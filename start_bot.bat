@echo off
setlocal EnableDelayedExpansion

REM Create logs directory
if not exist logs mkdir logs

REM Log files           
set LOG_FILE=logs\bot.log
set ERROR_LOG=logs\error.log

echo %date% %time% - Bot is starting >> %LOG_FILE%

REM Check Node.js
node --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not installed! Install Node.js and try again.
    echo %date% %time% - Error: Node.js not installed >> %ERROR_LOG%
    pause
    exit /b 1
)

REM Check .env file
if not exist .env (
    if exist .env.example (
        echo ATTENTION: .env not found. Creating from .env.example
        copy .env.example .env
        echo .env file created. Edit the file and add the necessary tokens.
        start notepad .env
        echo %date% %time% - Created .env from example >> %LOG_FILE%
        pause
        exit /b 1
    ) else (
        echo ERROR: .env and .env.example files are missing!
        echo %date% %time% - Missing .env and .env.example >> %ERROR_LOG%
        pause
        exit /b 1
    )
)

REM Check dependencies
if not exist node_modules (
    echo Installing dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies!
        echo %date% %time% - Error installing dependencies >> %ERROR_LOG%
        pause
        exit /b 1
    )
    echo Dependencies installed.
)

REM Компиляция проекта
if not exist dist (
    echo Compiling project...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to compile project!
        echo %date% %time% - Error compiling project >> %ERROR_LOG%
        pause
        exit /b 1
    )
    echo Project compiled.
)

REM Проверка конфигурации
findstr /C:"TELEGRAM_BOT_TOKEN=" .env | findstr /V "#" > nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: TELEGRAM_BOT_TOKEN not configured in .env file
    echo %date% %time% - TELEGRAM_BOT_TOKEN not configured >> %ERROR_LOG%
    pause
    exit /b 1
)

findstr /C:"CLAUDE_API_KEY=" .env | findstr /V "#" > nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: CLAUDE_API_KEY not configured in .env file
    echo %date% %time% - CLAUDE_API_KEY not configured >> %ERROR_LOG%
    pause
    exit /b 1
)

echo Starting bot...
echo %date% %time% - Starting bot >> %LOG_FILE%

REM Start bot
call npm run serve

REM Check exit code
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Bot finished with error (code %ERRORLEVEL%)
    echo %date% %time% - Bot finished with error code %ERRORLEVEL% >> %ERROR_LOG%
    echo See logs for details.
) else (
    echo Bot finished successfully.
    echo %date% %time% - Bot finished successfully >> %LOG_FILE%
)

pause 