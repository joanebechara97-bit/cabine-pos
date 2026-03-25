@echo off

set DB_NAME=neondb
set DB_USER=postgres
set DB_HOST=localhost
set BACKUP_FOLDER=Y:\Users' Protected Data\Elie Ayoub\JOANE\cabine-pos\backups

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do (
set day=%%a
set month=%%b
set year=%%c
)

set filename=%BACKUP_FOLDER%\backup_%year%-%month%-%day%.sql

pg_dump -h %DB_HOST% -U %DB_USER% -d %DB_NAME% -F p -f "%filename%"

echo Backup completed: %filename%