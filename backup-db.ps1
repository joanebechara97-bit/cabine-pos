$time = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

$pgdump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

$dburl = "postgresql://neondb_owner:npg_jAl7BUhPD9JS@ep-fancy-waterfall-alpzan9u-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

$backupFolder = "Y:\Users' Protected Data\Elie Ayoub\JOANE\cabine-pos\backups"

& $pgdump $dburl -f "$backupFolder\backup_$time.sql"
