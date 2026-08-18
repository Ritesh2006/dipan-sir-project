#!/usr/bin/env python3
"""Clean up all test data, temp files, and reset Master Excel Spreadsheet to fresh headers."""

import os
import sys
import shutil
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

load_dotenv()

from app.integrations.google_service import GoogleExhibitionService, EXHIBITION_EXCEL_PATH, TAB_HEADERS
from app.integrations.google_drive_uploader import GoogleDriveUploader
import openpyxl
from app.excel.formatter import format_header_row, auto_fit_columns


def reset_all_data():
    print("==================================================")
    print(" CLEANING UP TEST DATA & RESETTING MASTER EXCEL")
    print("==================================================")

    # 1. Clean scratch_demo directory
    scratch_dir = BASE_DIR / "data" / "scratch_demo"
    if scratch_dir.exists():
        shutil.rmtree(scratch_dir)
        print(" [✓] Removed data/scratch_demo/")

    # 2. Clean temporary uploads directory
    uploads_dir = BASE_DIR / "data" / "drive_uploads"
    if uploads_dir.exists():
        shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)
        print(" [✓] Cleared data/drive_uploads/")

    # 3. Clean temporary server uploads
    tmp_uploads = BASE_DIR / "data" / "uploads"
    if tmp_uploads.exists():
        shutil.rmtree(tmp_uploads)
        tmp_uploads.mkdir(parents=True, exist_ok=True)
        print(" [✓] Cleared data/uploads/")

    # 4. Reset Master Excel File with fresh clean headers
    if EXHIBITION_EXCEL_PATH.exists():
        EXHIBITION_EXCEL_PATH.unlink()

    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # remove default sheet

    for tab_name, headers in TAB_HEADERS.items():
        ws = wb.create_sheet(title=tab_name)
        ws.append(headers)
        format_header_row(ws)
        auto_fit_columns(ws)

    EXHIBITION_EXCEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(EXHIBITION_EXCEL_PATH))
    wb.close()
    print(f" [✓] Created fresh Master Excel File with clean headers at: {EXHIBITION_EXCEL_PATH}")

    # 5. Clean SQLite database
    db_path = BASE_DIR / "data" / "database" / "app.db"
    if db_path.exists():
        db_path.unlink()
        print(" [✓] Cleared test SQLite database app.db")

    # 6. Upload fresh empty Master Excel to Google Drive
    print("\n[*] Syncing fresh Master Excel File to Google Drive...")
    link = GoogleDriveUploader.upload_excel_file(EXHIBITION_EXCEL_PATH)
    print(f" [✓] Clean Master Excel Link in Google Drive: {link}")

    print("\n==================================================")
    print(" ALL TEST DATA REMOVED & SYSTEM IS CLEAN 100%!")
    print("==================================================")


if __name__ == "__main__":
    reset_all_data()
