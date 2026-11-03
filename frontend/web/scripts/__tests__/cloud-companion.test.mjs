import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

const assetDirectory = new URL(
  '../../public/static/cloud-companion-20261103/',
  import.meta.url
)
const entry = readdirSync(assetDirectory).find((name) => name.endsWith('.js'))
const source = readFileSync(new URL(entry, assetDirectory), 'utf8')

function mount(options = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><button id="page-button">Page action</button></body></html>',
    {
      url: 'https://skymoni.com/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    }
  )
  const { window } = dom
  Object.defineProperty(window, 'innerWidth', {
    value: options.mobile ? 390 : 1280,
  })
  Object.defineProperty(window, 'innerHeight', { value: 844 })
  Object.defineProperty(window.document.documentElement, 'clientWidth', {
    value: options.mobile ? 375 : 1265,
  })
  window.matchMedia = (media) => {
    const query = new window.EventTarget()
    query.matches = media.includes('760px') && Boolean(options.mobile)
    return query
  }
  window.SVGElement.prototype.beginElement = () => {}
  window.SVGElement.prototype.endElement = () => {}
  window.HTMLElement.prototype.setPointerCapture = () => {}
  for (const [key, value] of Object.entries(options.saved ?? {})) {
    window.localStorage.setItem(key, value)
  }
  if (options.storageUnavailable) {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage unavailable')
      },
    })
  }
  window.eval(source)
  const host = window.document.querySelector('#skymoni-cloud-companion')
  const root = host.shadowRoot
  root.querySelector('link').dispatchEvent(new window.Event('load'))
  return { dom, window, host, root, get: (id) => root.querySelector(`#${id}`) }
}

test('the fifth and tenth mascot clicks reveal the supplied redemption code', () => {
  const app = mount()
  try {
    for (let round = 0; round < 2; round += 1) {
      for (let click = 0; click < 4; click += 1) {
        app.get('character-button').click()
        assert.equal(app.get('reward-panel').hidden, true)
      }
      app.get('character-button').click()
      assert.equal(app.get('reward-panel').hidden, false)
      assert.equal(
        app.root.querySelector('.reward-code code').textContent,
        'caidan'
      )
      app.get('reward-close').click()
    }
  } finally {
    app.dom.window.close()
  }
})

test('mobile size selection persists and the compact entry restores the mascot', () => {
  const app = mount({ mobile: true })
  let saved
  try {
    assert.equal(app.get('widget-size-control').value, '96')
    app.get('companion-size-button').click()
    assert.equal(app.get('size-panel').hidden, false)
    app.get('widget-size-control').value = '80'
    app
      .get('widget-size-control')
      .dispatchEvent(new app.window.Event('input', { bubbles: true }))
    assert.equal(app.get('widget-size-value').value, '80 px')
    app.get('compact-button').click()
    assert.equal(app.get('companion').hidden, true)
    assert.equal(app.get('restore-companion').hidden, false)
    saved = app.window.localStorage.getItem('skymoni:cloud-companion:mobile:v1')
  } finally {
    app.dom.window.close()
  }
  const restored = mount({
    mobile: true,
    saved: { 'skymoni:cloud-companion:mobile:v1': saved },
  })
  try {
    assert.equal(restored.get('companion').hidden, true)
    restored.get('restore-companion').click()
    assert.equal(restored.get('companion').hidden, false)
    assert.equal(restored.get('widget-size-control').value, '80')
  } finally {
    restored.dom.window.close()
  }
})

test('customer service stays open for clicks inside its shadow root and closes outside', () => {
  const app = mount()
  try {
    app.get('support-hint').click()
    assert.equal(app.get('support-panel').hidden, false)
    app.get('copy-support-group').dispatchEvent(
      new app.window.MouseEvent('pointerdown', {
        bubbles: true,
        composed: true,
      })
    )
    assert.equal(app.get('support-panel').hidden, false)
    assert.equal(
      app.root.querySelector('.support-email').getAttribute('href'),
      'mailto:792521914@qq.com'
    )
    app.window.document.querySelector('#page-button').dispatchEvent(
      new app.window.MouseEvent('pointerdown', {
        bubbles: true,
        composed: true,
      })
    )
    assert.equal(app.get('support-panel').hidden, true)
  } finally {
    app.dom.window.close()
  }
})

test('dragging after four clicks does not claim the fifth-click reward', () => {
  const app = mount()
  try {
    for (let click = 0; click < 4; click += 1) {
      app.get('character-button').click()
    }
    for (const [name, coordinate] of [
      ['pointerdown', 200],
      ['pointermove', 240],
      ['pointerup', 240],
    ]) {
      const event = new app.window.MouseEvent(name, {
        bubbles: true,
        composed: true,
        clientX: coordinate,
        clientY: 300,
        button: 0,
      })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        isPrimary: { value: true },
      })
      app.get('character-button').dispatchEvent(event)
    }
    app.get('character-button').click()
    assert.equal(app.get('reward-panel').hidden, true)
  } finally {
    app.dom.window.close()
  }
})

test('the existing appearance preference controls the companion across tabs', () => {
  const app = mount({ saved: { 'skymoni:sky-decorations:v1': 'off' } })
  try {
    assert.equal(app.host.hidden, true)
    app.window.localStorage.setItem('skymoni:sky-decorations:v1', 'on')
    app.window.dispatchEvent(
      new app.window.StorageEvent('storage', {
        key: 'skymoni:sky-decorations:v1',
      })
    )
    assert.equal(app.host.hidden, false)
    app.window.dispatchEvent(
      new app.window.CustomEvent('skymoni:sky-decorations-change', {
        detail: false,
      })
    )
    assert.equal(app.host.hidden, true)
  } finally {
    app.dom.window.close()
  }
})

test('unavailable device storage still permits changing the size and using customer service', () => {
  const app = mount({ mobile: true, storageUnavailable: true })
  try {
    app.get('widget-size-control').value = '72'
    app
      .get('widget-size-control')
      .dispatchEvent(new app.window.Event('input', { bubbles: true }))
    assert.equal(app.get('widget-size-value').value, '72 px')
    app.get('support-hint').click()
    assert.equal(app.get('support-panel').hidden, false)
  } finally {
    app.dom.window.close()
  }
})

test('loading the entry twice mounts one companion and one click counter', () => {
  const app = mount()
  try {
    app.window.eval(source)
    assert.equal(
      app.window.document.querySelectorAll('#skymoni-cloud-companion').length,
      1
    )
    for (let click = 0; click < 4; click += 1) {
      app.get('character-button').click()
    }
    assert.equal(app.get('reward-panel').hidden, true)
  } finally {
    app.dom.window.close()
  }
})
