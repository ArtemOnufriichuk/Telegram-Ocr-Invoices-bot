import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { processDocument } from './mistralService';
import { ProcessingResult } from '../types/types';
import path from 'path';
import fs from 'fs';

let bot: TelegramBot;

async function downloadFile(filePath: string, destination: string): Promise<void> {
	console.log(`Downloading file from ${filePath} to ${destination}`);
	const response = await fetch(`https://api.telegram.org/file/bot${config.telegram.token}/${filePath}`);
	const buffer = await response.arrayBuffer();
	fs.writeFileSync(destination, Buffer.from(buffer));
	console.log('File downloaded successfully');
}

async function sendProcessingResult(chatId: number, result: ProcessingResult, originalFileName: string): Promise<void> {
	if (result.success && result.data) {
		// Создаем имя файла на основе имени исходного файла и данных поставщика
		const supplier = result.data.supplier ? result.data.supplier.replace(/[^\w\s]/gi, '_') : 'unknown';
		const jsonFileName = `${path.parse(originalFileName).name}_${supplier}_${Date.now()}.json`;
		const jsonFilePath = path.join(config.paths.uploads, jsonFileName);

		// Сохраняем JSON в файл
		fs.writeFileSync(jsonFilePath, JSON.stringify(result.data, null, 2));

		// Отправляем сообщение с результатом
		const messageSummary =
			`✅ Документ успешно обработан!\n\n` +
			`📋 Поставщик: ${result.data.supplier || 'Не указан'}\n` +
			`📅 Дата: ${result.data.invoice_date || 'Не указана'}\n` +
			`📦 Товаров: ${result.data.items?.length || 0}`;

		await bot.sendMessage(chatId, messageSummary);

		// Отправляем файл
		await bot.sendDocument(chatId, jsonFilePath, {
			caption: 'Результат обработки в формате JSON',
		});

		// Удаляем временный файл
		fs.unlinkSync(jsonFilePath);
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
		bot.sendMessage(chatId, '👋 Добро пожаловать! Отправьте мне документ или фото для обработки.');
		console.log(`New user started bot: ${chatId}`);
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

			// Обновляем статус - обработка
			await bot.editMessageText('🔍 Анализирую документ...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Process document with telegramFilePath
			const result = await processDocument(filePath, file.file_path);

			// Обновляем статус - завершено
			await bot.editMessageText('✅ Обработка завершена!', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Send result
			await sendProcessingResult(chatId, result, msg.document.file_name || 'document');

			// Clean up
			fs.unlinkSync(filePath);
			console.log(`Cleaned up file: ${filePath}`);
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

			// Обновляем статус - OCR
			await bot.editMessageText('👁️ Извлекаю текст из изображения...', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Process photo with telegramFilePath
			const result = await processDocument(filePath, file.file_path);

			// Обновляем статус - завершено
			await bot.editMessageText('✅ Обработка завершена!', {
				chat_id: chatId,
				message_id: statusMessage.message_id,
			});

			// Send result
			await sendProcessingResult(chatId, result, fileName);

			// Clean up
			fs.unlinkSync(filePath);
			console.log(`Cleaned up file: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			bot.sendMessage(chatId, '❌ Ошибка обработки фото. Пожалуйста, попробуйте снова.');
			console.error(`Error processing photo from chat ${chatId}: ${errorMessage}`);
		}
	});
}

export function startBot(): void {
	bot = new TelegramBot(config.telegram.token, { polling: true });
	setupHandlers();
	console.log('Telegram bot started');
}
