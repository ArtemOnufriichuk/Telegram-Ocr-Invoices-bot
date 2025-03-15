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

async function sendProcessingResult(chatId: number, result: ProcessingResult): Promise<void> {
	if (result.success && result.data) {
		const message = JSON.stringify(result.data, null, 2);
		await bot.sendMessage(chatId, message);
		console.log(`Successfully processed document for chat ${chatId}`);
	} else {
		const errorMessage = `Error: ${result.error || 'Unknown error occurred'}`;
		await bot.sendMessage(chatId, errorMessage);
		console.error(`Error processing document for chat ${chatId}: ${errorMessage}`);
	}
}

function setupHandlers(): void {
	bot.onText(/\/start/, (msg) => {
		const chatId = msg.chat.id;
		bot.sendMessage(chatId, 'Welcome! Please send me a document to process.');
		console.log(`New user started bot: ${chatId}`);
	});

	bot.on('document', async (msg) => {
		const chatId = msg.chat.id;
		const fileId = msg.document?.file_id;

		if (!fileId || !msg.document) {
			bot.sendMessage(chatId, 'Please send a valid document.');
			console.warn(`Invalid document received from chat ${chatId}`);
			return;
		}

		try {
			const file = await bot.getFile(fileId);
			const filePath = path.join(config.paths.uploads, msg.document.file_name || 'document');

			if (!file.file_path) {
				throw new Error('File path not found');
			}

			console.log(`Processing document from chat ${chatId}: ${msg.document.file_name}`);

			// Download file
			await downloadFile(file.file_path, filePath);

			// Process document with telegramFilePath
			const result = await processDocument(filePath, file.file_path);

			// Send result
			await sendProcessingResult(chatId, result);

			// Clean up
			fs.unlinkSync(filePath);
			console.log(`Cleaned up file: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			bot.sendMessage(chatId, 'Error processing document. Please try again.');
			console.error(`Error processing document from chat ${chatId}: ${errorMessage}`);
		}
	});

	// Обработка изображений
	bot.on('photo', async (msg) => {
		const chatId = msg.chat.id;
		const photos = msg.photo;

		if (!photos || photos.length === 0) {
			bot.sendMessage(chatId, 'Please send a valid photo.');
			console.warn(`Invalid photo received from chat ${chatId}`);
			return;
		}

		try {
			// Берем фото с наилучшим качеством (последнее в массиве)
			const fileId = photos[photos.length - 1].file_id;
			const file = await bot.getFile(fileId);

			if (!file.file_path) {
				throw new Error('File path not found');
			}

			const fileName = `photo_${Date.now()}.jpg`;
			const filePath = path.join(config.paths.uploads, fileName);

			console.log(`Processing photo from chat ${chatId}`);

			// Download file
			await downloadFile(file.file_path, filePath);

			// Process photo with telegramFilePath
			const result = await processDocument(filePath, file.file_path);

			// Send result
			await sendProcessingResult(chatId, result);

			// Clean up
			fs.unlinkSync(filePath);
			console.log(`Cleaned up file: ${filePath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			bot.sendMessage(chatId, 'Error processing photo. Please try again.');
			console.error(`Error processing photo from chat ${chatId}: ${errorMessage}`);
		}
	});
}

export function startBot(): void {
	bot = new TelegramBot(config.telegram.token, { polling: true });
	setupHandlers();
	console.log('Telegram bot started');
}
