"""Audio Processor module for buffering frames and isolating speech segments."""

import queue
import time
import numpy as np
from typing import Optional, Callable
from app.audio.vad import VoiceActivityDetector
from app.utils.logger import logger


class AudioProcessor:
    """Buffers stream frames, runs VAD, and constructs clean audio segments."""

    def __init__(
        self,
        sample_rate: int = 16000,
        vad_threshold: float = 0.01,
        silence_limit_sec: float = 0.8,
        max_segment_sec: float = 5.0,
        speech_queue: Optional[queue.Queue] = None,
        on_speech_detected: Optional[Callable[[], None]] = None,
    ):
        self.sample_rate = sample_rate
        self.vad = VoiceActivityDetector(threshold=vad_threshold)
        self.silence_limit_sec = silence_limit_sec
        self.max_segment_sec = max_segment_sec
        self.speech_queue = speech_queue or queue.Queue()
        self.on_speech_detected = on_speech_detected

        self._current_buffer: list[np.ndarray] = []
        self._is_speaking: bool = False
        self._last_speech_time: float = 0.0
        self._segment_start_time: float = 0.0

    def process_chunk(self, chunk: np.ndarray) -> None:
        """Process incoming raw audio chunk from microphone."""
        if chunk is None or chunk.size == 0:
            return

        # Ensure float32 1D array normalized -1.0 to 1.0
        if chunk.ndim > 1:
            chunk = chunk.flatten()

        if np.issubdtype(chunk.dtype, np.integer):
            max_val = float(np.iinfo(chunk.dtype).max)
            chunk = chunk.astype(np.float32) / max_val
        elif chunk.dtype != np.float32:
            chunk = chunk.astype(np.float32)

        has_speech = self.vad.is_speech(chunk)
        now = time.time()

        if has_speech:
            if not self._is_speaking:
                logger.debug("Speech activity started.")
                self._is_speaking = True
                self._segment_start_time = now
                if self.on_speech_detected:
                    self.on_speech_detected()

            self._last_speech_time = now
            self._current_buffer.append(chunk)
        else:
            if self._is_speaking:
                # Store silence frame to allow natural pause decay
                self._current_buffer.append(chunk)

                silence_duration = now - self._last_speech_time
                segment_duration = now - self._segment_start_time

                if silence_duration >= self.silence_limit_sec or segment_duration >= self.max_segment_sec:
                    logger.debug(
                        f"Speech segment ended (duration={segment_duration:.2f}s, silence={silence_duration:.2f}s)."
                    )
                    self._flush_buffer()

    def _flush_buffer(self) -> None:
        """Concatenate accumulated frames and send segment to queue."""
        if self._current_buffer:
            combined = np.concatenate(self._current_buffer, axis=0)
            # Only send segment if longer than 0.5 sec to filter brief clicks/coughs
            if len(combined) >= int(self.sample_rate * 0.5):
                self.speech_queue.put(combined)
                logger.info(f"Queued audio segment for STT: {len(combined)/self.sample_rate:.2f} seconds.")

        self._current_buffer = []
        self._is_speaking = False

    def force_flush(self) -> None:
        """Force flush buffer when stopping recording."""
        self._flush_buffer()
