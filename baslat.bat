@echo off
setlocal
chcp 65001 >nul
title Discord Duyuru Botu - Baslat
cd /d "%~dp0"

echo ==========================================
echo      DISCORD DUYURU BOTU BASLATILIYOR
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. Once kurulum.bat dosyasini calistirin.
    pause
    exit /b 1
)

if not exist package.json (
    echo [HATA] package.json bulunamadi. Bu dosyayi proje klasorunde calistirin.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [HATA] Paketler kurulu degil. Once kurulum.bat dosyasini calistirin.
    pause
    exit /b 1
)

if not exist .env (
    echo [HATA] .env dosyasi bulunamadi. Once kurulum.bat dosyasini calistirin.
    pause
    exit /b 1
)

findstr /r /c:"^DISCORD_TOKEN=." ".env" >nul 2>&1
if errorlevel 1 (
    echo [HATA] .env icinde DISCORD_TOKEN bulunamadi veya bos.
    echo Discord Developer Portal'dan token alip .env dosyasina ekleyin.
    pause
    exit /b 1
)

echo Discord botu ayri pencerede baslatiliyor...
start "Discord Bot" cmd /k "cd /d ""%~dp0"" && npm start"

echo Kick webhook'u bekleniyor...
set /a waited=0

:wait_for_webhook
set "WEBHOOK_READY="
for /f "tokens=1,* delims==" %%A in ('findstr /b "DISCORD_WEBHOOK_URL=" ".env" 2^>nul') do if not "%%B"=="" set "WEBHOOK_READY=1"
if defined WEBHOOK_READY goto start_monitors
if %waited% GEQ 60 goto monitor_timeout
timeout /t 3 /nobreak >nul
set /a waited+=3
goto wait_for_webhook

:start_monitors
echo Webhook hazir. Monitorler ayri pencerede baslatiliyor...
start "Discord Monitorler" cmd /k "cd /d ""%~dp0"" && npm run all-monitors"
echo.
echo Bot ve monitorler baslatildi. Acilan pencereleri kapatmayin.
timeout /t 3 /nobreak >nul
exit /b 0

:monitor_timeout
echo.
echo [UYARI] 60 saniyede webhook bulunamadi.
echo Discord bot penceresinde token ve izin hatalarini kontrol edin.
echo Monitorler baslatilmadi.
pause
exit /b 1
