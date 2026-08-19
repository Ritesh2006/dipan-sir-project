let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

export async function startAudioCapture() {
  if (isRecording) return;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: { ideal: 16000 },
      },
    });
  } catch (err) {
    throw new Error('Microphone permission denied');
  }

  audioChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.start(1000);
  isRecording = true;
}

export function stopAudioCapture() {
  return new Promise((resolve) => {
    if (!isRecording || !mediaRecorder) {
      resolve(null);
      return;
    }

    isRecording = false;

    mediaRecorder.onstop = () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }

      if (audioChunks.length === 0) {
        resolve(null);
        return;
      }

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      audioChunks = [];
      resolve(blob);
    };

    try {
      mediaRecorder.stop();
    } catch {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      audioChunks = [];
      resolve(null);
    }
  });
}

export function isCurrentlyRecording() {
  return isRecording;
}

export function releaseMic() {
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  audioChunks = [];
}
