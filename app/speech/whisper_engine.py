"""Whisper Speech-to-Text Engine wrapping faster-whisper."""

import threading
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, Union
from app.config.settings import settings
from app.speech.model_manager import ModelManager
from app.utils.logger import logger


class WhisperEngine:
    """Offline STT engine using faster-whisper (CTranslate2)."""

    def __init__(
        self,
        model_size: Optional[str] = None,
        device: str = "cpu",
        compute_type: str = "int8",
        language: Optional[str] = None,
    ):
        self.model_size = model_size or settings.WHISPER_MODEL
        self.device = device
        self.compute_type = compute_type
        self.language = language or settings.LANGUAGE
        self.model_manager = ModelManager()

        self._model = None
        self._lock = threading.RLock()
        self._is_loaded = False

    def load_model(self) -> bool:
        """Load faster-whisper model into memory."""
        with self._lock:
            if self._is_loaded and self._model is not None:
                return True

            logger.info(f"Loading faster-whisper model '{self.model_size}' (device={self.device}, compute_type={self.compute_type})...")
            try:
                from faster_whisper import WhisperModel

                target = self.model_manager.get_model_path_or_name(self.model_size)
                self._model = WhisperModel(
                    target,
                    device=self.device,
                    compute_type=self.compute_type,
                    download_root=str(settings.MODELS_DIR),
                )
                self._is_loaded = True
                logger.info(f"Successfully loaded Whisper model '{self.model_size}'.")
                return True
            except Exception as e:
                err = f"Failed to load Whisper model '{self.model_size}': {e}"
                logger.error(err)
                self._is_loaded = False
                self._model = None
                return False

    def transcribe(self, audio: Any) -> Dict[str, Any]:
        """Transcribe float32 audio numpy array or audio file path (str/Path).

        Returns dict:
            {
                "text": str,
                "language": str,
                "confidence": float,
                "success": bool,
                "error": Optional[str]
            }
        """
        with self._lock:
            if not self._is_loaded or self._model is None:
                loaded = self.load_model()
                if not loaded or self._model is None:
                    return {
                        "text": "",
                        "language": self.language,
                        "confidence": 0.0,
                        "success": False,
                        "error": "Whisper model not loaded.",
                    }

            try:
                if isinstance(audio, (str, Path)):
                    audio_input = str(audio)
                elif isinstance(audio, np.ndarray):
                    if audio.ndim > 1:
                        audio = audio.flatten()
                    if audio.dtype != np.float32:
                        audio = audio.astype(np.float32)
                    audio_input = audio
                else:
                    audio_input = audio

                segments, info = self._model.transcribe(
                    audio_input,
                    beam_size=5,
                    language=self.language if self.language and self.language != "auto" else None,
                    vad_filter=True,
                )

                text_chunks = []
                conf_sum = 0.0
                count = 0
                for seg in segments:
                    text_chunks.append(seg.text.strip())
                    conf_sum += getattr(seg, "avg_logprob", 0.0)
                    count += 1

                full_text = " ".join(text_chunks).strip()
                avg_confidence = float(np.exp(conf_sum / count)) if count > 0 else 0.85

                logger.info(f"Transcription complete: '{full_text}' (confidence={avg_confidence:.2f})")
                return {
                    "text": full_text,
                    "language": info.language if hasattr(info, "language") else self.language,
                    "confidence": avg_confidence,
                    "success": True,
                    "error": None,
                }
            except Exception as e:
                err_str = f"Transcription error: {e}"
                logger.error(err_str)
                return {
                    "text": "",
                    "language": self.language,
                    "confidence": 0.0,
                    "success": False,
                    "error": err_str,
                }

    def unload(self) -> None:
        """Unload model from memory."""
        with self._lock:
            self._model = None
            self._is_loaded = False
            logger.info("Whisper model unloaded.")

    @property
    def is_loaded(self) -> bool:
        """Check if model is currently loaded in memory."""
        return self._is_loaded
