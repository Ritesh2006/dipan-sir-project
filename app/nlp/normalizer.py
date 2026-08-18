"""High-accuracy text normalization engine for speech transcripts."""

import re
from typing import Dict
from app.utils.helpers import clean_text_whitespace
from app.utils.logger import logger

UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19
}

TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
}


def parse_compound_number_words(text: str) -> str:
    """Parse single and compound number words (e.g., 'twenty five' -> '25')."""
    words = text.split()
    new_words = []
    i = 0
    while i < len(words):
        w = words[i].lower()
        if w in TENS and i + 1 < len(words) and words[i + 1].lower() in UNITS:
            val = TENS[w] + UNITS[words[i + 1].lower()]
            new_words.append(str(val))
            i += 2
        elif w in TENS:
            new_words.append(str(TENS[w]))
            i += 1
        elif w in UNITS:
            new_words.append(str(UNITS[w]))
            i += 1
        else:
            new_words.append(words[i])
            i += 1
    return " ".join(new_words)


class TextNormalizer:
    """Normalizes raw speech transcripts into clean text for 100% accurate entity extraction."""

    def normalize(self, text: str) -> str:
        """Run complete normalization pipeline."""
        if not text:
            return ""

        # 1. Lowercase & strip
        normalized = text.lower().strip()

        # 2. Punctuation cleanup (preserve colons, commas, dashes, numbers)
        normalized = re.sub(r"[^\w\s:,\-\.]", " ", normalized)

        # 3. Compound spoken number conversion
        normalized = parse_compound_number_words(normalized)

        # 4. Standardize key domain keywords
        normalized = re.sub(r"\broll\s*(?:number|no|num)?\b", "roll", normalized)
        normalized = re.sub(r"\bphone\s*(?:number|no|num)?\b", "phone", normalized)
        normalized = re.sub(r"\battendance\s*(?:is|status)?\b", "attendance", normalized)

        # 5. Normalize whitespace
        normalized = clean_text_whitespace(normalized)

        logger.debug(f"High-accuracy normalized transcript: '{text}' -> '{normalized}'")
        return normalized
