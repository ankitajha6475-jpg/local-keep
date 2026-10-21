// Client-only Mermaid hydration. `renderMarkdown` emits placeholders with the
// original source in a hidden `<pre class="mermaid-source">`; this module turns
// them into SVG after the HTML has been inserted into the DOM.
//
// Mermaid is loaded lazily so notes without diagrams do not pay for the parser.

let mermaidInstance = null
let sequence = 0

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance
  const module = await import('mermaid')
  const mermaid = module.default || module
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'default',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    flowchart: { htmlLabels: true, curve: 'basis' },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true }
  })
  mermaidInstance = mermaid
  return mermaid
}

export async function renderMermaidBlocks(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0
  const blocks = root.querySelectorAll('.mermaid-block:not([data-mermaid-rendered])')
  if (blocks.length === 0) return 0
  let mermaid
  try {
    mermaid = await getMermaid()
  } catch (error) {
    for (const block of blocks) {
      block.setAttribute('data-mermaid-rendered', 'error')
      const node = document.createElement('div')
      node.className = 'mermaid-error'
      node.textContent = `Mermaid failed to load: ${error?.message || 'unknown error'}`
      block.appendChild(node)
    }
    return 0
  }

  let rendered = 0
  for (const block of blocks) {
    const source = block.querySelector('.mermaid-source')?.textContent || ''
    if (!source.trim()) {
      block.setAttribute('data-mermaid-rendered', 'empty')
      continue
    }
    block.setAttribute('data-mermaid-rendered', 'pending')
    const diagram = document.createElement('div')
    diagram.className = 'mermaid-diagram'
    try {
      const { svg, bindFunctions } = await mermaid.render(`lk-mermaid-${++sequence}`, source)
      diagram.innerHTML = svg
      block.appendChild(diagram)
      block.setAttribute('contenteditable', 'false')
      block.setAttribute('data-mermaid-rendered', 'true')
      rendered += 1
      if (typeof bindFunctions === 'function') bindFunctions(diagram)
    } catch (error) {
      const message = error?.message || 'Mermaid render failed'
      const node = document.createElement('div')
      node.className = 'mermaid-error'
      node.textContent = `Mermaid error: ${message}`
      block.appendChild(node)
      block.setAttribute('data-mermaid-rendered', 'error')
    }
  }
  return rendered
}
