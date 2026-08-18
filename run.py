#!/usr/bin/env python3
"""Run script for Offline Voice Logger application with automatic venv detection."""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.main import main

if __name__ == "__main__":
    main()
