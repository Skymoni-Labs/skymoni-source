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
import { describe, expect, it } from 'vitest'

import { appendSaleMarker } from './api'

describe('sale mail insertion', () => {
  it('keeps the selected template as the single root', () => {
    const id = 'a'.repeat(32)
    const result = appendSaleMarker(
      '<div data-mail-template="starry-mini-static"><p>hello</p></div>',
      id
    )
    const doc = new DOMParser().parseFromString(result, 'text/html')
    expect(doc.body.children).toHaveLength(1)
    expect(
      doc
        .querySelector('[data-mail-template] [data-model-sale]')
        ?.getAttribute('data-model-sale')
    ).toBe(id)
    expect(doc.body.textContent).toContain('hello')
  })
  it('rejects untrusted identifiers', () => {
    expect(() => appendSaleMarker('x', '<img>')).toThrow()
  })
  it('replaces the old activity and puts the countdown above the news', () => {
    const result = appendSaleMarker(
      `<div data-mail-template="starry-mini-static"><p>news</p><div data-model-sale="${'b'.repeat(32)}">old</div></div>`,
      'a'.repeat(32)
    )
    const doc = new DOMParser().parseFromString(result, 'text/html')
    const root = doc.querySelector('[data-mail-template]')
    expect(root?.querySelectorAll('[data-model-sale]')).toHaveLength(1)
    expect(root?.firstElementChild?.getAttribute('data-model-sale')).toBe(
      'a'.repeat(32)
    )
    expect(root?.textContent).toContain('news')
  })
})
