@echo off
setlocal
chcp 65001 >nul
title Discord Duyuru Botu - Kurulum
cd /d "%~dp0"

echo ==========================================
echo      DISCORD DUYURU BOTU KURULUMU
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo Node.js 22 LTS kurduktan sonra bu dosyayi tekrar calistirin.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist package.json (
    echo [HATA] package.json bulunamadi. Dosyayi proje klasorunde calistirin.
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js kontrolu:
node --version
echo.

echo [2/3] Paketler kuruluyor...
call npm install
if errorlevel 1 (
    echo.
    echo [HATA] Paket kurulumu basarisiz oldu.
    pause
    exit /b 1
)
echo.

if not exist .env if exist .env.example (
    copy /y .env.example .env >nul
    echo [3/3] .env dosyasi olusturuldu.
) else (
    echo [3/3] .env dosyasi zaten mevcut.
)

echo.
echo ==========================================
echo Kurulum tamamlandi.
echo ==========================================
echo.
echo Simdi .env dosyasini acip Discord bilgilerini doldurun.
echo Tokeni GitHub'a yuklemeyin ve buraya gondermeyin.
echo Sonra bir kez su komutu calistirin:
echo     npm run deploy-commands
echo Ardindan botu baslatmak icin baslat.bat dosyasini acin.
echo.
pause
