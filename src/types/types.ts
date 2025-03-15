export interface DocumentItem {
	name: string;
	article: string | null;
	quantity: number;
	unit: string;
	price_no_pdv: number;
	price_with_pdv: number;
	total: number;
}

export interface ParsedDocument {
	supplier: string;
	items: DocumentItem[];
	total_pdv: number;
	total_with_pdv: number;
}

export interface ProcessingResult {
	success: boolean;
	data?: ParsedDocument;
	error?: string;
}

export interface MistralApiResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: {
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface Config {
	telegram: {
		token: string;
	};
	mistral: {
		apiKey: string;
		model?: string;
		maxTokens?: number;
	};
	paths: {
		uploads: string;
	};
}

export interface OCRApiResponse {
	text?: string;
	document?: {
		text?: string;
	};
	pages?: Array<{
		text?: string;
		page_number?: number;
		index?: number;
		images?: Array<{
			base64?: string;
			index?: number;
		}>;
		dimensions?: {
			width?: number;
			height?: number;
			dpi?: number;
		};
		markdown?: string;
	}>;
	id?: string;
	model?: string;
	object?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
	[key: string]: any; // Для других возможных полей
}
