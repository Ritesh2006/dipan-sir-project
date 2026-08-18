"""Complete Asynchronous Processing Pipeline for Voice-to-Excel intelligence logger."""

import queue
import threading
import numpy as np
from typing import Optional, Callable, Dict, Any

from app.audio.recorder import AudioRecorder
from app.audio.audio_processor import AudioProcessor
from app.speech.whisper_engine import WhisperEngine
from app.nlp.extractor import InformationExtractor
from app.database.repository import ProcessingLogRepository
from app.database.models import ProcessingLogRecord
from app.excel.excel_manager import ExcelManager
from app.utils.validators import validate_extracted_data
from app.utils.logger import logger


class ProcessingPipeline:
    """Orchestrates continuous speech capture, offline transcription, NLP extraction, SQLite history, and Excel logging."""

    def __init__(
        self,
        recorder: Optional[AudioRecorder] = None,
        whisper_engine: Optional[WhisperEngine] = None,
        extractor: Optional[InformationExtractor] = None,
        db_repository: Optional[ProcessingLogRepository] = None,
        excel_manager: Optional[ExcelManager] = None,
        on_transcript_callback: Optional[Callable[[str, float], None]] = None,
        on_data_extracted_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        on_excel_saved_callback: Optional[Callable[[bool, str], None]] = None,
        on_status_change_callback: Optional[Callable[[str], None]] = None,
        on_error_callback: Optional[Callable[[str], None]] = None,
    ):
        self.speech_queue: queue.Queue = queue.Queue()
        self.processor = AudioProcessor(speech_queue=self.speech_queue)
        self.recorder = recorder or AudioRecorder(processor=self.processor)

        self.whisper_engine = whisper_engine or WhisperEngine()
        self.extractor = extractor or InformationExtractor()
        self.db_repository = db_repository or ProcessingLogRepository()
        self.excel_manager = excel_manager or ExcelManager()

        # Callbacks for GUI decoupling
        self.on_transcript_callback = on_transcript_callback
        self.on_data_extracted_callback = on_data_extracted_callback
        self.on_excel_saved_callback = on_excel_saved_callback
        self.on_status_change_callback = on_status_change_callback
        self.on_error_callback = on_error_callback

        self._running = False
        self._worker_thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        """Start recording and background pipeline processing thread."""
        if self._running:
            return True

        self._running = True

        # Start worker thread
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()

        # Start audio recorder
        success = self.recorder.start()
        if not success:
            self._running = False
            if self.on_status_change_callback:
                self.on_status_change_callback("Error")
            return False

        if self.on_status_change_callback:
            self.on_status_change_callback("Listening")
        logger.info("Pipeline processing service started.")
        return True

    def stop(self) -> None:
        """Stop pipeline and microphone recording."""
        if not self._running:
            return

        self._running = False
        self.recorder.stop()
        self.speech_queue.put(None)  # Sentinel to wake up worker thread

        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=2.0)

        if self.on_status_change_callback:
            self.on_status_change_callback("Ready")
        logger.info("Pipeline processing service stopped.")

    def _worker_loop(self) -> None:
        """Background worker thread consuming audio segments from speech_queue."""
        logger.info("Pipeline worker loop started.")
        while self._running:
            try:
                item = self.speech_queue.get(timeout=0.5)
                if item is None:
                    break

                if not isinstance(item, np.ndarray):
                    continue

                self.process_audio_segment(item)
                self.speech_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Unexpected error in pipeline worker loop: {e}")

    def process_audio_segment(self, audio_data: np.ndarray) -> Dict[str, Any]:
        """Process a single audio segment end-to-end."""
        if self.on_status_change_callback:
            self.on_status_change_callback("Processing")

        # 1. Offline Speech-to-Text
        stt_result = self.whisper_engine.transcribe(audio_data)
        raw_text = stt_result.get("text", "").strip()
        confidence = stt_result.get("confidence", 0.0)

        if not stt_result.get("success") or not raw_text:
            err_msg = stt_result.get("error") or "Unclear audio or empty transcript."
            logger.warning(f"STT failed/empty: {err_msg}")

            # Record failure in SQLite database history
            self.db_repository.add_log(
                ProcessingLogRecord(
                    raw_transcript=raw_text,
                    extracted_data={},
                    processing_status="ERROR",
                    confidence=confidence,
                    error_message=err_msg,
                )
            )
            if self.on_error_callback:
                self.on_error_callback(err_msg)
            if self.on_status_change_callback:
                self.on_status_change_callback("Listening")
            return {"success": False, "error": err_msg}

        if self.on_transcript_callback:
            self.on_transcript_callback(raw_text, confidence)

        # 2. NLP Information Extraction
        extracted_data = self.extractor.extract(raw_text)

        if self.on_data_extracted_callback and extracted_data:
            self.on_data_extracted_callback(extracted_data)

        # 3. Validation & Excel Logging
        valid, val_msg = validate_extracted_data(extracted_data)
        if not valid:
            logger.warning(f"Data validation failed for extracted dict {extracted_data}: {val_msg}")
            self.db_repository.add_log(
                ProcessingLogRecord(
                    raw_transcript=raw_text,
                    extracted_data=extracted_data,
                    processing_status="INVALID",
                    confidence=confidence,
                    error_message=val_msg,
                )
            )
            if self.on_excel_saved_callback:
                self.on_excel_saved_callback(False, f"Validation failed: {val_msg}")
            if self.on_status_change_callback:
                self.on_status_change_callback("Listening")
            return {"success": False, "transcript": raw_text, "extracted": extracted_data, "error": val_msg}

        # 4. Save to Excel
        saved_excel, excel_msg = self.excel_manager.append_record(extracted_data)
        status_str = "SUCCESS" if saved_excel else ("DUPLICATE" if "Duplicate" in excel_msg else "ERROR")

        if self.on_excel_saved_callback:
            self.on_excel_saved_callback(saved_excel, excel_msg)

        # 5. Save to SQLite database
        self.db_repository.add_log(
            ProcessingLogRecord(
                raw_transcript=raw_text,
                extracted_data=extracted_data,
                processing_status=status_str,
                confidence=confidence,
                error_message=None if saved_excel else excel_msg,
            )
        )

        if self.on_status_change_callback:
            self.on_status_change_callback("Saved" if saved_excel else "Ready")

        return {
            "success": saved_excel,
            "transcript": raw_text,
            "extracted": extracted_data,
            "message": excel_msg,
        }
