@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Yunnan V1 - Localize Images
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo Yunnan V1 - Download all remote photos and build local ZIP
echo ============================================================
echo.

set "PY_CMD="
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -c "import sys; assert sys.version_info.major == 3" >nul 2>nul
  if %errorlevel%==0 set "PY_CMD=py -3"
)

if not defined PY_CMD (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python -c "import sys; assert sys.version_info.major == 3" >nul 2>nul
    if %errorlevel%==0 set "PY_CMD=python"
  )
)

if not defined PY_CMD (
  echo Python 3 was not found.
  echo Please install Python 3, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo Python: %PY_CMD%
echo Full progress will also be saved to localize_images.log
echo.

%PY_CMD% tools\localize_remote_images.py
set "RC=%errorlevel%"

if not "%RC%"=="0" (
  echo.
  echo ============================================================
  echo Localization did not finish. Exit code: %RC%
  echo ============================================================
  echo The original V1 metadata was kept unchanged.
  echo Successful photo downloads were kept and will be reused next run.
  echo.
  echo Please open:
  echo   localize_images.log
  if exist "localize_failures.txt" echo   localize_failures.txt
  echo.
  pause
  exit /b %RC%
)

echo.
echo ============================================================
echo Finished successfully.
echo ============================================================
echo Output ZIP:
echo   %~dp0..\yunnan_v1_all_local.zip
echo.
pause
exit /b 0
