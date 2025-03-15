import dotenv from 'dotenv';
import path from 'path';
import { Config } from './types/types';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate required environment variables
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'MISTRAL_API_KEY'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
	throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export const config: Config = {
	telegram: {
		token: process.env.TELEGRAM_BOT_TOKEN!,
	},
	mistral: {
		apiKey: process.env.MISTRAL_API_KEY!,
		model: 'mistral-large-latest',
		maxTokens: 4000,
	},
	paths: {
		uploads: path.resolve(__dirname, '../uploads'),
	},
};
