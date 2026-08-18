"""Light Orange Theme QSS for National Exhibition 2026 PySide6 Desktop Application."""

LIGHT_ORANGE_THEME_QSS = """
QMainWindow {
    background-color: #FFF7ED;
    color: #1E293B;
}

QWidget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    color: #1E293B;
}

/* Header Bar */
#HeaderTitle {
    font-size: 20px;
    font-weight: 800;
    color: #EA580C;
    letter-spacing: 0.5px;
}

#HeaderSubtitle {
    font-size: 11px;
    font-weight: 600;
    color: #C2410C;
}

/* Status Badges */
#StatusBadgeReady {
    background-color: #FEF3C7;
    color: #D97706;
    border: 1px solid #FCD34D;
    border-radius: 12px;
    padding: 5px 12px;
    font-weight: 700;
}

#StatusBadgeListening {
    background-color: #FFEDD5;
    color: #EA580C;
    border: 1px solid #FDBA74;
    border-radius: 12px;
    padding: 5px 12px;
    font-weight: 700;
}

#StatusBadgeProcessing {
    background-color: #E0F2FE;
    color: #0284C7;
    border: 1px solid #7DD3FC;
    border-radius: 12px;
    padding: 5px 12px;
    font-weight: 700;
}

#StatusBadgeSaved {
    background-color: #DCFCE7;
    color: #15803D;
    border: 1px solid #86EFAC;
    border-radius: 12px;
    padding: 5px 12px;
    font-weight: 700;
}

#StatusBadgeError {
    background-color: #FEE2E2;
    color: #DC2626;
    border: 1px solid #FCA5A5;
    border-radius: 12px;
    padding: 5px 12px;
    font-weight: 700;
}

/* QTabWidget Light Orange */
QTabWidget::pane {
    border: 1px solid #FED7AA;
    background-color: #FFFFFF;
    border-radius: 12px;
    top: -1px;
}

QTabBar::tab {
    background-color: #FFEDD5;
    color: #9A3412;
    border: 1px solid #FED7AA;
    padding: 10px 20px;
    font-weight: 700;
    font-size: 12px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    margin-right: 4px;
}

QTabBar::tab:selected {
    background-color: #EA580C;
    color: #FFFFFF;
    border: 1px solid #EA580C;
}

QTabBar::tab:hover:!selected {
    background-color: #FDBA74;
    color: #7C2D12;
}

/* Buttons */
QPushButton {
    background-color: #FFFFFF;
    color: #431407;
    border: 1px solid #FDBA74;
    border-radius: 8px;
    padding: 8px 16px;
    font-weight: 700;
}

QPushButton:hover {
    background-color: #FFEDD5;
    border-color: #FB923C;
}

#BtnStart {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #FF7A00, stop:1 #EA580C);
    color: #FFFFFF;
    border: none;
    font-size: 13px;
}

#BtnStart:hover {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #FB923C, stop:1 #C2410C);
}

#BtnStop {
    background-color: #EF4444;
    color: #FFFFFF;
    border: none;
}

#BtnStop:hover {
    background-color: #DC2626;
}

#BtnSubmit {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #16A34A, stop:1 #15803D);
    color: #FFFFFF;
    border: none;
    padding: 10px 24px;
    font-size: 14px;
}

#BtnSubmit:hover {
    background-color: #15803D;
}

/* Inputs & Form Fields */
QLineEdit, QComboBox, QTextEdit {
    background-color: #FFFFFF;
    color: #1E293B;
    border: 1px solid #FED7AA;
    border-radius: 8px;
    padding: 8px;
}

QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
    border: 2px solid #EA580C;
    background-color: #FFF7ED;
}

QLabel {
    color: #431407;
    font-weight: 600;
}

/* Tables */
QTableWidget {
    background-color: #FFFFFF;
    border: 1px solid #FED7AA;
    gridline-color: #FFEDD5;
    border-radius: 8px;
}

QHeaderView::section {
    background-color: #FFEDD5;
    color: #7C2D12;
    padding: 8px;
    font-weight: 800;
    font-size: 11px;
    border: none;
    border-bottom: 2px solid #FDBA74;
}

QStatusBar {
    background-color: #FFEDD5;
    color: #9A3412;
    font-size: 11px;
    font-weight: 600;
}
"""
