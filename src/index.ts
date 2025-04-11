import { startBot } from './services/telegramBot';
import { config } from './config';
import fs from 'fs';
import path from 'path';

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
	const errorMsg = `${new Date().toISOString()} - Необработанное исключение: ${error.message}\n${error.stack}\n`;
	console.error(errorMsg);

	// Запись в лог-файл
	try {
		const logDir = path.resolve(__dirname, '../logs');
		if (!fs.existsSync(logDir)) {
			try {
				fs.mkdirSync(logDir, { recursive: true });
			} catch (mkdirError) {
				console.error('Не удалось создать директорию логов:', mkdirError);
			}
		}
		if (fs.existsSync(logDir)) {
			fs.appendFileSync(path.join(logDir, 'fatal_errors.log'), errorMsg);
		}
	} catch (e) {
		console.error('Не удалось записать в лог-файл:', e);
	}

	// Завершаем процесс с небольшой задержкой для логирования
	setTimeout(() => process.exit(1), 1000);
});

// Обработка отклоненных промисов без обработчика
process.on('unhandledRejection', (reason, promise) => {
	const errorMsg = `${new Date().toISOString()} - Необработанное отклонение промиса: ${reason}\n`;
	console.error(errorMsg);

	try {
		const logDir = path.resolve(__dirname, '../logs');
		if (!fs.existsSync(logDir)) {
			try {
				fs.mkdirSync(logDir, { recursive: true });
			} catch (mkdirError) {
				console.error('Не удалось создать директорию логов:', mkdirError);
			}
		}
		if (fs.existsSync(logDir)) {
			fs.appendFileSync(path.join(logDir, 'unhandled_rejections.log'), errorMsg);
		}
	} catch (e) {
		console.error('Не удалось записать в лог-файл:', e);
	}
});

// Функция очистки старых логов
function cleanupOldLogs() {
	try {
		const logsDir = path.resolve(__dirname, '../logs');
		if (!fs.existsSync(logsDir)) return;

		const files = fs.readdirSync(logsDir);
		// Получаем время неделю назад
		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		files.forEach((file) => {
			try {
				const filePath = path.join(logsDir, file);
				const stats = fs.statSync(filePath);

				// Удаляем файлы старше недели
				if (stats.mtimeMs < oneWeekAgo) {
					fs.unlinkSync(filePath);
					console.log(`Cleaned up old log file: ${filePath}`);
				}
			} catch (fileError) {
				console.error(`Error processing log file ${file}:`, fileError);
			}
		});
	} catch (error) {
		console.error('Error cleaning up old logs:', error);
	}
}

// Create uploads directory if it doesn't exist
const uploadsDir = config.paths.uploads;
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create logs directory if it doesn't exist
const logsDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Запускаем очистку при старте и каждый день
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// Start the Telegram bot
startBot();

console.log('Application started successfully');
