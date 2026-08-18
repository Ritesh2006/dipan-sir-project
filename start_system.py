#!/usr/bin/env python3
"""1-Click Launcher for Live Voice Audio Transcription & Automatic Excel Logging System."""

import os
import sys
import time
import subprocess
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

load_dotenv()

from app.utils.logger import logger


def start_system():
    print("==================================================")
    print(" NATIONAL EXHIBITION 2026 – LIVE SYSTEM LAUNCHER")
    print("==================================================")
    print(" [*] 1. Live Offline Whisper Speech-to-Text Engine")
    print(" [*] 2. Automated Master Excel Logging (National Exhibition 2026 – Data.xlsx)")
    print(" [*] 3. Google Drive Auto-Sync (Folder: 1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk)")
    print("==================================================\n")

    # 1. Start Python API Upload & Transcription Server (Port 8080)
    server_env = dict(os.environ)
    server_env["PYTHONPATH"] = str(BASE_DIR)
    server_cmd = [str(BASE_DIR / ".venv" / "bin" / "python"), str(BASE_DIR / "app" / "api" / "upload_server.py")]
    print("[*] Launching API Upload & Whisper STT Server on port 8080...")
    server_process = subprocess.Popen(server_cmd, env=server_env)

    # 2. Start Frontend Web UI Application (Port 5173)
    web_dir = BASE_DIR / "mobile_app"
    web_cmd = ["npm", "run", "dev"]
    print("[*] Launching Web UI Application on port 5173...")
    web_process = subprocess.Popen(web_cmd, cwd=str(web_dir))

    time.sleep(3)

    # 3. Display Access URLs
    local_ip = "172.28.36.209"
    print("\n==================================================")
    print(" SYSTEM IS LIVE & READY!")
    print("==================================================")
    print(f" [📱 Web App on Phone / Wi-Fi] : http://{local_ip}:5173")
    print(f" [💻 Web App on Computer]     : http://localhost:5173")
    print(f" [⚡ Backend API Endpoint]     : http://{local_ip}:8080/api/upload")
    print(f" [📁 Google Drive Folder]     : https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk")
    print("==================================================")
    print(" Press Ctrl+C anytime to stop all servers.\n")

    try:
        server_process.wait()
    except KeyboardInterrupt:
        print("\n[*] Stopping all servers...")
        server_process.terminate()
        web_process.terminate()
        print(" [✓] System stopped safely.")


if __name__ == "__main__":
    start_system()
