"""Microphone recording service using sounddevice."""

import queue
import threading
import numpy as np
from typing import Optional, Callable, List, Dict, Any
from app.audio.audio_processor import AudioProcessor
from app.utils.logger import logger


class AudioRecorder:
    """Manages microphone input audio stream using sounddevice."""

    def __init__(
        self,
        sample_rate: int = 16000,
        device_index: Optional[int] = None,
        chunk_duration: float = 0.2,
        processor: Optional[AudioProcessor] = None,
        on_status_change: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        self.sample_rate = sample_rate
        self.device_index = device_index
        self.chunk_size = int(sample_rate * chunk_duration)
        self.processor = processor or AudioProcessor(sample_rate=sample_rate)
        self.on_status_change = on_status_change
        self.on_error = on_error

        self._stream = None
        self._recording = False
        self._lock = threading.RLock()

    @staticmethod
    def get_input_devices() -> List[Dict[str, Any]]:
        """List available input microphone devices."""
        try:
            import sounddevice as sd
            devices = sd.query_devices()
            input_devices = []
            for i, dev in enumerate(devices):
                if dev.get("max_input_channels", 0) > 0:
                    input_devices.append({
                        "index": i,
                        "name": dev.get("name", f"Device {i}"),
                        "channels": dev.get("max_input_channels"),
                        "default_samplerate": dev.get("default_samplerate"),
                    })
            return input_devices
        except Exception as e:
            logger.error(f"Error querying input audio devices: {e}")
            return []

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info: Any, status: Any) -> None:
        """Callback executed by sounddevice for each audio chunk."""
        if status:
            logger.warning(f"Audio stream status warning: {status}")
        if self._recording and self.processor:
            self.processor.process_chunk(indata.copy())

    def start(self) -> bool:
        """Start non-blocking microphone recording stream."""
        with self._lock:
            if self._recording:
                logger.warning("Audio recorder is already running.")
                return True

            try:
                import sounddevice as sd

                self._stream = sd.InputStream(
                    samplerate=self.sample_rate,
                    blocksize=self.chunk_size,
                    device=self.device_index,
                    channels=1,
                    dtype="float32",
                    callback=self._audio_callback,
                )
                self._stream.start()
                self._recording = True
                logger.info(f"Microphone recording started (Sample rate={self.sample_rate}Hz, Device={self.device_index}).")
                if self.on_status_change:
                    self.on_status_change("Listening")
                return True
            except Exception as e:
                err_msg = f"Failed to start microphone stream: {e}"
                logger.error(err_msg)
                self._recording = False
                if self.on_error:
                    self.on_error(err_msg)
                if self.on_status_change:
                    self.on_status_change("Error")
                return False

    def stop(self) -> None:
        """Stop microphone recording stream."""
        with self._lock:
            if not self._recording:
                return

            self._recording = False
            if self._stream:
                try:
                    self._stream.stop()
                    self._stream.close()
                except Exception as e:
                    logger.error(f"Error closing audio stream: {e}")
                finally:
                    self._stream = None

            if self.processor:
                self.processor.force_flush()

            logger.info("Microphone recording stopped.")
            if self.on_status_change:
                self.on_status_change("Ready")

    @property
    def is_recording(self) -> bool:
        """Check if currently recording."""
        return self._recording
