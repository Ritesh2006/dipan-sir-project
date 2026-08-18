#!/usr/bin/env python3
"""Script to download lightweight offline Vosk speech model for 100% offline mobile app usage."""

import os
import sys
import ssl
import urllib.request
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
TARGET_DIR = BASE_DIR / "mobile_app/public/model"


def download_and_extract():
    print("==================================================")
    print(" DOWNLOADING 100% OFFLINE VOSK MOBILE SPEECH MODEL")
    print("==================================================")

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = BASE_DIR / "mobile_app/public/vosk_model.zip"

    if (TARGET_DIR / "am/final.mdl").exists():
        print("[✓] Vosk offline model already downloaded in mobile_app/public/model/")
        return

    print(f"[*] Downloading offline model from {MODEL_URL}...")
    try:
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(MODEL_URL, context=context) as response, open(zip_path, 'wb') as out_file:
            out_file.write(response.read())

        print("[✓] Download completed. Extracting model files...")

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(BASE_DIR / "mobile_app/public/")

        extracted_folder = BASE_DIR / "mobile_app/public/vosk-model-small-en-us-0.15"
        if extracted_folder.exists():
            for item in extracted_folder.iterdir():
                dest = TARGET_DIR / item.name
                if item.is_dir():
                    item.rename(dest)
                else:
                    item.rename(dest)
            extracted_folder.rmdir()

        if zip_path.exists():
            zip_path.unlink()

        print("[✓] Offline Vosk speech model successfully extracted to mobile_app/public/model/")
    except Exception as e:
        print(f"[X] Failed to download Vosk model: {e}")
        sys.exit(1)


if __name__ == "__main__":
    download_and_extract()
