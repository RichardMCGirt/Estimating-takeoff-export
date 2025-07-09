module.exports = {
  apps : [{
    name: 'ngrok-tunnel',
    script: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    interpreter: 'none',
    args: '-ExecutionPolicy Bypass -NoProfile -File C:\\Users\\vmadmin\\Estimating-takeoff-export\\start-ngrok.ps1'
  }]
};
