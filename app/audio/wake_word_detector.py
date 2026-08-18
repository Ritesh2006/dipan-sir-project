"""Voice Wake-Word and Stop-Word Detector with Wake Word 'RUBY'."""

import re
from typing import Optional
from app.utils.logger import logger


class WakeWordDetector:
    """Detects spoken wake word ('Ruby', 'Hey Ruby') and stop commands ('Stop', 'Ruby Stop')."""

    WAKE_KEYWORDS = [
        r"\bruby\b",
        r"\bhey\s*ruby\b",
        r"\bhi\s*ruby\b",
        r"\bstart\s*ruby\b",
        r"\bok\s*ruby\b",
        r"\bruby\s*start\b",
        r"\bstart\s*recording\b",
        r"\bstart\b",
        r"\brecord\b",
        r"\bbegin\s*recording\b"
    ]

    STOP_KEYWORDS = [
        r"\bruby\s*stop\b",
        r"\bstop\s*ruby\b",
        r"\bstop\s*recording\b",
        r"\bstop\b",
        r"\bdone\b",
        r"\bfinish\b",
        r"\bterminate\b"
    ]

    @classmethod
    def detect_command(cls, text: str) -> Optional[str]:
        """Inspect text for wake word 'Ruby' or stop keywords.
        
        Returns:
            "WAKE" if wake word ('Ruby') detected.
            "STOP" if stop command ('Stop', 'Ruby Stop') detected.
            None otherwise.
        """
        if not text:
            return None

        clean_text = text.lower().strip()

        for pattern in cls.STOP_KEYWORDS:
            if re.search(pattern, clean_text):
                logger.info(f"Voice Stop Command Detected: '{clean_text}'")
                return "STOP"

        for pattern in cls.WAKE_KEYWORDS:
            if re.search(pattern, clean_text):
                logger.info(f"Voice Wake Command ('RUBY') Detected: '{clean_text}'")
                return "WAKE"

        return None
