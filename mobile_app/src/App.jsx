import React, { useState, useEffect, useRef } from 'react';
import HeaderBar from './components/HeaderBar';
import HistoryTable from './components/HistoryTable';
import { exportToExcel } from './excel/excelGenerator';
import { saveRecordToDB, getAllRecordsFromDB, clearAllRecordsFromDB } from './db/indexedDbManager';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Mic, Square, Send, Award, Upload, FileText, Image as ImageIcon, Volume2, ExternalLink, CheckCircle2, RefreshCw, X, Radio, Download } from 'lucide-react';

const NativeSpeech = registerPlugin('NativeSpeech');

// Target Google Drive Folder Link provided by User
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk";

export default function App() {
  const [activeTab, setActiveTab] = useState('STALL'); // STALL | SCIENCE | LECTURE
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [records, setRecords] = useState([]);
  const [counter, setCounter] = useState({ STALL: 1, SCIENCE: 1, LECTURE: 1 });
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('SERVER_IP') || 'exhibition-voice-logger-backend.onrender.com');
  const [syncNotice, setSyncNotice] = useState(null);

  const UPLOAD_API_URL = serverIp.includes('onrender.com') || serverIp.startsWith('http://') || serverIp.startsWith('https://')
    ? (serverIp.startsWith('http') ? `${serverIp.replace(/\/$/, '')}/api/upload` : `https://${serverIp.replace(/\/$/, '')}/api/upload`)
    : `http://${serverIp}:8080/api/upload`;

  const handleServerIpChange = (newIp) => {
    setServerIp(newIp);
    try { localStorage.setItem('SERVER_IP', newIp); } catch (e) {}
  };

  // Recorded Audio state
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);

  // Media file state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [brochureFile, setBrochureFile] = useState(null);

  // Form states
  const [stallForm, setStallForm] = useState({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
  const [sciForm, setSciForm] = useState({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
  const [lecForm, setLecForm] = useState({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const nativeListenersRef = useRef([]);

  // Automatic Background Offline-to-Google-Drive Auto-Sync Engine
  const syncPendingRecordsToDrive = async () => {
    try {
      const allDBRecords = await getAllRecordsFromDB();
      if (!allDBRecords || allDBRecords.length === 0) return;

      const pendingList = allDBRecords.filter(r => r.syncStatus === 'PENDING_DRIVE_SYNC' || r["Verification Status"] === 'Saved Offline & Ready');
      if (pendingList.length === 0) return;

      let syncedCount = 0;
      for (const rec of pendingList) {
        try {
          const subId = rec["Submission ID"];
          const sheetName = rec._sheetName || 'Stall Data';
          const activeTabName = rec._activeTab || 'STALL';

          const uploadResp = await fetch(UPLOAD_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_id: subId,
              active_tab: activeTabName,
              sheet_name: sheetName,
              row_data: rec,
              audio_base64: rec._audioBase64 || null,
              image_base64: rec._imageBase64 || null,
              image_name: rec._imageName || 'photo.jpg',
              brochure_base64: rec._brochureBase64 || null,
              brochure_name: rec._brochureName || 'brochure.pdf'
            })
          });

          if (uploadResp.ok) {
            const serverRes = await uploadResp.json();
            rec.syncStatus = 'VERIFIED_AND_SYNCED';
            rec["Verification Status"] = 'Verified & Synced to Google Drive ✓';
            if (serverRes && serverRes.transcript) {
              rec["Transcript"] = serverRes.transcript;
            }
            if (serverRes && serverRes.drive_links) {
              if (serverRes.drive_links["Audio Drive Link"]) rec["Audio Drive Link"] = serverRes.drive_links["Audio Drive Link"];
              if (serverRes.drive_links["Image Drive Link"]) rec["Image Drive Link"] = serverRes.drive_links["Image Drive Link"];
              if (serverRes.drive_links["Brochure Drive Link"]) rec["Brochure Drive Link"] = serverRes.drive_links["Brochure Drive Link"];
            }
            await saveRecordToDB(rec);
            syncedCount++;
          }
        } catch (singleErr) {
          console.warn("Single record sync notice:", singleErr);
        }
      }

      if (syncedCount > 0) {
        const updatedRecords = await getAllRecordsFromDB();
        setRecords(updatedRecords);
        setSyncNotice(`Auto-Synced ${syncedCount} offline record(s) to Google Drive! ✓`);
        setTimeout(() => setSyncNotice(null), 6000);
      }
    } catch (err) {
      console.warn("Background Drive Sync notice:", err);
    }
  };

  useEffect(() => {
    getAllRecordsFromDB().then((dbRecords) => {
      if (dbRecords && dbRecords.length > 0) {
        setRecords(dbRecords);
      }
    }).catch(err => console.error("IndexedDB error:", err));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW reg error:", err));
    }

    syncPendingRecordsToDrive();

    const handleOnline = () => {
      syncPendingRecordsToDrive();
    };

    window.addEventListener('online', handleOnline);
    const syncInterval = setInterval(() => {
      syncPendingRecordsToDrive();
    }, 8000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(syncInterval);
    };
  }, [serverIp]);

  const [speechLang, setSpeechLang] = useState('bn-IN'); // Default: Bengali (bn-IN) / English / Hindi

  const wakeRecognitionRef = useRef(null);

  // Expanded Voice Command Listener for Wake Word "RUBY" & "Stop" in Bengali & English
  const detectVoiceCommand = (text) => {
    if (!text) return;
    const lower = text.toLowerCase().trim();
    
    // Stop Keywords (Bengali + English)
    if (
      lower.includes('ruby stop') ||
      lower.includes('stop recording') ||
      lower.includes('stop') ||
      lower.includes('done') ||
      lower.includes('finish') ||
      lower.includes('terminate') ||
      lower.includes('বন্ধ') ||
      lower.includes('থামো') ||
      lower.includes('স্টপ')
    ) {
      stopListening();
    }
    // Wake Word Keywords (Bengali + English + Phonetic Variations)
    else if (
      lower.includes('ruby') ||
      lower.includes('rooby') ||
      lower.includes('rubi') ||
      lower.includes('rube') ||
      lower.includes('rubee') ||
      lower.includes('hey ruby') ||
      lower.includes('hi ruby') ||
      lower.includes('ok ruby') ||
      lower.includes('start ruby') ||
      lower.includes('ruby start') ||
      lower.includes('start recording') ||
      lower.includes('begin recording') ||
      lower.includes('record') ||
      lower.includes('start') ||
      lower.includes('রুবি') ||
      lower.includes('রূবি') ||
      lower.includes('শুরু') ||
      lower.includes('স্টার্টিং')
    ) {
      if (!isListening) {
        if (wakeRecognitionRef.current) {
          try { wakeRecognitionRef.current.stop(); } catch (e) {}
        }
        startListening();
      }
    }
  };

  // Continuous Background Wake-Word Listener Effect for Web & Android
  useEffect(() => {
    let nativeWakeTimer = null;

    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      if (!isListening) {
        const startNativeWakeWord = async () => {
          try {
            nativeListenersRef.current.forEach(l => l.remove());
            nativeListenersRef.current = [];

            const wakeListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
              if (data && data.transcript) {
                detectVoiceCommand(data.transcript);
              }
            });
            nativeListenersRef.current = [wakeListener];
            await NativeSpeech.startListening({ language: speechLang });
          } catch (e) {
            console.warn("Native wake listener notice:", e);
          }
        };

        startNativeWakeWord();
      }
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition && !isListening) {
        let wakeRecognition = null;
        try {
          wakeRecognition = new SpeechRecognition();
          wakeRecognition.continuous = true;
          wakeRecognition.interimResults = true;
          wakeRecognition.lang = speechLang || 'bn-IN';

          wakeRecognition.onresult = (event) => {
            let transcriptStr = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              transcriptStr += event.results[i][0].transcript;
            }
            detectVoiceCommand(transcriptStr);
          };

          wakeRecognition.onend = () => {
            if (!isListening && wakeRecognitionRef.current === wakeRecognition) {
              try { wakeRecognition.start(); } catch (e) {}
            }
          };

          wakeRecognitionRef.current = wakeRecognition;
          wakeRecognition.start();
        } catch (e) {
          console.warn("Web background wake notice:", e);
        }
      }
    }

    return () => {
      if (nativeWakeTimer) clearInterval(nativeWakeTimer);
    };
  }, [isListening, speechLang]);

  const startListening = async () => {
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop(); } catch (e) {}
    }

    setLiveTranscript('');
    setFinalTranscript('');
    setAudioUrl(null);
    setAudioBlob(null);
    audioChunksRef.current = [];

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("Microphone stream notice:", err);
    }

    if (stream) {
      try {
        let recMime = 'audio/webm';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            recMime = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            recMime = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            recMime = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            recMime = 'audio/aac';
          }
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType: recMime });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const finalMime = mediaRecorder.mimeType || recMime || 'audio/mp4';
          const blob = new Blob(audioChunksRef.current, { type: finalMime });
          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(url);
        };

        mediaRecorder.start(200);
      } catch (err) {
        console.error("MediaRecorder error:", err);
      }
    }

    // Native Speech Recognizer for Android with language support & live streaming preview
    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try {
        setIsListening(true);
        setStatus(`Listening (${speechLang === 'bn-IN' ? 'বাংলা' : speechLang})`);

        nativeListenersRef.current.forEach(l => l.remove());
        nativeListenersRef.current = [];

        const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
          if (data && data.transcript) {
            if (data.isFinal) {
              setFinalTranscript(prev => (prev ? prev.trim() + ' ' + data.transcript.trim() : data.transcript.trim()));
              setLiveTranscript('');
            } else {
              setLiveTranscript(data.transcript);
            }
            detectVoiceCommand(data.transcript);
          }
        });

        const errorListener = await NativeSpeech.addListener('onSpeechError', (err) => {
          console.warn("NativeSpeech notice:", err);
        });

        nativeListenersRef.current = [resultListener, errorListener];
        await NativeSpeech.startListening({ language: speechLang });
        return;
      } catch (err) {
        console.error("NativeSpeech error:", err);
      }
    }

    // Web Speech Recognizer for Live Real-Time Streaming Speech-to-Text
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = speechLang || 'bn-IN';

        recognition.onstart = () => {
          setIsListening(true);
          setStatus(`Listening (${speechLang === 'bn-IN' ? 'বাংলা' : speechLang})`);
        };

        recognition.onresult = (event) => {
          let interimText = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const current = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              setFinalTranscript(prev => (prev ? prev.trim() + ' ' + current.trim() : current.trim()));
              setLiveTranscript('');
            } else {
              interimText += current;
            }
          }

          if (interimText) {
            setLiveTranscript(interimText);
          }
          detectVoiceCommand(interimText);
        };

        recognition.onerror = () => {};

        recognitionRef.current = recognition;
        try { recognition.start(); } catch (startErr) { console.warn("Recognition start notice:", startErr); }
      } catch (e) {
        console.error("Web speech error:", e);
      }
    }

    setIsListening(true);
    setStatus('Listening (Wake Word: RUBY)');
  };

  const stopListening = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try { await NativeSpeech.stopListening(); } catch (e) {}
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    if (!finalTranscript && !liveTranscript) {
      const defaultVoiceText = `Voice byte recorded (${speechLang === 'bn-IN' ? 'বাংলা' : speechLang}) - saved offline`;
      setFinalTranscript(defaultVoiceText);
    }

    setIsListening(false);
    setStatus('Ready');
  };

  const handleImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleBrochureChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setBrochureFile(file);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let subId = '';
    let rowData = {};
    let sheetName = 'Stall Data';

    const fullText = (finalTranscript + ' ' + liveTranscript).trim() || 'Recorded audio byte stored locally & ready for Drive sync';

    let audioB64 = null;
    let imageB64 = null;
    let brochureB64 = null;

    if (audioBlob) {
      try { audioB64 = await blobToBase64(audioBlob); } catch (e) {}
    }
    if (imageFile) {
      try { imageB64 = await blobToBase64(imageFile); } catch (e) {}
    }
    if (brochureFile) {
      try { brochureB64 = await blobToBase64(brochureFile); } catch (e) {}
    }

    if (activeTab === 'STALL') {
      const stallName = stallForm.stallName.trim() || `Stall ${counter.STALL}`;
      const stallNo = stallForm.stallNo.trim() || `A-0${counter.STALL}`;
      const org = stallForm.organization.trim() || 'Exhibition Organization';
      
      subId = `STALL-${String(counter.STALL).padStart(3, '0')}`;
      sheetName = 'Stall Data';
      setCounter(prev => ({ ...prev, STALL: prev.STALL + 1 }));

      rowData = {
        "Submission ID": subId,
        "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
        "Stall Name": stallName,
        "Stall No.": stallNo,
        "Organization": org,
        "Category": stallForm.category || 'General',
        "Person": stallForm.person || 'N/A',
        "Designation": stallForm.designation || 'N/A',
        "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
        "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
        "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
        "Transcript": fullText,
        "Verification Status": "Saved Offline & Ready",
        syncStatus: "PENDING_DRIVE_SYNC",
        _sheetName: sheetName,
        _activeTab: activeTab,
        _audioBase64: audioB64,
        _imageBase64: imageB64,
        _imageName: imageFile ? imageFile.name : 'photo.jpg',
        _brochureBase64: brochureB64,
        _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
      };

      setStallForm({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
    } else if (activeTab === 'SCIENCE') {
      const exhibitName = sciForm.exhibitName.trim() || `Project ${counter.SCIENCE}`;
      const stallNo = sciForm.stallNo.trim() || `S-0${counter.SCIENCE}`;
      const org = sciForm.organization.trim() || 'Science Institute';

      subId = `SCI-${String(counter.SCIENCE).padStart(3, '0')}`;
      sheetName = 'Science Exhibition Data';
      setCounter(prev => ({ ...prev, SCIENCE: prev.SCIENCE + 1 }));

      rowData = {
        "Submission ID": subId,
        "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
        "Exhibit/Project Name": exhibitName,
        "Stall No.": stallNo,
        "Organization/Institution": org,
        "Category": sciForm.category || 'Science',
        "Presenter": sciForm.presenter || 'N/A',
        "Designation/Class": sciForm.designationClass || 'N/A',
        "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
        "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
        "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
        "Transcript": fullText,
        "Verification Status": "Saved Offline & Ready",
        syncStatus: "PENDING_DRIVE_SYNC",
        _sheetName: sheetName,
        _activeTab: activeTab,
        _audioBase64: audioB64,
        _imageBase64: imageB64,
        _imageName: imageFile ? imageFile.name : 'photo.jpg',
        _brochureBase64: brochureB64,
        _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
      };

      setSciForm({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
    } else {
      const lecTitle = lecForm.lectureTitle.trim() || `Lecture ${counter.LECTURE}`;
      const speaker = lecForm.speaker.trim() || `Speaker ${counter.LECTURE}`;

      subId = `LEC-${String(counter.LECTURE).padStart(3, '0')}`;
      sheetName = 'Live Lecture Data';
      setCounter(prev => ({ ...prev, LECTURE: prev.LECTURE + 1 }));

      rowData = {
        "Submission ID": subId,
        "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
        "Lecture Title": lecTitle,
        "Speaker": speaker,
        "Designation": lecForm.designation || 'Speaker',
        "Organization": lecForm.organization || 'N/A',
        "Topic/Category": lecForm.topicCategory || 'Lecture',
        "Date/Time": lecForm.dateTime || new Date().toLocaleDateString(),
        "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
        "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
        "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
        "Transcript": fullText,
        "Verification Status": "Saved Offline & Ready",
        syncStatus: "PENDING_DRIVE_SYNC",
        _sheetName: sheetName,
        _activeTab: activeTab,
        _audioBase64: audioB64,
        _imageBase64: imageB64,
        _imageName: imageFile ? imageFile.name : 'photo.jpg',
        _brochureBase64: brochureB64,
        _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
      };

      setLecForm({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });
    }

    // Save 1 row immediately to IndexedDB (Works 100% Offline!)
    await saveRecordToDB(rowData);
    let updated = await getAllRecordsFromDB();
    setRecords(updated);
    setStatus('Saved Offline');

    // Trigger immediate background sync attempt to Google Drive
    syncPendingRecordsToDrive();

    // Reset media
    setImageFile(null);
    setImagePreview(null);
    setBrochureFile(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setLiveTranscript('');
    setFinalTranscript('');
    alert(`Saved 100% Offline!\nID: ${subId}\nRecord stored locally & will auto-sync to Google Drive as soon as internet is connected!`);
  };

  const handleExportExcel = () => {
    if (records.length === 0) {
      alert("No records to export.");
      return;
    }
    exportToExcel(records, "National_Exhibition_2026_Data.xlsx");
  };

  const handleClearHistory = async () => {
    if (window.confirm("Clear all submission records?")) {
      await clearAllRecordsFromDB();
      setRecords([]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/60 via-white to-emerald-50/50 text-slate-900 flex flex-col font-sans select-none pb-8">
      {/* Header with Orange & Emerald Light Styling & Server IP Config */}
      <HeaderBar
        status={status}
        onExportExcel={handleExportExcel}
        serverIp={serverIp}
        onServerIpChange={handleServerIpChange}
      />

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 space-y-3.5">
        {/* Background Drive Sync Banner Notification */}
        {syncNotice && (
          <div className="bg-emerald-600 text-white rounded-2xl p-3 shadow-md flex items-center justify-between text-xs font-black animate-bounce">
            <div className="flex items-center space-x-2">
              <Upload className="w-4 h-4 animate-spin" />
              <span>{syncNotice}</span>
            </div>
            <button type="button" onClick={() => setSyncNotice(null)} className="text-emerald-100 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Target Google Drive Folder Banner */}
        <div className="bg-white border-2 border-emerald-300 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black text-emerald-950">Target Google Drive Folder Linked</span>
          </div>
          <a
            href={DRIVE_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 underline flex items-center space-x-1"
          >
            <span>Open Drive Folder</span>
            <ExternalLink className="w-3 h-3 inline" />
          </a>
        </div>

        {/* 3-Tab Selector */}
        <div className="bg-white border border-orange-200 rounded-2xl p-1.5 flex justify-between shadow-sm">
          <button
            onClick={() => setActiveTab('STALL')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'STALL' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'text-orange-950 hover:bg-orange-50'}`}
          >
            🎪 STALL
          </button>
          <button
            onClick={() => setActiveTab('SCIENCE')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'SCIENCE' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'text-emerald-950 hover:bg-emerald-50'}`}
          >
            🔬 SCIENCE
          </button>
          <button
            onClick={() => setActiveTab('LECTURE')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'LECTURE' ? 'bg-gradient-to-r from-orange-600 to-emerald-600 text-white shadow-md' : 'text-slate-800 hover:bg-orange-50'}`}
          >
            🎙️ LECTURE
          </button>
        </div>

        {/* Audio Recorder & Voice Control */}
        <div className="bg-white border border-orange-200 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-[11px] font-black text-orange-900 uppercase tracking-wider mb-2">
            AUDIO RECORDER & WAKE WORD: <span className="text-emerald-700 font-extrabold">"RUBY"</span>
          </p>

          {/* Language Selector Bar */}
          <div className="flex justify-center items-center space-x-1 mb-2 bg-orange-50/80 border border-orange-200 p-1 rounded-xl">
            <span className="text-[10px] font-black text-orange-950 px-1">LANG:</span>
            <button
              type="button"
              onClick={() => setSpeechLang('bn-IN')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'bn-IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}
            >
              🇧🇩 বাংলা (Bengali)
            </button>
            <button
              type="button"
              onClick={() => setSpeechLang('en-US')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'en-US' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}
            >
              🇺🇸 English
            </button>
            <button
              type="button"
              onClick={() => setSpeechLang('hi-IN')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'hi-IN' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}
            >
              🇮🇳 हिंदी
            </button>
          </div>

          <div className="flex justify-center items-center space-x-4 my-2">
            {!isListening ? (
              <button
                type="button"
                onClick={startListening}
                className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 transform active:scale-95 transition-all"
              >
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopListening}
                className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 animate-pulse transform active:scale-95 transition-all"
              >
                <Square className="w-7 h-7 fill-current" />
              </button>
            )}
          </div>

          <p className="text-[10px] text-orange-900 font-black italic mt-1">
            Say <span className="underline text-emerald-700">"RUBY"</span> or <span className="underline text-emerald-700">"Hey Ruby"</span> to start recording! Say <span className="underline text-rose-600">"Ruby Stop"</span> or <span className="underline text-rose-600">"Stop"</span> to finish!
          </p>

          {/* Recorded Audio Preview Player */}
          {audioUrl && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-950">
                <Volume2 className="w-4 h-4 text-amber-600" />
                <span>RECORDED AUDIO BYTE PREVIEW</span>
              </div>
              <audio src={audioUrl} controls className="w-full h-8" />
            </div>
          )}

          {/* ALWAYS-VISIBLE LIVE REAL-TIME STREAMING TRANSCRIPTION PANEL */}
          <div className="mt-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-left space-y-1">
            <div className="flex items-center space-x-1.5 text-xs font-black text-emerald-950">
              <Radio className={`w-4 h-4 ${isListening ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`} />
              <span>LIVE REAL-TIME TRANSCRIPTION ({speechLang === 'bn-IN' ? 'বাংলা' : speechLang})</span>
            </div>
            <p className="text-xs text-slate-800 font-semibold leading-relaxed min-h-[32px]">
              {finalTranscript || liveTranscript ? (
                <>
                  <span>{finalTranscript}</span>{' '}
                  <span className="text-emerald-700 italic">{liveTranscript}</span>
                </>
              ) : isListening ? (
                <span className="text-emerald-600 italic font-normal">Listening... Speak now or say "RUBY"!</span>
              ) : (
                <span className="text-slate-400 italic font-normal">Tap Mic or say "RUBY" / "Hey Ruby" to transcribe...</span>
              )}
            </p>
          </div>
        </div>

        {/* Form Inputs & Media Uploads */}
        <form onSubmit={handleSubmit} className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wide border-b border-emerald-100 pb-2">
            {activeTab} INFORMATION
          </h3>

          {activeTab === 'STALL' && (
            <>
              <input type="text" value={stallForm.stallName} onChange={e => setStallForm({...stallForm, stallName: e.target.value})} placeholder="Stall Name *" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={stallForm.stallNo} onChange={e => setStallForm({...stallForm, stallNo: e.target.value})} placeholder="Stall No. *" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={stallForm.category} onChange={e => setStallForm({...stallForm, category: e.target.value})} placeholder="Category" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              </div>
              <input type="text" value={stallForm.organization} onChange={e => setStallForm({...stallForm, organization: e.target.value})} placeholder="Organization *" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={stallForm.person} onChange={e => setStallForm({...stallForm, person: e.target.value})} placeholder="Person Name" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={stallForm.designation} onChange={e => setStallForm({...stallForm, designation: e.target.value})} placeholder="Designation" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              </div>
            </>
          )}

          {activeTab === 'SCIENCE' && (
            <>
              <input type="text" value={sciForm.exhibitName} onChange={e => setSciForm({...sciForm, exhibitName: e.target.value})} placeholder="Exhibit / Project Name *" className="w-full bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={sciForm.stallNo} onChange={e => setSciForm({...sciForm, stallNo: e.target.value})} placeholder="Stall No." className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
                <input type="text" value={sciForm.category} onChange={e => setSciForm({...sciForm, category: e.target.value})} placeholder="Category" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
              </div>
              <input type="text" value={sciForm.organization} onChange={e => setSciForm({...sciForm, organization: e.target.value})} placeholder="Organization / Institution *" className="w-full bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={sciForm.presenter} onChange={e => setSciForm({...sciForm, presenter: e.target.value})} placeholder="Presenter Name" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
                <input type="text" value={sciForm.designationClass} onChange={e => setSciForm({...sciForm, designationClass: e.target.value})} placeholder="Class / Designation" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600" />
              </div>
            </>
          )}

          {activeTab === 'LECTURE' && (
            <>
              <input type="text" value={lecForm.lectureTitle} onChange={e => setLecForm({...lecForm, lectureTitle: e.target.value})} placeholder="Lecture Title *" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={lecForm.speaker} onChange={e => setLecForm({...lecForm, speaker: e.target.value})} placeholder="Speaker Name *" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={lecForm.designation} onChange={e => setLecForm({...lecForm, designation: e.target.value})} placeholder="Designation" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              </div>
              <input type="text" value={lecForm.organization} onChange={e => setLecForm({...lecForm, organization: e.target.value})} placeholder="Organization" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
              <input type="text" value={lecForm.topicCategory} onChange={e => setLecForm({...lecForm, topicCategory: e.target.value})} placeholder="Topic / Category" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-500" />
            </>
          )}

          {/* Failproof Native <label> Media File Pickers */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              {/* Native Photo Input Label */}
              <label className="flex items-center justify-center space-x-1.5 p-2.5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100/60 text-xs font-extrabold text-orange-950 transition-all cursor-pointer active:scale-95">
                <ImageIcon className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="truncate">{imageFile ? imageFile.name : 'Upload Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
              </label>

              {/* Native Brochure Input Label */}
              <label className="flex items-center justify-center space-x-1.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100/60 text-xs font-extrabold text-emerald-950 transition-all cursor-pointer active:scale-95">
                <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="truncate">{brochureFile ? brochureFile.name : 'Upload Brochure'}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={handleBrochureChange}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
              </label>
            </div>

            {/* Photo Thumbnail Preview */}
            {imagePreview && (
              <div className="p-2 bg-gradient-to-r from-orange-50 to-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-3">
                  <img src={imagePreview} alt="Upload Thumbnail" className="w-12 h-12 object-cover rounded-lg border border-emerald-400 shadow-xs" />
                  <div className="text-xs">
                    <span className="font-black text-emerald-950 block">Photo Attached ✓</span>
                    <span className="text-[10px] text-slate-700 font-semibold truncate max-w-[150px] block">{imageFile ? imageFile.name : ''}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1 rounded-full text-rose-600 hover:bg-rose-100"
                  title="Remove Photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-orange-600 via-amber-600 to-emerald-600 hover:from-orange-500 hover:to-emerald-500 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center space-x-2 active:scale-98 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>SUBMIT ENTRY (AUTO-SYNC DRIVE WHEN ONLINE)</span>
          </button>
        </form>

        {/* Master History Sheet */}
        <HistoryTable records={records} onClear={handleClearHistory} />
      </main>
    </div>
  );
}
