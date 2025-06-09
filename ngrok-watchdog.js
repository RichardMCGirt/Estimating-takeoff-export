// ngrok-watchdog.js
const { exec } = require("child_process");
const http = require("http");

const NGROK_PORT = 3000; // change this to your local server port
const CHECK_INTERVAL = 10000; // ms (10 seconds)

function isNgrokRunning(callback) {
    http.get(`http://localhost:4040/api/tunnels`, (res) => {
        callback(res.statusCode === 200);
    }).on('error', () => {
        callback(false);
    });
}

function startNgrok() {
    console.log("🔁 Starting ngrok...");
    exec(`ngrok http ${NGROK_PORT}`, (err, stdout, stderr) => {
        if (err) {
            console.error("❌ Failed to start ngrok:", err);
        }
    });
}

// Main loop
setInterval(() => {
    isNgrokRunning((running) => {
        if (!running) {
            console.log("⛔ ngrok not running, restarting...");
            startNgrok();
        } else {
            console.log("✅ ngrok is running.");
        }
    });
}, CHECK_INTERVAL);
