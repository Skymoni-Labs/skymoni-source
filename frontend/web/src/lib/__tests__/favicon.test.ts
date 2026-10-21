import { afterEach, expect, it } from 'vitest'

import { applyFaviconToDom } from '../dom-utils'

afterEach(() =>
  document
    .querySelectorAll('link[rel~="icon"]')
    .forEach((link) => link.remove())
)

it('uses the transparent cloud for the site logo and replaces a cached icon', () => {
  const old = document.createElement('link')
  old.rel = 'icon'
  old.href = '/skymoni.png'
  document.head.appendChild(old)
  applyFaviconToDom('/skymoni.png')
  const icons = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
  expect(icons).toHaveLength(1)
  expect(icons[0].getAttribute('href')).toBe('/skymoni-favicon.png?v=20260923')
})

it('preserves an administrator supplied custom icon', () => {
  applyFaviconToDom('https://example.com/custom.png')
  expect(
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href
  ).toBe('https://example.com/custom.png')
})
