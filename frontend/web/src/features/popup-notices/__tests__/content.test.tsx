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
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { PopupContent } from '../components/popup-content'
import { resolvePopupFormat, sanitizePopupHtml } from '../lib/content'

describe('popup content rendering', () => {
  test('email layout tokens and uploaded image markers render in automatic mode', () => {
    const name = `${'a'.repeat(64)}.png`
    const source = `<div data-mail-template="starry-compact-static"><div data-mail-block="traffic"><h1>673994374</h1></div><div data-mail-image="${name}"><script>alert(1)</script></div></div>`
    render(<PopupContent format='auto' content={source} />)
    const shadow = document.querySelector(
      '[data-popup-content] > div'
    )?.shadowRoot
    expect(shadow?.querySelector('.popup-mail-template h1')?.textContent).toBe(
      '673994374'
    )
    expect(shadow?.querySelector('img')).toHaveAttribute(
      'src',
      `https://skymoni.com/api/admin-mail-images/${name}`
    )
    expect(shadow?.querySelector('img')).toHaveAttribute(
      'referrerpolicy',
      'no-referrer'
    )
    expect(shadow?.querySelector('script')).toBeNull()
    expect(source).toContain('data-mail-image')
  })

  test('invalid image markers cannot inject paths or active attributes', () => {
    const clean = sanitizePopupHtml(
      '<div data-mail-image="../../secret.png"><img src="x" onerror="alert(1)"></div>'
    )
    expect(clean).not.toContain('secret.png')
    expect(clean).not.toContain('<img')
    expect(clean).not.toContain('onerror')
  })

  test('authored leading styles survive HTML parsing and full-document input', () => {
    const clean = sanitizePopupHtml(
      '<!doctype html><html><head><style>.my-card{color:red}</style></head><body><div class="my-card">Hello</div></body></html>'
    )
    expect(clean).toContain('.my-card{color:red}')
    expect(clean).toContain('class="my-card"')
  })

  test('explicit plain text preserves markup and line breaks as literal text', () => {
    render(
      <PopupContent format='text' content={'<b>Welcome</b>\n**Details**'} />
    )
    expect(screen.getByText('<b>Welcome</b> **Details**')).toHaveClass(
      'whitespace-pre-wrap'
    )
    expect(document.querySelector('b, strong')).toBeNull()
  })

  test('automatic detection treats HTML in fenced examples as Markdown', () => {
    const content = '# Guide\n\n```html\n<div>sample</div>\n```'
    expect(resolvePopupFormat(content, 'auto')).toBe('markdown')
    render(<PopupContent format='auto' content={content} />)
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeInTheDocument()
    expect(screen.getByText('<div>sample</div>')).toBeInTheDocument()
  })

  test('automatic HTML keeps styling and images while removing active content', () => {
    const content =
      '<style>.card{color:red;position:fixed}</style><div class="card">Hello<img src="https://example.com/cloud.png" onerror="alert(1)"></div><script>alert(1)</script><iframe src="https://example.com"></iframe><form><input><button>Send</button></form>'
    expect(resolvePopupFormat(content, 'auto')).toBe('html')
    const clean = sanitizePopupHtml(content)
    expect(clean).toContain('<style>')
    expect(clean).toContain('<img')
    expect(clean).not.toMatch(/<script|<iframe|<form|<input|<button|onerror/)
    render(<PopupContent format='html' content={content} />)
    const container = document.querySelector('[data-popup-content]')
    expect(container).toHaveClass(
      '[contain:layout_paint]',
      'overflow-hidden',
      'min-w-0'
    )
    const shadow = container?.querySelector('div')?.shadowRoot
    expect(shadow?.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/cloud.png'
    )
    expect(
      shadow?.querySelector('script, iframe, form, input, button')
    ).toBeNull()
  })

  test('Markdown raw HTML cannot introduce styles, forms or embedded pages', () => {
    render(
      <PopupContent
        format='markdown'
        content={
          '# Welcome\n\n<style>body{display:none}</style><form><input><button>Submit</button></form><iframe src="https://example.com"></iframe>\n\n```html\n<input name="example">\n```'
        }
      />
    )
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(
      document.querySelector('style, form, input, button, iframe')
    ).toBeNull()
    expect(screen.getByText('<input name="example">')).toBeInTheDocument()
  })

  test('Markdown preserves tables and puts long content within the popup width', () => {
    render(
      <PopupContent
        format='markdown'
        content={`| Model | Price |\n|---|---|\n| Cloud | 1 |\n\n${'LongWord'.repeat(1000)}`}
      />
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(document.querySelector('[data-popup-content]')).toHaveClass(
      'max-w-full',
      'break-words',
      '[&_table]:overflow-x-auto'
    )
  })
})
