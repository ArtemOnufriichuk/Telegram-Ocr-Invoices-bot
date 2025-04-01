import fs from 'fs';
import path from 'path';
import { ParsedDocument, ProcessingResult } from '../types/types';
import { config } from '../config';
import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import sharp from 'sharp';

// Инициализация клиента Anthropic
const anthropic = new Anthropic({
    apiKey: config.claude.apiKey,
});

// Базовый промт для обработки документов
const BASE_PROMPT = `
Пожалуйста, прочитай текст ниже. Он может содержать несколько языков (укр, рус, англ), в документе может быть пометка о наличии цены с ПДВ (НДС) или без. Определи в нём следующие данные:

Документ может быть в формате PDF с несколькими страницами. Разделители страниц могут выглядеть так: "=== Страница N ===".
Ищи важную информацию по всему тексту. Счет и таблица могут быть на разных страницах.
Так же это может быть фотография или скриншот счета.
А так же это может быть табллица excel в формате xls или xlsx.
ОБРАТИ ВНИМАНИЕ! Документ может содержать таблицы в формате JSON (обозначены как "--- Таблицы на странице N ---"). 
Если видишь таблицы в JSON формате, используй их для более точного извлечения данных о товарах.

При анализе документа обрати НАИБОЛЕЕ КРИТИЧНОЕ внимание на идентификационные коды:

1. ЕДРПОУ/ЄДРПОУ:
   - СТРОГО ищи в формате "код за ЄДРПОУ XXXXXXXX" или "ЄДРПОУ: XXXXXXXX" или "Код ЄДРПОУ XXXXXXXX"
   - Это обычно 8 цифр, но для ФЛП (ФОП) может быть 10 цифр
   - Расположен в шапке документа или реквизитах поставщика
   - НЕ ПУТАЙ с р/с, МФО или другими числовыми идентификаторами!
   - НИКОГДА не бери цифры из банковского счета (строки, содержащей "UA" или "р/с")!
   - Пример: "код за ЄДРПОУ 35601501" или "Код ЄДРПОУ 2103005940"

2. ИНН/ІПН:
   - СТРОГО ищи в формате "ІПН XXXXXXXXXXXX" или "ИНН: XXXXXXXXXXXX"
   - Это ВСЕГДА 10-12 цифр (не меньше и не больше)
   - Обычно идет сразу после ЕДРПОУ в том же блоке текста
   - Пример: "ІПН 356015004822"

ВАЖНО! При анализе номера счета или счета-фактуры:
- Обрати внимание на буквенные префиксы, например "Л-25/46" или "Л-25/46"
- Сохраняй исходный формат разделителей: тире (-), дробь (/) и т.д.
- В украинских документах: "Рахунок-фактура № Л-25/46" - номер "Л-25/46"

НИКОГДА не используй номер свидетельства или другие числа для ЕДРПОУ и ИНН!
Если видишь строку "код за ЄДРПОУ 35601501, ІПН 356015004822, № свід. 200026344", то:
- ЕДРПОУ = 35601501 (8 цифр после "код за ЄДРПОУ")
- ИНН = 356015004822 (после "ІПН")
- НЕ используй "200026344" (номер свидетельства) в качестве ЕДРПОУ или ИНН!

НИКОГДА не используй числа из номера расчетного счета, МФО или других реквизитов вместо ЕДРПОУ и ИНН!
Если не можешь точно определить эти коды, верни пустую строку вместо предположений.
НЕ МЕНЯЙ ПОРЯДОК ЦИФР! Копируй цифры ТОЧНО в том порядке, как они указаны в документе!

ЕДРПОУ должен быть 8-значным числом, расположенным сразу после слов "код за ЄДРПОУ" или "ЄДРПОУ". 
НЕ путай ЕДРПОУ с другими числами в документе, особенно с расчетным счетом!
Если видишь формат "код за ЄДРПОУ XXXXXXXX", обязательно извлеки все 8 цифр, а не их часть.

Тебе не надо дополнительно менять цены и считать их, только считывать и думать куда их переносить в правильные поля.

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
unit — единица измерения. Может быть указана отдельно или вместе с количеством (например, "шт","шт.", "100шт", "кг", "м", "м²", "м³", "л","од","од.",). Возможно, единица измерения указана вместе с числом (например, "100шт"), то это число является unit, а не количеством, надо продумать и указать корректно количество и единицу измерения!

При распознавании единиц измерения обрати внимание на следующие специфические единицы:
- "год" (украинское "години" - часы)
- "м3", "м²", "м" (кубические метры, квадратные метры, метры)

price_no_pdv — цена без ПДВ (числовое значение), /100/
price_with_pdv — цена с ПДВ (числовое значение), /110/
total_no_pdv — итоговая сумма без ПДВ. /10000/
total_with_pdv — итоговая сумма с ПДВ. /11000/

ОБЯЗАТЕЛЬНО! Все количества, цены и суммы должны быть числовыми значениями!
ОБЯЗАТЕЛЬНО! Возможно, единица измерения указана вместе с числом (например, "100шт"), то это число является unit, а не количеством, надо продумать и указать корректно количество и единицу измерения!

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
			"quantity": 20 | null,  // количество товара
			"unit": "100шт" | "шт" ..., // размер единицы измерения (100 штук в упаковке)
			"price_no_pdv": 100 | null,
			"price_with_pdv": 110 | null,
			"total_no_pdv": 10000 | null,
			"total_with_pdv": 11000 | null
		},
		{
			"name": "Песок",
			"article": null,
			"quantity": 5,
			"unit": "м³",          // обычная единица измерения
			"price_no_pdv": 200,
			"price_with_pdv": 220,
			"total_no_pdv": 1000,
			"total_with_pdv": 1100
		}
	],
	"total_no_pdv": 10000 | null,
	"total_pdv": 1000 | null,
	"total_with_pdv": 11000 | null
}
`;

/**
 * Преобразует изображение в формат и размер, подходящий для отправки в API Claude
 * Claude может принимать изображения размером до 5MB
 * @param filePath Путь к исходному файлу изображения
 * @returns Buffer с оптимизированным изображением 
 */
async function prepareImageForClaude(filePath: string): Promise<Buffer> {
    try {
        const image = sharp(filePath);
        const metadata = await image.metadata();
        
        // Если изображение слишком большое, уменьшаем его
        if ((metadata.width && metadata.width > 1500) || (metadata.height && metadata.height > 1500)) {
            return await image
                .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
        }
        
        // Иначе просто оптимизируем формат и качество
        return await image
            .jpeg({ quality: 85 })
            .toBuffer();
    } catch (error) {
        console.error('Error preparing image:', error);
        // Если что-то пошло не так, возвращаем исходный файл
        return fs.readFileSync(filePath);
    }
}

/**
 * Извлекает текст из PDF файла
 * @param filePath Путь к PDF файлу
 * @returns Извлеченный текст и метаданные
 */
async function extractTextFromPdf(filePath: string): Promise<{ text: string, pageCount: number }> {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        
        return {
            text: pdfData.text,
            pageCount: pdfData.numpages
        };
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('Failed to extract text from PDF');
    }
}

/**
 * Извлекает текст из файла Excel
 * @param filePath Путь к файлу Excel
 * @returns Извлеченный текст в виде строки
 */
async function extractTextFromExcel(filePath: string): Promise<string> {
    try {
        // Загружаем книгу Excel
        const workbook = XLSX.readFile(filePath);
        
        let extractedText = '';
        
        // Обрабатываем каждый лист
        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            
            // Добавляем имя листа
            extractedText += `=== Лист: ${sheetName} ===\n`;
            
            // Конвертируем лист в JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Преобразуем данные в текст
            for (const row of jsonData) {
                if (Array.isArray(row) && row.length > 0) {
                    extractedText += row.map(cell => cell !== undefined && cell !== null ? cell.toString() : '').join('\t') + '\n';
                }
            }
            
            extractedText += '\n';
        }
        
        return extractedText;
    } catch (error) {
        console.error('Error extracting text from Excel:', error);
        throw new Error('Failed to extract text from Excel');
    }
}

/**
 * Функция для определения типа файла и его обработки перед отправкой в Claude API
 * @param filePath Путь к файлу
 * @returns Объект с типом медиа и обработанными данными
 */
async function prepareMediaForClaude(filePath: string): Promise<{ 
    mediaType: 'image' | 'pdf' | 'excel' | 'unknown', 
    content: Buffer | string 
}> {
    const extension = path.extname(filePath).toLowerCase();
    
    // Обработка изображений
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
        const optimizedImage = await prepareImageForClaude(filePath);
        return { mediaType: 'image', content: optimizedImage };
    }
    
    // Обработка PDF
    else if (extension === '.pdf') {
        const { text, pageCount } = await extractTextFromPdf(filePath);
        const formattedText = `=== PDF документ (${pageCount} страниц) ===\n\n${text}`;
        return { mediaType: 'pdf', content: formattedText };
    }
    
    // Обработка Excel
    else if (['.xls', '.xlsx', '.csv'].includes(extension)) {
        const text = await extractTextFromExcel(filePath);
        const formattedText = `=== Excel документ ===\n\n${text}`;
        return { mediaType: 'excel', content: formattedText };
    }
    
    // Неизвестный формат
    else {
        throw new Error(`Unsupported file format: ${extension}`);
    }
}

/**
 * Основная функция для обработки документа через Claude API
 * Поддерживает обработку изображений, PDF и Excel файлов
 * @param filePath Локальный путь к файлу
 * @param originalFilePath Исходный путь в Telegram (опционально)
 * @returns Результат обработки с извлеченными данными
 */
export async function processDocumentWithFlexibleExtraction(
    filePath: string,
    originalFilePath?: string
): Promise<ProcessingResult> {
    try {
        console.log(`Processing document with Claude API: ${filePath}`);
        const extension = path.extname(filePath).toLowerCase();
        
        // Подготавливаем медиа для Claude
        const { mediaType, content } = await prepareMediaForClaude(filePath);
        
        let response;
        
        // В зависимости от типа медиа, формируем и отправляем запрос к Claude API
        if (mediaType === 'image') {
            // Конвертируем Buffer в base64
            const base64Image = (content as Buffer).toString('base64');
            
            // Отправляем запрос к Claude для анализа изображения
            response = await anthropic.messages.create({
                model: config.claude.model || 'claude-3-5-sonnet-20240620',
                max_tokens: config.claude.maxTokens || 4000,
                system: "You are an expert document and invoice analyzer. Extract all information accurately.",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: BASE_PROMPT },
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/jpeg",
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ]
            });
        } else {
            // Для PDF и Excel файлов отправляем извлеченный текст
            const pageContent = content as string;
            const documentText = `${BASE_PROMPT}\n\nВот содержание документа:${
                extension === '.xls' || extension === '.xlsx' ? '\nЭто данные, извлеченные из Excel файла в текстовом формате.' : ''
            }\n\n${pageContent}`;
            
            response = await anthropic.messages.create({
                model: config.claude.model || 'claude-3-5-sonnet-20240620',
                max_tokens: config.claude.maxTokens || 4000,
                system: "You are an expert document and invoice analyzer. Extract all information accurately.",
                messages: [
                    {
                        role: "user",
                        content: documentText
                    }
                ]
            });
        }
        
        // Обрабатываем ответ
        if (response.content && response.content.length > 0) {
            const responseContent = response.content[0];
            // Проверяем, что блок имеет тип text
            if ('text' in responseContent) {
                const text = responseContent.text;
                
                // Ищем JSON в ответе
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                
                if (jsonMatch) {
                    try {
                        const parsedData = JSON.parse(jsonMatch[0]) as ParsedDocument;
                        return {
                            success: true,
                            data: parsedData
                        };
                    } catch (jsonError) {
                        console.error('Error parsing JSON from Claude response:', jsonError);
                        return {
                            success: false,
                            error: 'Failed to parse extracted data from Claude response.'
                        };
                    }
                } else {
                    return {
                        success: false,
                        error: 'Claude did not return valid JSON data.'
                    };
                }
            } else {
                return {
                    success: false,
                    error: 'Claude API returned an unsupported content type.'
                };
            }
        } else {
            return {
                success: false,
                error: 'Claude API returned an empty response.'
            };
        }
    } catch (error) {
        console.error('Error in Claude API processing:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error in Claude processing'
        };
    }
}
