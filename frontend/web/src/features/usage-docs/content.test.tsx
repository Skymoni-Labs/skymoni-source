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
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DocContent } from './content'
import { moveBlock, newDocPage, safeImageURL } from './types'

describe('usage documents', () => {
  it('builds a stable outline from visible headings, including Markdown headings', async () => {
    const page = newDocPage()
    page.blocks = [
      { id: 'one', type: 'heading', text: '开始使用', url: '', level: 2 },
      {
        id: 'two',
        type: 'text',
        text: '### 复制链接\n\n正文内容',
        url: '',
        level: 0,
      },
    ]
    const outline = vi.fn()
    render(<DocContent page={page} onOutline={outline} />)
    await waitFor(() =>
      expect(outline).toHaveBeenCalledWith([
        { id: 'section-one-0', text: '开始使用', level: 2 },
        { id: 'section-two-0', text: '复制链接', level: 3 },
      ])
    )
    expect(screen.getByRole('heading', { name: '复制链接' }).id).toBe(
      'section-two-0'
    )
  })
  it('does not execute HTML or unsafe URLs and preserves code text', () => {
    const page = newDocPage()
    page.blocks = [
      {
        id: 'one',
        type: 'text',
        text: '<script>alert(1)</script>\n[bad](javascript:alert(1))\n<img src=x onerror="alert(1)">',
        url: '',
        level: 0,
      },
      {
        id: 'two',
        type: 'code',
        text: '<script>literal</script>',
        url: '',
        level: 0,
      },
    ]
    const { container } = render(<DocContent page={page} onOutline={vi.fn()} />)
    expect(
      container.querySelector('script,img,[onerror],a[href^="javascript:"]')
    ).toBeNull()
    expect(container.querySelector('code')?.textContent).toBe(
      '<script>literal</script>'
    )
    expect(safeImageURL('javascript:alert(1)')).toBe(false)
    expect(safeImageURL('/api/docs/images/../../file')).toBe(false)
  })
  it('reorders blocks without changing their stable IDs or source content', () => {
    const page = newDocPage()
    const a = page.blocks[0]
    const b = { ...a, id: 'b', text: 'second' }
    expect(moveBlock([a, b], a.id, 1)).toEqual([b, a])
    expect(moveBlock([a, b], a.id, -1)).toEqual([a, b])
  })
})
