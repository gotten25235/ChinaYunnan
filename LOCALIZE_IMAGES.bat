@echo off
setlocal
cd /d "%~dp0"
title Yunnan V1 - Localize Images

echo ============================================================
echo Yunnan V1 - Download all remote photos and build local ZIP
echo ============================================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\localize_remote_images.py
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python tools\localize_remote_images.py
  goto :done
)

echo Python 3 was not found.
echo Please install Python 3, then double-click this file again.
exit /b 1

:done
if errorlevel 1 (
  echo.
  echo Localization failed. The original V1 files were kept where possible.
  pause
  exit /b 1
)

echo.
echo Finished. Look for yunnan_v1_all_local.zip in the parent folder.
pause
