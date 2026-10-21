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

// Shared typography keeps the editor preview and storefront consistent.
export function ProductDescription(props: {
  content: string
  mode: 'markdown' | 'html' | 'text'
}) {
  const className =
    'text-sm leading-6 break-words [&_a]:font-medium [&_a]:text-sky-700 [&_a]:underline dark:[&_a]:text-sky-300 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:marker:text-sky-600 [&_p]:my-2 [&_p]:leading-6 [&_section+section]:mt-4 [&_section+section]:rounded-lg [&_section+section]:border [&_section+section]:bg-muted/20 [&_section+section]:p-4 [&_section>h3:first-child]:mt-0 [&_section>p:first-child]:mt-0 [&_section>p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto'
  return props.mode === 'text' ? (
    <p className='text-sm leading-6 break-words whitespace-pre-wrap'>
      {props.content}
    </p>
  ) : (
    <RichContent
      content={props.content}
      mode={props.mode}
      className={className}
    />
  )
}
