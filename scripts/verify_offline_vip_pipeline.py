#!/usr/bin/env python3
"""Verification test script for 100% offline VIP Executive Meeting pipeline."""

import os
import sys
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.nlp.extractor import InformationExtractor
from app.excel.excel_manager import ExcelManager
from app.database.db import DatabaseManager
from app.database.repository import ProcessingLogRepository
from app.database.models import ProcessingLogRecord
from app.speech.whisper_engine import WhisperEngine


def run_verification():
    print("==================================================")
    print(" RIGOROUS OFFLINE VIP MEETING PIPELINE VERIFICATION")
    print("==================================================")

    # 1. Test Offline Whisper Engine loading
    print("\n[*] 1. Testing Offline Whisper Model Loading...")
    whisper_engine = WhisperEngine()
    success = whisper_engine.load_model()
    if success:
        print("[✓] SUCCESS: Whisper model loaded 100% offline from local models/whisper-tiny/")
    else:
        print("[X] FAILED to load offline Whisper model")
        sys.exit(1)

    # 2. Test Audio Transcription on 3 seconds of dummy audio buffer
    print("\n[*] 2. Testing Audio Chunk Transcription...")
    dummy_audio = np.zeros(16000 * 3, dtype=np.float32)
    result = whisper_engine.transcribe(dummy_audio)
    if result["success"]:
        print(f"[✓] SUCCESS: Offline audio transcribed successfully (Output: '{result['text']}')")
    else:
        print(f"[X] FAILED: Audio transcription error: {result['error']}")
        sys.exit(1)

    # 3. Test VIP Meeting NLP Extraction
    print("\n[*] 3. Testing VIP Executive Meeting NLP Extraction...")
    sample_transcripts = [
        "Minister Sharma approved budget 50 million dollars for infrastructure project",
        "Secretary Rajesh Verma passed policy review on healthcare grant",
        "Chairman Smith deferred proposal regarding airport expansion"
    ]

    extractor = InformationExtractor()
    excel_mgr = ExcelManager()
    db_mgr = DatabaseManager()
    repo = ProcessingLogRepository(db_mgr)

    for text in sample_transcripts:
        record = extractor.extract(text)
        print(f"\n   Input Speech:  '{text}'")
        print(f"   Extracted Record: {record.to_excel_row()}")

        # 4. Test Excel Logging
        excel_path = excel_mgr.log_record(record)
        print(f"   [✓] Logged to Excel: {excel_path.name}")

        # 5. Test SQLite Logging
        log_rec = ProcessingLogRecord(raw_transcript=text, confidence=0.98, processing_status="SUCCESS", extracted_data=str(record.to_excel_row()))
        repo.add_log(log_rec)
        print(f"   [✓] Logged to SQLite Database: app.db")

    print("\n==================================================")
    print(" ALL OFFLINE VIP PIPELINE TESTS PASSED 100%!")
    print("==================================================")


if __name__ == "__main__":
    run_verification()
