@echo off
rem Sincroniza a caixa (Sheet) com os Pendentes do Organic. Corre a ponte e guarda o resultado em ponte.log
cd /d "%~dp0"
echo === %date% %time% >> ponte.log
"C:\Users\Edson Adolfo\AppData\Local\Programs\Python\Python314\python.exe" -X utf8 ponte.py >> ponte.log 2>&1
