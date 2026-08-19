#!/usr/bin/env python3
"""Backend Server - Google Drive Ingestion, Sheet Appends, NIM Transcription Proxy."""

import json
import base64
import os
import sys
import uuid
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

TARGET_DRIVE_FOLDER_ID = "1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk"
UPLOAD_DIR = BASE_DIR / "data" / "drive_uploads" / TARGET_DRIVE_FOLDER_ID
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

NIM_SERVER_URL = os.environ.get('NIM_SERVER_URL', '').rstrip('/')
NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '').strip()

google_svc = GoogleExhibitionService()
google_svc.ensure_sheets_exist()


def _transcribe_via_nim(audio_bytes, language='auto'):
    """Send WAV audio to self-hosted NIM server and return transcription result."""
    if not NIM_SERVER_URL:
        raise RuntimeError("NIM_SERVER_URL environment variable not set")

    boundary = f'---boundary-{uuid.uuid4().hex}'

    # Map language codes
    lang_map = {
        'hi': 'hi-IN', 'hi-IN': 'hi-IN',
        'bn': 'bn-IN', 'bn-IN': 'bn-IN',
        'en': 'en-US', 'en-US': 'en-US',
        'auto': 'multi', 'multi': 'multi',
    }
    nim_lang = lang_map.get(language, 'multi')
    if nim_lang == 'multi' and language and language not in ('auto', 'multi'):
        nim_lang = language

    # Build multipart body
    parts = []
    parts.append(f'--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n')
    parts.append(b'Content-Type: audio/wav\r\n\r\n')
    parts.append(audio_bytes)
    parts.append(f'\r\n--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="model"\r\n\r\n')
    parts.append(b'nvidia/whisper-large-v3')
    parts.append(f'\r\n--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="language"\r\n\r\n')
    parts.append(nim_lang.encode())
    parts.append(f'\r\n--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="response_format"\r\n\r\n')
    parts.append(b'json')
    parts.append(f'\r\n--{boundary}--\r\n'.encode())
    body = b''.join(parts)

    headers = {
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    }
    if NVIDIA_API_KEY:
        headers['Authorization'] = f'Bearer {NVIDIA_API_KEY}'

    req = urllib.request.Request(
        f'{NIM_SERVER_URL}/v1/audio/transcriptions',
        data=body,
        headers=headers,
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        return result


def _transcribe_via_nvidia_hosted(audio_bytes, language='auto'):
    """Fallback: send audio directly to NVIDIA NIM hosted API (requires API key)."""
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY not set for hosted fallback")

    boundary = f'---boundary-{uuid.uuid4().hex}'

    lang_map = {
        'hi': 'hi-IN', 'hi-IN': 'hi-IN',
        'bn': 'bn-IN', 'bn-IN': 'bn-IN',
        'en': 'en-US', 'en-US': 'en-US',
        'auto': 'multi', 'multi': 'multi',
    }
    nim_lang = lang_map.get(language, 'multi')

    parts = []
    parts.append(f'--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n')
    parts.append(b'Content-Type: audio/wav\r\n\r\n')
    parts.append(audio_bytes)
    parts.append(f'\r\n--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="model"\r\n\r\n')
    parts.append(b'nvidia/whisper-large-v3')
    parts.append(f'\r\n--{boundary}\r\n'.encode())
    parts.append(b'Content-Disposition: form-data; name="language"\r\n\r\n')
    parts.append(nim_lang.encode())
    parts.append(f'\r\n--{boundary}--\r\n'.encode())
    body = b''.join(parts)

    req = urllib.request.Request(
        'https://integrate.api.nvidia.com/v1/audio/transcriptions',
        data=body,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Authorization': f'Bearer {NVIDIA_API_KEY}',
        },
        method='POST'
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode('utf-8'))


class UploadRequestHandler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/health', '/api/health'):
            status = {
                "status": "ok",
                "transcription": "nim" if NIM_SERVER_URL else "unavailable",
                "nim_server": NIM_SERVER_URL or "not configured",
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(status).encode('utf-8'))
        elif self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_transcribe(self, body_bytes):
        try:
            payload = json.loads(body_bytes.decode('utf-8'))
            audio_b64 = payload.get('audio_base64', '')
            language = payload.get('language', 'auto')

            if not audio_b64:
                self._send_json(400, {"error": "No audio provided"})
                return

            if audio_b64.startswith('data:'):
                audio_b64 = audio_b64.split(',', 1)[1]
            audio_bytes = base64.b64decode(audio_b64)

            # Try self-hosted NIM first, fallback to NVIDIA hosted
            result = None
            last_error = None

            if NIM_SERVER_URL:
                try:
                    result = _transcribe_via_nim(audio_bytes, language)
                except Exception as e:
                    last_error = e
                    logger.warning(f"Self-hosted NIM failed: {e}, trying hosted fallback")

            if result is None and NVIDIA_API_KEY:
                try:
                    result = _transcribe_via_nvidia_hosted(audio_bytes, language)
                except Exception as e:
                    last_error = e
                    logger.warning(f"NVIDIA hosted fallback failed: {e}")

            if result is None:
                error_msg = "No transcription backend available"
                if last_error:
                    error_msg = f"Transcription failed: {last_error}"
                self._send_json(500, {"error": error_msg})
                return

            self._send_json(200, {
                "text": result.get('text', ''),
                "language": result.get('language', language),
                "confidence": result.get('confidence', 0.0),
            })
            logger.info(f"Transcription: '{result.get('text', '')[:100]}'")
        except Exception as e:
            logger.error(f"Transcribe error: {e}")
            self._send_json(500, {"error": str(e)})

    def _handle_upload(self, body_bytes):
        try:
            payload = json.loads(body_bytes.decode('utf-8'))

            sub_id = payload.get('submission_id', 'SUB-001')
            sheet_name = payload.get('sheet_name', 'Stall Data')
            row_dict = payload.get('row_data', {})

            # Decode & save files
            audio_base64 = payload.get('audio_base64')
            audio_path = None
            if audio_base64:
                audio_bytes = base64.b64decode(audio_base64.split(',')[-1])
                audio_path = UPLOAD_DIR / f"audio_{sub_id}.webm"
                audio_path.write_bytes(audio_bytes)

            image_base64 = payload.get('image_base64')
            image_name = payload.get('image_name', 'photo.jpg')
            image_path = None
            if image_base64:
                image_bytes = base64.b64decode(image_base64.split(',')[-1])
                image_path = UPLOAD_DIR / f"image_{sub_id}_{image_name}"
                image_path.write_bytes(image_bytes)

            brochure_base64 = payload.get('brochure_base64')
            brochure_name = payload.get('brochure_name', 'brochure.pdf')
            brochure_path = None
            if brochure_base64:
                brochure_bytes = base64.b64decode(brochure_base64.split(',')[-1])
                brochure_path = UPLOAD_DIR / f"brochure_{sub_id}_{brochure_name}"
                brochure_path.write_bytes(brochure_bytes)

            # Google Drive upload
            links = GoogleDriveUploader.upload_submission_files(
                category_folder=sheet_name,
                sub_id=sub_id,
                audio_path=audio_path,
                image_path=image_path,
                brochure_path=brochure_path,
                row_data=row_dict
            )

            if audio_path:
                row_dict["Audio Drive Link"] = links.get("Audio Drive Link", "")
            if image_path:
                row_dict["Image Drive Link"] = links.get("Image Drive Link", "")
            if brochure_path:
                row_dict["Brochure Drive Link"] = links.get("Brochure Drive Link", "")

            # Transcribe audio via NIM
            if audio_path and audio_path.exists():
                try:
                    wav_bytes = audio_path.read_bytes()
                    result = None

                    if NIM_SERVER_URL:
                        try:
                            result = _transcribe_via_nim(wav_bytes, 'auto')
                        except Exception as e:
                            logger.warning(f"NIM transcription failed for upload: {e}")

                    if result is None and NVIDIA_API_KEY:
                        try:
                            result = _transcribe_via_nvidia_hosted(wav_bytes, 'auto')
                        except Exception as e:
                            logger.warning(f"Hosted fallback failed for upload: {e}")

                    if result and result.get('text'):
                        row_dict["Transcript"] = result['text']
                        logger.info(f"Transcribed '{audio_path.name}': '{result['text'][:100]}'")
                except Exception as stt_err:
                    logger.warning(f"Transcription notice: {stt_err}")

            # Append to sheet
            row_dict["Verification Status"] = "Verified & Synced"
            google_svc.append_submission_row(sheet_name, row_dict)

            self._send_json(200, {
                "status": "success",
                "submission_id": sub_id,
                "sheet_name": sheet_name,
                "transcript": row_dict.get("Transcript", ""),
                "drive_links": links,
            })
        except Exception as e:
            logger.error(f"Upload error: {e}")
            self._send_json(500, {"status": "error", "message": str(e)})

    def _send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length else b''

        if self.path == '/api/transcribe':
            self._handle_transcribe(body_bytes)
        elif self.path == '/api/upload':
            self._handle_upload(body_bytes)
        else:
            self.send_response(404)
            self.end_headers()


def run_upload_server(port=None):
    if port is None:
        port = int(os.environ.get("PORT", 8080))
    server_address = ('', port)
    httpd = HTTPServer(server_address, UploadRequestHandler)
    logger.info(f"Server running on port {port} (NIM: {NIM_SERVER_URL or 'not configured'})...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()


if __name__ == '__main__':
    run_upload_server()
