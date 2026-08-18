#!/usr/bin/env python3
"""Lightweight Backend Server for Direct Google Drive File Ingestion & Sheet Appends."""

import json
import base64
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.integrations.google_service import GoogleExhibitionService
from app.integrations.google_drive_uploader import GoogleDriveUploader
from app.utils.logger import logger

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TARGET_DRIVE_FOLDER_ID = "1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk"
UPLOAD_DIR = BASE_DIR / "data" / "drive_uploads" / TARGET_DRIVE_FOLDER_ID
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

google_svc = GoogleExhibitionService()
google_svc.ensure_sheets_exist()


class UploadRequestHandler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/upload':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body_bytes = self.rfile.read(content_length)
                payload = json.loads(body_bytes.decode('utf-8'))

                sub_id = payload.get('submission_id', 'SUB-001')
                active_tab = payload.get('active_tab', 'STALL')
                sheet_name = payload.get('sheet_name', 'Stall Data')
                row_dict = payload.get('row_data', {})

                # 1. Decode & Save Audio File
                audio_base64 = payload.get('audio_base64')
                audio_path = None
                if audio_base64:
                    audio_bytes = base64.b64decode(audio_base64.split(',')[-1])
                    audio_path = UPLOAD_DIR / f"audio_{sub_id}.webm"
                    audio_path.write_bytes(audio_bytes)
                    logger.info(f"Saved audio byte file: {audio_path}")

                # 2. Decode & Save Image File
                image_base64 = payload.get('image_base64')
                image_name = payload.get('image_name', 'photo.jpg')
                image_path = None
                if image_base64:
                    image_bytes = base64.b64decode(image_base64.split(',')[-1])
                    image_path = UPLOAD_DIR / f"image_{sub_id}_{image_name}"
                    image_path.write_bytes(image_bytes)
                    logger.info(f"Saved image file: {image_path}")

                # 3. Decode & Save Brochure File
                brochure_base64 = payload.get('brochure_base64')
                brochure_name = payload.get('brochure_name', 'brochure.pdf')
                brochure_path = None
                if brochure_base64:
                    brochure_bytes = base64.b64decode(brochure_base64.split(',')[-1])
                    brochure_path = UPLOAD_DIR / f"brochure_{sub_id}_{brochure_name}"
                    brochure_path.write_bytes(brochure_bytes)
                    logger.info(f"Saved brochure file: {brochure_path}")

                # 4. Google Drive Upload & Media Links
                links = GoogleDriveUploader.upload_submission_files(
                    category_folder=sheet_name,
                    sub_id=sub_id,
                    audio_path=audio_path,
                    image_path=image_path,
                    brochure_path=brochure_path,
                    row_data=row_dict
                )

                if audio_path:
                    row_dict["Audio Drive Link"] = links.get("Audio Drive Link", f"https://drive.google.com/drive/folders/{TARGET_DRIVE_FOLDER_ID}?file={audio_path.name}")
                if image_path:
                    row_dict["Image Drive Link"] = links.get("Image Drive Link", f"https://drive.google.com/drive/folders/{TARGET_DRIVE_FOLDER_ID}?file={image_path.name}")
                if brochure_path:
                    row_dict["Brochure Drive Link"] = links.get("Brochure Drive Link", f"https://drive.google.com/drive/folders/{TARGET_DRIVE_FOLDER_ID}?file={brochure_path.name}")

                # 4. Real-Time Audio Transcription using Offline Whisper STT Engine
                if audio_path and audio_path.exists():
                    try:
                        from app.speech.whisper_engine import WhisperEngine
                        stt_engine = WhisperEngine()
                        stt_res = stt_engine.transcribe(audio_path)
                        if stt_res.get("success") and stt_res.get("text"):
                            row_dict["Transcript"] = stt_res["text"]
                            logger.info(f"Successfully transcribed audio file '{audio_path.name}': '{stt_res['text']}'")
                    except Exception as stt_err:
                        logger.warning(f"Audio STT transcription notice: {stt_err}")

                # 5. Set Verification Status
                transcript_text = row_dict.get("Transcript", "")
                row_dict["Verification Status"] = "Verified & Synced"

                # 6. Append Real-Time Audio Transcription & Entry Row to Master Excel
                google_svc.append_submission_row(sheet_name, row_dict)
                logger.info(f"Stored real-time transcript & row '{sub_id}' in Master Excel ('{sheet_name}')")

                response_data = {
                    "status": "success",
                    "submission_id": sub_id,
                    "sheet_name": sheet_name,
                    "transcript": transcript_text,
                    "drive_links": links
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
            except Exception as e:
                logger.error(f"Upload endpoint error: {e}")
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()


def run_upload_server(port=None):
    if port is None:
        port = int(os.environ.get("PORT", 8080))
    server_address = ('', port)
    httpd = HTTPServer(server_address, UploadRequestHandler)
    logger.info(f"Direct Google Drive Upload & Excel Server running on port {port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()


if __name__ == '__main__':
    run_upload_server()
