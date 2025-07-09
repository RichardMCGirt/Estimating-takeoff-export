@echo off
echo Starting ngrok tunnel...
cd /d C:\Users\vmadmin\Estimating-takeoff-export

:loop
ngrok http 5000
echo ngrok stopped. Restarting in 5 seconds...
timeout /t 5
goto loop
