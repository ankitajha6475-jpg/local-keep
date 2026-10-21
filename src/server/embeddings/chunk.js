// Deterministic paragraph-aware chunking. Markdown/canvas text is converted to
// plain text before this runs; the note title is added by the indexer when
// building the embedding input (not stored in the chunk body).

function normalize(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function tail(text, amount) {
  if (amount <= 0 || !text) return ''
  const start = Math.max(0, text.length - amount)
  const space = text.indexOf(' ', start)
  return text.slice(space === -1 ? start : space + 1).trimStart()
}

function splitLongBlock(block, maxChars, overlapChars) {
  const pieces = []
  let start = 0
  while (start < block.length) {
    let end = Math.min(block.length, start + maxChars)
    if (end < block.length) {
      const whitespace = block.lastIndexOf(' ', end)
      if (whitespace > start + Math.floor(maxChars * 0.6)) end = whitespace
    }
    const piece = block.slice(start, end).trim()
    if (piece) pieces.push(piece)
    if (end >= block.length) break
    start = Math.max(end - overlapChars, start + 1)
    const nextSpace = block.indexOf(' ', start)
    if (nextSpace !== -1 && nextSpace < end + maxChars) start = nextSpace + 1
  }
  return pieces
}

/**
 * @param {string} text
 * @param {{maxChars?:number,overlapChars?:number}} opts
 * @returns {{index:number,content:string,charCount:number}[]}
 */
export function chunkText(text, opts = {}) {
  const source = normalize(text)
  if (!source) return []
  const maxChars = Math.max(200, Number(opts.maxChars) || 1200)
  const overlapChars = Math.max(0, Math.min(
    Number(opts.overlapChars) || 0,
    Math.floor(maxChars / 3)
  ))

  const blocks = source.split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  const chunks = []
  let current = ''

  function pushCurrent() {
    const value = current.trim()
    if (value) chunks.push(value)
    current = ''
  }

  for (const block of blocks) {
    if (block.length > maxChars) {
      pushCurrent()
      for (const piece of splitLongBlock(block, maxChars, overlapChars)) {
        if (piece.length > maxChars) {
          // Extremely long unbroken token: hard split.
          for (let i = 0; i < piece.length; i += maxChars) {
            chunks.push(piece.slice(i, i + maxChars))
          }
        } else {
          chunks.push(piece)
        }
      }
      continue
    }

    const next = current ? `${current}\n\n${block}` : block
    if (next.length <= maxChars) {
      current = next
      continue
    }

    const overlap = tail(current, overlapChars)
    pushCurrent()
    current = overlap ? `${overlap}\n\n${block}` : block
    if (current.length > maxChars) {
      for (const piece of splitLongBlock(current, maxChars, overlapChars)) {
        chunks.push(piece)
      }
      current = ''
    }
  }
  pushCurrent()

  return chunks
    .filter((content, index, all) => content && (index === 0 || content !== all[index - 1]))
    .map((content, index) => ({ index, content, charCount: content.length }))
}
