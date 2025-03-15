import { startBot } from './services/telegramBot';
import { config } from './config';
import fs from 'fs';

// Create uploads directory if it doesn't exist
const uploadsDir = config.paths.uploads;
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

// Start the Telegram bot
startBot();

console.log('Application started successfully');
