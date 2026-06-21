// Parses raw message content into HTML with styled spans.
// Raw text is stored as-is in the DB; this runs at render time only.
//
// *text*  → <span class="action">text</span>   (bold + action color)
// "text"  → <span class="speech">text</span>   (italic + speech color)
// plain   → rendered as-is
//
// Colors come from CSS custom properties in themes.css,
// so the output automatically matches whichever theme is active.

export function parseMessage(raw) {
  if (!raw) return '';

  // Escape any HTML that might be in the raw text first (safety)
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // *asterisks* → action span
  let parsed = escaped.replace(/\*([^*\n]+)\*/g,
    '<span class="action">*$1*</span>'
  );

  // "quotes" → speech span (handles straight quotes only)
  parsed = parsed.replace(/"([^"\n]+)"/g,
    '<span class="speech">&quot;$1&quot;</span>'
  );

  return parsed;
}
