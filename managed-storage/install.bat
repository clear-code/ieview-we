@ECHO OFF

SET NAME=ieview-we@clear-code.com

ECHO Installing %NAME%...

SET INSTALL_DIR=%LocalAppData%\%NAME%
MD "%INSTALL_DIR%"
COPY *.json "%INSTALL_DIR%\"

ECHO Registering...
FOR %%f IN ("%INSTALL_DIR%") DO SET EXPANDED_PATH=%%~sf
REG ADD "HKCU\SOFTWARE\Mozilla\ManagedStorage\%NAME%" /ve /t REG_SZ /d "%EXPANDED_PATH%\%NAME%.json" /f

ECHO Done.
PAUSE
