import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeSpeech = registerPlugin('NativeSpeech');

const LANG_MAP = {
  'auto': 'auto',
  'hi-IN': 'hi-IN',
  'hi': 'hi-IN',
  'bn-IN': 'bn-IN',
  'bn': 'bn-IN',
  'en-US': 'en-US',
  'en': 'en-US',
};

let listeners = [];
let isListeningFlag = false;
let currentLanguage = 'hi-IN';
let retryCount = 0;
let sessionTimer = null;
let sessionStartTime = 0;
let accumulatedTranscript = '';
let onSessionResult = null;
let onSessionInterim = null;
let onSessionError = null;
let onSessionEnd = null;

const MAX_SESSION_MS = 30 * 60 * 1000;
const SESSION_RESTART_INTERVAL = 55 * 1000;

export async function startListening(language = 'auto', onResult, onInterim, onError, onEnd) {
  if (isListeningFlag) {
    await stopListening();
    await new Promise(r => setTimeout(r, 400));
  }

  const lang = LANG_MAP[language] || 'hi-IN';
  currentLanguage = lang;
  isListeningFlag = true;
  retryCount = 0;
  accumulatedTranscript = '';
  sessionStartTime = Date.now();
  onSessionResult = onResult;
  onSessionInterim = onInterim;
  onSessionError = onError;
  onSessionEnd = onEnd;

  if (Capacitor.isNativePlatform()) {
    try {
      const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
        if (data && data.transcript) {
          retryCount = 0;
          if (data.isFinal) {
            accumulatedTranscript += data.transcript + ' ';
            if (onSessionResult) onSessionResult(accumulatedTranscript.trim());
          } else {
            if (onSessionInterim) onSessionInterim(accumulatedTranscript.trim() + data.transcript);
          }
        }
      });

      const errorListener = await NativeSpeech.addListener('onSpeechError', async (err) => {
        if (!isListeningFlag) return;

        if (err.isRetryable && retryCount < 5) {
          retryCount++;
          try {
            await NativeSpeech.stopListening();
            await new Promise(r => setTimeout(r, 600));
            if (isListeningFlag) {
              await NativeSpeech.startListening({
                language: lang === 'auto' ? 'hi-IN' : lang,
                autoDetect: lang === 'auto',
                continuous: true,
              });
            }
          } catch (e) {
            isListeningFlag = false;
            clearSessionTimer();
            if (onSessionError) onSessionError(new Error(err.errorName || 'Speech error'));
          }
          return;
        }

        if (err.errorName === 'NO_MATCH' || err.errorName === 'SPEECH_TIMEOUT') {
          if (isListeningFlag) {
            await restartSession();
          }
          return;
        }

        isListeningFlag = false;
        clearSessionTimer();
        if (onSessionError) onSessionError(new Error(err.errorName || 'Speech error'));
      });

      const stateListener = await NativeSpeech.addListener('onSpeechState', (data) => {
        if (data && data.status === 'ready') {
          retryCount = 0;
        }
      });

      listeners = [resultListener, errorListener, stateListener];

      await NativeSpeech.startListening({
        language: lang === 'auto' ? 'hi-IN' : lang,
        autoDetect: lang === 'auto',
        continuous: true,
      });

      startSessionTimer();
    } catch (err) {
      isListeningFlag = false;
      if (onSessionError) onSessionError(err);
    }
  } else {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      isListeningFlag = false;
      if (onSessionError) onSessionError(new Error('Speech recognition not supported'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    if (lang !== 'auto') {
      recognition.lang = lang;
    }

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          accumulatedTranscript += t + ' ';
          if (onSessionResult) onSessionResult(accumulatedTranscript.trim());
        } else {
          interim += t;
          if (onSessionInterim) onSessionInterim(accumulatedTranscript.trim() + interim);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (onSessionError) onSessionError(new Error(`Speech error: ${event.error}`));
    };

    recognition.onend = () => {
      if (isListeningFlag) {
        try { recognition.start(); } catch {}
      }
    };

    try {
      recognition.start();
      startSessionTimer();
    } catch (err) {
      isListeningFlag = false;
      if (onSessionError) onSessionError(err);
    }
  }
}

async function restartSession() {
  if (!isListeningFlag) return;
  try {
    await NativeSpeech.stopListening();
    await new Promise(r => setTimeout(r, 500));
    if (isListeningFlag) {
      await NativeSpeech.startListening({
        language: currentLanguage === 'auto' ? 'hi-IN' : currentLanguage,
        autoDetect: currentLanguage === 'auto',
        continuous: true,
      });
    }
  } catch (e) {
    if (isListeningFlag) {
      setTimeout(() => restartSession(), 1000);
    }
  }
}

function startSessionTimer() {
  clearSessionTimer();
  const remaining = MAX_SESSION_MS - (Date.now() - sessionStartTime);

  if (remaining <= 0) {
    stopListening();
    if (onSessionEnd) onSessionEnd(accumulatedTranscript.trim());
    return;
  }

  sessionTimer = setTimeout(() => {
    stopListening();
    if (onSessionEnd) onSessionEnd(accumulatedTranscript.trim());
  }, remaining);
}

function clearSessionTimer() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
}

export async function stopListening() {
  isListeningFlag = false;
  retryCount = 0;
  clearSessionTimer();

  if (Capacitor.isNativePlatform()) {
    try {
      await NativeSpeech.stopListening();
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }

  listeners.forEach(l => {
    try { l.remove(); } catch (e) {}
  });
  listeners = [];
}

export function isCurrentlyListening() {
  return isListeningFlag;
}

export function getElapsedSeconds() {
  if (!isListeningFlag) return 0;
  return Math.floor((Date.now() - sessionStartTime) / 1000);
}

export function getRemainingSeconds() {
  if (!isListeningFlag) return 0;
  const remaining = MAX_SESSION_MS - (Date.now() - sessionStartTime);
  return Math.max(0, Math.floor(remaining / 1000));
}

export function getAccumulatedTranscript() {
  return accumulatedTranscript.trim();
}

export async function abortListening() {
  isListeningFlag = false;
  clearSessionTimer();
  await stopListening();
}

export async function checkAvailability() {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await NativeSpeech.isAvailable();
      return result.available;
    } catch {
      return false;
    }
  }
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
