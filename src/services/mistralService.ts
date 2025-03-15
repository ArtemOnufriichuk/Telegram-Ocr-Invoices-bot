import { config } from '../config';
import { ProcessingResult, ParsedDocument, MistralApiResponse, OCRApiResponse, DocumentItem } from '../types/types';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export async function processDocument(filePath: string, telegramFilePath?: string): Promise<ProcessingResult> {
	try {
		const extension = path.extname(filePath).toLowerCase();
		const fileName = path.basename(filePath);
		let content: string;

		// Определяем тип документа и обрабатываем соответствующим образом
		if (extension.match(/\.(jpg|jpeg|png|gif)$/i)) {
			content = await processImageFile(filePath, telegramFilePath);
		} else if (extension === '.xls' || extension === '.xlsx') {
			content = await processExcelFile(filePath);
		} else {
			content = await processTextFile(filePath, fileName);
		}

		// Обрабатываем ответ от API
		const parsedData = parseJSONResponse(content);
		return { success: true, data: parsedData };
	} catch (error) {
		console.error(`Error processing document: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}

// Обработка изображений через OCR API
async function processImageFile(filePath: string, telegramFilePath?: string): Promise<string> {
	if (!telegramFilePath) {
		throw new Error('Для изображений необходим путь к файлу в Telegram');
	}

	console.log('Отправляем изображение в Mistral OCR API');
	// Формируем URL для доступа к файлу через Telegram API
	const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${telegramFilePath}`;

	// Получаем текст из OCR API
	const ocrResult = await sendToMistralOCRAPI(fileUrl);
	console.log('OCR результат:', JSON.stringify(ocrResult, null, 2));

	// Извлекаем текст из ответа OCR API
	const extractedText = extractTextFromOCRResult(ocrResult);

	// Анализируем извлеченный текст через Chat API
	console.log('Получен текст из OCR, отправляем его для анализа в Chat API');
	console.log('Извлеченный текст:', extractedText.substring(0, 200) + '...');

	const prompt = createPrompt(extractedText);
	const chatResponse = await sendToMistralChatAPI(prompt);
	return chatResponse.choices[0]?.message?.content || '';
}

// Обработка Excel файлов
async function processExcelFile(filePath: string): Promise<string> {
	const workbook = XLSX.readFile(filePath);
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const data = XLSX.utils.sheet_to_json(worksheet);
	const fileContent = JSON.stringify(data, null, 2);

	// Отправляем в Chat API
	const prompt = createPrompt(fileContent);
	const chatResponse = await sendToMistralChatAPI(prompt);
	return chatResponse.choices[0]?.message?.content || '';
}

// Обработка текстовых файлов
async function processTextFile(filePath: string, fileName: string): Promise<string> {
	try {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		const prompt = createPrompt(fileContent);
		const chatResponse = await sendToMistralChatAPI(prompt);
		return chatResponse.choices[0]?.message?.content || '';
	} catch (error) {
		console.error(`Ошибка чтения файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
		throw new Error(`Не удалось прочитать файл ${fileName}`);
	}
}

// Извлечение текста из результата OCR API
function extractTextFromOCRResult(ocrResult: OCRApiResponse): string {
	let extractedText = '';

	// Проверяем различные возможные места, где может быть текст
	if (ocrResult.text) {
		extractedText = ocrResult.text;
		console.log('Найден текст в поле text');
	} else if (ocrResult.document?.text) {
		extractedText = ocrResult.document.text;
		console.log('Найден текст в поле document.text');
	} else if (ocrResult.pages && Array.isArray(ocrResult.pages)) {
		console.log(`Найдено ${ocrResult.pages.length} страниц`);
		// Собираем текст со всех страниц - проверяем и text и markdown поля
		const pageTexts = [];

		for (const page of ocrResult.pages) {
			if (page.text) {
				pageTexts.push(page.text);
				console.log(`Извлечен текст из страницы ${page.index || 0}`);
			} else if (page.markdown) {
				pageTexts.push(page.markdown);
				console.log(`Извлечен markdown из страницы ${page.index || 0}`);
			}
		}

		if (pageTexts.length > 0) {
			extractedText = pageTexts.join('\n');
			console.log(`Извлечен текст из ${pageTexts.length} страниц`);
		}
	}

	if (!extractedText) {
		console.error('Не удалось извлечь текст из ответа OCR API:', JSON.stringify(ocrResult));
		throw new Error('OCR API не вернул текст. Проверьте формат изображения.');
	}

	return extractedText;
}

// Формирование промпта для Chat API
function createPrompt(fileContent: string): string {
	return `
Пожалуйста, прочитай текст ниже и определи в нём следующие данные:

supplier — название поставщика (контрагента).
total — итоговая сумма.
total_pdv — общая сумма пдв.
total_with_pdv — общая сумма c пдв.

items — список позиций (товаров, услуг или работ), где у каждой позиции нужно указать:
name — наименование,
article — артикул,
quantity — количество (числовое значение),
unit — единица измерения,
price_no_pdv — цена без пдв (числовое значение),
price_with_pdv — цена с пдв (числовое значение),

Важно: все числовые значения должны быть именно числами, а не строками!
ОБЯЗАТЕЛЬНО! Все количества, цены и суммы должны быть числовыми значениями!

Если какой-то информации не хватает, укажи null.

Ответ ДОЛЖЕН быть только в виде корректного JSON без лишних символов, комментариев и текста вне фигурных скобок.

Вот пример ожидаемого формата ответа:
{
  "supplier": "ООО Компания",
  "items": [
    {
      "name": "Товар 1",
      "article": "ABC123",
      "quantity": 10,
      "unit": "шт",
      "price_no_pdv": 100.5,
      "price_with_pdv": 120.6,
      "total": 1206
    }
  ],
  "total_pdv": 201,
  "total_with_pdv": 1206
}

Вот содержание документа:

${fileContent}
`;
}

// Отправка запроса в Mistral Chat API
async function sendToMistralChatAPI(prompt: string): Promise<MistralApiResponse> {
	console.log('Отправляем запрос в Mistral Chat API');

	const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.mistral.apiKey}`,
		},
		body: JSON.stringify({
			model: config.mistral.model,
			messages: [{ role: 'user', content: prompt }],
			max_tokens: config.mistral.maxTokens,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Mistral API error: ${response.status} ${errorText}`);
	}

	const data = (await response.json()) as MistralApiResponse;
	console.log(`Получен ответ от Mistral Chat API, использовано токенов: ${data.usage?.total_tokens || 'неизвестно'}`);
	return data;
}

// Отправка запроса в Mistral OCR API
async function sendToMistralOCRAPI(imageUrl: string): Promise<OCRApiResponse> {
	console.log('Отправляем запрос в Mistral OCR API');
	console.log(`Используем изображение по URL: ${imageUrl}`);

	const response = await fetch('https://api.mistral.ai/v1/ocr', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.mistral.apiKey}`,
		},
		body: JSON.stringify({
			model: 'mistral-ocr-latest',
			document: {
				type: 'image_url',
				image_url: imageUrl,
			},
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Mistral OCR API error: ${response.status} ${errorText}`);
	}

	const data = await response.json();
	console.log('Получен ответ от Mistral OCR API. Структура ответа:');
	console.log(JSON.stringify(data, null, 2).substring(0, 1000) + '...');

	return data as OCRApiResponse;
}

// Парсинг JSON-ответа от API
function parseJSONResponse(content: string): ParsedDocument {
	try {
		if (!content) {
			throw new Error('Нет содержимого в ответе');
		}

		// Ищем JSON в ответе
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			throw new Error('Не удалось найти JSON в ответе');
		}

		// Парсим JSON
		const parsedJson = JSON.parse(jsonMatch[0]);

		// Обрабатываем items
		const items = processItems(parsedJson.items || []);

		// Обрабатываем числовые значения
		const total_pdv = convertToNumber(parsedJson.total_pdv);
		const total_with_pdv = convertToNumber(parsedJson.total_with_pdv);

		return {
			supplier: parsedJson.supplier || '',
			items,
			total_pdv,
			total_with_pdv,
		};
	} catch (error) {
		console.error(`Ошибка при парсинге ответа: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
		return { supplier: '', items: [], total_pdv: 0, total_with_pdv: 0 };
	}
}

// Обработка элементов items
function processItems(items: any[]): DocumentItem[] {
	if (!Array.isArray(items)) return [];

	return items.map((item) => ({
		name: item.name || '',
		article: item.article || null,
		quantity: convertToNumber(item.quantity),
		unit: item.unit || '',
		price_no_pdv: convertToNumber(item.price_no_pdv),
		price_with_pdv: convertToNumber(item.price_with_pdv),
		total: convertToNumber(item.total),
	}));
}

// Преобразование значения в число
function convertToNumber(value: any): number {
	if (typeof value === 'number') return value;
	if (value === null || value === 'данные не найдены') return 0;
	return parseFloat(value) || 0;
}
