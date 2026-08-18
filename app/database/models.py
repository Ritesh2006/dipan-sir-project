"""Database model definitions for SQLite history log."""

import json
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from app.utils.helpers import get_current_timestamp


CREATE_LOGS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS processing_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    raw_transcript TEXT NOT NULL,
    extracted_data TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    confidence REAL DEFAULT 0.0,
    error_message TEXT
);
"""


@dataclass
class ProcessingLogRecord:
    """Dataclass representing an entry in processing_logs SQLite table."""

    raw_transcript: str
    extracted_data: Dict[str, Any]
    processing_status: str = "SUCCESS"
    confidence: float = 0.0
    error_message: Optional[str] = None
    timestamp: str = field(default_factory=get_current_timestamp)
    id: Optional[int] = None

    def to_row_tuple(self) -> tuple:
        """Return tuple formatted for SQLite INSERT execution."""
        data = self.extracted_data
        if hasattr(data, "to_excel_row"):
            data = data.to_excel_row()
        elif hasattr(data, "model_dump"):
            data = data.model_dump()
        elif hasattr(data, "dict"):
            data = data.dict()
        elif hasattr(data, "__dict__") and not isinstance(data, dict):
            data = data.__dict__

        try:
            json_str = json.dumps(data, ensure_ascii=False)
        except Exception:
            json_str = json.dumps(str(data), ensure_ascii=False)

        return (
            self.timestamp,
            self.raw_transcript,
            json_str,
            self.processing_status,
            self.confidence,
            self.error_message,
        )
