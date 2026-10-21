import type { TopicFormat } from './types'

export type Selection = { start: number; end: number }
export type Edit = Selection & { content: string }
export type ArticleCommand =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'codeblock'
  | 'quote'
  | 'bullet'
  | 'ordered'
  | 'rule'
  | 'table'
  | 'paragraph'
  | `h${1 | 2 | 3 | 4 | 5 | 6}`
  | 'left'
  | 'center'
  | 'right'
export const escapeArticleHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

export function insertAt(
  content: string,
  selection: Selection,
  text: string
): Edit {
  const start = Math.max(0, Math.min(selection.start, content.length))
  const end = Math.max(start, Math.min(selection.end, content.length))
  return {
    content: content.slice(0, start) + text + content.slice(end),
    start: start + text.length,
    end: start + text.length,
  }
}

export function wrapSelection(
  content: string,
  selection: Selection,
  before: string,
  after: string,
  fallback: string
): Edit {
  const selected = content.slice(selection.start, selection.end) || fallback
  if (
    content.slice(
      Math.max(0, selection.start - before.length),
      selection.start
    ) === before &&
    content.slice(selection.end, selection.end + after.length) === after
  ) {
    const result = insertAt(
      content,
      {
        start: selection.start - before.length,
        end: selection.end + after.length,
      },
      selected
    )
    return {
      ...result,
      start: selection.start - before.length,
      end: selection.start - before.length + selected.length,
    }
  }
  const result = insertAt(content, selection, before + selected + after)
  return {
    ...result,
    start: selection.start + before.length,
    end: selection.start + before.length + selected.length,
  }
}

export function articleCommand(
  content: string,
  selection: Selection,
  command: ArticleCommand,
  format: TopicFormat
): Edit {
  if (format === 'text') return { ...selection, content }
  const html = format === 'html'
  const inline = {
    bold: html ? ['<strong>', '</strong>'] : ['**', '**'],
    italic: html ? ['<em>', '</em>'] : ['*', '*'],
    strike: html ? ['<del>', '</del>'] : ['~~', '~~'],
    code: html ? ['<code>', '</code>'] : ['`', '`'],
  } as const
  if (command in inline) {
    const [before, after] = inline[command as keyof typeof inline]
    return wrapSelection(
      content,
      selection,
      before,
      after,
      {
        bold: '粗体文字',
        italic: '斜体文字',
        strike: '删除线文字',
        code: '代码',
      }[command as keyof typeof inline]
    )
  }
  if (command === 'codeblock') {
    return wrapSelection(
      content,
      selection,
      html ? '<pre><code>' : '\n```\n',
      html ? '</code></pre>' : '\n```\n',
      '代码'
    )
  }
  if (command === 'rule') {
    return insertAt(content, selection, html ? '\n<hr>\n' : '\n\n---\n\n')
  }
  if (command === 'table') {
    return insertAt(
      content,
      selection,
      html
        ? '\n<table><thead><tr><th>标题一</th><th>标题二</th></tr></thead><tbody><tr><td>内容</td><td>内容</td></tr></tbody></table>\n'
        : '\n\n| 标题一 | 标题二 |\n| --- | --- |\n| 内容 | 内容 |\n\n'
    )
  }
  const start =
    selection.start === 0
      ? 0
      : content.lastIndexOf('\n', selection.start - 1) + 1
  const endAt = content.indexOf(
    '\n',
    Math.max(
      selection.start,
      selection.end - (selection.end > selection.start ? 1 : 0)
    )
  )
  const end = endAt < 0 ? content.length : endAt
  let text = content.slice(start, end)
  if (['left', 'center', 'right'].includes(command)) {
    const openings = [
      ...content
        .slice(0, selection.start)
        .matchAll(/<div class="sf-text-(?:left|center|right)">\n\n/g),
    ]
    const opening = openings.at(-1),
      close = content.indexOf('\n\n</div>', selection.end)
    if (
      opening &&
      close >= 0 &&
      !content
        .slice((opening.index ?? 0) + opening[0].length, selection.start)
        .includes('</div>')
    ) {
      const next =
        content.slice(0, opening.index) +
        opening[0].replace(
          /sf-text-(left|center|right)/,
          `sf-text-${command}`
        ) +
        content.slice((opening.index ?? 0) + opening[0].length)
      const delta = next.length - content.length
      return {
        content: next,
        start: selection.start + delta,
        end: selection.end + delta,
      }
    }
    const before = `<div class="sf-text-${command}">\n\n`
    text = text || '对齐文字'
    const result = insertAt(
      content,
      { start, end },
      `${before + text}\n\n</div>`
    )
    return {
      ...result,
      start: start + before.length,
      end: start + before.length + text.length,
    }
  }
  if (command === 'paragraph' || /^h[1-6]$/.test(command)) {
    text = text || '标题文字'
    if (html) {
      text = text.replace(/^<(?:h[1-6]|p)>([\s\S]*)<\/(?:h[1-6]|p)>$/, '$1')
    } else text = text.replaceAll(/^#{1,6}\s+/gm, '')
    const tag = command === 'paragraph' ? 'p' : command
    text = html
      ? `<${tag}>${text}</${tag}>`
      : text
          .split('\n')
          .map(
            (line) =>
              (command === 'paragraph'
                ? ''
                : '#'.repeat(Number(command[1])) + ' ') + line
          )
          .join('\n')
  } else {
    text = text || (command === 'quote' ? '引用内容' : '列表内容')
    const lines = text.split('\n')
    if (html) {
      text =
        command === 'quote'
          ? `<blockquote>${text}</blockquote>`
          : `<${command === 'ordered' ? 'ol' : 'ul'}>${lines.map((line) => `<li>${line}</li>`).join('')}</${command === 'ordered' ? 'ol' : 'ul'}>`
    } else {
      text = lines
        .map((line, index) => {
          if (command === 'quote') return `> ${line}`
          if (command === 'ordered') return `${index + 1}. ${line}`
          return `- ${line}`
        })
        .join('\n')
    }
  }
  const result = insertAt(content, { start, end }, text)
  return { ...result, start, end: start + text.length }
}
