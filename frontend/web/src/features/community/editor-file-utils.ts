import { useAuthStore } from '@/stores/auth-store'

import { communityRequest } from './api'
import type { TopicFormat, TopicUpload } from './types'

export const TOPIC_CONTENT_LIMIT = 200000
function readFile(file: File, dataUrl = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'error',
      () => reject(new Error('文件读取失败，请重新选择')),
      { once: true }
    )
    reader.addEventListener(
      'load',
      () => resolve(String(reader.result ?? '')),
      { once: true }
    )
    if (dataUrl) reader.readAsDataURL(file)
    else reader.readAsText(file, 'UTF-8')
  })
}
export async function importTopicDocument(
  file: File
): Promise<{ content: string; format: TopicFormat }> {
  if (file.size > 1024 * 1024) throw new Error('导入的内容文件最多 1 MB')
  const extension = file.name.split('.').pop()?.toLowerCase()
  let format: TopicFormat = 'text'
  if (['html', 'htm'].includes(extension ?? '')) format = 'html'
  else if (['md', 'markdown'].includes(extension ?? '')) format = 'markdown'
  const content = (await readFile(file)).replace(/^\uFEFF/, '')
  if (content.length > TOPIC_CONTENT_LIMIT) {
    throw new Error('导入的正文最多 200,000 个字符')
  }
  return { content, format }
}
export const actorKey = () => {
  const auth = useAuthStore.getState().auth
  return `${auth.user?.id}:${auth.session?.sid}`
}
export async function uploadTopicFile(file: File): Promise<TopicUpload> {
  const actor = actorKey()
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('请选择非空文件，单个文件最多 5 MB')
  }
  const data = await readFile(file, true)
  if (actorKey() !== actor) {
    throw new DOMException('Account changed', 'AbortError')
  }
  return communityRequest<TopicUpload>('/uploads', {
    method: 'post',
    data: { name: file.name, content: data.slice(data.indexOf(',') + 1) },
    timeout: 60000,
  })
}
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
export function uploadMarkup(file: TopicUpload, format: TopicFormat): string {
  const name = file.name.replaceAll(/[[\]\\\r\n]/g, '')
  if (format === 'text') return `${file.name}: ${file.url}`
  if (format === 'html') {
    return file.image
      ? `<p><img src="${file.url}" alt="${escapeHtml(file.name)}"></p>`
      : `<p><a href="${file.url}">${escapeHtml(file.name)}</a></p>`
  }
  return `${file.image ? '!' : ''}[${name}](${file.url})`
}
