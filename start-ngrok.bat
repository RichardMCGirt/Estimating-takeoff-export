@echo off
cd /d C:\Users\vmadmin\Estimating-takeoff-export

echo Starting Flask server in venv...
start "" venv\Scripts\python.exe local_injection_server.py

echo Starting ngrok tunnel using ngrok.yml...
start "" ngrok.exe start myinjector

echo Both Flask and ngrok started!
exit
