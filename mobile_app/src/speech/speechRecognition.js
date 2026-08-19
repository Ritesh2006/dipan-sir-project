import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeSpeech = registerPlugin('NativeSpeech');

const LANG_MAP = {
  'auto': '',
  'hi-IN': 'hi-IN',
  'hi': 'hi-IN',
  'bn-IN': 'bn-IN',
  'bn': 'bn-IN',
  'en-US': 'en-US',
  'en': 'en-US',
};

let webRecognition = null;
let isListening = false;
let finalTranscript = '';
let interimTranscript = '';
let onResultCallback = null;
let onInterimCallback = null;
let onErrorCallback = null;
let onEndCallback = null;
let nativeListeners = [];

const isNative = Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android';

export async function startListening(language = 'auto', onResult, onInterim, onError, onEnd) {
  if (isListening) {
    stopListening();
  }

  finalTranscript = '';
  interimTranscript = '';
  onResultCallback = onResult;
  onInterimCallback = onInterim;
  onErrorCallback = onError;
  onEndCallback = onEnd;

  const targetLang = LANG_MAP[language] || (language === 'auto' ? 'hi-IN' : language);
  const autoDetect = language === 'auto';

  // 1. Android Native Platform Speech Recognizer
  if (isNative) {
    try {
      // Remove any prior listeners
      nativeListeners.forEach(l => {
        try { l.remove(); } catch {}
      });
      nativeListeners = [];

      const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
        if (data && data.transcript) {
          if (data.isFinal) {
            finalTranscript += (finalTranscript ? ' ' : '') + data.transcript.trim();
            interimTranscript = '';
            if (onResultCallback) {
              onResultCallback(finalTranscript.trim());
            }
          } else {
            interimTranscript = data.transcript;
            if (onInterimCallback) {
              onInterimCallback((finalTranscript ? finalTranscript + ' ' : '') + interimTranscript);
            }
          }
        }
      });

      const errorListener = await NativeSpeech.addListener('onSpeechError', (err) => {
        if (err && (err.errorName === 'NO_MATCH' || err.errorName === 'SPEECH_TIMEOUT')) {
          // Normal silence timeouts in continuous mode - do not abort
          return;
        }
        if (onErrorCallback) {
          onErrorCallback(new Error(err.errorName || `Speech error code: ${err.error}`));
        }
      });

      const stateListener = await NativeSpeech.addListener('onSpeechState', (state) => {
        if (state && state.status === 'ready') {
          isListening = true;
        }
      });

      nativeListeners = [resultListener, errorListener, stateListener];

      await NativeSpeech.startListening({
        language: targetLang,
        autoDetect: autoDetect,
        continuous: true
      });

      isListening = true;
      return;
    } catch (nativeErr) {
      console.warn("Native speech start failed, trying web fallback:", nativeErr);
    }
  }

  // 2. Web Browser Fallback (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (onErrorCallback) {
      onErrorCallback(new Error('Speech recognition not supported on this device/browser'));
    }
    return;
  }

  webRecognition = new SpeechRecognition();
  webRecognition.continuous = true;
  webRecognition.interimResults = true;
  webRecognition.maxAlternatives = 1;

  if (targetLang) {
    webRecognition.lang = targetLang;
  }

  webRecognition.onresult = (event) => {
    interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += (finalTranscript ? ' ' : '') + transcript.trim();
        if (onResultCallback) {
          onResultCallback(finalTranscript.trim());
        }
      } else {
        interimTranscript += transcript;
        if (onInterimCallback) {
          onInterimCallback((finalTranscript ? finalTranscript + ' ' : '') + interimTranscript);
        }
      }
    }
  };

  webRecognition.onerror = (event) => {
    if (event.error === 'no-speech') return;
    if (onErrorCallback) {
      onErrorCallback(new Error(`Speech error: ${event.error}`));
    }
  };

  webRecognition.onend = () => {
    if (isListening && webRecognition) {
      try {
        webRecognition.start();
        return;
      } catch {}
    }
    isListening = false;
    if (onEndCallback) {
      onEndCallback(finalTranscript.trim());
    }
  };

  try {
    webRecognition.start();
    isListening = true;
  } catch (err) {
    isListening = false;
    if (onErrorCallback) {
      onErrorCallback(err);
    }
  }
}

export function stopListening() {
  isListening = false;

  if (isNative) {
    try {
      NativeSpeech.stopListening();
    } catch {}
    nativeListeners.forEach(l => {
      try { l.remove(); } catch {}
    });
    nativeListeners = [];
  }

  if (webRecognition) {
    try {
      webRecognition.stop();
    } catch {}
    webRecognition = null;
  }

  return finalTranscript.trim();
}

export function getTranscript() {
  return finalTranscript.trim();
}

export function isCurrentlyListening() {
  return isListening;
}

export function abortListening() {
  isListening = false;

  if (isNative) {
    try {
      NativeSpeech.stopListening();
    } catch {}
    nativeListeners.forEach(l => {
      try { l.remove(); } catch {}
    });
    nativeListeners = [];
  }

  if (webRecognition) {
    try {
      webRecognition.abort();
    } catch {}
    webRecognition = null;
  }

  finalTranscript = '';
  interimTranscript = '';
}
