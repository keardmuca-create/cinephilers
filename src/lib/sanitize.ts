// Strips HTML tags repeatedly so nested payloads like "<<b>script>" can't
// survive a single pass, then removes control characters.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

export function sanitizeText(s: string): string {
  let prev = s;
  let out = s.replace(/<[^>]*>/g, '');
  while (out !== prev) {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  }
  return out.replace(CONTROL_CHARS, '').trim();
}
