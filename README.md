# 🎙️ Offline Voice-to-Excel Intelligence Logger (Desktop & Mobile)

A production-quality, lightweight, **100% OFFLINE** desktop & downloadable mobile application that continuously listens to microphone audio, transcribes speech locally, extracts structured data via rule-based NLP & Pydantic schemas, and automatically logs the extracted information into Excel spreadsheets (`openpyxl` / `xlsx`) and local database history.

---

## 📱 Mobile App (100% Offline & Native Android Project)

The mobile system includes a **100% Offline Progressive Web App (PWA)** and **Native Android Project (`mobile_app/android/`)**:

- **Automated Asset Sync:** Run `./scripts/build_mobile_app.py` to auto-build and sync all offline PWA assets into the Android native project in 1 click!
- **0% Internet Required:** Cached via Service Worker (`sw.js`). Operates completely offline without cellular data or Wi-Fi.
- **Client-Side Excel Generation:** Generates and downloads `.xlsx` spreadsheets directly into the mobile device's Download folder.
- **IndexedDB Storage:** Persists offline log history directly on your phone.

### 📲 Mobile Installation:
1. **Automated Mobile Build Script:**
   ```bash
   ./scripts/build_mobile_app.py
   ```
2. **Android APK Compilation:** Open `mobile_app/android` in Android Studio $\to$ Click **Build $\to$ Build APK(s)**.
3. **Direct Mobile Browser Download:** Open `http://<your-ip>:3000` on Chrome (Android) $\to$ Tap **"Install App"** / **"Add to Home Screen"**.

---

## 🖥️ Desktop Application (PySide6)

- **100% Offline & Private:** Powered by `faster-whisper` (CTranslate2) and local SQLite (`data/database/app.db`).
- **Real-Time Voice Activity Detection (VAD):** Dynamic noise floor filter.
- **Formula Injection Protection:** Automatic cell sanitization (`=`, `+`, `-`, `@`).

---

## 🏃 Running the Applications

### Desktop App:
```bash
python run.py
```

### Mobile App (Dev / Network Host):
```bash
cd mobile_app
npm run dev
```
