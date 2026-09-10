@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Yunnan V1 - Localize Images
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo Yunnan V1 - Download all remote photos and build local ZIP
echo ============================================================
echo.

set "PY_EXE="
set "PY_ARGS="
set "PY_HOME="

rem 1) Windows Python Launcher
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; assert sys.version_info.major == 3" >nul 2>nul
  if not errorlevel 1 (
    set "PY_EXE=py"
    set "PY_ARGS=-3"
  )
)

rem 2) Python already available on PATH
if not defined PY_EXE (
  where python >nul 2>nul
  if not errorlevel 1 (
    python -c "import sys; assert sys.version_info.major == 3" >nul 2>nul
    if not errorlevel 1 set "PY_EXE=python"
  )
)

rem 3) Active Conda environment
if not defined PY_EXE if defined CONDA_PREFIX (
  if exist "%CONDA_PREFIX%\python.exe" (
    set "PY_EXE=%CONDA_PREFIX%\python.exe"
  )
)

rem 4) Ask Conda where its base environment is
if not defined PY_EXE (
  where conda >nul 2>nul
  if not errorlevel 1 (
    for /f "usebackq delims=" %%B in (`call conda info --base 2^>nul`) do (
      if exist "%%B\python.exe" set "PY_EXE=%%B\python.exe"
    )
  )
)

rem 5) Common Anaconda / Miniconda locations
if not defined PY_EXE if exist "%USERPROFILE%\anaconda3\python.exe" set "PY_EXE=%USERPROFILE%\anaconda3\python.exe"
if not defined PY_EXE if exist "%USERPROFILE%\miniconda3\python.exe" set "PY_EXE=%USERPROFILE%\miniconda3\python.exe"
if not defined PY_EXE if exist "%LOCALAPPDATA%\anaconda3\python.exe" set "PY_EXE=%LOCALAPPDATA%\anaconda3\python.exe"
if not defined PY_EXE if exist "%LOCALAPPDATA%\miniconda3\python.exe" set "PY_EXE=%LOCALAPPDATA%\miniconda3\python.exe"
if not defined PY_EXE if exist "%ProgramData%\anaconda3\python.exe" set "PY_EXE=%ProgramData%\anaconda3\python.exe"
if not defined PY_EXE if exist "%ProgramData%\miniconda3\python.exe" set "PY_EXE=%ProgramData%\miniconda3\python.exe"

if not defined PY_EXE (
  echo Python 3 / Anaconda was not found.
  echo Open Anaconda Prompt and run: where python
  echo.
  pause
  exit /b 1
)

rem If PY_EXE is a full path, prepare the DLL search path used by Conda.
if exist "%PY_EXE%" (
  for %%I in ("%PY_EXE%") do set "PY_HOME=%%~dpI"
  if defined PY_HOME if "!PY_HOME:~-1!"=="\" set "PY_HOME=!PY_HOME:~0,-1!"

  rem Conda keeps OpenSSL and other native DLLs in Library\bin.
  set "PATH=!PY_HOME!;!PY_HOME!\Library\bin;!PY_HOME!\DLLs;!PY_HOME!\Scripts;!PATH!"

  rem Activate the same Conda environment when activation script is available.
  if exist "!PY_HOME!\Scripts\activate.bat" (
    call "!PY_HOME!\Scripts\activate.bat" "!PY_HOME!" >nul 2>nul
  )
)

echo Python: "%PY_EXE%" %PY_ARGS%
if defined PY_HOME echo Python home: !PY_HOME!
echo.

rem Fail early with a clear message if the Anaconda SSL runtime is still broken.
"%PY_EXE%" %PY_ARGS% -c "import ssl; print('SSL: OK -', ssl.OPENSSL_VERSION)"
if errorlevel 1 (
  echo.
  echo ============================================================
  echo Anaconda Python was found, but its SSL runtime could not load.
  echo ============================================================
  echo.
  echo This launcher already added the usual Conda DLL folders to PATH.
  echo If the error above still says DLL load failed, open Anaconda Prompt and run:
  echo.
  echo   conda activate base
  echo   conda install --force-reinstall openssl ca-certificates
  echo.
  echo If SSL is still broken after that, run:
  echo   conda install --force-reinstall python
  echo.
  echo Then run this BAT again.
  echo.
  pause
  exit /b 2
)

echo.
echo Full progress will also be saved to localize_images.log
echo.

"%PY_EXE%" %PY_ARGS% tools\localize_remote_images.py
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
