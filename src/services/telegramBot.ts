import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { processDocumentWithFlexibleExtraction } from './claudeService';
import { ProcessingResult } from '../types/types';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import process from 'process';

// Глобальные переменные для состояния бота
let bot: TelegramBot;
let isRunning = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_COOLDOWN = 10000; // 10 секунд между перезапусками
const RESET_ATTEMPTS_AFTER = 60000 * 5; // Сбросить счетчик попыток после 5 минут успешной работы

async function downloadFile(filePath: string, destination: string): Promise<void> {
	console.log(`Downloading file from ${filePath} to ${destination}`);
	const response = await fetch(`https://api.telegram.org/file/bot${config.telegram.token}/${filePath}`);
	const buffer = await response.arrayBuffer();
	fs.writeFileSync(destination, Buffer.from(buffer));
	console.log('File downloaded successfully');
}

// Функция для создания Excel файла из данных ParsedDocument
function createExcelFile(data: any, filePath: string): void {
	try {
		// Создаем рабочую книгу
		const workbook = XLSX.utils.book_new();

		// Создаем данные для единого листа
		const sheetData: any[][] = [];

		// Добавляем заголовок с информацией о документе
		sheetData.push(['ИНФОРМАЦИЯ О ДОКУМЕНТЕ']);
		sheetData.push([]);

		// Добавляем основную информацию
		sheetData.push(['Номер счета', data.invoice_number || '']);
		sheetData.push(['Дата', data.invoice_date || '']);
		sheetData.push(['ЕДРПОУ', data.edrpou || '']);
		sheetData.push(['ИПН', data.ipn || '']);
		sheetData.push(['Поставщик', data.supplier || '']);
		sheetData.push(['Цены с НДС', data.isPriceWithPdv ? 'Да' : 'Нет']);

		// Добавляем пустую строку для разделения
		sheetData.push([]);
		sheetData.push([]);

		// Добавляем заголовок раздела товаров
		sheetData.push(['СПИСОК ТОВАРОВ']);
		sheetData.push([]);

		// Заголовки для таблицы товаров
		const itemsHeaders = ['№', 'Наименование', 'Артикул', 'Количество', 'Ед. изм.', 'Цена без НДС', 'Цена с НДС', 'Сумма без НДС', 'Сумма с НДС'];
		sheetData.push(itemsHeaders);

		// Добавляем данные товаров
		if (data.items && data.items.length > 0) {
			data.items.forEach((item: any, index: number) => {
				sheetData.push([
					index + 1, // Порядковый номер
					item.name || '',
					item.article || '',
					item.quantity || 0,
					item.unit || '',
					item.price_no_pdv || 0,
					item.price_with_pdv || 0,
					item.total_no_pdv || 0,
					item.total_with_pdv || 0,
				]);
			});
		}

		// Добавляем пустую строку для разделения
		sheetData.push([]);

		// Добавляем итоговые суммы внизу
		sheetData.push(['', '', '', '', '', '', 'ИТОГО:', data.total_no_pdv || 0, data.total_with_pdv || 0]);
		sheetData.push(['', '', '', '', '', '', 'НДС:', data.total_pdv || 0, '']);

		// Создаем лист
		const sheet = XLSX.utils.aoa_to_sheet(sheetData);

		// Настраиваем стили (ширину столбцов)
		const colWidths = [
			{ wch: 5 }, // №
			{ wch: 40 }, // Наименование
			{ wch: 15 }, // Артикул
			{ wch: 10 }, // Количество
			{ wch: 10 }, // Ед. изм.
			{ wch: 12 }, // Цена без НДС
			{ wch: 12 }, // Цена с НДС
			{ wch: 12 }, // Сумма без НДС
			{ wch: 12 }, // Сумма с НДС
		];

		// Применяем ширину столбцов
		sheet['!cols'] = colWidths;

		// Объединяем ячейки для заголовков
		if (!sheet['!merges']) sheet['!merges'] = [];
		sheet['!merges'].push(
			{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Заголовок информации
			{ s: { r: 8, c: 0 }, e: { r: 8, c: 8 } }, // Заголовок товаров
		);

		// Добавляем лист в книгу
		XLSX.utils.book_append_sheet(workbook, sheet, 'Документ');

		// Записываем файл
		XLSX.writeFile(workbook, filePath);
		console.log(`Excel file created: ${filePath}`);
	} catch (error) {
		console.error(`Error creating Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
		throw new Error('Failed to create Excel file');
	}
}

/**
 * Нормализует имя файла для безопасного сохранения
 * Удаляет недопустимые символы и ограничивает длину
 */
function normalizeFileName(fileName: string): string {
	// Заменяем недопустимые символы
	let normalized = fileName
		// Исключаем недопустимые символы для имен файлов
		.replace(/[\\/:*?"<>|]/g, '_')
		// Заменяем множественные пробелы и подчеркивания одним подчеркиванием
		.replace(/\s+/g, '_')
		.replace(/_+/g, '_');

	// Максимальная длина фрагмента имени файла (без учета расширения)
	const MAX_PART_LENGTH = 30;

	// Сокращаем части имени, если оно слишком длинное
	const parts = normalized.split('_');
	const shortenedParts = parts.map((part) => (part.length > MAX_PART_LENGTH ? part.substring(0, MAX_PART_LENGTH - 3) + '...' : part));

	// Конечное имя файла: ограничиваем общую длину до 100 символов
	normalized = shortenedParts.join('_');
	if (normalized.length > 100) {
		normalized = normalized.substring(0, 97) + '...';
	}

	// Если имя стало пустым, используем timestamp
	return normalized || `file_${Date.now()}`;
}

/**
 * Безопасно удаляет файл с проверкой существования и использованием задержки
 * Предотвращает ошибки EPERM при удалении файлов, которые всё ещё используются
 */
function safeDeleteFile(filePath: string): void {
	try {
		// Проверяем существование файла перед удалением
		if (fs.existsSync(filePath)) {
			// Добавляем небольшую задержку для завершения всех операций с файлом
			setTimeout(() => {
				try {
					fs.unlinkSync(filePath);
					console.log(`Cleaned up file: ${filePath}`);
				} catch (error) {
					console.warn(`Warning: Could not delete file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}, 500); // 500мс задержка
		} else {
			console.log(`File not found, skipping delete: ${filePath}`);
		}
	} catch (error) {
		console.warn(`Warning: Error checking file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

async function sendProcessingResult(chatId: number, result: ProcessingResult, originalFileName: string): Promise<void> {
	if (result.success && result.data) {
		// Нормализуем данные для имени файла
		const invoiceNumber = result.data.invoice_number ? normalizeFileName(`№ ${result.data.invoice_number}`) : '';

		const invoiceDate = result.data.invoice_date ? normalizeFileName(` від ${result.data.invoice_date}`) : '';

		const supplier = result.data.supplier ? normalizeFileName(result.data.supplier) : 'unknown';

		// Создаем короткое имя файла
		const originalBaseName = path.parse(originalFileName).name;
		const timestamp = Date.now();

		// Приоритет: номер счета + дата, если нет - используем имя исходного файла
		let baseName = '';
		if (invoiceNumber) {
			baseName = `${invoiceNumber}${invoiceDate}_${supplier}_${timestamp}`;
		} else {
			baseName = `${normalizeFileName(originalBaseName)}_${supplier}_${timestamp}`;
		}

		// Нормализуем финальное имя файла
		baseName = normalizeFileName(baseName);

		const jsonFileName = `${baseName}.json`;
		const xlsxFileName = `${baseName}.xlsx`;
		const jsonFilePath = path.join(config.paths.uploads, jsonFileName);
		const xlsxFilePath = path.join(config.paths.uploads, xlsxFileName);

		// Сохраняем JSON в файл
		fs.writeFileSync(jsonFilePath, JSON.stringify(result.data, null, 2));

		// Создаем Excel файл
		createExcelFile(result.data, xlsxFilePath);

		// Отправляем сообщение с результатом
		const messageSummary =
			`✅ Документ успешно обработан!\n\n` +
			`📋 Поставщик: ${result.data.supplier || 'Не указан'}\n` +
			`📅 Дата: ${result.data.invoice_date || 'Не указана'}\n` +
			`📦 Товаров: ${result.data.items?.length || 0}` +
			`\n\n🔍 Подробности в файле JSON и Excel`;

		await bot.sendMessage(chatId, messageSummary);

		// Отправляем JSON файл
		await bot.sendDocument(chatId, jsonFilePath, {
			caption: 'Результат обработки в формате JSON',
		});

		// Отправляем Excel файл
		await bot.sendDocument(chatId, xlsxFilePath, {
			caption: 'Результат обработки в формате Excel',
		});

		// Удаляем временные файлы безопасным способом
		safeDeleteFile(jsonFilePath);
		safeDeleteFile(xlsxFilePath);
		console.log(`Successfully processed document for chat ${chatId}`);
	} else {
		const errorMessage = `❌ Ошибка: ${result.error || 'Произошла неизвестная ошибка'}`;
		await bot.sendMessage(chatId, errorMessage);
		console.error(`Error processing document for chat ${chatId}: ${result.error}`);
	}
}

function setupHandlers(): void {
	bot.onText(/\/start/, (msg) => {
		const chatId = msg.chat.id;
		bot.sendMessage(
			chatId,
			`👋 Добро пожаловать! 

Я помогу вам обработать счета и накладные, извлекая из них структурированные данные.

Просто отправьте мне документ (PDF, Excel) или фото счета, и я автоматически извлеку всю важную информацию.

ℹ️ Используйте /help для получения справки.`,
		);
		console.log(`New user started bot: ${chatId}`);
	});

	bot.onText(/\/help/, (msg) => {
		const chatId = msg.chat.id;
		const helpMessage = `
📋 Доступные команды:

/start - Начать работу с ботом
/help - Показать эту справку

Просто отправьте файл документа (PDF, Excel) или изображение счета/накладной для обработки.

Бот использует продвинутый анализ с помощью нейросетей для распознавания любых форматов документов и таблиц.`;
		bot.sendMessage(chatId, helpMessage);
	});

	bot.on('document', async (msg) => {
		const chatId = msg.chat.id;
		const fileId = msg.document?.file_id;

		if (!fileId || !msg.document) {
			bot.sendMessage(chatId, '❌ Пожалуйста, отправьте корректный документ.');
			console.warn(`Invalid document received from chat ${chatId}`);
			return;
		}

		try {
			// Отправляем статус о получении документа
			const statusMessage = await bot.sendMessage(chatId, '📥 Получен документ. Начинаю обработку...');

			const file = await bot.getFile(fileId);
			const filePath = path.join(config.paths.uploads, msg.document.file_name || 'document');

			if (!file.file_path) {
				throw new Error('File path not found');
			}

			console.log(`Processing document from chat ${chatId}: ${msg.document.file_name}`);

			// Обновляем статус - скачивание
			await bot.editMessageText('⬇️ Скачиваю документ...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Download file
			await downloadFile(file.file_path, filePath);

			// Обновляем статус - обработка с использованием гибкого режима
			await bot.editMessageText('🧠 Анализирую документ...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			console.log(`Processing document with flexible extraction for chat ${chatId}`);
			console.log(`File type: ${path.extname(filePath).toLowerCase()}`);

			// Используем только гибкий метод обработки
			const result = await processDocumentWithFlexibleExtraction(filePath, file.file_path);
			console.log(`Flexible processing completed for chat ${chatId}`);

			// Обновляем статус - завершено
			await bot.editMessageText('✅ Обработка завершена!', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Send result
			await sendProcessingResult(chatId, result, msg.document.file_name || 'document');

			// Clean up безопасным способом
			safeDeleteFile(filePath);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			bot.sendMessage(chatId, '❌ Ошибка обработки документа. Пожалуйста, попробуйте снова.');
			console.error(`Error processing document from chat ${chatId}: ${errorMessage}`);
		}
	});

	// Обработка изображений
	bot.on('photo', async (msg) => {
		const chatId = msg.chat.id;
		const photos = msg.photo;

		if (!photos || photos.length === 0) {
			bot.sendMessage(chatId, '❌ Пожалуйста, отправьте корректное фото.');
			console.warn(`Invalid photo received from chat ${chatId}`);
			return;
		}

		try {
			// Отправляем статус о получении фото
			const statusMessage = await bot.sendMessage(chatId, '📸 Получено фото. Начинаю обработку...');

			// Берем фото с наилучшим качеством (последнее в массиве)
			const fileId = photos[photos.length - 1].file_id;
			const file = await bot.getFile(fileId);

			if (!file.file_path) {
				throw new Error('File path not found');
			}

			const fileName = `photo_${Date.now()}.jpg`;
			const filePath = path.join(config.paths.uploads, fileName);

			console.log(`Processing photo from chat ${chatId}`);

			// Обновляем статус - скачивание
			await bot.editMessageText('⬇️ Скачиваю фото...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Download file
			await downloadFile(file.file_path, filePath);

			// Обновляем статус - обработка с использованием гибкого режима
			await bot.editMessageText('🧠 Анализирую изображение...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			console.log(`Processing photo with flexible extraction from chat ${chatId}`);
			console.log(`File type: ${path.extname(filePath).toLowerCase()}`);

			// Используем только гибкий метод обработки
			const result = await processDocumentWithFlexibleExtraction(filePath, file.file_path);
			console.log(`Flexible processing completed for photo from chat ${chatId}`);

			// Обновляем статус - завершено
			await bot.editMessageText('✅ Обработка завершена!', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Send result
			await sendProcessingResult(chatId, result, fileName);

			// Clean up безопасным способом
			safeDeleteFile(filePath);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			bot.sendMessage(chatId, '❌ Ошибка обработки фото. Пожалуйста, попробуйте снова.');
			console.error(`Error processing photo from chat ${chatId}: ${errorMessage}`);
		}
	});
}

/**
 * Остановка бота и освобождение ресурсов
 */
function stopBot(): void {
	if (bot && isRunning) {
		try {
			console.log('Stopping the Telegram bot...');
			// Останавливаем поллинг и отключаем все обработчики
			bot.stopPolling();
			isRunning = false;
			console.log('Telegram bot stopped successfully');
		} catch (error) {
			console.error('Error stopping bot:', error);
		}
	}
}

/**
 * Запуск бота с настройкой всех обработчиков
 */
function initializeBot(): void {
	try {
		// Создаем нового бота
		bot = new TelegramBot(config.telegram.token, { polling: true });

		// Регистрируем обработчик ошибок поллинга
		bot.on('polling_error', (error) => {
			console.error('Telegram bot polling error:', error);

			// Если ошибка критическая, перезапускаем бота
			if (error && typeof error === 'object' && 'code' in error && (error.code === 'ETELEGRAM' || error.code === 'EFATAL')) {
				console.log('Critical polling error detected, restarting bot...');
				restartBot();
			}
		});

		// Устанавливаем обработчики сообщений
		setupHandlers();

		isRunning = true;
		console.log('Telegram bot initialized with flexible processing mode only');
	} catch (error) {
		console.error('Failed to initialize bot:', error);
		throw error; // Пробрасываем ошибку для перезапуска
	}
}

/**
 * Перезапуск бота с учетом количества попыток
 */
function restartBot(): void {
	restartAttempts++;
	console.log(`Attempting to restart bot (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);

	if (restartAttempts > MAX_RESTART_ATTEMPTS) {
		console.error(`Maximum restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
		console.error('Bot requires manual intervention. Please check logs and restart the application.');
		return;
	}

	// Останавливаем старого бота, если он существует
	stopBot();

	// Ждем некоторое время перед перезапуском
	setTimeout(() => {
		try {
			console.log('Reinitializing bot...');
			initializeBot();

			// Сбрасываем счетчик попыток через некоторое время успешной работы
			setTimeout(() => {
				if (isRunning) {
					console.log('Bot has been stable for a while, resetting restart attempts counter.');
					restartAttempts = 0;
				}
			}, RESET_ATTEMPTS_AFTER);
		} catch (error) {
			console.error('Error during bot restart:', error);
			// Рекурсивный вызов для следующей попытки
			restartBot();
		}
	}, RESTART_COOLDOWN);
}

/**
 * Основная функция запуска бота с механизмом отказоустойчивости
 */
export function startBot(): void {
	try {
		// Регистрируем обработчики необработанных исключений
		process.on('uncaughtException', (error) => {
			console.error('Uncaught exception:', error);
			if (isRunning) {
				console.log('Attempting to restart bot due to uncaught exception...');
				restartBot();
			}
		});

		process.on('unhandledRejection', (reason, promise) => {
			console.error('Unhandled promise rejection:', reason);
			if (isRunning) {
				console.log('Attempting to restart bot due to unhandled promise rejection...');
				restartBot();
			}
		});

		// Запускаем бота
		initializeBot();

		// Проверяем состояние бота каждые 5 минут
		setInterval(() => {
			if (!isRunning) {
				console.log('Bot health check failed: Bot is not running. Attempting restart...');
				restartBot();
			} else {
				console.log('Bot health check: OK');
			}
		}, 5 * 60 * 1000); // 5 минут
	} catch (error) {
		console.error('Failed to start bot:', error);
		restartBot();
	}
}
