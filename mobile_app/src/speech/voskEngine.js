import { createModel } from 'vosk-browser';

let modelInstance = null;
let recognizerInstance = null;
let audioContextInstance = null;
let mediaStreamInstance = null;
let scriptNodeInstance = null;
let sourceNodeInstance = null;
let isRunning = false;

export function isVoskReady() {
  return isRunning && recognizerInstance !== null;
}

export async function initVoskModel() {
  if (modelInstance) return modelInstance;
  try {
    console.log("[Vosk] Loading offline speech model from local assets...");
    const model = await createModel('/model/');
    modelInstance = model;
    console.log("[Vosk] Model loaded successfully.");
    return model;
  } catch (err) {
    console.error("[Vosk] Model load failed:", err);
    throw err;
  }
}

export async function startOfflineSpeechRecognition(onPartialResult, onFinalResult, onError) {
  if (isRunning) {
    console.warn("[Vosk] Already running, stopping first...");
    stopOfflineSpeechRecognition();
    await new Promise(r => setTimeout(r, 200));
  }

  try {
    const model = await initVoskModel();
    const recognizer = new model.KaldiRecognizer(16000);
    recognizerInstance = recognizer;

    recognizer.on('result', (message) => {
      if (message.result && message.result.text) {
        onFinalResult(message.result.text);
      }
    });

    recognizer.on('partialresult', (message) => {
      if (message.result && message.result.partial) {
        onPartialResult(message.result.partial);
      }
    });

    recognizer.on('error', (err) => {
      console.error("[Vosk] Recognizer error:", err);
    });

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
    } catch (micErr) {
      console.error("[Vosk] Microphone access denied:", micErr);
      if (onError) onError(micErr);
      cleanup();
      return false;
    }

    mediaStreamInstance = stream;

    let audioContext;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    } catch (ctxErr) {
      console.error("[Vosk] AudioContext failed:", ctxErr);
      if (onError) onError(ctxErr);
      cleanup();
      return false;
    }
    audioContextInstance = audioContext;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    sourceNodeInstance = source;

    const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNodeInstance = scriptNode;

    scriptNode.onaudioprocess = (event) => {
      if (!isRunning) return;
      try {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        recognizer.acceptWaveform(inputBuffer);
      } catch (e) {
        console.error("[Vosk] Audio process error:", e);
      }
    };

    source.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    isRunning = true;
    console.log("[Vosk] Offline speech recognition started.");
    return true;
  } catch (err) {
    console.error("[Vosk] Start failed:", err);
    if (onError) onError(err);
    cleanup();
    return false;
  }
}

function cleanup() {
  if (scriptNodeInstance) {
    try { scriptNodeInstance.disconnect(); } catch (e) {}
    scriptNodeInstance = null;
  }
  if (sourceNodeInstance) {
    try { sourceNodeInstance.disconnect(); } catch (e) {}
    sourceNodeInstance = null;
  }
  if (audioContextInstance) {
    try { audioContextInstance.close(); } catch (e) {}
    audioContextInstance = null;
  }
  if (mediaStreamInstance) {
    try {
      mediaStreamInstance.getTracks().forEach((track) => track.stop());
    } catch (e) {}
    mediaStreamInstance = null;
  }
  if (recognizerInstance) {
    try { recognizerInstance.remove(); } catch (e) {}
    recognizerInstance = null;
  }
  isRunning = false;
}

export function stopOfflineSpeechRecognition() {
  console.log("[Vosk] Stopping offline speech recognition...");
  cleanup();
}
