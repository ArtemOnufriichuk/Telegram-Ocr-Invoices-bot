# Telegram OCR Invoices Bot

Приложение для автоматического извлечения и структурирования данных из документов строительных проектов с помощью искусственного интеллекта. Бот анализирует квитанции, чеки и другие документы, извлекает важную информацию и представляет её в структурированном формате.

## Возможности

- **Универсальное распознавание документов**:

  - Анализ изображений квитанций и чеков через OCR (оптическое распознавание символов)
  - Обработка PDF-документов с извлечением текстовой информации
  - Обработка Excel-таблиц с данными (форматы xls, xlsx)
  - Работа с документами любого качества и формата (включая фото низкого качества)

- **Извлечение данных**:

  - Номер и дата счета/накладной
  - Информация о поставщике (название, ЕДРПОУ, ИПН)
  - Детальная информация о товарах и услугах (наименование, артикул, количество, цена)
  - Автоматический расчет сумм с НДС и без НДС
  - Определение единиц измерения и других специфических данных

- **Умный анализ**:

  - Распознавание различных форматов таблиц с помощью ИИ Claude
  - Адаптивный анализ документов с разным расположением данных
  - Работа с нестандартным форматированием документов
  - Интеллектуальное извлечение данных даже из сложных документов

- **Интеграция**:
  - Удобный Telegram-интерфейс для отправки и получения документов
  - Структурированный JSON-ответ для дальнейшей интеграции с другими системами
  - Возможность обработки нескольких документов подряд

## Технологии

- **Backend**: Node.js и TypeScript
- **ИИ**: Claude AI (Anthropic) для OCR и интеллектуального анализа документов
- **Интеграции**:
  - Telegram Bot API для взаимодействия с пользователями
  - XLSX для работы с Excel-файлами
  - PDF Parser для обработки PDF-документов
- **Обработка изображений**: Sharp для предварительной обработки и оптимизации

## Подробная инструкция по установке

### Предварительные требования

1. Node.js (версия 18 или выше)
2. npm или yarn
3. Аккаунт Telegram
4. API-ключ Claude от Anthropic

### Шаги установки

```bash
# 1. Клонирование репозитория
git clone https://github.com/username/telegram-ocr-invoices-bot.git
cd telegram-ocr-invoices-bot

# 2. Установка зависимостей
npm install

# 3. Создание файла конфигурации
cp .env.example .env
```

### Настройка окружения

Откройте файл `.env` в любом текстовом редакторе и заполните следующие переменные:

```
# Обязательные параметры
TELEGRAM_BOT_TOKEN=ваш_токен_бота_от_BotFather
CLAUDE_API_KEY=ваш_ключ_api_claude_от_Anthropic

# Дополнительные параметры (опционально)
LOG_LEVEL=info  # Уровень логирования (debug, info, warn, error)
```

#### Получение токена Telegram бота:

1. Откройте Telegram и найдите @BotFather
2. Отправьте команду `/newbot`
3. Следуйте инструкциям и получите токен бота
4. Скопируйте токен в ваш файл `.env`

#### Получение API-ключа Claude:

1. Зарегистрируйтесь на [сайте Anthropic](https://www.anthropic.com/)
2. Запросите доступ к API Claude (если необходимо)
3. Создайте API-ключ в личном кабинете
4. Скопируйте ключ в ваш файл `.env`

## Запуск приложения

### Запуск через bat-файл (Windows)

Для удобства запуска на Windows предоставлен bat-файл:

```
# Запуск бота с проверкой зависимостей
start_bot.bat
```

Файл запуска выполняет предварительные проверки:

- Наличие Node.js и npm
- Наличие файла .env и необходимых токенов
- Наличие установленных зависимостей
- Корректную компиляцию TypeScript

### Запуск вручную через npm

```bash
# Запуск в режиме разработки (с автоматической перезагрузкой)
npm run dev

# Компиляция TypeScript в JavaScript
npm run build

# Запуск скомпилированного приложения в продакшн-режиме
npm start

# Сборка и запуск в одной команде
npm run serve
```

## Использование бота

### Команды Telegram-бота

- `/start` - Начать работу с ботом, получить приветственное сообщение
- `/help` - Получить справку о доступных командах и возможностях
- `/status` - Проверить статус и работоспособность бота
- `/example` - Получить пример документа и результат его обработки

### Обработка документов

1. **Отправка документа**:

   - Отправьте боту фотографию квитанции или чека
   - Загрузите PDF-документ
   - Отправьте Excel-файл
   - Можно отправлять документы в сжатом виде или оригинального качества
   - **Важно**: Рекомендуется отправлять файлы по одному и дожидаться ответа бота перед отправкой следующего файла для оптимальной обработки

2. **Получение результата**:

   - Бот обработает документ и пришлет структурированный ответ
   - Данные будут представлены в читаемом виде
   - При необходимости бот пришлет JSON-файл с полной структурой данных
   - Обработка занимает от нескольких секунд до минуты в зависимости от сложности документа

3. **Взаимодействие с ботом**:
   - Бот поддерживает диалог для уточнения деталей при необходимости
   - Может запросить дополнительную информацию при неполном распознавании
   - Предлагает опции для дальнейшей обработки документа

## Технология обработки документов

Бот использует многоступенчатый процесс обработки:

1. **Предварительная обработка**:

   - Оптимизация изображений для лучшего распознавания
   - Извлечение текста из PDF-документов
   - Преобразование Excel-таблиц в структурированные данные

2. **Интеллектуальный анализ**:

   - Использование Claude AI для распознавания контекста и структуры документа
   - Адаптивное определение типа документа
   - Извлечение ключевых данных с учетом контекста

3. **Структурирование данных**:
   - Форматирование извлеченной информации в JSON
   - Проверка и валидация данных
   - Расчет итоговых сумм и проверка согласованности данных

Бот особенно эффективен для:

- Документов с нестандартным форматированием
- Таблиц с разным расположением колонок и данных
- Счетов и накладных с уникальным дизайном
- Документов различных поставщиков с разной структурой

## Формат вывода

Результат обработки документа представляется в формате JSON со следующей структурой:

```json
{
	"invoice_number": "1234", // Номер счета
	"invoice_date": "01.01.2023", // Дата счета
	"edrpou": "12345678", // ЕДРПОУ поставщика
	"ipn": "123456789012", // ИПН поставщика
	"supplier": "ООО Поставщик", // Название поставщика
	"isPriceWithPdv": true, // Цены указаны с НДС/ПДВ
	"items": [
		// Список товаров/услуг
		{
			"name": "Товар 1", // Название товара
			"article": "АРТ-001", // Артикул товара
			"quantity": 10, // Количество
			"unit": "шт", // Единица измерения
			"price_no_pdv": 100, // Цена без НДС
			"price_with_pdv": 120, // Цена с НДС
			"total_no_pdv": 1000, // Сумма без НДС
			"total_with_pdv": 1200 // Сумма с НДС
		}
	],
	"total_no_pdv": 1000, // Общая сумма без НДС
	"total_pdv": 200, // Сумма НДС
	"total_with_pdv": 1200 // Общая сумма с НДС
}
```

## Особенности и преимущества

- **Высокая точность распознавания** благодаря использованию продвинутого ИИ
- **Универсальность** — работает с документами разных форматов и структур
- **Модульная архитектура** для легкого расширения функционала
- **Эффективное извлечение данных** даже из сложных документов
- **Надежная обработка ошибок** и преобразование числовых значений
- **Удобный интерфейс** через Telegram для мгновенного доступа с любого устройства
- **Быстрая обработка** документов благодаря оптимизированному коду
- **Умное управление нагрузкой** — система ограничивает количество параллельных запросов к API Claude (до 3 одновременно) и реализует механизм "охлаждения" при ошибках API

## Требования к документам

- **Изображения**: форматы jpg, jpeg, png; желательно хорошее освещение и четкость
- **PDF**: текстовые PDF-файлы (не сканы без OCR-слоя)
- **Excel**: файлы форматов xls, xlsx с таблицами данных

## Разработка и расширение

```bash
# Запуск в режиме разработки с отслеживанием изменений
npm run dev

# Запуск тестов (когда будут реализованы)
npm test
```

## Структура хранения данных

Проект использует разделение на три основные директории для хранения данных:

- **uploads/**: Временная директория для загружаемых файлов (находится внутри проекта)
- **logs/**: Директория для хранения логов работы бота (находится внутри проекта)
- **../files/**: Директория для постоянного хранения обработанных файлов (находится на два уровня выше директории src)

Важно: Директория `files/` должна быть создана вручную при первом запуске проекта по пути, указанному в конфигурации (../../files относительно директории src).

### Структура проекта

```
telegram-ocr-invoices-bot/
├── src/                     # Исходный код
│   ├── services/            # Сервисы приложения
│   │   ├── telegramBot.ts   # Логика Telegram-бота
│   │   └── claudeService.ts # Интеграция с Claude AI
│   ├── types/               # TypeScript типы и интерфейсы
│   │   ├── types.ts         # Основные типы данных
│   │   └── pdf-parse.d.ts   # Типы для PDF парсера
│   ├── config.ts            # Конфигурация приложения
│   └── index.ts             # Точка входа
├── uploads/                 # Временная папка для загрузок
├── logs/                    # Логи работы приложения
├── test-files/              # Тестовые файлы для разработки
├── .env                     # Файл с переменными окружения
├── start_bot.bat            # Скрипт для запуска бота (Windows)
└── package.json             # Зависимости и скрипты
```

## Для перезапуска бота и API запросов настроены следующие параметры:

- **Перезапуск бота** (в start_bot.bat)
- **Сколько раз пробует перезапуститься:** 5 раз (MAX_RETRIES=5)
- **Начальный кулдаун между перезапусками:** 30 секунд (RETRY_DELAY=30)
- **Динамический кулдаун:** После 3 последовательных ошибок задержка удваивается (с 30 до 60, 120 секунд и т.д.)
- **Минимальный интервал между запусками:** 30 секунд (MIN_DELAY=30)
- **Повторные запросы к Claude API** (в claudeService.ts)
- **Сколько раз пробует повторить запрос:** 3 раза (maxRetries=3)
- **Начальный кулдаун между запросами:** 5 секунд (retryDelay=5000)
- **Динамический кулдаун:** При повторных попытках задержка удваивается
- **Режим охлаждения API:** После 3 последовательных ошибок API помечается как недоступный на 60 секунд (cooldownPeriod=60000)
