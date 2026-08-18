#!/usr/bin/env python3
"""Google Drive Integration Setup & Verification Tool."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

load_dotenv()

from app.config.settings import settings
from app.integrations.google_drive_uploader import GoogleDriveUploader


def main():
    print("==================================================")
    print(" GOOGLE DRIVE INTEGRATION DIAGNOSTIC & VERIFICATION")
    print("==================================================")

    folder_id = settings.GOOGLE_DRIVE_FOLDER_ID
    apps_script_url = settings.GOOGLE_APPS_SCRIPT_URL
    service_acc_path = BASE_DIR / "service_account.json"

    print(f"[*] Target Folder ID: {folder_id}")
    print(f"[*] Service Account File: {service_acc_path} (Exists: {service_acc_path.exists()})")
    print(f"[*] Google Apps Script URL: {apps_script_url or 'Not configured'}\n")

    # Test file upload
    test_file = BASE_DIR / "data" / "drive_uploads" / "test_file.txt"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("Testing Google Drive upload pipeline.")

    print("[*] Testing file upload...")
    links = GoogleDriveUploader.upload_submission_files(
        category_folder="Test Data",
        sub_id="TEST-001",
        audio_path=test_file
    )

    print("\n[+] Link Results:")
    for key, val in links.items():
        print(f"   {key}: {val}")

    print("\n==================================================")
    print(" SUMMARY:")
    if service_acc_path.exists():
        print(" [✓] GCP Service Account active for direct Google Drive uploads.")
    elif apps_script_url:
        print(" [!] Apps Script URL configured in .env.")
        print("     To fix 'DriveApp.getFolderById' permission errors in Apps Script:")
        print("     1. Open script.google.com -> Run testAuth() once.")
        print("     2. Approve the 'Authorization Required' Google popup.")
        print("     3. Click Deploy -> New deployment -> Web app (Anyone).")
    else:
        print(" [i] Operating in 100% Offline / Local Disk mode.")
        print("     All files are safely stored in data/drive_uploads/")
    print("==================================================")


if __name__ == "__main__":
    main()
