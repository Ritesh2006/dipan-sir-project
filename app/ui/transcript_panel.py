"""Live Transcript display panel for PySide6 GUI."""

from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QTextEdit, QFrame
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont


class TranscriptPanel(QFrame):
    """Widget panel displaying speech transcripts in real time."""

    def __init__(self, parent: QWidget = None):
        super().__init__(parent)
        self.setObjectName("TranscriptPanel")
        self.setProperty("class", "card")
        self._init_ui()

    def _init_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        title_label = QLabel("🎤 Live Speech Transcript")
        title_label.setFont(QFont("Segoe UI", 11, QFont.Bold))
        title_label.setStyleSheet("color: #38BDF8;")
        layout.addWidget(title_label)

        self.text_display = QTextEdit()
        self.text_display.setReadOnly(True)
        self.text_display.setPlaceholderText("Click 'Start Listening' and speak into your microphone...")
        self.text_display.setFont(QFont("Segoe UI", 11))
        layout.addWidget(self.text_display)

    def set_transcript(self, text: str, confidence: float = 0.0) -> None:
        """Append or update transcript display."""
        formatted_entry = f"🗣️ \"{text}\"  (Confidence: {confidence*100:.1f}%)"
        self.text_display.append(formatted_entry)

    def set_listening_status(self) -> None:
        """Show listening placeholder text."""
        self.text_display.append("<i>Listening...</i>")

    def clear(self) -> None:
        """Clear transcript display."""
        self.text_display.clear()
