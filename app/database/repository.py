"""Repository for querying and saving history logs in SQLite."""

import json
from typing import List, Dict, Any, Optional
from app.database.db import DatabaseManager
from app.database.models import ProcessingLogRecord
from app.utils.logger import logger


class ProcessingLogRepository:
    """Data Access Object for SQLite processing history."""

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db_manager = db_manager or DatabaseManager()

    def add_log(self, record: ProcessingLogRecord) -> int:
        """Insert a processing log record into SQLite."""
        sql = """
        INSERT INTO processing_logs (timestamp, raw_transcript, extracted_data, processing_status, confidence, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
        """
        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, record.to_row_tuple())
                conn.commit()
                log_id = cursor.lastrowid
                logger.info(f"Saved log record #{log_id} into database (status={record.processing_status}).")
                return log_id
        except Exception as e:
            logger.error(f"Error saving log record to database: {e}")
            return -1

    def get_recent_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve recent processing logs."""
        sql = "SELECT * FROM processing_logs ORDER BY id DESC LIMIT ?"
        logs = []
        try:
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, (limit,))
                rows = cursor.fetchall()
                for row in rows:
                    item = dict(row)
                    try:
                        item["extracted_data"] = json.loads(item["extracted_data"])
                    except Exception:
                        pass
                    logs.append(item)
        except Exception as e:
            logger.error(f"Error fetching logs from database: {e}")
        return logs
