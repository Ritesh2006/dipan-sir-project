"""SQLite connection manager."""

import sqlite3
from pathlib import Path
from typing import Optional
from app.config.settings import settings
from app.database.models import CREATE_LOGS_TABLE_SQL
from app.utils.logger import logger


class DatabaseManager:
    """Manages thread-safe SQLite connection and table initialization."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.DATABASE_FILE
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def get_connection(self) -> sqlite3.Connection:
        """Return new SQLite connection."""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        """Initialize SQLite database tables."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(CREATE_LOGS_TABLE_SQL)
                conn.commit()
            logger.info(f"Database initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize database at {self.db_path}: {e}")
            raise
