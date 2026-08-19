const SENTENCE_ENDERS = /[.!?।]\s*/;
const HINDI_DANDA = /।/;

export function processTranscript(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();
  if (!text) return '';

  text = text.replace(/\s+/g, ' ');

  text = text.replace(/([,.])\1+/g, '$1');
  text = text.replace(/!{2,}/g, '!');
  text = text.replace(/\?{2,}/g, '?');

  text = text.replace(/\bi\b/g, 'I');
  text = text.replace(/\bi('m|'ll|'ve|'d|'re|'s)\b/g, 'I$1');

  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasBengali = /[\u0980-\u09FF]/.test(text);

  if (hasDevanagari || hasBengali) {
    text = text.replace(/\s*।\s*/g, '। ');
    text = text.replace(/\s*,\s*/g, ', ');
  } else {
    text = text.replace(/\.\s*\./g, '.');
    text = text.replace(/,\s*,/g, ',');
  }

  text = text.replace(/\bi('m|'ll|'ve|'d|'re|'s)\b/g, 'I$1');

  if (text.length > 0) {
    const firstChar = text.charAt(0);
    if (/[a-z]/.test(firstChar) && !hasDevanagari && !hasBengali) {
      text = firstChar.toUpperCase() + text.slice(1);
    }

    if (!/[.!?।]$/.test(text)) {
      text += '.';
    }
  }

  return text;
}

export function formatTranscriptForSheet(transcript, meta = {}) {
  const cleaned = processTranscript(transcript);
  if (!cleaned) return '';

  const parts = [];
  if (meta.speaker) parts.push(`${meta.speaker}:`);
  parts.push(cleaned);

  return parts.join(' ');
}
