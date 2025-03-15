# Construction Project Receipt Parser

Приложение для автоматического извлечения и структурирования данных из документов строительных проектов с помощью искусственного интеллекта.

## Возможности

- Анализ изображений квитанций и чеков через OCR
- Обработка Excel-таблиц с данными
- Обработка текстовых файлов
- Извлечение данных о поставщиках, товарах и суммах
- Структурирование данных в формате JSON
- Интеграция с Telegram для удобной отправки и получения документов

## Технологии

- Node.js & TypeScript
- Mistral AI API для OCR и анализа текста
- Telegram Bot API
- XLSX для работы с Excel-файлами

## Установка

```bash
# Клонирование репозитория
git clone https://github.com/username/construction-project-receipt-parser.git
cd construction-project-receipt-parser

# Установка зависимостей
npm install

# Создайте файл .env в корне проекта со следующими переменными:
# TELEGRAM_BOT_TOKEN=ваш_токен_бота
# MISTRAL_API_KEY=ваш_ключ_api_mistral
```

## Настройка

Перед запуском приложения необходимо создать файл `.env` в корне проекта со следующими переменными:

```
TELEGRAM_BOT_TOKEN=ваш_токен_бота
MISTRAL_API_KEY=ваш_ключ_api_mistral
```

## Использование

```bash
# Запуск в режиме разработки
npm run dev

# Компиляция TypeScript
npm run build

# Запуск скомпилированного приложения
npm start
```

## Обработка документов

Приложение может обрабатывать следующие типы документов:

1. **Изображения** (jpg, jpeg, png, gif) - извлекает текст с помощью OCR и анализирует его
2. **Excel-файлы** (xls, xlsx) - преобразует таблицы в структурированные данные
3. **Текстовые файлы** - анализирует текстовое содержимое документов

## Формат вывода

Результат обработки документа представляется в формате JSON со следующей структурой:

```json
{
	"supplier": "ООО Компания",
	"items": [
		{
			"name": "Товар 1",
			"article": "ABC123",
			"quantity": 10,
			"unit": "шт",
			"price_no_pdv": 100.5,
			"price_with_pdv": 120.6,
			"total": 1206
		}
	],
	"total_pdv": 201,
	"total_with_pdv": 1206
}
```

## Telegram-бот

Для использования Telegram-бота необходимо:

1. Создать бота у @BotFather и получить токен
2. Указать токен в файле .env
3. Запустить приложение
4. Отправить боту фото квитанции, Excel-файл или текстовый файл

## Разработка

```bash
# Запуск в режиме разработки с отслеживанием изменений
npm run dev

# Запуск тестов
npm test
```

## Лицензия

MIT

## Контакты

Для вопросов и предложений свяжитесь с нами через [GitHub Issues](https://github.com/username/construction-project-receipt-parser/issues).
