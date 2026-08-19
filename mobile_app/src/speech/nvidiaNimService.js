const LANG_MAP = {
  'auto': null,
  'hi-IN': 'hi',
  'hi': 'hi',
  'bn-IN': 'bn',
  'bn': 'bn',
  'en-US': 'en',
  'en': 'en',
};

function getBackendUrl() {
  try {
    const serverIp = localStorage.getItem('SERVER_IP') || 'exhibition-voice-logger-backend.onrender.com';
    if (serverIp.includes('onrender.com') || serverIp.startsWith('http://') || serverIp.startsWith('https://')) {
      return serverIp.startsWith('http') ? serverIp.replace(/\/$/, '') : `https://${serverIp.replace(/\/$/, '')}`;
    }
    return `http://${serverIp}:8080`;
  } catch {
    return 'https://exhibition-voice-logger-backend.onrender.com';
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function transcribeWithNim(audioBlob, language = 'auto') {
  const backendUrl = getBackendUrl();
  const lang = LANG_MAP[language] || null;
  const audioB64 = await blobToBase64(audioBlob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${backendUrl}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_base64: audioB64,
        language: lang,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try { detail = JSON.parse(text).error || text; } catch {}
      throw new Error(`Server error (${response.status}): ${detail}`);
    }

    const result = JSON.parse(text);
    if (result.error) throw new Error(result.error);
    return {
      text: result.text || '',
      language: result.language || lang || 'auto',
      confidence: result.confidence || 0,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Transcription timed out - try shorter audio');
    throw err;
  }
}

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${getBackendUrl()}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
