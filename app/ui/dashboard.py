"""Historical data table dashboard for PySide6 GUI."""

from typing import List, Dict, Any
from PySide6.QtWidgets import QFrame, QVBoxLayout, QLabel, QTableWidget, QTableWidgetItem, QHeaderView, QWidget
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont


class HistoryDashboard(QFrame):
    """Table dashboard presenting recent Excel & SQLite records."""

    def __init__(self, parent: QWidget = None):
        super().__init__(parent)
        self.setObjectName("HistoryDashboard")
        self.setProperty("class", "card")
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        title_label = QLabel("📊 Recent Excel Log Records")
        title_label.setFont(QFont("Segoe UI", 11, QFont.Bold))
        title_label.setStyleSheet("color: #FBBF24;")
        layout.addWidget(title_label)

        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["Name", "Roll", "Attendance", "Date", "Logged At"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)

        layout.addWidget(self.table)

    def populate_records(self, records: List[Dict[str, Any]]) -> None:
        """Populate table with recent records list."""
        self.table.setRowCount(0)
        if not records:
            return

        self.table.setRowCount(len(records))
        for row_idx, rec in enumerate(records):
            name_item = QTableWidgetItem(str(rec.get("Name") or rec.get("name") or ""))
            roll_item = QTableWidgetItem(str(rec.get("Roll") or rec.get("roll") or ""))
            att_item = QTableWidgetItem(str(rec.get("Attendance") or rec.get("attendance") or ""))
            date_item = QTableWidgetItem(str(rec.get("Date") or rec.get("date") or ""))
            log_item = QTableWidgetItem(str(rec.get("Logged At") or rec.get("timestamp") or ""))

            self.table.setItem(row_idx, 0, name_item)
            self.table.setItem(row_idx, 1, roll_item)
            self.table.setItem(row_idx, 2, att_item)
            self.table.setItem(row_idx, 3, date_item)
            self.table.setItem(row_idx, 4, log_item)
