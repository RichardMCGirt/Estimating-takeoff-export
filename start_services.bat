@echo off
REM Start Flask server (Windows service should already handle this, but this is a fallback)
REM Uncomment if you want to start python server here instead of NSSM service
REM start "" "C:\Users\vmadmin\Estimating-takeoff-export\venv\Scripts\python.exe" "C:\Users\vmadmin\Estimating-takeoff-export\local_injection_server.py"

REM Start ngrok tunnel
start "" "C:\Users\vmadmin\Estimating-takeoff-export\ngrok.exe" http 5000
