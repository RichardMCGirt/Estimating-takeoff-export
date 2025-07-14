# ----------------------------------------------
# nssm_install.ps1
# ----------------------------------------------
# This script launches NSSM to create both services:
#   1. Server2      - Python Waitress/Flask server
#   2. NgrokTunnel2 - Ngrok tunnel for port 5000
# ----------------------------------------------

# Your confirmed NSSM path
$NSSM = "C:\Users\vmadmin\Downloads\nssm-2.24-101-g897c7ad\nssm-2.24-101-g897c7ad\win64\nssm.exe"

# Test the NSSM path first
if (-not (Test-Path $NSSM)) {
    Write-Error "❌ NSSM not found at: $NSSM"
    exit 1
}

Write-Host "✅ NSSM found: $NSSM"

# Launch Server2 service config
Start-Process -FilePath $NSSM -ArgumentList "install Server2"
Write-Host "➡️ Fill out Server2:"
Write-Host "   Path: C:\Users\vmadmin\Estimating-takeoff-export\venv\Scripts\python.exe"
Write-Host "   Arguments: C:\Users\vmadmin\Estimating-takeoff-export\local_injection_server.py"
Write-Host "   Startup directory: C:\Users\vmadmin\Estimating-takeoff-export"

Start-Sleep -Seconds 1

# Launch NgrokTunnel2 service config
Start-Process -FilePath $NSSM -ArgumentList "install NgrokTunnel2"
Write-Host "➡️ Fill out NgrokTunnel2:"
Write-Host "   Path: C:\Users\vmadmin\Estimating-takeoff-export\ngrok.exe"
Write-Host "   Arguments: start --config C:\Users\vmadmin\Estimating-takeoff-export\ngrok.yml myinjector"
Write-Host "   Startup directory: C:\Users\vmadmin\Estimating-takeoff-export"

Write-Host "`n✅ Both NSSM config windows opened. Fill them out, click Install, then use Services to Start them."
Write-Host "`nRun these to verify:"
Write-Host "   $NSSM status Server2"
Write-Host "   $NSSM status NgrokTunnel2"
