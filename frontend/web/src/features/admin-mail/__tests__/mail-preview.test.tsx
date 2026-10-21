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
import { afterEach, expect, test } from 'vitest'

import { MailPreview } from '../components/mail-preview'

afterEach(() => document.documentElement.classList.remove('dark'))

test('uploaded mail images survive without allowing external trackers', () => {
  const source = `https://skymoni.com/api/admin-mail-images/${'a'.repeat(64)}.png`
  render(
    <MailPreview
      html={`<img src="${source}" srcset="https://tracker.invalid/a 2x"><img src="https://skymoni.com.evil.test/api/admin-mail-images/${'a'.repeat(64)}.png">`}
    />
  )
  const frame = screen.getByTitle('Email preview') as HTMLIFrameElement
  const email = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  expect(email.querySelectorAll('img')).toHaveLength(1)
  expect(email.querySelector('img')?.getAttribute('src')).toBe(source)
  expect(email.querySelector('img')?.hasAttribute('srcset')).toBe(false)
})

test('only the owned sale countdown image survives and srcset is removed', () => {
  const source = `https://skymoni.com/api/model-sales/public/${'a'.repeat(32)}/countdown.gif`
  render(
    <MailPreview
      html={`<img src="${source}" srcset="https://other.test/a 2x"><img src="https://other.test/x">`}
    />
  )
  const frame = screen.getByTitle('Email preview') as HTMLIFrameElement
  const email = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  expect(email.querySelectorAll('img')).toHaveLength(1)
  expect(email.querySelector('img')?.getAttribute('src')).toBe(source)
  expect(email.querySelector('img')?.hasAttribute('srcset')).toBe(false)
})

test('a white email keeps its dark text when the console uses a dark theme', () => {
  document.documentElement.classList.add('dark')
  render(
    <MailPreview html='<html><body style="color:#294b61;background:#fff"><h1>Update</h1><p>Readable text</p></body></html>' />
  )
  const frame = screen.getByTitle('Email preview') as HTMLIFrameElement
  const email = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  expect(email.body.style.color).toBe('rgb(41, 75, 97)')
  expect(email.body.style.background).toBe('rgb(255, 255, 255)')
  expect(email.querySelector('p')?.textContent).toBe('Readable text')
  expect(email.querySelector('.dark')).toBeNull()
  expect(email.querySelector('link[rel="stylesheet"]')).toBeNull()
})

test('email links open separately while active content stays disabled', () => {
  render(
    <MailPreview html='<body><p>Hello</p><script>alert(1)</script><form><input></form><iframe src="https://example.invalid"></iframe><img src="https://example.invalid/tracker"><a href="https://skymoni.com/docs">Read docs</a></body>' />
  )
  const frame = screen.getByTitle('Email preview') as HTMLIFrameElement
  const email = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  expect(email.querySelector('script,form,input,iframe,img')).toBeNull()
  expect(email.querySelector('a')?.getAttribute('target')).toBe('_blank')
  expect(email.querySelector('a')?.getAttribute('rel')).toBe(
    'noopener noreferrer'
  )
  const permissions = frame.getAttribute('sandbox')?.split(' ') ?? []
  expect(permissions).not.toContain('allow-scripts')
  expect(permissions).not.toContain('allow-forms')
})
