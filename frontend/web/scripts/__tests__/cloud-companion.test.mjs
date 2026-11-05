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
    configurable: true,
  })
  window.matchMedia = (media) => {
    const query = new window.EventTarget()
    query.matches = media.includes('760px') && Boolean(options.mobile)
    return query
  }
  window.SVGElement.prototype.beginElement = () => {}
  window.SVGElement.prototype.endElement = () => {}
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.TextDecoder = TextDecoder
  if (options.fetch) window.fetch = options.fetch
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const reply = (data, ok = true) => ({ ok, json: async () => data })

test('streaming text appears before completion, then renders the final links', async () => {
  let controller
  const body = new ReadableStream({
    start(value) {
      controller = value
    },
  })
  const app = mount({
    fetch: async (url) =>
      url.endsWith('/status')
        ? reply({ ready: true, remaining: 20 })
        : { ok: true, headers: { get: () => 'text/event-stream' }, body },
  })
  const send = (kind, data) => {
    const bytes = new TextEncoder().encode(
      `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`
    )
    controller.enqueue(bytes.slice(0, bytes.length - 4))
    controller.enqueue(bytes.slice(bytes.length - 4))
  }
  try {
    app.get('chat-input').value = '怎么接入？'
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    await settle()
    send('delta', { text: '第一步，打开密钥页' })
    await settle()
    assert.equal(
      app.root.querySelector('.is-streaming .chat-message-body').textContent,
      '第一步，打开密钥页'
    )
    assert.equal(app.get('chat-send').disabled, true)
    assert.equal(app.root.querySelector('#chat-privacy'), null)
    send('delta', { text: '第一步，打开密钥页。然后创建。' })
    send('done', { answer: '打开[密钥](/keys)', remaining: 19 })
    await settle()
    assert.equal(app.root.querySelector('.is-streaming'), null)
    assert.equal(
      app.root.querySelector('.chat-message:last-child a').href,
      'https://skymoni.com/keys'
    )
    assert.equal(app.get('chat-send').disabled, false)
  } finally {
    app.dom.window.close()
  }
})

test('an interrupted stream retains the request id and replaces partial text on retry', async () => {
  const requests = []
  const app = mount({
    fetch: async (url, options) => {
      if (url.endsWith('/status')) return reply({ ready: true, remaining: 20 })
      requests.push(JSON.parse(options.body))
      if (requests.length > 1) {
        return reply({ answer: '完整回答', remaining: 19 })
      }
      return {
        ok: true,
        headers: { get: () => 'text/event-stream' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: delta\ndata: {"text":"部分回答"}\n\n'
              )
            )
            controller.close()
          },
        }),
      }
    },
  })
  try {
    app.get('chat-input').value = '怎么使用？'
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(app.get('chat-retry-row').hidden, false)
    assert.ok(
      app.root
        .querySelector('.chat-message:last-child')
        .textContent.includes('回复未完成')
    )
    app.get('chat-retry').click()
    await settle()
    assert.equal(requests[0].request_id, requests[1].request_id)
    assert.equal(app.root.querySelectorAll('.chat-message-user').length, 1)
    assert.ok(!app.get('chat-transcript').textContent.includes('部分回答'))
    assert.ok(app.get('chat-transcript').textContent.includes('完整回答'))
  } finally {
    app.dom.window.close()
  }
})

test('chat sends redacted messages and follow-ups with safe document links', async () => {
  const requests = []
  const app = mount({
    fetch: async (url, options) => {
      if (url.endsWith('/status')) return reply({ ready: true, remaining: 20 })
      requests.push(JSON.parse(options.body))
      return reply({
        answer:
          '打开[密钥](/keys)。[外链](https://evil.example) <img src=x onerror=alert(1)>',
        remaining: 19,
        sources: [
          { title: '教程', url: '/docs?doc=start&edit=false' },
          { title: '不安全', url: 'https://user:pass@skymoni.com/keys' },
        ],
      })
    },
  })
  try {
    app.get('support-hint').click()
    app.get('chat-input').value =
      '怎么使用 sk-0123456789abcdef test@example.com'
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(requests.length, 1)
    assert.ok(!requests[0].message.includes('sk-0123'))
    assert.ok(!requests[0].message.includes('test@example.com'))
    assert.equal(app.root.querySelector('.chat-message-body img'), null)
    const links = [...app.root.querySelectorAll('.chat-message a')]
    assert.equal(links.length, 2)
    assert.ok(
      links.every(
        (link) => link.origin === 'https://skymoni.com' && !link.username
      )
    )
    app.get('chat-input').value = '下一步呢'
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(requests[1].history.length, 2)
    app.get('chat-new').click()
    assert.equal(app.root.querySelectorAll('.chat-message').length, 1)
    assert.equal(app.get('chat-input').value, '')
  } finally {
    app.dom.window.close()
  }
})

test('chat retry preserves the request id after an uncertain network result', async () => {
  const requests = []
  const app = mount({
    fetch: async (url, options) => {
      if (url.endsWith('/status')) return reply({ ready: true, remaining: 20 })
      requests.push(JSON.parse(options.body))
      if (requests.length === 1) throw new TypeError('Network error')
      return reply({ answer: '已完成', remaining: 19 })
    },
  })
  try {
    app.get('chat-input').value = '怎么接入'
    app
      .get('chat-form')
      .dispatchEvent(new app.window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(app.get('chat-retry-row').hidden, false)
    app.get('chat-retry').click()
    await settle()
    assert.equal(requests[0].request_id, requests[1].request_id)
    assert.equal(app.root.querySelectorAll('.chat-message-user').length, 1)
    assert.equal(app.get('chat-retry-row').hidden, true)
  } finally {
    app.dom.window.close()
  }
})

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

function dragRestore(app, pointerType, destination, endEvent = 'pointerup') {
  const button = app.get('restore-companion')
  button.getBoundingClientRect = () => ({
    left: Number.parseFloat(button.style.left) || 200,
    top: Number.parseFloat(button.style.top) || 600,
    width: 48,
    height: 48,
  })
  for (const [name, point] of [
    ['pointerdown', [220, 620]],
    ['pointermove', destination],
    [endEvent, destination],
  ]) {
    const event = new app.window.MouseEvent(name, {
      bubbles: true,
      composed: true,
      clientX: point[0],
      clientY: point[1],
      button: 0,
    })
    Object.defineProperties(event, {
      pointerId: { value: 2 },
      isPrimary: { value: true },
      pointerType: { value: pointerType },
    })
    button.dispatchEvent(event)
  }
}

test('mouse and touch can move the restore entry without opening the mascot or counting a reward click', async () => {
  for (const pointerType of ['mouse', 'touch']) {
    const app = mount({ mobile: pointerType === 'touch' })
    let saved
    try {
      assert.equal(app.get('companion-close'), null)
      app
        .get('character-button')
        .dispatchEvent(
          new app.window.KeyboardEvent('keydown', { key: 'Escape' })
        )
      assert.equal(app.get('restore-companion').hidden, false)
      dragRestore(app, pointerType, [120, 320])
      app.get('restore-companion').click()
      assert.equal(app.get('companion').hidden, true)
      assert.equal(app.get('restore-companion').style.left, '100px')
      assert.equal(app.get('restore-companion').style.top, '300px')
      const layout = pointerType === 'touch' ? 'mobile' : 'desktop'
      saved = app.window.localStorage.getItem(
        `skymoni:cloud-companion:${layout}:v1`
      )
      assert.deepEqual(JSON.parse(saved).restorePosition, {
        left: 100,
        top: 300,
      })
      await new Promise((resolve) => app.window.setTimeout(resolve, 0))
      app.get('restore-companion').click()
      assert.equal(app.get('companion').hidden, false)
      for (let click = 0; click < 4; click += 1) {
        app.get('character-button').click()
      }
      assert.equal(app.get('reward-panel').hidden, true)
    } finally {
      app.dom.window.close()
    }
    const layout = pointerType === 'touch' ? 'mobile' : 'desktop'
    const restored = mount({
      mobile: pointerType === 'touch',
      saved: { [`skymoni:cloud-companion:${layout}:v1`]: saved },
    })
    try {
      restored
        .get('character-button')
        .dispatchEvent(
          new restored.window.KeyboardEvent('keydown', { key: 'Escape' })
        )
      assert.equal(restored.get('restore-companion').style.left, '100px')
      assert.equal(restored.get('restore-companion').style.top, '300px')
    } finally {
      restored.dom.window.close()
    }
  }
})

test('compact entry movement remains within the viewport after cancellation and resize', () => {
  const app = mount({ mobile: true })
  try {
    app.get('compact-button').click()
    dragRestore(app, 'touch', [900, -500], 'pointercancel')
    assert.equal(app.get('companion').hidden, true)
    assert.equal(app.get('restore-companion').style.left, '315px')
    assert.equal(app.get('restore-companion').style.top, '12px')
    Object.defineProperty(app.window.document.documentElement, 'clientWidth', {
      value: 280,
    })
    app.window.dispatchEvent(new app.window.Event('resize'))
    assert.equal(app.get('restore-companion').style.left, '220px')
    app
      .get('restore-companion')
      .dispatchEvent(
        new app.window.KeyboardEvent('keydown', { key: 'ArrowDown' })
      )
    assert.equal(app.get('restore-companion').style.top, '32px')
  } finally {
    app.dom.window.close()
  }
})
