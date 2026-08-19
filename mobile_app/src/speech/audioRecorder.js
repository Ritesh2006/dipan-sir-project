let mediaStream = null;
let audioContext = null;
let scriptNode = null;
let recordedChunks = [];
let isRecording = false;
let sampleRate = 16000;

function mergeBuffers(channels, length) {
  const result = new Float32Array(length);
  for (let ch = 0; ch < channels.length; ch++) {
    const data = channels[ch];
    for (let i = 0; i < length; i++) {
      result[i] += (data[i] || 0) / channels.length;
    }
  }
  return result;
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function encodeWAV(samples, sr) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sr * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const pcm = floatTo16BitPCM(samples);
  new Uint8Array(buffer).set(new Uint8Array(pcm), headerSize);

  return new Blob([buffer], { type: 'audio/wav' });
}

export async function startRecording() {
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

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') await audioContext.resume();
  sampleRate = audioContext.sampleRate;

  const source = audioContext.createMediaStreamSource(mediaStream);
  const bufferSize = 4096;
  scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

  recordedChunks = [];

  scriptNode.onaudioprocess = (event) => {
    if (!isRecording) return;
    const inputBuffer = event.inputBuffer;
    const channelData = inputBuffer.getChannelData(0);
    recordedChunks.push(new Float32Array(channelData));
  };

  source.connect(scriptNode);
  scriptNode.connect(audioContext.destination);
  isRecording = true;
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!isRecording) {
      resolve(null);
      return;
    }

    isRecording = false;

    if (scriptNode) {
      scriptNode.disconnect();
      scriptNode = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    const totalLength = recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (totalLength === 0) {
      resolve(null);
      return;
    }

    const merged = mergeBuffers(recordedChunks, totalLength);
    recordedChunks = [];
    const wavBlob = encodeWAV(merged, sampleRate);
    resolve(wavBlob);
  });
}

export function isCurrentlyRecording() {
  return isRecording;
}

export function releaseMic() {
  isRecording = false;
  if (scriptNode) { try { scriptNode.disconnect(); } catch {} scriptNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
  recordedChunks = [];
}
