/**
 * Apply a transform only to text outside fenced code blocks and inline code.
 * Fenced and inline code segments are preserved verbatim. This pure helper is
 * shared by the client renderer and the server tag/link parsers.
 */
export function transformOutsideCode(markdown, transform) {
  const source = String(markdown ?? '')
  const lines = source.split('\n')
  let fenceChar = null

  return lines.map(line => {
    const fence = line.match(/^\s*(```+|~~~+)/)
    if (fence) {
      const char = fence[1][0]
      if (!fenceChar) fenceChar = char
      else if (fenceChar === char) fenceChar = null
      return line
    }
    if (fenceChar) return line
    return line
      .split(/(`+[^`]*`+)/g)
      .map(segment => (segment.startsWith('`') ? segment : transform(segment)))
      .join('')
  }).join('\n')
}
