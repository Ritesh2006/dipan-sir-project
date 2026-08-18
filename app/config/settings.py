"""Configuration settings management for Offline Voice Logger."""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env if present
BASE_DIR = Path(__file__).resolve().parent.parent.parent
env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)


class Settings:
    """Application Settings loaded from environment or default configuration."""

    APP_NAME: str = os.getenv("APP_NAME", "Offline Voice Logger")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "tiny")
    LANGUAGE: str = os.getenv("LANGUAGE", "en")
    SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))
    CHUNK_DURATION: float = float(os.getenv("CHUNK_DURATION", "3.0"))

    # Google Drive Target Integration
    GOOGLE_DRIVE_FOLDER_ID: str = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk")
    GOOGLE_DRIVE_BASE_URL: str = os.getenv("GOOGLE_DRIVE_BASE_URL", "https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk")
    GOOGLE_APPS_SCRIPT_URL: str = os.getenv("GOOGLE_APPS_SCRIPT_URL", "")

    # File paths
    BASE_DIR: Path = BASE_DIR
    EXCEL_FILE: Path = BASE_DIR / os.getenv("EXCEL_FILE", "data/exports/voice_log.xlsx")
    DATABASE_FILE: Path = BASE_DIR / os.getenv("DATABASE_FILE", "data/database/app.db")
    LOG_FILE: Path = BASE_DIR / "data/logs/app.log"
    MODELS_DIR: Path = BASE_DIR / os.getenv("MODELS_DIR", "models")

    # Audio & VAD settings
    DEVICE_INDEX: Optional[int] = (
        int(os.getenv("DEVICE_INDEX")) if os.getenv("DEVICE_INDEX") and os.getenv("DEVICE_INDEX") != "-1" else None
    )
    VAD_THRESHOLD: float = float(os.getenv("VAD_THRESHOLD", "0.01"))
    VAD_SILENCE_LIMIT: float = float(os.getenv("VAD_SILENCE_LIMIT", "1.5"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")

    @classmethod
    def ensure_directories(cls) -> None:
        """Ensure all required runtime directories exist."""
        cls.EXCEL_FILE.parent.mkdir(parents=True, exist_ok=True)
        cls.DATABASE_FILE.parent.mkdir(parents=True, exist_ok=True)
        cls.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        cls.MODELS_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
