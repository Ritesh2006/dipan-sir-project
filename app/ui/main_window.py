"""Main Window PySide6 Desktop Application for National Exhibition 2026 – Byte & Reporting System."""

import sys
import os
import threading
import subprocess
import platform
from pathlib import Path
from typing import Dict, Any, Optional

from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QComboBox, QLineEdit, QTabWidget, QFileDialog,
    QStatusBar, QMessageBox, QGroupBox, QFormLayout, QTableWidget,
    QTableWidgetItem, QHeaderView
)
from PySide6.QtCore import Qt, Signal, QObject
from PySide6.QtGui import QFont, QDesktopServices

from app.config.settings import settings
from app.audio.recorder import AudioRecorder
from app.audio.wake_word_detector import WakeWordDetector
from app.services.pipeline import ProcessingPipeline
from app.services.ai_reporting_service import AiReportingService
from app.integrations.google_service import GoogleExhibitionService, EXHIBITION_EXCEL_PATH, TAB_HEADERS
from app.schemas.exhibition_schemas import StallSubmission, ScienceSubmission, LectureSubmission
from app.ui.styles import LIGHT_ORANGE_THEME_QSS
from app.utils.logger import logger


class PipelineSignalEmitter(QObject):
    """Qt Signal emitter bridge to ensure thread-safe UI updates."""

    transcript_signal = Signal(str, float)
    status_signal = Signal(str)
    submission_complete_signal = Signal(str, str, dict)
    error_signal = Signal(str)


class MainWindow(QMainWindow):
    """Main desktop application window for National Exhibition 2026."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("National Exhibition 2026 – Byte & Reporting System")
        self.resize(1150, 800)
        self.setStyleSheet(LIGHT_ORANGE_THEME_QSS)

        # Services & counters
        self.google_service = GoogleExhibitionService()
        self.counters = {"STALL": 1, "SCI": 1, "LEC": 1}

        # Media paths for current submission
        self.current_audio_file: Optional[Path] = None
        self.current_image_file: Optional[Path] = None
        self.current_brochure_file: Optional[Path] = None

        # Qt Signals bridge
        self.signals = PipelineSignalEmitter()
        self._connect_signals()

        # Pipeline
        self.pipeline = ProcessingPipeline(
            on_transcript_callback=lambda txt, conf: self.handle_realtime_speech(txt, conf),
            on_status_change_callback=lambda st: self.signals.status_signal.emit(st),
            on_error_callback=lambda err: self.signals.error_signal.emit(err),
        )

        self._init_ui()
        self.refresh_master_table()

    def _connect_signals(self) -> None:
        self.signals.transcript_signal.connect(self.on_transcript_received)
        self.signals.status_signal.connect(self.update_status_badge)
        self.signals.submission_complete_signal.connect(self.on_submission_async_complete)
        self.signals.error_signal.connect(self.on_pipeline_error)

    def _init_ui(self) -> None:
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(16, 16, 16, 16)
        main_layout.setSpacing(14)

        # 1. Header Bar
        header_layout = QHBoxLayout()
        title_box = QVBoxLayout()
        title_lbl = QLabel("NATIONAL EXHIBITION 2026 – BYTE & REPORTING SYSTEM")
        title_lbl.setObjectName("HeaderTitle")
        sub_lbl = QLabel("Central Verification & Immediate Reporting System (Light Orange Executive Edition)")
        sub_lbl.setObjectName("HeaderSubtitle")
        title_box.addWidget(title_lbl)
        title_box.addWidget(sub_lbl)
        header_layout.addLayout(title_box)

        header_layout.addStretch()

        self.status_badge = QLabel("● Ready")
        self.status_badge.setObjectName("StatusBadgeReady")
        header_layout.addWidget(self.status_badge)
        main_layout.addLayout(header_layout)

        # 2. Main 3-Tab Widget
        self.tab_widget = QTabWidget()

        # Tab 1: STALL
        self.tab_stall = QWidget()
        self._init_stall_tab(self.tab_stall)
        self.tab_widget.addTab(self.tab_stall, "🎪 STALL")

        # Tab 2: SCIENCE EXHIBITION
        self.tab_science = QWidget()
        self._init_science_tab(self.tab_science)
        self.tab_widget.addTab(self.tab_science, "🔬 SCIENCE EXHIBITION")

        # Tab 3: LIVE LECTURE
        self.tab_lecture = QWidget()
        self._init_lecture_tab(self.tab_lecture)
        self.tab_widget.addTab(self.tab_lecture, "🎙️ LIVE LECTURE")

        main_layout.addWidget(self.tab_widget)

        # 3. Audio & Voice Wake Control Action Bar
        audio_bar = QHBoxLayout()
        audio_bar.setSpacing(10)

        dev_lbl = QLabel("Microphone:")
        audio_bar.addWidget(dev_lbl)

        self.device_combo = QComboBox()
        self.device_combo.setMinimumWidth(200)
        self.populate_microphones()
        audio_bar.addWidget(self.device_combo)

        self.btn_start = QPushButton("▶ Start Recording (or say 'Start Recording')")
        self.btn_start.setObjectName("BtnStart")
        self.btn_start.clicked.connect(self.start_listening)
        audio_bar.addWidget(self.btn_start)

        self.btn_stop = QPushButton("⏹ Stop Recording (or say 'Stop')")
        self.btn_stop.setObjectName("BtnStop")
        self.btn_stop.setEnabled(False)
        self.btn_stop.clicked.connect(self.stop_listening)
        audio_bar.addWidget(self.btn_stop)

        self.btn_submit = QPushButton("🚀 SUBMIT ENTRY")
        self.btn_submit.setObjectName("BtnSubmit")
        self.btn_submit.clicked.connect(self.submit_current_tab)
        audio_bar.addWidget(self.btn_submit)

        main_layout.addLayout(audio_bar)

        # Live Transcript Preview Box
        self.lbl_transcript_preview = QLabel("Live Audio / Voice Control Transcript: Speech will appear here...")
        self.lbl_transcript_preview.setStyleSheet("background: #FFF7ED; border: 1px solid #FED7AA; padding: 8px; border-radius: 8px; font-style: italic; color: #9A3412;")
        main_layout.addWidget(self.lbl_transcript_preview)

        # 4. Master History Table
        history_box = QGroupBox("Master Verification Spreadsheet (1 Submission = 1 Row)")
        history_layout = QVBoxLayout(history_box)

        table_hdr_layout = QHBoxLayout()
        self.btn_open_excel = QPushButton("📁 Open Master Google/Excel Sheet")
        self.btn_open_excel.clicked.connect(self.open_excel_file)
        table_hdr_layout.addWidget(self.btn_open_excel)
        table_hdr_layout.addStretch()

        history_layout.addLayout(table_hdr_layout)

        self.master_table = QTableWidget()
        self.master_table.setColumnCount(6)
        self.master_table.setHorizontalHeaderLabels(["Submission ID", "Timestamp", "Title / Name", "Category", "Status", "Transcript / Summary"])
        self.master_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        history_layout.addWidget(self.master_table)

        main_layout.addWidget(history_box)

        # Status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage(f"Master Sheet: {EXHIBITION_EXCEL_PATH}")

    # --- TAB INITIALIZERS ---
    def _init_stall_tab(self, tab: QWidget) -> None:
        layout = QHBoxLayout(tab)
        form = QFormLayout()
        
        self.txt_stall_name = QLineEdit()
        self.txt_stall_name.setPlaceholderText("e.g. DRDO Technology Pavilion")
        self.txt_stall_no = QLineEdit()
        self.txt_stall_no.setPlaceholderText("e.g. A-24")
        self.txt_stall_org = QLineEdit()
        self.txt_stall_org.setPlaceholderText("e.g. Defence Research & Dev Org")
        self.txt_stall_cat = QLineEdit()
        self.txt_stall_cat.setPlaceholderText("e.g. Defence & Aerospace")
        self.txt_stall_person = QLineEdit()
        self.txt_stall_person.setPlaceholderText("e.g. Dr. Rajesh Sharma")
        self.txt_stall_desig = QLineEdit()
        self.txt_stall_desig.setPlaceholderText("e.g. Chief Scientist")

        form.addRow("Stall Name *:", self.txt_stall_name)
        form.addRow("Stall No. *:", self.txt_stall_no)
        form.addRow("Organization *:", self.txt_stall_org)
        form.addRow("Category *:", self.txt_stall_cat)
        form.addRow("Person *:", self.txt_stall_person)
        form.addRow("Designation *:", self.txt_stall_desig)

        layout.addLayout(form)

        # Media upload box
        media_box = QGroupBox("Media Uploads (Optional)")
        media_layout = QVBoxLayout(media_box)

        self.btn_stall_img = QPushButton("🖼️ Upload Stall Image")
        self.btn_stall_img.clicked.connect(lambda: self.pick_file("image"))
        self.lbl_stall_img = QLabel("No image selected")
        self.lbl_stall_img.setStyleSheet("color: #64748B; font-size: 11px;")

        self.btn_stall_doc = QPushButton("📄 Upload Brochure")
        self.btn_stall_doc.clicked.connect(lambda: self.pick_file("brochure"))
        self.lbl_stall_doc = QLabel("No brochure selected")
        self.lbl_stall_doc.setStyleSheet("color: #64748B; font-size: 11px;")

        media_layout.addWidget(self.btn_stall_img)
        media_layout.addWidget(self.lbl_stall_img)
        media_layout.addWidget(self.btn_stall_doc)
        media_layout.addWidget(self.lbl_stall_doc)
        media_layout.addStretch()

        layout.addWidget(media_box)

    def _init_science_tab(self, tab: QWidget) -> None:
        layout = QHBoxLayout(tab)
        form = QFormLayout()

        self.txt_sci_name = QLineEdit()
        self.txt_sci_name.setPlaceholderText("e.g. Autonomous AI Drone Swarm")
        self.txt_sci_stall = QLineEdit()
        self.txt_sci_stall.setPlaceholderText("e.g. S-12")
        self.txt_sci_org = QLineEdit()
        self.txt_sci_org.setPlaceholderText("e.g. IIT Delhi")
        self.txt_sci_cat = QLineEdit()
        self.txt_sci_cat.setPlaceholderText("e.g. Robotics & AI")
        self.txt_sci_presenter = QLineEdit()
        self.txt_sci_presenter.setPlaceholderText("e.g. Ananya Roy")
        self.txt_sci_desig = QLineEdit()
        self.txt_sci_desig.setPlaceholderText("e.g. M.Tech Scholar")

        form.addRow("Exhibit/Project Name *:", self.txt_sci_name)
        form.addRow("Stall No. *:", self.txt_sci_stall)
        form.addRow("Organization/Institution *:", self.txt_sci_org)
        form.addRow("Category *:", self.txt_sci_cat)
        form.addRow("Presenter *:", self.txt_sci_presenter)
        form.addRow("Designation/Class *:", self.txt_sci_desig)

        layout.addLayout(form)

        # Media upload box
        media_box = QGroupBox("Media Uploads (Optional)")
        media_layout = QVBoxLayout(media_box)

        self.btn_sci_img = QPushButton("🖼️ Upload Project Image")
        self.btn_sci_img.clicked.connect(lambda: self.pick_file("image"))
        self.lbl_sci_img = QLabel("No image selected")
        self.lbl_sci_img.setStyleSheet("color: #64748B; font-size: 11px;")

        self.btn_sci_doc = QPushButton("📄 Upload Project Brochure")
        self.btn_sci_doc.clicked.connect(lambda: self.pick_file("brochure"))
        self.lbl_sci_doc = QLabel("No brochure selected")
        self.lbl_sci_doc.setStyleSheet("color: #64748B; font-size: 11px;")

        media_layout.addWidget(self.btn_sci_img)
        media_layout.addWidget(self.lbl_sci_img)
        media_layout.addWidget(self.btn_sci_doc)
        media_layout.addWidget(self.lbl_sci_doc)
        media_layout.addStretch()

        layout.addWidget(media_box)

    def _init_lecture_tab(self, tab: QWidget) -> None:
        layout = QHBoxLayout(tab)
        form = QFormLayout()

        self.txt_lec_title = QLineEdit()
        self.txt_lec_title.setPlaceholderText("e.g. Future of Quantum Computing")
        self.txt_lec_speaker = QLineEdit()
        self.txt_lec_speaker.setPlaceholderText("e.g. Dr. APJ Abdul Kalam Fellow")
        self.txt_lec_desig = QLineEdit()
        self.txt_lec_desig.setPlaceholderText("e.g. Director General")
        self.txt_lec_org = QLineEdit()
        self.txt_lec_org.setPlaceholderText("e.g. ISRO")
        self.txt_lec_cat = QLineEdit()
        self.txt_lec_cat.setPlaceholderText("e.g. Space Technology")
        self.txt_lec_datetime = QLineEdit()
        self.txt_lec_datetime.setPlaceholderText("e.g. 2026-08-16 10:30 AM")

        form.addRow("Lecture Title *:", self.txt_lec_title)
        form.addRow("Speaker *:", self.txt_lec_speaker)
        form.addRow("Designation *:", self.txt_lec_desig)
        form.addRow("Organization *:", self.txt_lec_org)
        form.addRow("Topic/Category *:", self.txt_lec_cat)
        form.addRow("Date/Time *:", self.txt_lec_datetime)

        layout.addLayout(form)

        # Media upload box
        media_box = QGroupBox("Media Uploads (Optional)")
        media_layout = QVBoxLayout(media_box)

        self.btn_lec_img = QPushButton("🖼️ Upload Lecture Image")
        self.btn_lec_img.clicked.connect(lambda: self.pick_file("image"))
        self.lbl_lec_img = QLabel("No image selected")
        self.lbl_lec_img.setStyleSheet("color: #64748B; font-size: 11px;")

        self.btn_lec_doc = QPushButton("📄 Upload Presentation/Brochure")
        self.btn_lec_doc.clicked.connect(lambda: self.pick_file("brochure"))
        self.lbl_lec_doc = QLabel("No brochure selected")
        self.lbl_lec_doc.setStyleSheet("color: #64748B; font-size: 11px;")

        media_layout.addWidget(self.btn_lec_img)
        media_layout.addWidget(self.lbl_lec_img)
        media_layout.addWidget(self.btn_lec_doc)
        media_layout.addWidget(self.lbl_lec_doc)
        media_layout.addStretch()

        layout.addWidget(media_box)

    # --- ACTIONS & HANDLERS ---
    def populate_microphones(self) -> None:
        devices = AudioRecorder.get_input_devices()
        self.device_combo.clear()
        self.device_combo.addItem("Default Microphone", -1)
        for dev in devices:
            self.device_combo.addItem(f"{dev['name']}", dev['index'])

    def pick_file(self, file_type: str) -> None:
        file_path, _ = QFileDialog.getOpenFileName(self, f"Select {file_type.capitalize()} File")
        if file_path:
            p = Path(file_path)
            if file_type == "image":
                self.current_image_file = p
                self.lbl_stall_img.setText(p.name)
                self.lbl_sci_img.setText(p.name)
                self.lbl_lec_img.setText(p.name)
            else:
                self.current_brochure_file = p
                self.lbl_stall_doc.setText(p.name)
                self.lbl_sci_doc.setText(p.name)
                self.lbl_lec_doc.setText(p.name)

    def start_listening(self) -> None:
        selected_idx = self.device_combo.currentData()
        if selected_idx is not None and selected_idx != -1:
            self.pipeline.recorder.device_index = selected_idx

        started = self.pipeline.start()
        if started:
            self.btn_start.setEnabled(False)
            self.btn_stop.setEnabled(True)

    def stop_listening(self) -> None:
        self.pipeline.stop()
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)

    def handle_realtime_speech(self, text: str, conf: float) -> None:
        self.signals.transcript_signal.emit(text, conf)
        # Check wake/stop words
        command = WakeWordDetector.detect_command(text)
        if command == "WAKE" and not self.pipeline.is_running:
            self.start_listening()
        elif command == "STOP" and self.pipeline.is_running:
            self.stop_listening()

    def on_transcript_received(self, text: str, conf: float) -> None:
        self.lbl_transcript_preview.setText(f"Transcript ({conf:.0%}): {text}")

    def update_status_badge(self, status: str) -> None:
        status_map = {
            "Ready": ("● Ready", "StatusBadgeReady"),
            "Listening": ("● Listening", "StatusBadgeListening"),
            "Processing": ("● Processing...", "StatusBadgeProcessing"),
            "Saved": ("✓ Saved", "StatusBadgeSaved"),
            "Error": ("⚠ Error", "StatusBadgeError"),
        }
        text, object_name = status_map.get(status, (f"● {status}", "StatusBadgeReady"))
        self.status_badge.setText(text)
        self.status_badge.setObjectName(object_name)
        self.status_badge.setStyle(self.status_badge.style())

    def submit_current_tab(self) -> None:
        current_idx = self.tab_widget.currentIndex()

        if current_idx == 0:
            self._submit_stall()
        elif current_idx == 1:
            self._submit_science()
        else:
            self._submit_lecture()

    def _submit_stall(self) -> None:
        name = self.txt_stall_name.text().strip()
        no = self.txt_stall_no.text().strip()
        org = self.txt_stall_org.text().strip()
        cat = self.txt_stall_cat.text().strip()
        person = self.txt_stall_person.text().strip()
        desig = self.txt_stall_desig.text().strip()

        if not name or not no or not org:
            QMessageBox.warning(self, "Validation Error", "Please fill in Stall Name, Stall No., and Organization.")
            return

        sub_id = f"STALL-{self.counters['STALL']:03d}"
        self.counters['STALL'] += 1

        sub = StallSubmission(
            submission_id=sub_id,
            stall_name=name,
            stall_no=no,
            organization=org,
            category=cat or "General",
            person=person or "N/A",
            designation=desig or "N/A",
            image_link=self.current_image_file.name if self.current_image_file else "N/A",
            brochure_link=self.current_brochure_file.name if self.current_brochure_file else "N/A"
        )

        self._process_submission("Stall Data", sub_id, sub.to_row_dict(), name)

    def _submit_science(self) -> None:
        name = self.txt_sci_name.text().strip()
        no = self.txt_sci_stall.text().strip()
        org = self.txt_sci_org.text().strip()
        cat = self.txt_sci_cat.text().strip()
        presenter = self.txt_sci_presenter.text().strip()
        desig = self.txt_sci_desig.text().strip()

        if not name or not org:
            QMessageBox.warning(self, "Validation Error", "Please fill in Exhibit Name and Organization.")
            return

        sub_id = f"SCI-{self.counters['SCI']:03d}"
        self.counters['SCI'] += 1

        sub = ScienceSubmission(
            submission_id=sub_id,
            exhibit_name=name,
            stall_no=no or "N/A",
            organization=org,
            category=cat or "Science",
            presenter=presenter or "N/A",
            designation_class=desig or "N/A",
            image_link=self.current_image_file.name if self.current_image_file else "N/A",
            brochure_link=self.current_brochure_file.name if self.current_brochure_file else "N/A"
        )

        self._process_submission("Science Exhibition Data", sub_id, sub.to_row_dict(), name)

    def _submit_lecture(self) -> None:
        title = self.txt_lec_title.text().strip()
        speaker = self.txt_lec_speaker.text().strip()
        desig = self.txt_lec_desig.text().strip()
        org = self.txt_lec_org.text().strip()
        cat = self.txt_lec_cat.text().strip()
        dt = self.txt_lec_datetime.text().strip()

        if not title or not speaker:
            QMessageBox.warning(self, "Validation Error", "Please fill in Lecture Title and Speaker.")
            return

        sub_id = f"LEC-{self.counters['LEC']:03d}"
        self.counters['LEC'] += 1

        sub = LectureSubmission(
            submission_id=sub_id,
            lecture_title=title,
            speaker=speaker,
            designation=desig or "Speaker",
            organization=org or "N/A",
            topic_category=cat or "Lecture",
            date_time=dt or "Today",
            image_link=self.current_image_file.name if self.current_image_file else "N/A",
            brochure_link=self.current_brochure_file.name if self.current_brochure_file else "N/A"
        )

        self._process_submission("Live Lecture Data", sub_id, sub.to_row_dict(), title)

    def _process_submission(self, tab_name: str, sub_id: str, row_dict: Dict[str, Any], title: str) -> None:
        # STEP 1: Append 1 row immediately with Status: Submitted
        self.google_service.append_submission_row(tab_name, row_dict)
        self.refresh_master_table()

        # Immediate feedback
        QMessageBox.information(self, "Submission Successful", f"Submission ID: {sub_id}\nRow created in Google/Excel Sheet '{tab_name}'!")

        # STEP 2: Asynchronous AI Transcription & Summary processing in background thread
        captured_text = self.lbl_transcript_preview.text().replace("Transcript (100%):", "").strip()

        def async_worker():
            summary = AiReportingService.generate_summary(tab_name, captured_text, row_dict)
            updates = {
                "Transcript": captured_text if captured_text and "Speech will appear" not in captured_text else "No speech byte recorded",
                "Summary": summary,
                "Verification Status": "Transcript Ready"
            }
            self.google_service.update_submission_row(tab_name, sub_id, updates)
            self.signals.submission_complete_signal.emit(tab_name, sub_id, updates)

        threading.Thread(target=async_worker, daemon=True).start()

    def on_submission_async_complete(self, tab_name: str, sub_id: str, updates: Dict[str, Any]) -> None:
        self.status_bar.showMessage(f"✓ AI Summary completed for Submission {sub_id} in {tab_name}!", 6000)
        self.refresh_master_table()

    def refresh_master_table(self) -> None:
        self.google_service.ensure_sheets_exist()
        try:
            wb = openpyxl.load_workbook(str(EXHIBITION_EXCEL_PATH), data_only=True)
            all_rows = []
            for sname in wb.sheetnames:
                ws = wb[sname]
                if ws.max_row <= 1:
                    continue
                headers = [str(cell.value or "") for cell in ws[1]]
                for r in range(ws.max_row, 1, -1):
                    row_dict = {headers[c-1]: ws.cell(row=r, column=c).value for c in range(1, len(headers)+1)}
                    all_rows.append(row_dict)
            wb.close()

            self.master_table.setRowCount(len(all_rows))
            for i, rdata in enumerate(all_rows):
                self.master_table.setItem(i, 0, QTableWidgetItem(str(rdata.get("Submission ID", ""))))
                self.master_table.setItem(i, 1, QTableWidgetItem(str(rdata.get("Timestamp", ""))))
                title = rdata.get("Stall Name") or rdata.get("Exhibit/Project Name") or rdata.get("Lecture Title") or ""
                self.master_table.setItem(i, 2, QTableWidgetItem(str(title)))
                cat = rdata.get("Category") or rdata.get("Topic/Category") or ""
                self.master_table.setItem(i, 3, QTableWidgetItem(str(cat)))
                self.master_table.setItem(i, 4, QTableWidgetItem(str(rdata.get("Verification Status", ""))))
                self.master_table.setItem(i, 5, QTableWidgetItem(str(rdata.get("Summary", ""))[:60] + "..."))
        except Exception as e:
            logger.error(f"Error refreshing master table: {e}")

    def open_excel_file(self) -> None:
        if not EXHIBITION_EXCEL_PATH.exists():
            self.google_service.ensure_sheets_exist()

        try:
            if platform.system() == "Darwin":
                subprocess.run(["open", str(EXHIBITION_EXCEL_PATH)])
            elif platform.system() == "Windows":
                os.startfile(str(EXHIBITION_EXCEL_PATH))
            else:
                subprocess.run(["xdg-open", str(EXHIBITION_EXCEL_PATH)])
        except Exception as e:
            QMessageBox.warning(self, "Error", f"Could not open file: {e}")

    def on_pipeline_error(self, err_msg: str) -> None:
        self.status_bar.showMessage(f"Error: {err_msg}", 6000)

    def closeEvent(self, event) -> None:
        self.pipeline.stop()
        event.accept()
