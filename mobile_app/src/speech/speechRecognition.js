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
const MAX_RETRIES = 3;

export async function startListening(language = 'auto', onResult, onInterim, onError, onEnd) {
  if (isListeningFlag) {
    await stopListening();
    await new Promise(r => setTimeout(r, 400));
  }

  const lang = LANG_MAP[language] || 'hi-IN';
  currentLanguage = lang;
  isListeningFlag = true;
  retryCount = 0;

  if (Capacitor.isNativePlatform()) {
    try {
      const resultListener = await NativeSpeech.addListener('onSpeechResult', (data) => {
        if (data && data.transcript) {
          retryCount = 0;
          if (data.isFinal) {
            if (onResult) onResult(data.transcript);
          } else {
            if (onInterim) onInterim(data.transcript);
          }
        }
      });

      const errorListener = await NativeSpeech.addListener('onSpeechError', async (err) => {
        if (err.isRetryable && retryCount < MAX_RETRIES) {
          retryCount++;
          try {
            await NativeSpeech.stopListening();
            await new Promise(r => setTimeout(r, 500));
            await NativeSpeech.startListening({
              language: lang === 'auto' ? 'hi-IN' : lang,
              autoDetect: lang === 'auto',
              continuous: false,
            });
          } catch (e) {
            isListeningFlag = false;
            if (onError) onError(new Error(err.errorName || 'Speech error'));
          }
          return;
        }
        isListeningFlag = false;
        if (onError) onError(new Error(err.errorName || 'Speech error'));
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
        continuous: false,
      });
    } catch (err) {
      isListeningFlag = false;
      if (onError) onError(err);
    }
  } else {
    // Fallback: Web Speech API for browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      isListeningFlag = false;
      if (onError) onError(new Error('Speech recognition not supported'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    if (lang !== 'auto') {
      recognition.lang = lang;
    }

    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += t + ' ';
          if (onResult) onResult(finalText.trim());
        } else {
          interim += t;
          if (onInterim) onInterim(finalText.trim() + interim);
        }
      }
    };

    recognition.onerror = (event) => {
      isListeningFlag = false;
      if (event.error === 'no-speech') return;
      if (onError) onError(new Error(`Speech error: ${event.error}`));
    };

    recognition.onend = () => {
      isListeningFlag = false;
      if (onEnd) onEnd(finalText.trim());
    };

    try {
      recognition.start();
    } catch (err) {
      isListeningFlag = false;
      if (onError) onError(err);
    }
  }
}

export async function stopListening() {
  isListeningFlag = false;
  retryCount = 0;

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

export async function abortListening() {
  isListeningFlag = false;
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
