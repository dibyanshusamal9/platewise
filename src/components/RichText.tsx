import type { ReactNode } from 'react'

/**
 * Tiny, injection-safe formatter for AI replies: paragraphs, "- " bullets,
 * "1. " numbered lists, "### " headings and **bold**. Everything is rendered as
 * React text nodes; no HTML from the model is ever interpreted.
 */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p${blocks.length}`}>{inline(paragraph.join(' '))}</p>)
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={`l${blocks.length}`} className={`space-y-1 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}>
          {list.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>,
      )
      list = null
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (!line) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push(
        <p key={`h${blocks.length}`} className="font-semibold text-ink">
          {inline(heading[1])}
        </p>,
      )
    } else if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return <div className="space-y-2.5">{blocks}</div>
}

/** **bold** → <strong>; stray markdown markers are dropped. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part.replace(/__|`/g, '')
      ),
    )
}
