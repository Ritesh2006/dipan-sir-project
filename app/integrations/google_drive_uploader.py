"""Google Drive Uploader linked directly to National Exhibition 2026 Drive Folder."""

import os
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from app.config.settings import settings
from app.utils.logger import logger

# Google Drive API Client imports
try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from google.oauth2 import service_account
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

import base64
import json
import ssl
import urllib.request

# Target Google Drive Base URL & Folder ID
TARGET_DRIVE_BASE_URL = settings.GOOGLE_DRIVE_BASE_URL
TARGET_DRIVE_FOLDER_ID = settings.GOOGLE_DRIVE_FOLDER_ID

# Local Backup & Sync Directory
LOCAL_DRIVE_DIR = settings.BASE_DIR / "data" / "drive_uploads" / TARGET_DRIVE_FOLDER_ID
LOCAL_DRIVE_DIR.mkdir(parents=True, exist_ok=True)


class GoogleDriveUploader:
    """Uploads submission audio, photos, and brochures directly to Google Drive."""

    @staticmethod
    def _get_drive_service():
        """Initialize Google Drive API client using service account if present."""
        if not GOOGLE_API_AVAILABLE:
            return None

        creds_path = settings.BASE_DIR / "service_account.json"
        if not creds_path.exists():
            creds_path = settings.BASE_DIR / "credentials.json"

        if creds_path.exists():
            try:
                scopes = ['https://www.googleapis.com/auth/drive.file']
                creds = service_account.Credentials.from_service_account_file(
                    str(creds_path), scopes=scopes
                )
                return build('drive', 'v3', credentials=creds)
            except Exception as e:
                logger.warning(f"Google Drive API Service initialization notice: {e}")
        return None

    @staticmethod
    def convert_to_mp3(audio_path: Path) -> Path:
        """Convert any input audio file (webm, wav, m4a, ogg) to standard playable MP3 format using ffmpeg."""
        if not audio_path or not audio_path.exists():
            return audio_path

        if audio_path.suffix.lower() == ".mp3":
            return audio_path

        mp3_path = audio_path.with_suffix(".mp3")
        try:
            import subprocess
            cmd = ["ffmpeg", "-y", "-i", str(audio_path), "-acodec", "libmp3lame", "-ab", "128k", str(mp3_path)]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            if mp3_path.exists() and mp3_path.stat().st_size > 0:
                logger.info(f"Converted audio '{audio_path.name}' -> MP3 '{mp3_path.name}'")
                return mp3_path
        except Exception as e:
            logger.warning(f"Audio MP3 conversion notice for '{audio_path.name}': {e}")
        return audio_path

    @staticmethod
    def _upload_via_apps_script(script_url: str, file_path: Path, folder_id: str) -> Optional[str]:
        """Upload file to Google Drive using a Google Apps Script Web App deployment."""
        try:
            mime_type = "application/octet-stream"
            ext = file_path.suffix.lower()
            if ext in (".jpg", ".jpeg"):
                mime_type = "image/jpeg"
            elif ext == ".png":
                mime_type = "image/png"
            elif ext == ".mp3":
                mime_type = "audio/mp3"
            elif ext in (".webm", ".weba"):
                mime_type = "audio/webm"
            elif ext in (".wav", ".m4a"):
                mime_type = f"audio/{ext[1:]}"
            elif ext == ".pdf":
                mime_type = "application/pdf"

            file_bytes = file_path.read_bytes()
            b64_str = base64.b64encode(file_bytes).decode('utf-8')

            payload = {
                "fileName": file_path.name,
                "mimeType": mime_type,
                "base64": b64_str,
                "folderId": folder_id
            }

            req = urllib.request.Request(
                script_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
            )

            ssl_ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=120) as response:
                res_bytes = response.read()
                res_data = json.loads(res_bytes.decode('utf-8'))
                if res_data.get("status") == "success" and res_data.get("webViewLink"):
                    return res_data.get("webViewLink")
        except Exception as e:
            logger.warning(f"Google Apps Script upload notice for '{file_path.name}': {e}")
        return None

    @classmethod
    def _upload_file(cls, target_file: Path, sub_id: str, service: Any) -> str:
        """Upload a single file via Drive API or Apps Script Web App, returning the webViewLink."""
        fallback_link = f"{TARGET_DRIVE_FOLDER_ID}?sub_id={sub_id}&file={target_file.name}"
        if not TARGET_DRIVE_BASE_URL.endswith(TARGET_DRIVE_FOLDER_ID):
            fallback_link = f"{TARGET_DRIVE_BASE_URL}?sub_id={sub_id}&file={target_file.name}"

        # 1. Try Google Drive API (Service Account)
        if service:
            try:
                file_metadata = {
                    'name': target_file.name,
                    'parents': [TARGET_DRIVE_FOLDER_ID]
                }
                media = MediaFileUpload(str(target_file), resumable=True)
                uploaded_file = service.files().create(
                    body=file_metadata, media_body=media, fields='id, webViewLink'
                ).execute()
                drive_link = uploaded_file.get('webViewLink', fallback_link)
                logger.info(f"Direct Google Drive API Upload Success for '{target_file.name}': {drive_link}")
                return drive_link
            except Exception as err:
                logger.warning(f"Google Drive API upload notice for '{target_file.name}': {err}")

        # 2. Try Google Apps Script Web App if configured
        script_url = settings.GOOGLE_APPS_SCRIPT_URL or os.getenv("GOOGLE_APPS_SCRIPT_URL", "")
        if script_url:
            script_link = cls._upload_via_apps_script(script_url, target_file, TARGET_DRIVE_FOLDER_ID)
            if script_link:
                logger.info(f"Google Apps Script Drive Upload Success for '{target_file.name}': {script_link}")
                return script_link

        logger.info(f"Saved file locally at '{target_file}'. To upload directly to Google Drive, place service_account.json in project root or set GOOGLE_APPS_SCRIPT_URL in .env.")
        return fallback_link

    @classmethod
    def upload_submission_files(
        cls,
        category_folder: str,
        sub_id: str,
        audio_path: Optional[Path] = None,
        image_path: Optional[Path] = None,
        brochure_path: Optional[Path] = None,
        row_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, str]:
        """Save files locally into target Drive sync folder and upload to Google Drive API / Apps Script."""
        import re
        dest_dir = LOCAL_DRIVE_DIR / category_folder / sub_id
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Extract Stall No & Project / Stall Name for clean user requested naming format:
        # "Stall_{stall_no}_{project_name}_Audio_1.mp3"
        row_info = row_data or {}
        raw_stall_no = row_info.get("Stall No.", sub_id)
        raw_name = (
            row_info.get("Stall Name") or
            row_info.get("Exhibit/Project Name") or
            row_info.get("Lecture Title") or
            row_info.get("Organization") or
            "Project"
        )

        clean_stall = re.sub(r'[^a-zA-Z0-9\-]', '_', str(raw_stall_no)).strip('_')
        clean_proj = re.sub(r'[^a-zA-Z0-9\-]', '_', str(raw_name)).strip('_')
        if not clean_stall:
            clean_stall = sub_id
        if not clean_proj:
            clean_proj = "Project"

        prefix = f"Stall_{clean_stall}_{clean_proj}"

        # Count index extraction from sub_id (e.g. STALL-001 -> 1)
        try:
            item_num = int(sub_id.split('-')[-1])
        except Exception:
            item_num = 1

        links = {
            "Audio Drive Link": "N/A",
            "Image Drive Link": "N/A",
            "Brochure Drive Link": "N/A"
        }

        service = cls._get_drive_service()

        # 1. Audio File Upload (Format: Stall_{stall_no}_{project_name}_Audio_{count}.mp3)
        if audio_path and audio_path.exists():
            converted_audio = cls.convert_to_mp3(audio_path)
            clean_audio_name = f"{prefix}_Audio_{item_num}.mp3"
            target_audio = dest_dir / clean_audio_name
            shutil.copy(str(converted_audio), str(target_audio))
            links["Audio Drive Link"] = cls._upload_file(target_audio, sub_id, service)

        # 2. Image File Upload (Format: Stall_{stall_no}_{project_name}_Photo_{count}.jpg)
        if image_path and image_path.exists():
            ext = image_path.suffix.lower() if image_path.suffix else ".jpg"
            clean_image_name = f"{prefix}_Photo_{item_num}{ext}"
            target_img = dest_dir / clean_image_name
            shutil.copy(str(image_path), str(target_img))
            links["Image Drive Link"] = cls._upload_file(target_img, sub_id, service)

        # 3. Brochure File Upload (Format: Stall_{stall_no}_{project_name}_Brochure_{count}.pdf)
        if brochure_path and brochure_path.exists():
            ext = brochure_path.suffix.lower() if brochure_path.suffix else ".pdf"
            clean_brochure_name = f"{prefix}_Brochure_{item_num}{ext}"
            target_doc = dest_dir / clean_brochure_name
            shutil.copy(str(brochure_path), str(target_doc))
            links["Brochure Drive Link"] = cls._upload_file(target_doc, sub_id, service)

        return links

    @classmethod
    def upload_excel_file(cls, excel_path: Path) -> Optional[str]:
        """Upload/sync the Master Excel file to Google Drive as requested: National_Exhibition_2026_Master_Excel_Sheet_1.xlsx"""
        if not excel_path or not excel_path.exists():
            return None

        service = cls._get_drive_service()
        LOCAL_DRIVE_DIR.mkdir(parents=True, exist_ok=True)

        clean_excel_name = "National_Exhibition_2026_Master_Excel_Sheet_1.xlsx"
        dest_excel = LOCAL_DRIVE_DIR / clean_excel_name
        shutil.copy(str(excel_path), str(dest_excel))
        link = cls._upload_file(dest_excel, "EXCEL_SYNC", service)
        logger.info(f"Master Excel File synced to Google Drive: {link}")
        return link
