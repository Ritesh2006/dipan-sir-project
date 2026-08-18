"""Helper functions for date formatting, string cleaning, and file handling."""

import datetime
from typing import Optional


def get_current_timestamp() -> str:
    """Return ISO format timestamp string."""
    return datetime.datetime.now().isoformat()


def get_current_date(fmt: str = "%Y-%m-%d") -> str:
    """Return formatted current date string."""
    return datetime.datetime.now().strftime(fmt)


def clean_text_whitespace(text: str) -> str:
    """Normalize whitespace in text."""
    if not text:
        return ""
    return " ".join(text.split()).strip()
