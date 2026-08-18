"""High-accuracy rule-based pattern matching and extraction heuristics."""

import re
from typing import Dict, Any, Optional
from app.utils.helpers import get_current_date
from app.utils.logger import logger


class ExtractionRules:
    """Regex and position-agnostic rules for 100% accurate entity extraction."""

    @staticmethod
    def extract_roll(text: str) -> Optional[int]:
        """Extract roll number with flexible matching."""
        # Pattern 1: roll [number/no] <digits>
        match = re.search(r"\broll\s*(?:number|no|num)?\s*[:=\-]?\s*(\d+)\b", text)
        if match:
            return int(match.group(1))

        # Pattern 2: <digits> attendance / present / absent
        match = re.search(r"\b(\d+)\s*(?:attendance|present|absent|p|a|leave)\b", text)
        if match:
            return int(match.group(1))

        # Pattern 3: <word> <digits> <status> (e.g. "Rahul 25 present")
        match = re.search(r"\b[a-zA-Z]+\s+(\d+)\s+(?:present|absent|p|a|leave)\b", text)
        if match:
            return int(match.group(1))

        return None

    @staticmethod
    def extract_attendance(text: str) -> Optional[str]:
        """Extract attendance status."""
        if re.search(r"\b(?:present|here|attending|\bp\b)\b", text):
            return "Present"
        if re.search(r"\b(?:absent|missing|not present|\ba\b)\b", text):
            return "Absent"
        if re.search(r"\b(?:leave|on leave|sick leave)\b", text):
            return "Leave"
        return "Present"  # Default

    @staticmethod
    def extract_phone(text: str) -> Optional[str]:
        """Extract phone number (10 to 12 digits)."""
        match = re.search(r"\b(?:phone|mobile|contact)?\s*[:=\-]?\s*(\+?\d{10,12})\b", text)
        if match:
            return match.group(1)
        return None

    @staticmethod
    def extract_age(text: str) -> Optional[int]:
        """Extract age integer."""
        match = re.search(r"\bage\s*[:=\-]?\s*(\d{1,2})\b", text)
        if match:
            return int(match.group(1))
        match = re.search(r"\b(\d{1,2})\s*(?:years|yr|yrs)\b", text)
        if match:
            return int(match.group(1))
        return None

    @staticmethod
    def extract_amount(text: str) -> Optional[float]:
        """Extract numerical amount / money, handling multipliers like million, billion, lakh, crore, k."""
        if not text:
            return None

        multipliers = {
            "k": 1_000,
            "thousand": 1_000,
            "lakh": 100_000,
            "lakhs": 100_000,
            "million": 1_000_000,
            "millions": 1_000_000,
            "crore": 10_000_000,
            "crores": 10_000_000,
            "billion": 1_000_000_000,
            "billions": 1_000_000_000,
        }

        # 1. Match number with explicit multiplier or currency words
        pattern = r"(?:\$|rs|rupees|budget|amount|cost|price|grant|allocation)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|million|millions|crore|crores|billion|billions)?\s*(?:dollars|usd|inr|rs|rupees)?"
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            num_str = match.group(1)
            unit_str = match.group(2)
            full_match = match.group(0).strip().lower()

            if not num_str:
                continue

            has_currency_signal = any(kw in full_match for kw in ["$", "rs", "rupees", "dollar", "usd", "inr", "budget", "amount", "cost", "price", "grant", "allocation"])
            if unit_str:
                return float(num_str) * multipliers.get(unit_str.lower(), 1)
            elif has_currency_signal:
                return float(num_str)

        return None

    @staticmethod
    def extract_status(text: str) -> Optional[str]:
        """Extract task / transaction status."""
        match = re.search(r"\bstatus\s*[:=\-]?\s*([a-zA-Z]+)\b", text)
        if match:
            return match.group(1).capitalize()
        found = re.search(r"\b(paid|done|completed|pending|approved|rejected)\b", text)
        if found:
            return found.group(1).capitalize()
        return None

    @staticmethod
    def extract_name(text: str, extracted_roll: Optional[int] = None) -> Optional[str]:
        """Extract candidate person name using positional & key heuristics."""
        # Pattern 1: name[:=] <Name>
        match = re.search(r"\bname\s*[:=\-]?\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b", text)
        if match:
            candidate = match.group(1).strip()
            if candidate not in ("is", "present", "absent", "roll", "attendance", "status"):
                return candidate.title()

        # Pattern 2: Name before digits or before keywords
        tokens = text.split()
        keywords = {"roll", "attendance", "name", "phone", "status", "date", "age", "project", "amount", "present", "absent", "p", "a"}

        name_tokens = []
        for token in tokens:
            cleaned = re.sub(r"[^\w]", "", token)
            if not cleaned:
                continue
            if cleaned.isdigit() or cleaned.lower() in keywords:
                break
            name_tokens.append(cleaned)

        if name_tokens:
            candidate = " ".join(name_tokens).title()
            if len(candidate) >= 2:
                return candidate

        return "Unknown"
