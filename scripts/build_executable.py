"""PyInstaller packaging script for building standalone desktop binary."""

import os
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.config.settings import settings


def build():
    print("==================================================")
    print(" Building Standalone Desktop Executable")
    print("==================================================")

    dist_dir = BASE_DIR / "dist"
    build_dir = BASE_DIR / "build"

    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--name=OfflineVoiceLogger",
        "--onedir",
        "--windowed",  # Desktop GUI app mode
        "--clean",
        f"--add-data={BASE_DIR / '.env.example'}:.",
        "--collect-all=PySide6",
        "--collect-all=faster_whisper",
        "--collect-all=ctranslate2",
        "--collect-all=openpyxl",
        "--collect-all=sounddevice",
        str(BASE_DIR / "run.py"),
    ]

    print(f"Executing: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, cwd=str(BASE_DIR), check=True)
        print("\n[✓] Build completed successfully!")
        print(f"Executable folder generated at: {dist_dir / 'OfflineVoiceLogger'}")
    except subprocess.CalledProcessError as e:
        print(f"\n[X] Build failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    build()
