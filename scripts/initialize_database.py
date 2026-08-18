#!/usr/bin/env python3
"""Script to initialize SQLite database tables."""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.database.db import DatabaseManager
from app.utils.logger import logger


def init():
    print("[*] Initializing SQLite database...")
    db_mgr = DatabaseManager()
    print(f"[✓] Database successfully initialized at {db_mgr.db_path}")


if __name__ == "__main__":
    init()
