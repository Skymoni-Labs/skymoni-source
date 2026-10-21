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
import DOMPurify, { type Config } from 'dompurify'

import { isLikelyHtml } from '@/lib/content-format'

import type { PopupFormat } from '../types'
import { preparePopupMailContent, popupRichContentStyles } from './mail-content'

export function resolvePopupFormat(
  content: string,
  format: PopupFormat
): Exclude<PopupFormat, 'auto'> {
  if (format !== 'auto') return format
  // HTML examples inside Markdown code fences are text, not HTML documents.
  const prose = content
    .replaceAll(
      /(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[^\n]*(?=\n|$)|$)/g,
      ''
    )
    .replaceAll(/`[^`\n]*`/g, '')
  return isLikelyHtml(prose) ? 'html' : 'markdown'
}

export function sanitizePopupHtml(content: string): string {
  const html = DOMPurify.sanitize(content, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['style', 'target', 'rel'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'base',
      'meta',
      'link',
      'object',
      'embed',
    ],
    FORBID_ATTR: ['srcdoc', 'autofocus'],
    FORCE_BODY: true,
  })
  // These rules live only in HtmlContent's isolated shadow root, not the site.
  return `${preparePopupMailContent(html)}${popupRichContentStyles}`
}

export const popupMarkdownSanitizeOptions: Config = {
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'base',
    'meta',
    'link',
    'object',
    'embed',
  ],
  FORBID_ATTR: ['srcdoc', 'autofocus'],
}
