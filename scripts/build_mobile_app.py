#!/usr/bin/env python3
"""Automated builder script for Mobile Application & Native Android Assets."""

import os
import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.utils.logger import logger


def build_mobile():
    print("==================================================")
    print(" AUTOMATED MOBILE APP & ANDROID ASSET BUILDER")
    print("==================================================")

    mobile_dir = BASE_DIR / "mobile_app"
    if not mobile_dir.exists():
        print("[X] mobile_app directory not found!")
        sys.exit(1)

    print("[*] 1. Building 100% Offline Mobile PWA Web Bundle...")
    try:
        subprocess.run(["npm", "run", "build"], cwd=str(mobile_dir), check=True)
        print("[✓] PWA bundle built in mobile_app/dist/")
    except subprocess.CalledProcessError as e:
        print(f"[X] Mobile PWA build failed: {e}")
        sys.exit(1)

    print("\n[*] 2. Syncing 100% Offline Assets to Native Android Project...")
    try:
        subprocess.run(["npx", "cap", "sync", "android"], cwd=str(mobile_dir), check=True)
        print("[✓] Native Android assets synchronized in mobile_app/android/")
    except subprocess.CalledProcessError as e:
        print(f"[X] Android sync failed: {e}")
        sys.exit(1)

    print("\n==================================================")
    print(" AUTOMATED MOBILE BUILD COMPLETED SUCCESSFULLY!")
    print("==================================================")
    print("Native Android Project: mobile_app/android/")
    print("Offline PWA Assets:      mobile_app/dist/")


if __name__ == "__main__":
    build_mobile()
