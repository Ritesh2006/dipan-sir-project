"""Extracted Information display panel for PySide6 GUI (VIP Executive Meetings)."""

from typing import Dict, Any
from PySide6.QtWidgets import QFrame, QVBoxLayout, QLabel, QWidget, QGridLayout
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont


class ExtractedDataPanel(QFrame):
    """Widget panel displaying extracted VIP Meeting entities as structured cards."""

    def __init__(self, parent: QWidget = None):
        super().__init__(parent)
        self.setObjectName("ExtractedDataPanel")
        self.setProperty("class", "card")
        self._init_ui()

    def _init_ui(self) -> None:
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(12, 12, 12, 12)
        self.layout.setSpacing(8)

        title_label = QLabel("🏛️ VIP Meeting Extracted Intelligence")
        title_label.setFont(QFont("Segoe UI", 11, QFont.Bold))
        title_label.setStyleSheet("color: #34D399;")
        self.layout.addWidget(title_label)

        self.grid_widget = QWidget()
        self.grid_layout = QGridLayout(self.grid_widget)
        self.grid_layout.setContentsMargins(0, 0, 0, 0)
        self.grid_layout.setSpacing(8)

        self.empty_label = QLabel("No VIP meeting notes parsed yet.")
        self.empty_label.setStyleSheet("color: #64748B; font-style: italic;")
        self.grid_layout.addWidget(self.empty_label, 0, 0)

        self.layout.addWidget(self.grid_widget)
        self.layout.addStretch()

    def update_data(self, data: Dict[str, Any]) -> None:
        """Render extracted VIP meeting key-value items."""
        for i in reversed(range(self.grid_layout.count())):
            item = self.grid_layout.itemAt(i)
            if item and item.widget():
                item.widget().deleteLater()

        if not data:
            self.empty_label = QLabel("No VIP meeting notes parsed yet.")
            self.empty_label.setStyleSheet("color: #64748B; font-style: italic;")
            self.grid_layout.addWidget(self.empty_label, 0, 0)
            return

        key_labels = {
            "speaker": "🏛️ Speaker / VIP:",
            "designation": "💼 Designation / Ministry:",
            "topic": "📋 Agenda Topic:",
            "decision": "⚖️ Decision Status:",
            "remarks": "📝 Key Action / Remarks:",
            "date": "📅 Date:",
        }

        row = 0
        for k, v in data.items():
            k_clean = k.lower()
            label_text = key_labels.get(k_clean, f"{k.title()}:")

            key_lbl = QLabel(label_text)
            key_lbl.setStyleSheet("color: #94A3B8; font-weight: 600;")

            val_lbl = QLabel(str(v))
            val_lbl.setStyleSheet("color: #F8FAFC; font-weight: 700; background-color: #0F172A; border-radius: 4px; padding: 4px 8px;")

            self.grid_layout.addWidget(key_lbl, row, 0)
            self.grid_layout.addWidget(val_lbl, row, 1)
            row += 1

    def clear(self) -> None:
        """Clear extracted fields."""
        self.update_data({})
