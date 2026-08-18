"""Application main entry point."""

import sys
from PySide6.QtWidgets import QApplication
from app.config.settings import settings
from app.utils.logger import logger
from app.ui.main_window import MainWindow


def main() -> None:
    """Initialize and run Offline Voice Logger PySide6 Desktop Application."""
    logger.info(f"Starting {settings.APP_NAME}...")

    app = QApplication(sys.argv)
    app.setApplicationName(settings.APP_NAME)
    app.setOrganizationName("OfflineVoiceLogger")

    main_window = MainWindow()
    main_window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
