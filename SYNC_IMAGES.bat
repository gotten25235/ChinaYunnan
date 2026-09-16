@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Yunnan V1 - Exact Image Sync

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ============================================================
echo Yunnan V1 - Sync exact remote images into local WebP files
echo ============================================================
echo.

set "PY_EXE="
set "PY_ARGS="
set "PY_HOME="

rem ============================================================
rem Find Python
rem Priority:
rem   1. Currently active Conda environment
rem   2. python on PATH
rem   3. Windows Python Launcher (py -3)
rem   4. Conda base environment
rem   5. Common Anaconda / Miniconda locations
rem ============================================================


rem ------------------------------------------------------------
rem 1) Currently active Conda environment
rem ------------------------------------------------------------
if defined CONDA_PREFIX (
    if exist "%CONDA_PREFIX%\python.exe" (
        set "PY_EXE=%CONDA_PREFIX%\python.exe"
        echo Active Conda environment detected:
        echo   %CONDA_PREFIX%
        echo.
    )
)


rem ------------------------------------------------------------
rem 2) Python already available on PATH
rem ------------------------------------------------------------
if not defined PY_EXE (
    where python >nul 2>nul

    if not errorlevel 1 (
        python -c "import sys; assert sys.version_info.major == 3" >nul 2>nul

        if not errorlevel 1 (
            set "PY_EXE=python"
        )
    )
)


rem ------------------------------------------------------------
rem 3) Windows Python Launcher
rem ------------------------------------------------------------
if not defined PY_EXE (
    where py >nul 2>nul

    if not errorlevel 1 (
        py -3 -c "import sys; assert sys.version_info.major == 3" >nul 2>nul

        if not errorlevel 1 (
            set "PY_EXE=py"
            set "PY_ARGS=-3"
        )
    )
)


rem ------------------------------------------------------------
rem 4) Ask Conda where its base environment is
rem ------------------------------------------------------------
if not defined PY_EXE (
    where conda >nul 2>nul

    if not errorlevel 1 (
        for /f "usebackq delims=" %%B in (`call conda info --base 2^>nul`) do (
            if exist "%%B\python.exe" (
                set "PY_EXE=%%B\python.exe"
            )
        )
    )
)


rem ------------------------------------------------------------
rem 5) Common Anaconda / Miniconda locations
rem ------------------------------------------------------------
if not defined PY_EXE if exist "%USERPROFILE%\anaconda3\python.exe" (
    set "PY_EXE=%USERPROFILE%\anaconda3\python.exe"
)

if not defined PY_EXE if exist "%USERPROFILE%\miniconda3\python.exe" (
    set "PY_EXE=%USERPROFILE%\miniconda3\python.exe"
)

if not defined PY_EXE if exist "%LOCALAPPDATA%\anaconda3\python.exe" (
    set "PY_EXE=%LOCALAPPDATA%\anaconda3\python.exe"
)

if not defined PY_EXE if exist "%LOCALAPPDATA%\miniconda3\python.exe" (
    set "PY_EXE=%LOCALAPPDATA%\miniconda3\python.exe"
)

if not defined PY_EXE if exist "%ProgramData%\anaconda3\python.exe" (
    set "PY_EXE=%ProgramData%\anaconda3\python.exe"
)

if not defined PY_EXE if exist "%ProgramData%\miniconda3\python.exe" (
    set "PY_EXE=%ProgramData%\miniconda3\python.exe"
)


rem ------------------------------------------------------------
rem Python not found
rem ------------------------------------------------------------
if not defined PY_EXE (
    echo.
    echo ============================================================
    echo ERROR: Python 3 / Anaconda was not found.
    echo ============================================================
    echo.
    echo Open Anaconda Prompt and run:
    echo.
    echo   where python
    echo.
    pause
    exit /b 1
)


rem ============================================================
rem Prepare Conda DLL paths when PY_EXE is a full path
rem ============================================================

if exist "%PY_EXE%" (

    for %%I in ("%PY_EXE%") do (
        set "PY_HOME=%%~dpI"
    )

    if defined PY_HOME (
        if "!PY_HOME:~-1!"=="\" (
            set "PY_HOME=!PY_HOME:~0,-1!"
        )
    )

    rem Conda keeps OpenSSL and other native DLLs here.
    set "PATH=!PY_HOME!;!PY_HOME!\Library\bin;!PY_HOME!\DLLs;!PY_HOME!\Scripts;!PATH!"

    rem Activate this exact Conda environment if possible.
    if exist "!PY_HOME!\Scripts\activate.bat" (
        call "!PY_HOME!\Scripts\activate.bat" "!PY_HOME!" >nul 2>nul
    )
)


rem ============================================================
rem Show actual Python being used
rem ============================================================

echo ============================================================
echo Python environment
echo ============================================================
echo.

echo Command:
echo   "%PY_EXE%" %PY_ARGS%
echo.

"%PY_EXE%" %PY_ARGS% -c "import sys; print('Executable :', sys.executable); print('Python     :', sys.version.replace(chr(10),' '))"

echo.

if defined PY_HOME (
    echo Python home:
    echo   !PY_HOME!
    echo.
)


rem ============================================================
rem Check SSL
rem ============================================================

echo ============================================================
echo Checking SSL
echo ============================================================
echo.

"%PY_EXE%" %PY_ARGS% -c "import ssl; print('SSL        : OK'); print('OpenSSL    :', ssl.OPENSSL_VERSION)"

if errorlevel 1 (

    echo.
    echo ============================================================
    echo ERROR: Python SSL runtime could not load.
    echo ============================================================
    echo.
    echo Open Anaconda Prompt and run:
    echo.
    echo   conda activate EX_Project38
    echo   conda install --force-reinstall openssl ca-certificates
    echo.
    echo If SSL is still broken:
    echo.
    echo   conda install --force-reinstall python
    echo.
    pause
    exit /b 2
)


rem ============================================================
rem Check Pillow
rem ============================================================

echo.
echo ============================================================
echo Checking Pillow
echo ============================================================
echo.

"%PY_EXE%" %PY_ARGS% -c "import PIL; from PIL import Image; print('Pillow     :', PIL.__version__); print('Resampling :', hasattr(Image, 'Resampling'))"

if errorlevel 1 (

    echo.
    echo ============================================================
    echo ERROR: Pillow is not installed correctly.
    echo ============================================================
    echo.
    echo Install Pillow with:
    echo.
    echo   "%PY_EXE%" %PY_ARGS% -m pip install Pillow==10.4.0
    echo.
    pause
    exit /b 3
)


rem ============================================================
rem Require Image.Resampling
rem ============================================================

"%PY_EXE%" %PY_ARGS% -c "from PIL import Image; assert hasattr(Image, 'Resampling'), 'Image.Resampling is unavailable'"

if errorlevel 1 (

    echo.
    echo ============================================================
    echo ERROR: Pillow is too old or the wrong Python is being used.
    echo ============================================================
    echo.
    echo The script requires:
    echo.
    echo   Pillow 10.4.0
    echo.
    echo Run:
    echo.
    echo   "%PY_EXE%" %PY_ARGS% -m pip uninstall Pillow -y
    echo   "%PY_EXE%" %PY_ARGS% -m pip install Pillow==10.4.0
    echo.
    pause
    exit /b 4
)


rem ============================================================
rem Check WebP support
rem ============================================================

echo.
echo ============================================================
echo Checking WebP support
echo ============================================================
echo.

"%PY_EXE%" %PY_ARGS% -c "from PIL import features; import sys; ok=features.check('webp'); print('WebP       :', ok); sys.exit(0 if ok else 1)"

if errorlevel 1 (

    echo.
    echo ============================================================
    echo ERROR: This Pillow installation has no WebP support.
    echo ============================================================
    echo.
    echo Reinstall Pillow:
    echo.
    echo   "%PY_EXE%" %PY_ARGS% -m pip uninstall Pillow -y
    echo   "%PY_EXE%" %PY_ARGS% -m pip install --no-cache-dir Pillow==10.4.0
    echo.
    pause
    exit /b 5
)


rem ============================================================
rem Start image sync
rem ============================================================

echo.
echo ============================================================
echo Environment check passed
echo ============================================================
echo.
echo Full progress will also be saved to:
echo   sync_images.log
echo.

"%PY_EXE%" %PY_ARGS% tools\sync_images.py

set "RC=%errorlevel%"


rem ============================================================
rem Failed
rem ============================================================

if not "%RC%"=="0" (

    echo.
    echo ============================================================
    echo Image sync did not finish.
    echo Exit code: %RC%
    echo ============================================================
    echo.
    echo The site still uses one rule: imageId - local - remote - no image.
    echo Only the exact remote URL declared in data is used.
    echo No replacement image is searched or substituted.
    echo.
    echo Please open:
    echo.
    echo   sync_images.log

    if exist "sync_failures.txt" (
        echo   sync_failures.txt
    )

    if exist "sync_summary.txt" (
        echo.
        echo ============================================================
        type "sync_summary.txt"
        echo ============================================================
    )

    echo.
    pause
    exit /b %RC%
)


rem ============================================================
rem Success
rem ============================================================

echo.
echo ============================================================
echo Finished successfully.
echo ============================================================
echo.
echo Output ZIP:
echo.
for /f "usebackq delims=" %%V in (`"%PY_EXE%" %PY_ARGS% -c "import json; print(json.load(open(r'tools/release.json', encoding='utf-8'))['version'])"`) do set "APP_VERSION=%%V"
echo   %~dp0..\yunnan_!APP_VERSION!_all_local.zip

if exist "sync_summary.txt" (
    echo.
    echo ============================================================
    type "sync_summary.txt"
    echo ============================================================
)

echo.
pause

exit /b 0