#!/usr/bin/env python3
"""Script to process and update high-resolution app logo icons for Android APK & Mobile PWA."""

import os
import sys
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-switch to virtual environment python if available
venv_python = BASE_DIR / ".venv/bin/python"
if venv_python.exists() and os.path.abspath(sys.executable) != os.path.abspath(str(venv_python)):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

SOURCE_ICON = Path("/Users/riteshrakshit/.gemini/antigravity-ide/brain/aab61d5d-de4f-444e-9bf0-79a419644a8c/app_logo_icon_1786742434111.png")


def update_icons():
    print("==================================================")
    print(" PROCESSING MODERN APP LOGO ICONS FOR MOBILE & APK")
    print("==================================================")

    if not SOURCE_ICON.exists():
        print(f"[X] Source icon not found at {SOURCE_ICON}")
        sys.exit(1)

    img = Image.open(SOURCE_ICON)

    # 1. Update Mobile PWA icons
    public_dir = BASE_DIR / "mobile_app/public"
    public_dir.mkdir(parents=True, exist_ok=True)

    img.resize((192, 192), Image.Resampling.LANCZOS).save(public_dir / "icon-192.png", "PNG")
    img.resize((512, 512), Image.Resampling.LANCZOS).save(public_dir / "icon-512.png", "PNG")
    print("[✓] Generated PWA icons (icon-192.png & icon-512.png)")

    # 2. Update Android native launcher icons
    res_dir = BASE_DIR / "mobile_app/android/app/src/main/res"

    sizes = {
        "mipmap-mdpi": (48, 48),
        "mipmap-hdpi": (72, 72),
        "mipmap-xhdpi": (96, 96),
        "mipmap-xxhdpi": (144, 144),
        "mipmap-xxxhdpi": (192, 192),
    }

    for folder, size in sizes.items():
        target_folder = res_dir / folder
        target_folder.mkdir(parents=True, exist_ok=True)

        resized = img.resize(size, Image.Resampling.LANCZOS)
        resized.save(target_folder / "ic_launcher.png", "PNG")
        resized.save(target_folder / "ic_launcher_round.png", "PNG")
        resized.save(target_folder / "ic_launcher_foreground.png", "PNG")
        print(f"[✓] Generated Android icons for {folder} ({size[0]}x{size[1]})")

    print("\n[✓] All mobile app logo icons updated successfully!")


if __name__ == "__main__":
    update_icons()
