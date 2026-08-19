import React, { useState, useEffect, useRef, useCallback } from 'react';
import HeaderBar from './components/HeaderBar';
import HistoryTable from './components/HistoryTable';
import { exportToExcel } from './excel/excelGenerator';
import { saveRecordToDB, updateRecordToDB, getAllRecordsFromDB, clearAllRecordsFromDB } from './db/indexedDbManager';
import {
  addTranscriptionRow, updateTranscriptionRow, getAllTranscriptions,
  getTranscriptionsByTab, getNextCounter, clearAllTranscriptions, autoLogPhrase
} from './db/offlineSheetManager';
import { processTranscript, formatTranscriptForSheet } from './nlp/transcriptProcessor';
import { startListening, stopListening, abortListening, isCurrentlyListening, getRemainingSeconds } from './speech/speechRecognition';
import { startRecording, stopRecording, releaseMic } from './speech/audioRecorder';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { Mic, Square, Upload, FileText, Camera, ExternalLink, X, Radio, WifiOff, Wifi, FileSpreadsheet, Clock, Settings, ChevronDown, ChevronUp, Keyboard } from 'lucide-react';
import ExcelPreview from './components/ExcelPreview';

const NativeSpeech = registerPlugin('NativeSpeech');
const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk";

const WAKE_WORDS = [
  'ruby', 'rooby', 'rubi', 'rube', 'rubee',
  'hey ruby', 'hi ruby', 'ok ruby', 'start ruby', 'ruby start',
  'start recording', 'begin recording', 'record', 'start',
  'রুবি', 'রূবি', 'শুরু', 'স্টার্টিং',
];

export default function App() {
  const [activeTab, setActiveTab] = useState('STALL');
  const [status, setStatus] = useState('Ready');
  const [records, setRecords] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [counter, setCounter] = useState({ STALL: 1, SCIENCE: 1, LECTURE: 1 });
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('SERVER_IP') || 'exhibition-voice-logger-backend.onrender.com');
  const [syncNotice, setSyncNotice] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewSubId, setPreviewSubId] = useState('');
  const [previewCounter, setPreviewCounter] = useState(1);

  const [speechLang, setSpeechLang] = useState(() => localStorage.getItem('SPEECH_LANG') || 'auto');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [brochureFile, setBrochureFile] = useState(null);

  const [stallForm, setStallForm] = useState({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
  const [sciForm, setSciForm] = useState({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
  const [lecForm, setLecForm] = useState({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });

  const imageInputRef = useRef(null);

  const [recordingState, setRecordingState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [liveInterim, setLiveInterim] = useState('');
  const [transcribeError, setTranscribeError] = useState('');
  const timerRef = useRef(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState('');

  const [wakeWordActive, setWakeWordActive] = useState(false);
  const wakeListenersRef = useRef([]);

  const UPLOAD_API_URL = serverIp.includes('onrender.com') || serverIp.startsWith('http://') || serverIp.startsWith('https://')
    ? (serverIp.startsWith('http') ? `${serverIp.replace(/\/$/, '')}/api/upload` : `https://${serverIp.replace(/\/$/, '')}/api/upload`)
    : `http://${serverIp}:8080/api/upload`;

  const handleServerIpChange = (newIp) => {
    setServerIp(newIp);
    try { localStorage.setItem('SERVER_IP', newIp); } catch {}
  };

  const refreshSheetData = async () => {
    try {
      const rows = sheetFilter === 'ALL'
        ? await getAllTranscriptions()
        : await getTranscriptionsByTab(sheetFilter);
      setSheetRows(rows);
    } catch {}
  };

  const syncPendingRecordsToDrive = async () => {
    if (!navigator.onLine) return;
    try {
      const allDBRecords = await getAllRecordsFromDB();
      if (!allDBRecords || allDBRecords.length === 0) return;
      const pendingList = allDBRecords.filter(r => r.syncStatus === 'PENDING_DRIVE_SYNC');
      if (pendingList.length === 0) return;

      let syncedCount = 0;
      for (const rec of pendingList) {
        try {
          const uploadResp = await fetch(UPLOAD_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              submission_id: rec["Submission ID"],
              active_tab: rec._activeTab || 'STALL',
              sheet_name: rec._sheetName || 'Stall Data',
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
            rec["Verification Status"] = 'Verified & Synced to Google Drive';
            if (serverRes && serverRes.drive_links) {
              if (serverRes.drive_links["Audio Drive Link"]) rec["Audio Drive Link"] = serverRes.drive_links["Audio Drive Link"];
              if (serverRes.drive_links["Image Drive Link"]) rec["Image Drive Link"] = serverRes.drive_links["Image Drive Link"];
              if (serverRes.drive_links["Brochure Drive Link"]) rec["Brochure Drive Link"] = serverRes.drive_links["Brochure Drive Link"];
            }
            await updateRecordToDB(rec);
            if (rec._offlineSheetId) {
              try {
                const sheetRow = await getTranscriptionsByTab(rec._activeTab || 'STALL');
                const match = sheetRow.find(r => r.id === rec._offlineSheetId);
                if (match) { match.syncStatus = 'SYNCED'; await updateTranscriptionRow(match); }
              } catch {}
            }
            syncedCount++;
          }
        } catch {}
      }
      if (syncedCount > 0) {
        const updatedRecords = await getAllRecordsFromDB();
        setRecords(updatedRecords);
        await refreshSheetData();
        setSyncNotice(`Synced ${syncedCount} record(s) to Drive!`);
        setTimeout(() => setSyncNotice(null), 5000);
      }
    } catch {}
  };

  useEffect(() => {
    getAllRecordsFromDB().then((dbRecords) => {
      if (dbRecords && dbRecords.length > 0) setRecords(dbRecords);
    }).catch(() => {});
    refreshSheetData();
    syncPendingRecordsToDrive();
    const handleOnline = () => { setIsOnline(true); syncPendingRecordsToDrive(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const syncInterval = setInterval(() => { if (navigator.onLine) syncPendingRecordsToDrive(); }, 15000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, [serverIp]);

  useEffect(() => { refreshSheetData(); }, [sheetFilter]);

  useEffect(() => {
    try { localStorage.setItem('SPEECH_LANG', speechLang); } catch {}
  }, [speechLang]);

  useEffect(() => {
    return () => { abortListening(); releaseMic(); clearInterval(timerRef.current); stopWakeWord(); };
  }, []);

  const detectVoiceCommand = useCallback((text) => {
    if (!text) return;
    const lower = text.toLowerCase().trim();

    const isWakeWord = WAKE_WORDS.some(w => lower.includes(w));
    if (isWakeWord && recordingState === 'idle') {
      handleToggleRecording();
      return;
    }

    const isStopWord = lower.includes('stop') || lower.includes('থামাও') || lower.includes('বন্ধ');
    if (isStopWord && recordingState === 'listening') {
      handleToggleRecording();
    }
  }, [recordingState]);

  const startWakeWord = useCallback(async () => {
    if (wakeWordActive) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const wakeListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
          if (data && data.transcript) {
            detectVoiceCommand(data.transcript);
          }
        });
        wakeListenersRef.current = [wakeListener];
        await NativeSpeech.startListening({
          language: speechLang === 'auto' ? 'hi-IN' : speechLang,
          autoDetect: speechLang === 'auto',
          continuous: true,
        });
        setWakeWordActive(true);
      } catch (e) {
        console.warn("Wake word start failed:", e);
      }
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = speechLang === 'auto' ? '' : speechLang;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            detectVoiceCommand(event.results[i][0].transcript);
          }
        }
      };

      recognition.onerror = () => {};
      recognition.onend = () => {
        if (wakeWordActive) {
          try { recognition.start(); } catch {}
        }
      };

      try {
        recognition.start();
        wakeListenersRef.current = [{ remove: () => { try { recognition.stop(); } catch {} } }];
        setWakeWordActive(true);
      } catch {}
    }
  }, [wakeWordActive, speechLang, detectVoiceCommand, recordingState]);

  const stopWakeWord = useCallback(async () => {
    setWakeWordActive(false);
    if (Capacitor.isNativePlatform()) {
      try { await NativeSpeech.stopListening(); } catch {}
    }
    wakeListenersRef.current.forEach(l => {
      try { l.remove(); } catch {}
    });
    wakeListenersRef.current = [];
  }, []);

  const handleToggleRecording = useCallback(async () => {
    if (recordingState === 'listening') {
      clearInterval(timerRef.current);
      await stopListening();
      // Stop audio recording and capture the WAV blob
      try {
        const wavBlob = await stopRecording();
        if (wavBlob) {
          setAudioBlob(wavBlob);
        }
      } catch (e) {
        console.warn('Audio recording stop notice:', e);
      }
      setRecordingState('idle');
      setLiveInterim('');
      if (transcript) {
        setStatus('Transcription complete');
      } else {
        setTranscribeError('No speech detected. Try again.');
        setStatus('Ready');
      }
    } else {
      setTranscript('');
      setLiveInterim('');
      setTranscribeError('');
      setAudioBlob(null);
      setElapsed(0);
      // Start audio recording in parallel with speech recognition
      try {
        await startRecording();
      } catch (e) {
        console.warn('Audio recording start notice:', e);
      }
      try {
        await startListening(
          speechLang,
          (finalText) => {
            setTranscript(finalText);
            setLiveInterim('');
          },
          (interimText) => {
            setLiveInterim(interimText);
          },
          (err) => {
            const msg = err.message || '';
            if (msg.includes('CLIENT_ERROR') || msg.includes('BUSY')) {
              setTranscribeError('Mic busy, retrying...');
              setTimeout(() => {
                setTranscribeError('');
                handleToggleRecording();
              }, 1000);
              return;
            }
            setTranscribeError(msg || 'Speech recognition failed');
            setRecordingState('idle');
            clearInterval(timerRef.current);
            setStatus('Error');
          },
          (finalText) => {
            setRecordingState('idle');
            clearInterval(timerRef.current);
            setLiveInterim('');
            if (finalText) {
              setTranscript(finalText);
              setStatus('30 min session complete');
            }
          }
        );
        setRecordingState('listening');
        setStatus('Listening... (30 min session)');
        const start = Date.now();
        timerRef.current = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - start) / 1000);
          setElapsed(elapsedSec);
          const remaining = 1800 - elapsedSec;
          if (remaining <= 0) {
            clearInterval(timerRef.current);
          }
        }, 200);
      } catch (err) {
        setTranscribeError(err.message || 'Speech recognition not available');
        setRecordingState('idle');
        setStatus('Ready');
      }
    }
  }, [recordingState, speechLang, transcript]);

  const handleManualSubmit = useCallback(() => {
    if (!manualText.trim()) return;
    setTranscript(processTranscript(manualText));
    setShowManualInput(false);
    setManualText('');
    setStatus('Text added');
  }, [manualText]);

  const handleSaveManualToLive = useCallback(() => {
    if (!transcript.trim()) return;
    autoLogPhrase({ tab: activeTab, transcript: processTranscript(transcript) });
    setTranscript('');
    setStatus('Saved to sheet');
    refreshSheetData();
  }, [transcript, activeTab]);

  const handleImageFromGallery = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawText = transcript.trim();
    const fullText = rawText ? formatTranscriptForSheet(rawText) : 'Voice recorded offline';
    const offlineCounter = await getNextCounter(activeTab);
    const subIdPrefix = activeTab === 'STALL' ? 'STALL' : activeTab === 'SCIENCE' ? 'SCI' : 'LEC';
    const subId = `${subIdPrefix}-${String(offlineCounter).padStart(3, '0')}`;
    setPreviewSubId(subId);
    setPreviewCounter(offlineCounter);
    setShowPreview(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const rawText = transcript.trim();
      const fullText = rawText ? formatTranscriptForSheet(rawText) : 'Voice recorded offline';
      let subId = previewSubId;
      let offlineCounter = previewCounter;
      let rowData = {};
      let sheetName = 'Stall Data';

      let audioB64 = null, imageB64 = null, brochureB64 = null;
      if (audioBlob) try { audioB64 = await blobToBase64(audioBlob); } catch {}
      if (imageFile) try { imageB64 = await blobToBase64(imageFile); } catch {}
      if (brochureFile) try { brochureB64 = await blobToBase64(brochureFile); } catch {}

      const ts = new Date().toISOString().replace('T', ' ').substring(0, 16);
      if (activeTab === 'STALL') {
        sheetName = 'Stall Data';
        setCounter(p => ({ ...p, STALL: offlineCounter + 1 }));
        rowData = { "Submission ID": subId, "Timestamp": ts, "Stall Name": stallForm.stallName.trim() || `Stall ${offlineCounter}`, "Stall No.": stallForm.stallNo.trim() || `A-0${offlineCounter}`, "Organization": stallForm.organization.trim() || 'Exhibition Organization', "Category": stallForm.category || 'General', "Person": stallForm.person || 'N/A', "Designation": stallForm.designation || 'N/A', "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}`, "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo` : 'N/A', "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure` : 'N/A', "Transcript": fullText, "Verification Status": "Saved Offline", syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab, _audioBase64: audioB64, _imageBase64: imageB64, _imageName: imageFile ? imageFile.name : 'photo.jpg', _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf' };
        setStallForm({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
      } else if (activeTab === 'SCIENCE') {
        sheetName = 'Science Exhibition Data';
        setCounter(p => ({ ...p, SCIENCE: offlineCounter + 1 }));
        rowData = { "Submission ID": subId, "Timestamp": ts, "Exhibit/Project Name": sciForm.exhibitName.trim() || `Project ${offlineCounter}`, "Stall No.": sciForm.stallNo.trim() || `S-0${offlineCounter}`, "Organization/Institution": sciForm.organization.trim() || 'Science Institute', "Category": sciForm.category || 'Science', "Presenter": sciForm.presenter || 'N/A', "Designation/Class": sciForm.designationClass || 'N/A', "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}`, "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo` : 'N/A', "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure` : 'N/A', "Transcript": fullText, "Verification Status": "Saved Offline", syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab, _audioBase64: audioB64, _imageBase64: imageB64, _imageName: imageFile ? imageFile.name : 'photo.jpg', _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf' };
        setSciForm({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
      } else {
        sheetName = 'Live Lecture Data';
        setCounter(p => ({ ...p, LECTURE: offlineCounter + 1 }));
        rowData = { "Submission ID": subId, "Timestamp": ts, "Lecture Title": lecForm.lectureTitle.trim() || `Lecture ${offlineCounter}`, "Speaker": lecForm.speaker.trim() || `Speaker ${offlineCounter}`, "Designation": lecForm.designation || 'Speaker', "Organization": lecForm.organization || 'N/A', "Topic/Category": lecForm.topicCategory || 'Lecture', "Date/Time": lecForm.dateTime || new Date().toLocaleDateString(), "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}`, "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo` : 'N/A', "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure` : 'N/A', "Transcript": fullText, "Verification Status": "Saved Offline", syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab, _audioBase64: audioB64, _imageBase64: imageB64, _imageName: imageFile ? imageFile.name : 'photo.jpg', _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf' };
        setLecForm({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });
      }

      await saveRecordToDB(rowData);
      setRecords(await getAllRecordsFromDB());
      const sheetRowId = await addTranscriptionRow({ tab: activeTab, submissionId: subId, timestamp: ts, name: rowData["Stall Name"] || rowData["Exhibit/Project Name"] || rowData["Lecture Title"] || '', transcript: fullText, syncStatus: 'PENDING', syncNotice: 'Saved Offline', speaker: rowData["Speaker"] || rowData["Person"] || rowData["Presenter"] || '', organization: rowData["Organization"] || rowData["Organization/Institution"] || '', category: rowData["Category"] || rowData["Topic/Category"] || '', stallNo: rowData["Stall No."] || '' });
      rowData._offlineSheetId = sheetRowId;
      await updateRecordToDB(rowData);
      await refreshSheetData();
      syncPendingRecordsToDrive();
      setImageFile(null); setImagePreview(null); setBrochureFile(null); setTranscript('');
      setShowPreview(false);
      setStatus('Saved successfully');
    } catch (err) {
      alert("Error saving. Try again.");
    }
    finally { setIsSubmitting(false); }
  };

  const handleExportExcel = () => {
    if (records.length === 0) { alert("No records to export."); return; }
    exportToExcel(records, "National_Exhibition_2026_Data.xlsx");
  };

  const handleClearHistory = async () => {
    if (window.confirm("Clear all records?")) {
      await clearAllRecordsFromDB(); await clearAllTranscriptions();
      setRecords([]); setSheetRows([]);
    }
  };

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/60 via-white to-emerald-50/50 text-slate-900 flex flex-col font-sans select-none pb-8">
      <HeaderBar status={status} onExportExcel={handleExportExcel} serverIp={serverIp} onServerIpChange={handleServerIpChange} isOnline={isOnline} speechEngine={recordingState === 'listening' ? 'Listening' : 'Local STT'} />

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 space-y-3">
        {syncNotice && (
          <div className="bg-emerald-600 text-white rounded-2xl p-3 shadow-md flex items-center justify-between text-xs font-black">
            <div className="flex items-center space-x-2"><Upload className="w-4 h-4" /><span>{syncNotice}</span></div>
            <button onClick={() => setSyncNotice(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="bg-white border-2 border-emerald-300 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-rose-500" />}
            <span className="text-xs font-black text-emerald-950">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <a href={DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-emerald-700 underline flex items-center space-x-1"><span>Drive</span><ExternalLink className="w-3 h-3" /></a>
        </div>

        <div className="bg-white border border-orange-200 rounded-2xl p-1.5 flex justify-between shadow-sm">
          <button onClick={() => setActiveTab('STALL')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'STALL' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'text-orange-950 hover:bg-orange-50'}`}>STALL</button>
          <button onClick={() => setActiveTab('SCIENCE')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'SCIENCE' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'text-emerald-950 hover:bg-emerald-50'}`}>SCIENCE</button>
          <button onClick={() => setActiveTab('LECTURE')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'LECTURE' ? 'bg-gradient-to-r from-orange-600 to-emerald-600 text-white shadow-md' : 'text-slate-800 hover:bg-orange-50'}`}>LECTURE</button>
        </div>

        <div className="flex justify-center items-center space-x-1 bg-white border border-orange-200 rounded-xl p-1.5">
          <span className="text-[10px] font-black text-slate-500 px-1">LANG:</span>
          {[['auto', 'Auto'], ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['en-US', 'English']].map(([val, label]) => (
            <button key={val} onClick={() => setSpeechLang(val)} className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${speechLang === val ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
          ))}
        </div>

        <div className="bg-white border border-orange-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col items-center space-y-3">
            {recordingState === 'idle' && (
              <button onClick={handleToggleRecording} className="w-20 h-20 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-95 transition-all">
                <Mic className="w-10 h-10" />
              </button>
            )}
            {recordingState === 'listening' && (
              <button onClick={handleToggleRecording} className="w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 animate-pulse active:scale-95 transition-all">
                <Square className="w-9 h-9 fill-current" />
              </button>
            )}

            {recordingState === 'listening' && (
              <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-sm font-black text-rose-700 font-mono">{formatTimer(elapsed)}</span>
                <span className="text-[10px] font-bold text-slate-400">/</span>
                <span className="text-[10px] font-bold text-emerald-600">{formatTimer(Math.max(0, 1800 - elapsed))}</span>
                <span className="text-[9px] font-bold text-slate-400">remaining</span>
              </div>
            )}

            {recordingState === 'listening' && liveInterim && (
              <div className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-[10px] font-black text-blue-500 uppercase mb-1">Listening...</p>
                <p className="text-sm text-blue-800 font-semibold leading-relaxed whitespace-pre-wrap">{liveInterim}</p>
              </div>
            )}

            <p className="text-[10px] text-slate-500 font-bold text-center">
              {recordingState === 'idle' && !transcript && 'Tap mic or say "RUBY" to start (30 min session)'}
              {recordingState === 'listening' && 'Listening... speak freely, auto-restarts every 60s'}
              {recordingState === 'idle' && transcript && 'Transcription ready below'}
            </p>
          </div>

          {transcribeError && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-[11px] text-rose-700 font-bold">{transcribeError}</p>
            </div>
          )}

          {transcript && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center space-x-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] font-black text-slate-500 uppercase">Transcript</span>
              </div>
              <p className="text-sm text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap">{transcript}</p>
              <div className="mt-2 flex items-center space-x-2">
                <button onClick={() => { setTranscript(''); setTranscribeError(''); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50">Clear</button>
                <button onClick={() => setShowManualInput(!showManualInput)} className="text-[10px] font-bold text-violet-600 hover:text-violet-800 px-2 py-1 rounded hover:bg-violet-50 flex items-center space-x-1"><Keyboard className="w-3 h-3" /><span>Edit</span></button>
              </div>
            </div>
          )}

          {!transcript && recordingState === 'idle' && !transcribeError && (
            <div className="mt-3 flex justify-center">
              <button onClick={() => setShowManualInput(!showManualInput)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center space-x-1 border border-slate-200">
                <Keyboard className="w-3 h-3" /><span>Type text manually</span>
              </button>
            </div>
          )}
        </div>

        {showManualInput && (
          <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-violet-950">Manual Text Input</span>
              <button onClick={() => setShowManualInput(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder="Type or paste transcript text here..."
              rows={3}
              className="w-full bg-violet-50/40 border border-violet-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-violet-500 resize-none"
            />
            <button onClick={handleManualSubmit} className="w-full py-2 bg-violet-600 text-white text-xs font-black rounded-xl active:scale-98 transition-all">
              Use This Text
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wide border-b border-emerald-100 pb-2">{activeTab} Info</h3>

          {activeTab === 'STALL' && (
            <>
              <input type="text" value={stallForm.stallName} onChange={e => setStallForm({...stallForm, stallName: e.target.value})} placeholder="Stall Name" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={stallForm.stallNo} onChange={e => setStallForm({...stallForm, stallNo: e.target.value})} placeholder="Stall No." className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={stallForm.category} onChange={e => setStallForm({...stallForm, category: e.target.value})} placeholder="Category" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              </div>
              <input type="text" value={stallForm.organization} onChange={e => setStallForm({...stallForm, organization: e.target.value})} placeholder="Organization" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={stallForm.person} onChange={e => setStallForm({...stallForm, person: e.target.value})} placeholder="Person" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={stallForm.designation} onChange={e => setStallForm({...stallForm, designation: e.target.value})} placeholder="Designation" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              </div>
            </>
          )}

          {activeTab === 'SCIENCE' && (
            <>
              <input type="text" value={sciForm.exhibitName} onChange={e => setSciForm({...sciForm, exhibitName: e.target.value})} placeholder="Exhibit / Project Name" className="w-full bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={sciForm.stallNo} onChange={e => setSciForm({...sciForm, stallNo: e.target.value})} placeholder="Stall No." className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
                <input type="text" value={sciForm.category} onChange={e => setSciForm({...sciForm, category: e.target.value})} placeholder="Category" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
              </div>
              <input type="text" value={sciForm.organization} onChange={e => setSciForm({...sciForm, organization: e.target.value})} placeholder="Organization" className="w-full bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={sciForm.presenter} onChange={e => setSciForm({...sciForm, presenter: e.target.value})} placeholder="Presenter" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
                <input type="text" value={sciForm.designationClass} onChange={e => setSciForm({...sciForm, designationClass: e.target.value})} placeholder="Class / Designation" className="bg-emerald-50/40 border border-emerald-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-600" />
              </div>
            </>
          )}

          {activeTab === 'LECTURE' && (
            <>
              <input type="text" value={lecForm.lectureTitle} onChange={e => setLecForm({...lecForm, lectureTitle: e.target.value})} placeholder="Lecture Title" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={lecForm.speaker} onChange={e => setLecForm({...lecForm, speaker: e.target.value})} placeholder="Speaker Name" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
                <input type="text" value={lecForm.designation} onChange={e => setLecForm({...lecForm, designation: e.target.value})} placeholder="Designation" className="bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              </div>
              <input type="text" value={lecForm.organization} onChange={e => setLecForm({...lecForm, organization: e.target.value})} placeholder="Organization" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
              <input type="text" value={lecForm.topicCategory} onChange={e => setLecForm({...lecForm, topicCategory: e.target.value})} placeholder="Topic / Category" className="w-full bg-orange-50/40 border border-orange-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500" />
            </>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => imageInputRef.current && imageInputRef.current.click()} className="flex items-center justify-center space-x-1.5 p-2.5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100/60 text-xs font-extrabold text-orange-950 active:scale-95 transition-all">
              <Camera className="w-4 h-4 text-orange-600" />
              <span className="truncate">{imageFile ? imageFile.name : 'Photo'}</span>
            </button>
            <label className="flex items-center justify-center space-x-1.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100/60 text-xs font-extrabold text-emerald-950 cursor-pointer active:scale-95 transition-all">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span className="truncate">{brochureFile ? brochureFile.name : 'Brochure'}</span>
              <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBrochureFile(f); }} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            </label>
          </div>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFromGallery} style={{ display: 'none' }} />

          {imagePreview && (
            <div className="p-2 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img src={imagePreview} alt="" className="w-10 h-10 object-cover rounded-lg border border-emerald-400" />
                <span className="text-[10px] text-slate-700 font-bold truncate max-w-[140px]">{imageFile?.name}</span>
              </div>
              <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="text-rose-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-gradient-to-r from-orange-600 via-amber-600 to-emerald-600 text-white font-black text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 active:scale-98 transition-all">
            <FileSpreadsheet className="w-4 h-4" /><span>PREVIEW & SAVE</span>
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <button onClick={() => setShowSettings(!showSettings)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center space-x-2">
              <Settings className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-black text-slate-700">Settings</span>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Local STT</span>
            </div>
            {showSettings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
              <div className="pt-3">
                <label className="text-[10px] font-black text-slate-500 block mb-1">Backend Server</label>
                <input type="text" value={serverIp} onChange={e => handleServerIpChange(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 block mb-1">Wake Word ("RUBY")</label>
                <button
                  onClick={wakeWordActive ? stopWakeWord : startWakeWord}
                  className={`w-full py-2 rounded-xl text-xs font-black transition-all ${wakeWordActive ? 'bg-rose-100 text-rose-700 border border-rose-300' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}
                >
                  {wakeWordActive ? 'Wake Word: ACTIVE (tap to stop)' : 'Enable Wake Word "RUBY"'}
                </button>
              </div>
            </div>
          )}
        </div>

        <HistoryTable records={records} onClear={handleClearHistory} sheetRows={sheetRows} sheetFilter={sheetFilter} onFilterChange={setSheetFilter} onRefreshSheet={refreshSheetData} />
      </main>

      <ExcelPreview show={showPreview} onClose={() => { if (!isSubmitting) setShowPreview(false); }} onSubmit={handleConfirmSubmit} activeTab={activeTab} formData={activeTab === 'STALL' ? stallForm : activeTab === 'SCIENCE' ? sciForm : lecForm} transcript={transcript} audioBlob={audioBlob} imageFile={imageFile} imagePreview={imagePreview} brochureFile={brochureFile} subId={previewSubId} counter={previewCounter} isSubmitting={isSubmitting} />
    </div>
  );
}
