Write-Host "Starting ngrok loop..."
Set-Location "C:\Users\vmadmin\Estimating-takeoff-export"

while ($true) {
  Start-Process cmd.exe -ArgumentList "/c start-ngrok.bat" -Wait
  Write-Host "ngrok stopped. Restarting in 5 seconds..."
  Start-Sleep -Seconds 5
}