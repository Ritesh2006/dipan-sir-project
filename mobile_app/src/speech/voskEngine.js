import { createModel } from 'vosk-browser';

let modelInstance = null;
let recognizerInstance = null;
let audioContextInstance = null;
let mediaStreamInstance = null;
let scriptNodeInstance = null;

export async function initVoskModel() {
  if (modelInstance) return modelInstance;
  try {
    console.log("Loading offline Vosk speech model from local app assets...");
    // Load local offline WebAssembly Vosk model bundled in public/model
    const model = await createModel('/model/');
    modelInstance = model;
    console.log("Offline Vosk speech model loaded successfully.");
    return model;
  } catch (err) {
    console.error("Vosk model initialization error:", err);
    throw err;
  }
}

export async function startOfflineSpeechRecognition(onPartialResult, onFinalResult, onError) {
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 16000,
      },
    });
    mediaStreamInstance = stream;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    audioContextInstance = audioContext;

    const source = audioContext.createMediaStreamSource(stream);

    // Buffer audio samples and feed into Vosk WebAssembly recognizer
    const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptNodeInstance = scriptNode;

    scriptNode.onaudioprocess = (event) => {
      try {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        recognizer.acceptWaveform(inputBuffer);
      } catch (e) {
        console.error("Audio process error:", e);
      }
    };

    source.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    return true;
  } catch (err) {
    console.error("Start offline speech error:", err);
    if (onError) onError(err);
    return false;
  }
}

export function stopOfflineSpeechRecognition() {
  if (scriptNodeInstance) {
    try { scriptNodeInstance.disconnect(); } catch (e) {}
    scriptNodeInstance = null;
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
}
