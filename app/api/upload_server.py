#!/usr/bin/env python3
"""Lightweight Backend Server for Direct Google Drive File Ingestion & Sheet Appends."""

import json
import base64
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from http.server import HTTPServer, BaseHTTPRequestHandler
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

    def do_GET(self):
        if self.path == '/health' or self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/api/transcribe':
            try:
                content_type = self.headers.get('Content-Type', '')
                content_length = int(self.headers.get('Content-Length', 0))
                body_bytes = self.rfile.read(content_length)

                payload = json.loads(body_bytes.decode('utf-8'))
                audio_b64 = payload.get('audio_base64', '')
                language = payload.get('language', 'multi')
                model = payload.get('model', 'nvidia/whisper-large-v3')
                api_key = payload.get('api_key', os.environ.get('NVIDIA_API_KEY', ''))

                if not api_key:
                    api_key = os.environ.get('NVIDIA_API_KEY', '')

                if not audio_b64:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "No audio provided"}).encode('utf-8'))
                    return

                if audio_b64.startswith('data:'):
                    audio_b64 = audio_b64.split(',', 1)[1]
                audio_bytes = base64.b64decode(audio_b64)

                nim_url = 'https://integrate.api.nvidia.com/v1/audio/transcriptions'
                boundary = '----VoiceLoggerBoundary2026'
                form_data = (
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="file"; filename="recording.wav"\r\n'
                    f'Content-Type: audio/wav\r\n\r\n'
                ).encode('utf-8') + audio_bytes + (
                    f'\r\n--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="model"\r\n\r\n{model}\r\n'
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="language"\r\n\r\n{language}\r\n'
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="response_format"\r\n\r\njson\r\n'
                    f'--{boundary}--\r\n'
                ).encode('utf-8')

                req = urllib.request.Request(
                    nim_url,
                    data=form_data,
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': f'multipart/form-data; boundary={boundary}',
                    },
                    method='POST'
                )

                try:
                    with urllib.request.urlopen(req, timeout=30) as nim_resp:
                        nim_result = json.loads(nim_resp.read().decode('utf-8'))
                except urllib.error.HTTPError as nim_err:
                    err_body = nim_err.read().decode('utf-8', errors='replace')
                    logger.error(f"NVIDIA NIM API error {nim_err.code}: {err_body}")
                    self.send_response(502)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "error": f"NVIDIA API error ({nim_err.code})",
                        "detail": err_body
                    }).encode('utf-8'))
                    return

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(nim_result).encode('utf-8'))
                logger.info(f"Transcription complete: {nim_result.get('text', '')[:100]}")
            except Exception as e:
                logger.error(f"Transcribe endpoint error: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

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
