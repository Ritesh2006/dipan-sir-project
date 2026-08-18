"""Logging configuration for Offline Voice Logger."""

import sys
import logging
from logging.handlers import RotatingFileHandler
from app.config.settings import settings


def setup_logger(name: str = "offline_voice_logger") -> logging.Logger:
    """Configure and return structured application logger."""
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))

    # Prevent duplicate handlers if called multiple times
    if logger.handlers:
        return logger

    # Log format
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s:%(filename)s:%(lineno)d]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Rotating File Handler (Max 5MB per file, max 3 backups)
    file_handler = RotatingFileHandler(
        filename=str(settings.LOG_FILE),
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


logger = setup_logger()
