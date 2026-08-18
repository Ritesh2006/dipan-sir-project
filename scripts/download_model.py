#!/usr/bin/env python3
"""Utility script to pre-download Whisper models for 100% offline usage."""

import os
import sys
import argparse
import warnings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Suppress HuggingFace deprecation warnings for clean output
warnings.filterwarnings("ignore")

from app.config.settings import settings
from app.utils.logger import logger


def download_model(model_size: str = "tiny") -> None:
    """Download faster-whisper model into local models directory."""
    print(f"[*] Pre-downloading Whisper model '{model_size}' to '{settings.MODELS_DIR}'...")
    try:
        from faster_whisper import download_model as fw_download

        target_dir = settings.MODELS_DIR / f"whisper-{model_size}"
        fw_download(model_size, output_dir=str(target_dir))
        print(f"[✓] Successfully downloaded model '{model_size}' to {target_dir}")
        logger.info(f"Model '{model_size}' successfully downloaded offline.")
    except Exception as e:
        print(f"[X] Failed to download model: {e}")
        logger.error(f"Download model script failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download Whisper model for offline use.")
    parser.add_argument("--model", type=str, default=settings.WHISPER_MODEL, help="Model size (tiny, base, small)")
    args = parser.parse_args()

    download_model(args.model)
