/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { marked, type Tokens } from 'marked'

export type DocBlock = {
  id: string
  type: 'heading' | 'text' | 'list' | 'code' | 'image' | 'callout' | 'divider'
  text: string
  url: string
  level: number
}
export type DocPage = {
  title: string
  summary: string
  category: string
  order: number
  blocks: DocBlock[]
}
export type DocEntry = {
  id: string
  revision: string
  draft: DocPage
  published?: DocPage
  updatedAt: number
  publishedAt: number
}
export type PublicDoc = DocPage & { id: string; publishedAt: number }
export type OutlineItem = { id: string; text: string; level: number }
export const newDocPage = (): DocPage => ({
  title: '未命名文档',
  summary: '',
  category: '入门指南',
  order: 0,
  blocks: [
    { id: crypto.randomUUID(), type: 'text', text: '', url: '', level: 2 },
  ],
})
export function safeImageURL(url: string) {
  if (/^\/api\/docs\/images\/[a-zA-Z0-9_-]{1,64}$/.test(url)) return true
  try {
    const parsed = new URL(url)
    return (
      ['https:', 'http:'].includes(parsed.protocol) &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}
export function moveBlock(blocks: DocBlock[], id: string, direction: number) {
  const from = blocks.findIndex((b) => b.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= blocks.length) return blocks
  const result = [...blocks]
  const [block] = result.splice(from, 1)
  result.splice(to, 0, block)
  return result
}

export function editorOutline(page: DocPage): OutlineItem[] {
  return page.blocks.flatMap((block) => {
    if (block.type === 'heading') {
      return [
        {
          id: `block-${block.id}`,
          text: block.text || '未命名章节',
          level: block.level,
        },
      ]
    }
    if (!['text', 'list', 'callout'].includes(block.type)) return []
    return marked
      .lexer(block.text)
      .filter((token): token is Tokens.Heading => token.type === 'heading')
      .map((token, index) => ({
        id: `block-${block.id}-heading-${index}`,
        text: token.text.replaceAll(/<[^>]*>/g, '').replaceAll(/[*_`]/g, ''),
        level: Math.min(3, token.depth),
      }))
  })
}
