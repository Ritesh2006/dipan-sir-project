import { normalizeText } from './normalizer';

export function extractEntities(transcript) {
  if (!transcript || typeof transcript !== 'string') return null;

  const norm = normalizeText(transcript).trim();
  if (!norm) return null;

  // Filter out conversational greetings or non-data phrases
  const ignorePhrases = [
    "hello", "hello how are you", "hi", "hey", "testing", "test", "check",
    "mic test", "how are you", "good morning", "good afternoon"
  ];
  if (ignorePhrases.includes(norm.toLowerCase())) {
    return null;
  }


  // 1. Roll Number
  let roll = null;
  let rollMatch = norm.match(/\broll\s*(?:number|no|num)?\s*[:=\-]?\s*(\d+)\b/i);
  if (rollMatch) {
    roll = parseInt(rollMatch[1], 10);
  } else {
    let altRoll = norm.match(/\b(\d+)\s*(?:attendance|present|absent|p|a|leave)\b/i);
    if (altRoll) roll = parseInt(altRoll[1], 10);
  }

  // 2. Attendance Status
  let attendance = null;
  if (/\b(?:present|p)\b/i.test(norm)) attendance = "Present";
  else if (/\b(?:absent|missing|not present|\ba\b)\b/i.test(norm)) attendance = "Absent";
  else if (/\b(?:leave|on leave|sick leave)\b/i.test(norm)) attendance = "Leave";

  // 3. Name Heuristic
  let name = null;
  const nameMatch = norm.match(/\bname\s*[:=\-]?\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i);
  if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    const tokens = norm.split(/\s+/);
    const stopWords = new Set([
      "roll", "attendance", "name", "phone", "status", "present", "absent",
      "p", "a", "is", "hello", "hi", "hey", "how", "are", "you", "test", "testing",
      "number", "no", "num", "date", "logged", "at", "the", "a", "an", "this", "that"
    ]);

    const candidateTokens = [];
    for (let token of tokens) {
      const clean = token.replace(/[^\w]/g, "");
      if (!clean || /\d+/.test(clean) || stopWords.has(clean.toLowerCase())) break;
      candidateTokens.push(clean);
    }
    if (candidateTokens.length > 0) {
      name = candidateTokens.join(" ");
    }
  }

  // Reject if no meaningful name or roll number was parsed
  if (!name && !roll) {
    return null;
  }

  if (name) {
    name = name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  // Default attendance if name or roll exists
  if (!attendance && (name || roll)) {
    attendance = "Present";
  }

  // 4. Phone
  let phone = null;
  const phoneMatch = norm.match(/\b(?:phone|mobile|contact)?\s*[:=\-]?\s*(\+?\d{10,12})\b/i);
  if (phoneMatch) phone = phoneMatch[1];

  const result = {
    Name: name || "Unknown",
    Roll: roll || "N/A",
    Attendance: attendance || "Present",
    Date: new Date().toISOString().split("T")[0],
    "Logged At": new Date().toLocaleTimeString()
  };

  if (phone) result.Phone = phone;

  return result;
}
