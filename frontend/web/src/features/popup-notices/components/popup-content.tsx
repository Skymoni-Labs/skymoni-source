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
import { RichContent } from '@/components/rich-content'

import {
  resolvePopupFormat,
  sanitizePopupHtml,
  popupMarkdownSanitizeOptions,
} from '../lib/content'
import type { PopupFormat } from '../types'

export function PopupContent(props: { content: string; format: PopupFormat }) {
  const format = resolvePopupFormat(props.content, props.format)
  return (
    <div
      data-popup-content
      className='relative isolate max-w-full min-w-0 overflow-hidden break-words [contain:layout_paint] [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto'
    >
      {format === 'text' ? (
        <div className='whitespace-pre-wrap'>{props.content}</div>
      ) : (
        <RichContent
          breaks
          mode={format}
          htmlVariant='isolated'
          markdownSanitizeOptions={popupMarkdownSanitizeOptions}
          content={
            format === 'html' ? sanitizePopupHtml(props.content) : props.content
          }
        />
      )}
    </div>
  )
}
