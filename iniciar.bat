@echo off
setlocal
cd /d "%~dp0"

if exist "backend\venv\Scripts\activate.bat" (
  call "backend\venv\Scripts\activate.bat"
) else if exist "backend\.venv\Scripts\activate.bat" (
  call "backend\.venv\Scripts\activate.bat"
) else (
  echo Nao achei o venv em backend\venv.
  echo Crie o venv e instale as dependencias, como explica o README.md.
  pause
  exit /b 1
)

python dev.py %*
set "CODIGO=%ERRORLEVEL%"
pause
exit /b %CODIGO%
