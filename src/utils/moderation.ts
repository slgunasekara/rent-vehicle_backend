import { ApiError } from './ApiError';

/**
 * Text checks for what people type into ads, reviews and replies:
 *  - a bad-word filter (English and the common Sinhala / Tamil words written in English letters)
 *  - spam: web links, e-mail addresses, shouting in capitals, one word repeated again and again
 * Words are compared as whole words after "f*ck" / "sh1t" style tricks and stretched letters are undone, so ordinary words are not caught.
 */
const BAD = new Set([
  'fuck', 'fucking', 'fucker', 'fck', 'fuk', 'shit', 'shitty', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'dickhead', 'pussy', 'cunt', 'slut', 'whore', 'motherfucker', 'nigger', 'nigga', 'porn', 'rape', 'rapist',
  // Sinhala / Tamil words (written in English letters)
  'huththa', 'huththo', 'hutta', 'hutto', 'huttha', 'pakaya', 'pakayo', 'ponnaya', 'ponna', 'wesi', 'vesi', 'wesige', 'ukkla', 'otha', 'punda', 'pundai', 'thevidiya', 'thevidya', 'koothi', 'sunni',
]);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function tokens(text: string): string[] {
  const t = text.toLowerCase().replace(/[01345 7@$!]/g, (c) => (c === ' ' ? ' ' : LEET[c] ?? c)).replace(/[*_.\-]/g, '').replace(/(.)\1{2,}/g, '$1$1');
  return t.split(/[^a-z]+/).filter(Boolean);
}

export function hasBadWord(text: string): boolean {
  return tokens(text).some((w) => BAD.has(w) || BAD.has(w.replace(/(.)\1/g, '$1'))); // "fuuck" -> "fuck"
}

/** why the text looks like spam, or null */
export function spamReason(text: string): string | null {
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|lk|net|org|info|biz|xyz|me|link)\b\/?)/i.test(text)) return 'web links';
  if (/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(text)) return 'e-mail addresses';
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 30 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return 'capital letters only';
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const count = new Map<string, number>();
  for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
  if ([...count.values()].some((n) => n >= 8)) return 'the same word again and again';
  return null;
}

/** throws a friendly 400 when one of the texts is not acceptable (the bad word itself is never repeated back) */
export function checkTexts(fields: Record<string, string | undefined>): void {
  for (const [label, text] of Object.entries(fields)) {
    if (!text) continue;
    if (hasBadWord(text)) throw new ApiError(400, `Your ${label} has words that are not allowed on Vehicle Buddy. Please remove them and try again.`);
    const spam = spamReason(text);
    if (spam) throw new ApiError(400, `Your ${label} looks like spam (${spam}). Please write about the vehicle only.`);
  }
}
