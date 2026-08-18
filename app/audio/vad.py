"""Voice Activity Detection (VAD) module."""

import numpy as np
from app.utils.logger import logger


class VoiceActivityDetector:
    """Energy & dynamic noise threshold based Voice Activity Detector."""

    def __init__(self, threshold: float = 0.01, adapt_noise: bool = True):
        self.threshold = threshold
        self.adapt_noise = adapt_noise
        self.noise_floor = threshold * 0.5

    def calculate_rms(self, audio_chunk: np.ndarray) -> float:
        """Calculate Root Mean Square (RMS) energy of audio chunk."""
        if audio_chunk.size == 0:
            return 0.0
        # If integer pcm data, convert to float32 normalized -1.0 to 1.0
        if np.issubdtype(audio_chunk.dtype, np.integer):
            max_val = float(np.iinfo(audio_chunk.dtype).max)
            audio_chunk = audio_chunk.astype(np.float32) / max_val
        return float(np.sqrt(np.mean(np.square(audio_chunk))))

    def is_speech(self, audio_chunk: np.ndarray) -> bool:
        """Determine if audio chunk contains speech based on RMS energy."""
        rms = self.calculate_rms(audio_chunk)

        if rms < self.threshold:
            if self.adapt_noise:
                # Dynamically update noise floor estimate
                self.noise_floor = 0.95 * self.noise_floor + 0.05 * rms
            return False

        # Speech detected if RMS significantly exceeds noise floor and absolute threshold
        return rms > max(self.threshold, self.noise_floor * 2.5)
