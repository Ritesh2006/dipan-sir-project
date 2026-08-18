"""Model manager for inspecting and resolving local faster-whisper model files."""

import os
from pathlib import Path
from typing import Optional
from app.config.settings import settings
from app.utils.logger import logger


class ModelManager:
    """Manages offline Whisper model resolution and local downloads."""

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = models_dir or settings.MODELS_DIR
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def get_model_path_or_name(self, model_size: str) -> str:
        """Return local path if downloaded in models/, else return model size string for HuggingFace local cache loading."""
        local_dir = self.models_dir / f"whisper-{model_size}"
        if local_dir.exists() and (local_dir / "model.bin").exists():
            logger.info(f"Using offline model from local directory: {local_dir}")
            return str(local_dir)

        # Fallback to model size name (faster-whisper will use cached version or download if allowed)
        logger.info(f"Model directory {local_dir} not populated; using model name '{model_size}'")
        return model_size

    def is_model_installed(self, model_size: str) -> bool:
        """Check if local model directory contains valid binary files."""
        local_dir = self.models_dir / f"whisper-{model_size}"
        return local_dir.exists() and (local_dir / "model.bin").exists()
