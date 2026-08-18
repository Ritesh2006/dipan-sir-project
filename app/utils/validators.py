"""Validation and sanitization utility functions."""

from typing import Any


def sanitize_excel_value(value: Any) -> Any:
    """Sanitize string values to prevent Excel formula injection attacks.

    Values starting with =, +, -, @, \\t, \\r are prefixed with a single quote.
    """
    if isinstance(value, str):
        stripped = value.strip()
        if stripped and stripped[0] in ("=", "+", "-", "@", "\t", "\r"):
            return f"'{value}"
    return value


def validate_extracted_data(data: Any) -> tuple[bool, str]:
    """Validate extracted dictionary or model fields before writing.

    Returns (is_valid, error_message).
    """
    if hasattr(data, "to_excel_row"):
        data = data.to_excel_row()
    elif hasattr(data, "model_dump"):
        data = data.model_dump()
    elif hasattr(data, "dict"):
        data = data.dict()
    elif hasattr(data, "__dict__") and not isinstance(data, dict):
        data = data.__dict__

    if not isinstance(data, dict):
        return False, "Extracted data is not a dictionary"

    if not data:
        return False, "Extracted data is empty"

    # Check that at least one field has non-empty content
    has_content = any(v is not None and str(v).strip() != "" for v in data.values())
    if not has_content:
        return False, "All fields in extracted data are empty"

    return True, "Valid"
