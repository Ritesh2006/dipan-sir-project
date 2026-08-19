import React, { useState, useEffect, useRef } from 'react';
import HeaderBar from './components/HeaderBar';
import HistoryTable from './components/HistoryTable';
import { exportToExcel } from './excel/excelGenerator';
import { saveRecordToDB, updateRecordToDB, getAllRecordsFromDB, clearAllRecordsFromDB } from './db/indexedDbManager';
import {
  addTranscriptionRow, updateTranscriptionRow, getAllTranscriptions,
  getTranscriptionsByTab, getNextCounter, clearAllTranscriptions, autoLogPhrase
} from './db/offlineSheetManager';
import { startOfflineSpeechRecognition, stopOfflineSpeechRecognition, isVoskReady } from './speech/voskEngine';
import { processTranscript, formatTranscriptForSheet } from './nlp/transcriptProcessor';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Mic, Square, Send, Upload, FileText, Image as ImageIcon, Camera, GalleryHorizontalEnd, Volume2, ExternalLink, CheckCircle2, X, Radio, Download, WifiOff, Wifi, Database, FileSpreadsheet } from 'lucide-react';
import ExcelPreview from './components/ExcelPreview';
import LiveTranscription from './components/LiveTranscription';

const NativeSpeech = registerPlugin('NativeSpeech');

const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1aaD44uttnMpWdLo19tko-8Ipl3_MUhbk";

const MAX_NATIVE_RETRY = 3;
const NATIVE_RETRY_DELAY = 1500;

export default function App() {
  const [activeTab, setActiveTab] = useState('STALL');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [records, setRecords] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [counter, setCounter] = useState({ STALL: 1, SCIENCE: 1, LECTURE: 1 });
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('SERVER_IP') || 'exhibition-voice-logger-backend.onrender.com');
  const [syncNotice, setSyncNotice] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [speechEngine, setSpeechEngine] = useState('initializing');
  const [nativeRetryCount, setNativeRetryCount] = useState(0);

  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewSubId, setPreviewSubId] = useState('');
  const [previewCounter, setPreviewCounter] = useState(1);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [livePhrases, setLivePhrases] = useState([]);
  const [liveLoggedCount, setLiveLoggedCount] = useState(0);
  const [livePartial, setLivePartial] = useState('');
  const isLiveModeRef = useRef(false);

  const isListeningRef = useRef(false);
  isListeningRef.current = isListening;

  const nativeRetryCountRef = useRef(0);
  const speechEngineRef = useRef('initializing');
  speechEngineRef.current = speechEngine;

  const audioStreamRef = useRef(null);
  const imageInputRef = useRef(null);

  const UPLOAD_API_URL = serverIp.includes('onrender.com') || serverIp.startsWith('http://') || serverIp.startsWith('https://')
    ? (serverIp.startsWith('http') ? `${serverIp.replace(/\/$/, '')}/api/upload` : `https://${serverIp.replace(/\/$/, '')}/api/upload`)
    : `http://${serverIp}:8080/api/upload`;

  const handleServerIpChange = (newIp) => {
    setServerIp(newIp);
    try { localStorage.setItem('SERVER_IP', newIp); } catch (e) {}
  };

  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [brochureFile, setBrochureFile] = useState(null);

  const [stallForm, setStallForm] = useState({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
  const [sciForm, setSciForm] = useState({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
  const [lecForm, setLecForm] = useState({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const nativeListenersRef = useRef([]);

  const refreshSheetData = async () => {
    try {
      const rows = sheetFilter === 'ALL'
        ? await getAllTranscriptions()
        : await getTranscriptionsByTab(sheetFilter);
      setSheetRows(rows);
    } catch (e) {
      console.error("Sheet refresh error:", e);
    }
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
            rec["Verification Status"] = 'Verified & Synced to Google Drive';
            if (serverRes && serverRes.transcript) rec["Transcript"] = serverRes.transcript;
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
                if (match) {
                  match.syncStatus = 'SYNCED';
                  match.serverLinks = serverRes.drive_links || {};
                  await updateTranscriptionRow(match);
                }
              } catch (e) {}
            }
            syncedCount++;
          }
        } catch (singleErr) {
          console.warn("Single record sync error:", singleErr);
        }
      }

      if (syncedCount > 0) {
        const updatedRecords = await getAllRecordsFromDB();
        setRecords(updatedRecords);
        await refreshSheetData();
        setSyncNotice(`Auto-Synced ${syncedCount} record(s) to Google Drive!`);
        setTimeout(() => setSyncNotice(null), 6000);
      }
    } catch (err) {
      console.warn("Background Drive Sync error:", err);
    }
  };

  useEffect(() => {
    getAllRecordsFromDB().then((dbRecords) => {
      if (dbRecords && dbRecords.length > 0) setRecords(dbRecords);
    }).catch(err => console.error("IndexedDB error:", err));

    refreshSheetData();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW reg error:", err));
    }

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

  const [speechLang, setSpeechLang] = useState('auto');
  const wakeRecognitionRef = useRef(null);

  const detectVoiceCommand = (text) => {
    if (!text) return;
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('ruby stop') || lower.includes('stop recording') || lower.includes('stop') ||
      lower.includes('done') || lower.includes('finish') || lower.includes('terminate') ||
      lower.includes('বন্ধ') || lower.includes('थामो') || lower.includes('बंद') || lower.includes('स्टॉप') || lower.includes('স্টপ')
    ) {
      stopListening();
    } else if (
      lower.includes('ruby') || lower.includes('rooby') || lower.includes('rubi') ||
      lower.includes('rube') || lower.includes('rubee') || lower.includes('hey ruby') ||
      lower.includes('hi ruby') || lower.includes('ok ruby') || lower.includes('start ruby') ||
      lower.includes('ruby start') || lower.includes('start recording') ||
      lower.includes('begin recording') || lower.includes('record') || lower.includes('start') ||
      lower.includes('রুবি') || lower.includes('রূবি') || lower.includes('শুরু') || lower.includes('স্টার্টিং') ||
      lower.includes('शुरू') || lower.includes('स्टार्ट')
    ) {
      if (!isListeningRef.current) {
        if (wakeRecognitionRef.current) {
          try { wakeRecognitionRef.current.stop(); } catch (e) {}
        }
        startListening();
      }
    }
  };

  useEffect(() => {
    let isCancelled = false;
    let wakeRetryTimeout = null;
    let wakeNativeRetry = 0;

    const effectiveLang = speechLang === 'auto' ? 'hi-IN' : speechLang;

    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      if (!isListening) {
        const loopNativeWake = async () => {
          if (isCancelled || isListeningRef.current) return;
          try {
            nativeListenersRef.current.forEach(l => l.remove());
            nativeListenersRef.current = [];

            const wakeListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
              wakeNativeRetry = 0;
              if (data && data.transcript) detectVoiceCommand(data.transcript);
            });

            const errorListener = await NativeSpeech.addListener('onSpeechError', (err) => {
              if (err && err.isNetworkError) return;
              if (!isCancelled && !isListeningRef.current) {
                wakeNativeRetry++;
                const delay = Math.min(NATIVE_RETRY_DELAY * wakeNativeRetry, 5000);
                wakeRetryTimeout = setTimeout(loopNativeWake, delay);
              }
            });

            nativeListenersRef.current = [wakeListener, errorListener];
            await NativeSpeech.startListening({
              language: effectiveLang,
              autoDetect: speechLang === 'auto'
            });
          } catch (e) {
            if (!isCancelled && !isListeningRef.current) {
              wakeNativeRetry++;
              const delay = Math.min(NATIVE_RETRY_DELAY * wakeNativeRetry, 5000);
              wakeRetryTimeout = setTimeout(loopNativeWake, delay);
            }
          }
        };
        loopNativeWake();
      }
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition && !isListening) {
        let wakeRecognition = null;
        try {
          wakeRecognition = new SpeechRecognition();
          wakeRecognition.continuous = true;
          wakeRecognition.interimResults = true;
          wakeRecognition.lang = effectiveLang;

          wakeRecognition.onresult = (event) => {
            let transcriptStr = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              transcriptStr += event.results[i][0].transcript;
            }
            detectVoiceCommand(transcriptStr);
          };

          wakeRecognition.onend = () => {
            if (!isListeningRef.current && wakeRecognitionRef.current === wakeRecognition) {
              try { wakeRecognition.start(); } catch (e) {}
            }
          };

          wakeRecognitionRef.current = wakeRecognition;
          wakeRecognition.start();
        } catch (e) {
          console.warn("Web background wake error:", e);
        }
      }
    }

    return () => {
      isCancelled = true;
      if (wakeRetryTimeout) clearTimeout(wakeRetryTimeout);
    };
  }, [isListening, speechLang]);

  const releaseMicStream = () => {
    if (audioStreamRef.current) {
      try { audioStreamRef.current.getTracks().forEach(track => track.stop()); } catch (e) {}
      audioStreamRef.current = null;
    }
  };

  const startListening = async () => {
    if (wakeRecognitionRef.current) {
      try { wakeRecognitionRef.current.stop(); } catch (e) {}
    }

    setLiveTranscript('');
    setFinalTranscript('');
    setAudioUrl(null);
    setAudioBlob(null);
    audioChunksRef.current = [];
    releaseMicStream();

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("Microphone access error:", err);
    }

    if (stream) {
      audioStreamRef.current = stream;
      try {
        let recMime = 'audio/webm';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/mp4')) recMime = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) recMime = 'audio/webm;codecs=opus';
          else if (MediaRecorder.isTypeSupported('audio/webm')) recMime = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/aac')) recMime = 'audio/aac';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType: recMime });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const finalMime = mediaRecorder.mimeType || recMime || 'audio/mp4';
          const blob = new Blob(audioChunksRef.current, { type: finalMime });
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
        };

        mediaRecorder.start(200);
      } catch (err) {
        console.error("MediaRecorder error:", err);
      }
    }

    const effectiveLang = speechLang === 'auto' ? 'hi-IN' : speechLang;

    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try {
        setIsListening(true);
        setStatus(`Listening (${speechLang === 'auto' ? 'Auto-Detect' : speechLang})`);
        setSpeechEngine('native');
        nativeRetryCountRef.current = 0;

        nativeListenersRef.current.forEach(l => l.remove());
        nativeListenersRef.current = [];

        const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
          if (data && data.transcript) {
            nativeRetryCountRef.current = 0;
            const processed = processTranscript(data.transcript);
            if (data.isFinal) {
              setFinalTranscript(prev => (prev ? prev.trim() + ' ' + processed : processed));
              setLiveTranscript('');
              setTimeout(() => {
                if (isListeningRef.current) {
                  NativeSpeech.startListening({
                    language: effectiveLang,
                    autoDetect: speechLang === 'auto'
                  }).catch(() => {});
                }
              }, 300);
            } else {
              setLiveTranscript(data.transcript);
            }
            detectVoiceCommand(data.transcript);
          }
        });

        const errorListener = await NativeSpeech.addListener('onSpeechError', (err) => {
          if (err && err.isNetworkError) {
            console.warn("[App] NativeSpeech network error, switching to Vosk offline");
            setSpeechEngine('vosk-offline');
            fallbackToVosk();
            return;
          }
          nativeRetryCountRef.current++;
          if (nativeRetryCountRef.current >= MAX_NATIVE_RETRY) {
            console.warn("[App] NativeSpeech max retries, switching to Vosk offline");
            setSpeechEngine('vosk-offline');
            fallbackToVosk();
            return;
          }
          setTimeout(() => {
            if (isListeningRef.current) {
              NativeSpeech.startListening({
                language: effectiveLang,
                autoDetect: speechLang === 'auto'
              }).catch(() => {});
            }
          }, NATIVE_RETRY_DELAY);
        });

        nativeListenersRef.current = [resultListener, errorListener];
        await NativeSpeech.startListening({
          language: effectiveLang,
          autoDetect: speechLang === 'auto'
        });
        return;
      } catch (err) {
        console.error("NativeSpeech error:", err);
      }
    }

    try {
      const started = await startOfflineSpeechRecognition(
        (partial) => setLiveTranscript(partial),
        (final) => {
          const processed = processTranscript(final);
          setFinalTranscript(prev => (prev ? prev.trim() + ' ' + processed : processed));
          setLiveTranscript('');
        },
        (err) => console.error("Vosk error:", err)
      );
      if (started) {
        setIsListening(true);
        setStatus('Listening Offline (Vosk)');
        setSpeechEngine('vosk-offline');
        return;
      }
    } catch (e) {
      console.error("Vosk start error:", e);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = effectiveLang;

        recognition.onstart = () => {
          setIsListening(true);
          setStatus(`Listening (${speechLang === 'auto' ? 'Auto-Detect' : speechLang})`);
          setSpeechEngine('web-speech');
        };

        recognition.onresult = (event) => {
          let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const current = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              const processed = processTranscript(current);
              setFinalTranscript(prev => (prev ? prev.trim() + ' ' + processed : processed));
              setLiveTranscript('');
            } else {
              interimText += current;
            }
          }
          if (interimText) setLiveTranscript(interimText);
          detectVoiceCommand(interimText);
        };

        recognition.onerror = () => {};
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (startErr) { console.warn("Recognition start error:", startErr); }
      } catch (e) {
        console.error("Web speech error:", e);
      }
    }

    setIsListening(true);
    setStatus('Listening (Wake Word: RUBY)');
  };

  const fallbackToVosk = async () => {
    nativeListenersRef.current.forEach(l => l.remove());
    nativeListenersRef.current = [];
    try {
      const started = await startOfflineSpeechRecognition(
        (partial) => setLiveTranscript(partial),
        (final) => {
          const processed = processTranscript(final);
          setFinalTranscript(prev => (prev ? prev.trim() + ' ' + processed : processed));
          setLiveTranscript('');
        },
        (err) => console.error("Vosk fallback error:", err)
      );
      if (started) {
        setIsListening(true);
        setStatus('Listening Offline (Vosk)');
        setSpeechEngine('vosk-offline');
      }
    } catch (e) {
      console.error("Vosk fallback failed:", e);
    }
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
    if (speechEngineRef.current === 'vosk-offline' || isVoskReady()) {
      stopOfflineSpeechRecognition();
    }

    nativeListenersRef.current.forEach(l => l.remove());
    nativeListenersRef.current = [];
    nativeRetryCountRef.current = 0;
    releaseMicStream();

    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      mediaRecorderRef.current = null;
    }

    if (!finalTranscript && !liveTranscript) {
      const defaultVoiceText = `Voice byte recorded (${speechLang === 'auto' ? 'Auto' : speechLang}) - saved offline`;
      setFinalTranscript(defaultVoiceText);
    }

    setIsListening(false);
    setStatus('Ready');
    setSpeechEngine('idle');
  };

  const startLiveMode = async () => {
    if (isListening) {
      await stopListening();
    }

    setLivePhrases([]);
    setLiveLoggedCount(0);
    setLivePartial('');
    isLiveModeRef.current = true;
    setIsLiveMode(true);
    setStatus('Live Mode - Continuous Listening');

    const effectiveLang = speechLang === 'auto' ? 'hi-IN' : speechLang;

    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try {
        setSpeechEngine('native');
        nativeRetryCountRef.current = 0;

        nativeListenersRef.current.forEach(l => l.remove());
        nativeListenersRef.current = [];

        const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
          if (!isLiveModeRef.current) return;
          if (data && data.transcript) {
            nativeRetryCountRef.current = 0;
            if (data.isFinal) {
              const processed = processTranscript(data.transcript);
              if (processed.trim()) {
                autoLogPhrase({
                  tab: activeTab,
                  transcript: processed,
                }).then((row) => {
                  if (row) {
                    setLivePhrases(prev => [...prev, row]);
                    setLiveLoggedCount(prev => prev + 1);
                  }
                });
              }
              setLivePartial('');
            } else {
              setLivePartial(data.transcript);
            }
          }
        });

        const errorListener = await NativeSpeech.addListener('onSpeechError', (err) => {
          if (!isLiveModeRef.current) return;
          if (err && err.isNetworkError) {
            setSpeechEngine('vosk-offline');
            fallbackToVoskLive();
            return;
          }
          nativeRetryCountRef.current++;
          if (nativeRetryCountRef.current >= MAX_NATIVE_RETRY) {
            setSpeechEngine('vosk-offline');
            fallbackToVoskLive();
          }
        });

        nativeListenersRef.current = [resultListener, errorListener];
        await NativeSpeech.startListening({
          language: effectiveLang,
          autoDetect: speechLang === 'auto',
          continuous: true,
        });
        setIsListening(true);
        return;
      } catch (err) {
        console.error("Live mode native error:", err);
      }
    }

    try {
      const started = await startOfflineSpeechRecognition(
        (partial) => { if (isLiveModeRef.current) setLivePartial(partial); },
        (final) => {
          if (!isLiveModeRef.current) return;
          const processed = processTranscript(final);
          if (processed.trim()) {
            autoLogPhrase({ tab: activeTab, transcript: processed }).then((row) => {
              if (row) {
                setLivePhrases(prev => [...prev, row]);
                setLiveLoggedCount(prev => prev + 1);
              }
            });
          }
          setLivePartial('');
        },
        (err) => console.error("Live mode Vosk error:", err)
      );
      if (started) {
        setIsListening(true);
        setSpeechEngine('vosk-offline');
        return;
      }
    } catch (e) {
      console.error("Live mode Vosk start error:", e);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = effectiveLang;

        recognition.onstart = () => {
          setIsListening(true);
          setSpeechEngine('web-speech');
        };

        recognition.onresult = (event) => {
          if (!isLiveModeRef.current) return;
          let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const current = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              const processed = processTranscript(current);
              if (processed.trim()) {
                autoLogPhrase({ tab: activeTab, transcript: processed }).then((row) => {
                  if (row) {
                    setLivePhrases(prev => [...prev, row]);
                    setLiveLoggedCount(prev => prev + 1);
                  }
                });
              }
              setLivePartial('');
            } else {
              interimText += current;
            }
          }
          if (interimText) setLivePartial(interimText);
        };

        recognition.onerror = () => {};
        recognition.onend = () => {
          if (isLiveModeRef.current) {
            try { recognition.start(); } catch (e) {}
          }
        };
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (startErr) {}
      } catch (e) {
        console.error("Live mode web speech error:", e);
      }
    }

    setIsListening(true);
  };

  const fallbackToVoskLive = async () => {
    nativeListenersRef.current.forEach(l => l.remove());
    nativeListenersRef.current = [];
    try {
      const started = await startOfflineSpeechRecognition(
        (partial) => { if (isLiveModeRef.current) setLivePartial(partial); },
        (final) => {
          if (!isLiveModeRef.current) return;
          const processed = processTranscript(final);
          if (processed.trim()) {
            autoLogPhrase({ tab: activeTab, transcript: processed }).then((row) => {
              if (row) {
                setLivePhrases(prev => [...prev, row]);
                setLiveLoggedCount(prev => prev + 1);
              }
            });
          }
          setLivePartial('');
        },
        (err) => console.error("Live Vosk fallback error:", err)
      );
      if (started) {
        setIsListening(true);
        setSpeechEngine('vosk-offline');
      }
    } catch (e) {
      console.error("Live Vosk fallback failed:", e);
    }
  };

  const stopLiveMode = async () => {
    isLiveModeRef.current = false;

    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try { await NativeSpeech.stopListening(); } catch (e) {}
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    if (speechEngineRef.current === 'vosk-offline' || isVoskReady()) {
      stopOfflineSpeechRecognition();
    }

    nativeListenersRef.current.forEach(l => l.remove());
    nativeListenersRef.current = [];
    nativeRetryCountRef.current = 0;
    releaseMicStream();

    if (mediaRecorderRef.current) {
      try { mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      mediaRecorderRef.current = null;
    }

    setIsLiveMode(false);
    setIsListening(false);
    setLivePartial('');
    setStatus('Ready');
    setSpeechEngine('idle');
    refreshSheetData();
  };

  const clearLivePhrases = () => {
    setLivePhrases([]);
    setLiveLoggedCount(0);
  };

  const handleImageFromGallery = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleBrochureChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setBrochureFile(file);
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

    const rawText = (finalTranscript + ' ' + liveTranscript).trim();
    const fullText = rawText ? formatTranscriptForSheet(rawText) : 'Recorded audio byte stored locally & ready for Drive sync';

    const offlineCounter = await getNextCounter(activeTab);
    let subIdPrefix = activeTab === 'STALL' ? 'STALL' : activeTab === 'SCIENCE' ? 'SCI' : 'LEC';
    const subId = `${subIdPrefix}-${String(offlineCounter).padStart(3, '0')}`;

    setPreviewSubId(subId);
    setPreviewCounter(offlineCounter);
    setShowPreview(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);

    try {
      const rawText = (finalTranscript + ' ' + liveTranscript).trim();
      const fullText = rawText ? formatTranscriptForSheet(rawText) : 'Recorded audio byte stored locally & ready for Drive sync';

      let subId = previewSubId;
      let offlineCounter = previewCounter;
      let rowData = {};
      let sheetName = 'Stall Data';
      let tabType = activeTab;

      let audioB64 = null;
      let imageB64 = null;
      let brochureB64 = null;

      if (audioBlob) try { audioB64 = await blobToBase64(audioBlob); } catch (e) {}
      if (imageFile) try { imageB64 = await blobToBase64(imageFile); } catch (e) {}
      if (brochureFile) try { brochureB64 = await blobToBase64(brochureFile); } catch (e) {}

      if (activeTab === 'STALL') {
        sheetName = 'Stall Data';
        setCounter(prev => ({ ...prev, STALL: offlineCounter + 1 }));
        rowData = {
          "Submission ID": subId, "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
          "Stall Name": stallForm.stallName.trim() || `Stall ${offlineCounter}`,
          "Stall No.": stallForm.stallNo.trim() || `A-0${offlineCounter}`,
          "Organization": stallForm.organization.trim() || 'Exhibition Organization',
          "Category": stallForm.category || 'General', "Person": stallForm.person || 'N/A',
          "Designation": stallForm.designation || 'N/A',
          "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
          "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
          "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
          "Transcript": fullText, "Verification Status": "Saved Offline & Ready",
          syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab,
          _audioBase64: audioB64, _imageBase64: imageB64,
          _imageName: imageFile ? imageFile.name : 'photo.jpg',
          _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
        };
        setStallForm({ stallName: '', stallNo: '', organization: '', category: '', person: '', designation: '' });
      } else if (activeTab === 'SCIENCE') {
        sheetName = 'Science Exhibition Data';
        setCounter(prev => ({ ...prev, SCIENCE: offlineCounter + 1 }));
        rowData = {
          "Submission ID": subId, "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
          "Exhibit/Project Name": sciForm.exhibitName.trim() || `Project ${offlineCounter}`,
          "Stall No.": sciForm.stallNo.trim() || `S-0${offlineCounter}`,
          "Organization/Institution": sciForm.organization.trim() || 'Science Institute',
          "Category": sciForm.category || 'Science', "Presenter": sciForm.presenter || 'N/A',
          "Designation/Class": sciForm.designationClass || 'N/A',
          "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
          "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
          "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
          "Transcript": fullText, "Verification Status": "Saved Offline & Ready",
          syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab,
          _audioBase64: audioB64, _imageBase64: imageB64,
          _imageName: imageFile ? imageFile.name : 'photo.jpg',
          _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
        };
        setSciForm({ exhibitName: '', stallNo: '', organization: '', category: '', presenter: '', designationClass: '' });
      } else {
        sheetName = 'Live Lecture Data';
        setCounter(prev => ({ ...prev, LECTURE: offlineCounter + 1 }));
        rowData = {
          "Submission ID": subId, "Timestamp": new Date().toISOString().replace('T', ' ').substring(0, 16),
          "Lecture Title": lecForm.lectureTitle.trim() || `Lecture ${offlineCounter}`,
          "Speaker": lecForm.speaker.trim() || `Speaker ${offlineCounter}`,
          "Designation": lecForm.designation || 'Speaker', "Organization": lecForm.organization || 'N/A',
          "Topic/Category": lecForm.topicCategory || 'Lecture',
          "Date/Time": lecForm.dateTime || new Date().toLocaleDateString(),
          "Audio Drive Link": `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Audio_${subId}.mp3`,
          "Image Drive Link": imageFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Photo_${subId}_${imageFile.name}` : 'N/A',
          "Brochure Drive Link": brochureFile ? `${DRIVE_FOLDER_URL}?sub_id=${subId}&file=Brochure_${subId}_${brochureFile.name}` : 'N/A',
          "Transcript": fullText, "Verification Status": "Saved Offline & Ready",
          syncStatus: "PENDING_DRIVE_SYNC", _sheetName: sheetName, _activeTab: activeTab,
          _audioBase64: audioB64, _imageBase64: imageB64,
          _imageName: imageFile ? imageFile.name : 'photo.jpg',
          _brochureBase64: brochureB64, _brochureName: brochureFile ? brochureFile.name : 'brochure.pdf'
        };
        setLecForm({ lectureTitle: '', speaker: '', designation: '', organization: '', topicCategory: '', dateTime: '' });
      }

      await saveRecordToDB(rowData);
      let updated = await getAllRecordsFromDB();
      setRecords(updated);

      const sheetRowId = await addTranscriptionRow({
        tab: tabType, submissionId: subId, timestamp: rowData["Timestamp"],
        name: rowData["Stall Name"] || rowData["Exhibit/Project Name"] || rowData["Lecture Title"] || '',
        transcript: fullText, syncStatus: 'PENDING', syncNotice: 'Saved Offline',
        speaker: rowData["Speaker"] || rowData["Person"] || rowData["Presenter"] || '',
        organization: rowData["Organization"] || rowData["Organization/Institution"] || '',
        category: rowData["Category"] || rowData["Topic/Category"] || '',
        stallNo: rowData["Stall No."] || '',
      });

      rowData._offlineSheetId = sheetRowId;
      await updateRecordToDB(rowData);
      await refreshSheetData();
      setStatus('Saved Offline');
      syncPendingRecordsToDrive();

      setImageFile(null); setImagePreview(null); setBrochureFile(null);
      setAudioUrl(null); setAudioBlob(null);
      setLiveTranscript(''); setFinalTranscript('');
      setShowPreview(false);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Error saving record. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    if (records.length === 0) { alert("No records to export."); return; }
    exportToExcel(records, "National_Exhibition_2026_Data.xlsx");
  };

  const handleClearHistory = async () => {
    if (window.confirm("Clear all submission records?")) {
      await clearAllRecordsFromDB();
      await clearAllTranscriptions();
      setRecords([]); setSheetRows([]);
    }
  };

  const engineLabel = () => {
    switch (speechEngine) {
      case 'native': return 'Native STT';
      case 'vosk-offline': return 'Vosk Offline';
      case 'web-speech': return 'Web Speech';
      case 'idle': return 'Idle';
      default: return 'Initializing...';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50/60 via-white to-emerald-50/50 text-slate-900 flex flex-col font-sans select-none pb-8">
      <HeaderBar status={status} onExportExcel={handleExportExcel} serverIp={serverIp} onServerIpChange={handleServerIpChange} isOnline={isOnline} speechEngine={engineLabel()} />

      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-3 space-y-3.5">
        {syncNotice && (
          <div className="bg-emerald-600 text-white rounded-2xl p-3 shadow-md flex items-center justify-between text-xs font-black animate-bounce">
            <div className="flex items-center space-x-2"><Upload className="w-4 h-4 animate-spin" /><span>{syncNotice}</span></div>
            <button type="button" onClick={() => setSyncNotice(null)} className="text-emerald-100 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="bg-white border-2 border-emerald-300 rounded-2xl p-3 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-rose-500" />}
            <span className="text-xs font-black text-emerald-950">{isOnline ? 'Online - Drive Sync Active' : 'Offline - Local Sheet Active'}</span>
          </div>
          <a href={DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 underline flex items-center space-x-1">
            <span>Open Drive</span><ExternalLink className="w-3 h-3 inline" />
          </a>
        </div>

        <div className="bg-white border border-orange-200 rounded-2xl p-1.5 flex justify-between shadow-sm">
          <button onClick={() => setActiveTab('STALL')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'STALL' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'text-orange-950 hover:bg-orange-50'}`}>STALL</button>
          <button onClick={() => setActiveTab('SCIENCE')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'SCIENCE' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md' : 'text-emerald-950 hover:bg-emerald-50'}`}>SCIENCE</button>
          <button onClick={() => setActiveTab('LECTURE')} className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'LECTURE' ? 'bg-gradient-to-r from-orange-600 to-emerald-600 text-white shadow-md' : 'text-slate-800 hover:bg-orange-50'}`}>LECTURE</button>
        </div>

        <div className="bg-white border border-orange-200 rounded-2xl p-4 shadow-sm text-center">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <p className="text-[11px] font-black text-orange-900 uppercase tracking-wider">
              AUDIO RECORDER & WAKE WORD: <span className="text-emerald-700 font-extrabold">"RUBY"</span>
            </p>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${speechEngine === 'vosk-offline' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : speechEngine === 'native' ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {engineLabel()}
            </span>
          </div>

          <div className="flex justify-center items-center space-x-1 mb-2 bg-orange-50/80 border border-orange-200 p-1 rounded-xl">
            <span className="text-[10px] font-black text-orange-950 px-1">LANG:</span>
            <button type="button" onClick={() => setSpeechLang('auto')} className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'auto' ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}>Auto</button>
            <button type="button" onClick={() => setSpeechLang('hi-IN')} className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'hi-IN' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}>Hindi</button>
            <button type="button" onClick={() => setSpeechLang('bn-IN')} className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'bn-IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}>Bengali</button>
            <button type="button" onClick={() => setSpeechLang('en-US')} className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all ${speechLang === 'en-US' ? 'bg-orange-600 text-white shadow-xs' : 'text-slate-700 hover:bg-orange-100'}`}>English</button>
          </div>

          <div className="flex justify-center items-center space-x-4 my-2">
            {!isListening ? (
              <button type="button" onClick={startListening} className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 transform active:scale-95 transition-all cursor-pointer">
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button type="button" onClick={stopListening} className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 animate-pulse transform active:scale-95 transition-all cursor-pointer">
                <Square className="w-7 h-7 fill-current" />
              </button>
            )}
          </div>

          <p className="text-[10px] text-orange-900 font-black italic mt-1">
            Say <span className="underline text-emerald-700">"RUBY"</span> or <span className="underline text-emerald-700">"Hey Ruby"</span> to start! Say <span className="underline text-rose-600">"Ruby Stop"</span> to finish!
          </p>

          {audioUrl && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-950">
                <Volume2 className="w-4 h-4 text-amber-600" /><span>RECORDED AUDIO BYTE PREVIEW</span>
              </div>
              <audio src={audioUrl} controls className="w-full h-8" />
            </div>
          )}

          <div className="mt-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-left space-y-1">
            <div className="flex items-center space-x-1.5 text-xs font-black text-emerald-950">
              <Radio className={`w-4 h-4 ${isListening ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`} />
              <span>LIVE TRANSCRIPTION ({speechLang === 'auto' ? 'Auto-Detect' : speechLang === 'hi-IN' ? 'Hindi' : speechLang === 'bn-IN' ? 'Bengali' : 'English'})</span>
            </div>
            <p className="text-xs text-slate-800 font-semibold leading-relaxed min-h-[32px]">
              {finalTranscript || liveTranscript ? (
                <><span>{finalTranscript}</span>{' '}<span className="text-emerald-700 italic">{liveTranscript}</span></>
              ) : isListening ? (
                <span className="text-emerald-600 italic font-normal">Listening... Speak now or say "RUBY"!</span>
              ) : (
                <span className="text-slate-400 italic font-normal">Tap Mic or say "RUBY" to transcribe...</span>
              )}
            </p>
          </div>
        </div>

        <LiveTranscription
          isActive={isLiveMode}
          phrases={livePhrases}
          livePartial={livePartial}
          speechEngine={speechEngine}
          isOnline={isOnline}
          loggedCount={liveLoggedCount}
          onStart={startLiveMode}
          onStop={stopLiveMode}
          onClear={clearLivePhrases}
        />

        <form onSubmit={handleSubmit} className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wide border-b border-emerald-100 pb-2">{activeTab} INFORMATION</h3>

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

          {/* Camera / Gallery Image Picker */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { if (imageInputRef.current) imageInputRef.current.click(); }} className="flex items-center justify-center space-x-1.5 p-2.5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100/60 text-xs font-extrabold text-orange-950 transition-all active:scale-95">
                <Camera className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="truncate">{imageFile ? imageFile.name : 'Camera / Gallery'}</span>
              </button>
              <label className="flex items-center justify-center space-x-1.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100/60 text-xs font-extrabold text-emerald-950 transition-all cursor-pointer active:scale-95">
                <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="truncate">{brochureFile ? brochureFile.name : 'Upload Brochure'}</span>
                <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={handleBrochureChange} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              </label>
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFromGallery} style={{ display: 'none' }} />

            {imagePreview && (
              <div className="p-2 bg-gradient-to-r from-orange-50 to-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-3">
                  <img src={imagePreview} alt="Upload Thumbnail" className="w-12 h-12 object-cover rounded-lg border border-emerald-400 shadow-xs" />
                  <div className="text-xs">
                    <span className="font-black text-emerald-950 block">Photo Attached</span>
                    <span className="text-[10px] text-slate-700 font-semibold truncate max-w-[150px] block">{imageFile ? imageFile.name : ''}</span>
                  </div>
                </div>
                <button type="button" onClick={handleRemoveImage} className="p-1 rounded-full text-rose-600 hover:bg-rose-100" title="Remove Photo">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <button type="submit" className="w-full py-3 bg-gradient-to-r from-orange-600 via-amber-600 to-emerald-600 hover:from-orange-500 hover:to-emerald-500 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center space-x-2 active:scale-98 transition-all">
            <FileSpreadsheet className="w-4 h-4" />
            <span>PREVIEW & SAVE OFFLINE</span>
          </button>
        </form>

        <HistoryTable records={records} onClear={handleClearHistory} sheetRows={sheetRows} sheetFilter={sheetFilter} onFilterChange={setSheetFilter} onRefreshSheet={refreshSheetData} />
      </main>

      <ExcelPreview
        show={showPreview}
        onClose={() => { if (!isSubmitting) setShowPreview(false); }}
        onSubmit={handleConfirmSubmit}
        activeTab={activeTab}
        formData={activeTab === 'STALL' ? stallForm : activeTab === 'SCIENCE' ? sciForm : lecForm}
        transcript={(finalTranscript + ' ' + liveTranscript).trim()}
        audioBlob={audioBlob}
        imageFile={imageFile}
        imagePreview={imagePreview}
        brochureFile={brochureFile}
        subId={previewSubId}
        counter={previewCounter}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
