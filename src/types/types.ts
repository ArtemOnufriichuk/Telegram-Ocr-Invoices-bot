export interface DocumentItem {
	name: string; // "Кирпич"
	article: string | null; // "1234567890 || КР 2.04 || ZST10230-04079"
	quantity: number; // 1000
	unit: string; // "шт"
	price_no_pdv: number; // 100
	price_with_pdv: number; // 110
	total_no_pdv: number; // 10000
	total_with_pdv: number; // 11000
}

export interface ParsedDocument {
	invoice_number: string; // 1234
	invoice_date: string; // DD.MM.YYYY
	edrpou: string; // 1234567890
	ipn: string; // 1234567890
	supplier: string; // "ООО 'Стройматериалы'"
	isPriceWithPdv: boolean; // true
	items: DocumentItem[];
	total_no_pdv: number; // 10000
	total_pdv: number; // 1000
	total_with_pdv: number; // 11000
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
		name?: string;
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
		tables?: Array<any>; // For table extraction
	}>;
	content?: string | any; // Дополнительное поле для PDF
	blocks?: Array<{
		type?: string;
		text?: string;
		page_index?: number;
		bbox?: number[];
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
