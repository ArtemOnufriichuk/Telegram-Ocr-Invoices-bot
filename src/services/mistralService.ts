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

	console.log('Получен ответ от Chat API:', chatResponse.choices[0]?.message?.content);

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
Пожалуйста, прочитай текст ниже. Он может содержать несколько языков (укр, рус, англ), в документе может быть пометка о наличии цены с ПДВ (НДС) или без. Определи в нём следующие данные:

ОЧЕНЬ ВАЖНО! При определении поля isPriceWithPdv (указаны ли цены с ПДВ/НДС):
1. Если в таблице есть колонка "Цiна з ПДВ", "Сума з ПДВ" или подобные - значит цены указаны с ПДВ
2. Если рядом с ценой есть пометка "в т.ч. ПДВ" - значит цены указаны с ПДВ
3. Если в документе ниже есть строка "У тому числi ПДВ" с суммой - скорее всего цены указаны с ПДВ
4. Если вообще нет упоминания ПДВ/НДС - считай, что цены без ПДВ

ОБЯЗАТЕЛЬНО! Если цены указаны и с ПДВ и без, то надо заполнить все поля ..._no_pdv и ..._with_pdv.

invoice_number — номер (№) счета. /1234/
invoice_date — дата счета. /DD.MM.YYYY/
edrpou — едрпоу поставщика. /1234567890/
ipn — ипн поставщика. /1234567890/
supplier — название поставщика (контрагента). /ООО 'Стройматериалы'/
isPriceWithPdv — какая цена указана в items с ПДВ (НДС) или без. /true/false/
total_no_pdv — общая сумма без ПДВ. /10000/
total_pdv — общая сумма ПДВ. /1000/
total_with_pdv — общая сумма c ПДВ. /11000/

items — список позиций (товаров, услуг или работ), где у каждой позиции нужно указать:
name — наименование, /Кирпич/
article — артикул, /1234567890 || КР 2.04 || ZST10230-04079/ (может использовать буквы нескольких языков)
quantity — количество (числовое значение), /1000/
unit — единица измерения, /шт/
price_no_pdv — цена без ПДВ (числовое значение), /100/
price_with_pdv — цена с ПДВ (числовое значение), /110/
total_no_pdv — итоговая сумма без ПДВ. /10000/
total_with_pdv — итоговая сумма с ПДВ. /11000/

ОБЯЗАТЕЛЬНО! Все количества, цены и суммы должны быть числовыми значениями!

Если какой-то информации не хватает, укажи null.

Ответ ДОЛЖЕН быть только в виде корректного JSON без лишних символов, комментариев и текста вне фигурных скобок.

Вот пример ожидаемого формата ответа:
{
	"invoice_number": "1234567890",
	"invoice_date": "01.01.2021",
	"edrpou": "1234567890",
	"ipn": "1234567890",
	"supplier": "ООО 'Стройматериалы'",
	"isPriceWithPdv": true | false,
	"items": [
		{
			"name": "Кирпич" | "Кирпич 2.04" | "Кирпич 2.04 079" | null,
			"article": "1234567890" | "КР 2.04" | "ZST10230-04079" | null,
			"quantity": 1000 | null,
			"unit": "шт",
			"price_no_pdv": 100 | null,
			"price_with_pdv": 110 | null,
			"total_no_pdv": 10000 | null,
			"total_with_pdv": 11000 | null
		}	
	],
	"total_no_pdv": 10000 | null,
	"total_pdv": 1000 | null,
	"total_with_pdv": 11000 | null
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

		return {
			invoice_number: parsedJson.invoice_number || '',
			invoice_date: parsedJson.invoice_date || '',
			edrpou: parsedJson.edrpou || '',
			ipn: parsedJson.ipn || '',
			supplier: parsedJson.supplier || '',
			isPriceWithPdv: parsedJson.isPriceWithPdv || false,
			items,
			total_no_pdv: convertToNumber(parsedJson.total_no_pdv),
			total_pdv: convertToNumber(parsedJson.total_pdv),
			total_with_pdv: convertToNumber(parsedJson.total_with_pdv),
		};
	} catch (error) {
		console.error(`Ошибка при парсинге ответа: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
		return {
			invoice_number: '',
			invoice_date: '',
			edrpou: '',
			ipn: '',
			supplier: '',
			isPriceWithPdv: false,
			items: [],
			total_no_pdv: 0,
			total_pdv: 0,
			total_with_pdv: 0,
		};
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
		total_no_pdv: convertToNumber(item.total_no_pdv),
		total_with_pdv: convertToNumber(item.total_with_pdv),
	}));
}

// Преобразование значения в число
function convertToNumber(value: any): number {
	if (typeof value === 'number') return value;
	if (value === null || value === 'данные не найдены') return 0;
	return parseFloat(value) || 0;
}
