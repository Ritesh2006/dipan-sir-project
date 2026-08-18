const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19
};

const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

export function parseCompoundNumbers(text) {
  const words = text.split(/\s+/);
  const result = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i].toLowerCase();
    const nextW = (i + 1 < words.length) ? words[i + 1].toLowerCase() : '';
    
    if (TENS[w] !== undefined && UNITS[nextW] !== undefined) {
      result.push(TENS[w] + UNITS[nextW]);
      i += 2;
    } else if (TENS[w] !== undefined) {
      result.push(TENS[w]);
      i += 1;
    } else if (UNITS[w] !== undefined) {
      result.push(UNITS[w]);
      i += 1;
    } else {
      result.push(words[i]);
      i += 1;
    }
  }
  return result.join(' ');
}

export function normalizeText(text) {
  if (!text) return "";
  let norm = text.toLowerCase().trim();

  // Clean punctuation
  norm = norm.replace(/[^\w\s:,\-\.]/g, " ");

  // Compound spoken numbers
  norm = parseCompoundNumbers(norm);

  // Keywords
  norm = norm.replace(/\broll\s*(?:number|no|num)?\b/gi, "roll");
  norm = norm.replace(/\bphone\s*(?:number|no|num)?\b/gi, "phone");
  norm = norm.replace(/\battendance\s*(?:is|status)?\b/gi, "attendance");

  return norm.trim().replace(/\s+/g, ' ');
}
