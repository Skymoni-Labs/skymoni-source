import type { ContentBlock } from '../types'

export function reorderBlocks(
  blocks: ContentBlock[],
  from: string,
  to: string
): ContentBlock[] {
  const source = blocks.findIndex((block) => block.id === from)
  const target = blocks.findIndex((block) => block.id === to)
  if (source < 0 || target < 0 || source === target) return blocks
  const next = [...blocks]
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved)
  return next
}

export function listItems(text: string) {
  const counts = new Map<string, number>()
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => {
      const occurrence = (counts.get(text) ?? 0) + 1
      counts.set(text, occurrence)
      return { key: `${text}:${occurrence}`, text }
    })
}
