import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { defaultPolicy, saleInputMatches, type Sale } from './api'
import {
  beijingInput,
  parseBeijingInput,
  publicationState,
  SalePublication,
} from './publication'
afterEach(cleanup)
const now = 1791734400
const sale: Sale = {
  id: 'a'.repeat(32),
  title: '七天降价',
  status: 'draft',
  start_at: now + 3600,
  end_at: now + 7 * 86400,
  revision: 1,
  message: '',
  config: {
    models: ['test'],
    policy: defaultPolicy,
    countdown_mode: 'end',
    discount_percent: 5,
  },
  announcement_managed: true,
  announcement_enabled: true,
  announcement_at: now + 300,
}
it('uses Beijing time independent of the browser timezone', () => {
  expect(parseBeijingInput(beijingInput(now))).toBe(now)
  expect(parseBeijingInput('2026-10-12T12:00')).toBe(
    Date.parse('2026-10-12T04:00:00Z') / 1000
  )
})
it('separates the saved publication gate from actual pricing activation', () => {
  expect(publicationState(sale, now)).toBe('scheduled')
  expect(publicationState(sale, now + 300)).toBe('published')
  expect(
    publicationState({ ...sale, announcement_enabled: false }, now + 300)
  ).toBe('unpublished')
  expect(publicationState(sale, sale.end_at)).toBe('ended')
})
it('publishes the chosen timestamp and cancels without calling pricing controls', () => {
  const publish = vi.fn(),
    cancel = vi.fn()
  render(
    <SalePublication
      sale={sale}
      serverTime={now}
      busy={false}
      dirty={false}
      onPublish={publish}
      onCancel={cancel}
    />
  )
  fireEvent.change(screen.getByLabelText('公告发布时间 · 北京时间'), {
    target: { value: beijingInput(now + 600) },
  })
  fireEvent.click(screen.getByRole('button', { name: '更新发布计划' }))
  expect(publish).toHaveBeenCalledWith(now + 600)
  fireEvent.click(screen.getByRole('button', { name: '取消公告' }))
  expect(cancel).toHaveBeenCalledOnce()
  expect(screen.getByText('实际降价未启用 · 当前价格未变')).toBeVisible()
})
it('requires a saved and unchanged template', () => {
  render(
    <SalePublication
      sale={sale}
      serverTime={now}
      busy={false}
      dirty={true}
      onPublish={vi.fn()}
      onCancel={vi.fn()}
    />
  )
  expect(screen.getByRole('button', { name: '更新发布计划' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '立即发布' })).toBeDisabled()
})

it('accepts omitted empty maps and rejects actual unsaved price edits', () => {
  const input = {
    title: sale.title,
    start_at: sale.start_at,
    end_at: sale.end_at,
    revision: sale.revision,
    config: { ...sale.config, request_prices_cny: {}, model_multipliers: {} },
  }
  expect(saleInputMatches(sale, input)).toBe(true)
  expect(saleInputMatches(sale, { ...input, title: 'changed title' })).toBe(
    false
  )
  expect(
    saleInputMatches(sale, {
      ...input,
      config: { ...input.config, model_multipliers: { test: 0.14 } },
    })
  ).toBe(false)
})
