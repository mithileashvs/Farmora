const MAX_CHUNK_CHARS = 700;
const OVERLAP_CHARS = 100;

// Cleans repeated whitespace/blank lines without touching wording.
function cleanText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Splits into paragraphs first (meaning-preserving unit), then greedily
// packs paragraphs into chunks up to MAX_CHUNK_CHARS, only falling back to
// splitting a single overlong paragraph on sentence boundaries. Never
// blindly slices every N characters through the middle of a sentence.
function chunkText(rawText) {
  const text = cleanText(rawText);
  if (!text) return [];

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  function flush() {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  }

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }

    // Current chunk is full — flush it (keeping a small overlap for context
    // continuity), then handle this paragraph on its own.
    if (current) {
      flush();
      const tail = candidate.slice(-OVERLAP_CHARS - para.length, -para.length).trim();
      current = tail ? `${tail}\n\n` : '';
    }

    if (para.length <= MAX_CHUNK_CHARS) {
      current = (current + para).trim();
    } else {
      // A single paragraph longer than the limit: split on sentence
      // boundaries rather than mid-sentence.
      const sentences = para.match(/[^.!?]+[.!?]?\s*/g) || [para];
      let piece = current;
      for (const sentence of sentences) {
        if ((piece + sentence).length > MAX_CHUNK_CHARS && piece.trim()) {
          chunks.push(piece.trim());
          const overlap = piece.slice(-OVERLAP_CHARS).trim();
          piece = overlap ? `${overlap} ` : '';
        }
        piece += sentence;
      }
      current = piece;
    }
  }
  flush();

  return chunks;
}

module.exports = { chunkText, cleanText, MAX_CHUNK_CHARS, OVERLAP_CHARS };
