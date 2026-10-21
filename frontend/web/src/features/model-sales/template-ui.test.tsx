import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { defaultPolicy, type Sale, type SaleInput } from './api'
import { ModelSales } from './index'

const calls = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  change: vi.fn(),
  publish: vi.fn(),
  mail: vi.fn(),
}))
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  listSales: calls.list,
  saveSale: calls.save,
  changeSale: calls.change,
  publishSale: calls.publish,
  createSaleMailDraft: calls.mail,
  quoteSales: vi.fn(async () => ({ quotes: [], server_time: 1791770400 })),
}))
vi.mock('@/features/admin-mail/api', () => ({
  listMail: vi.fn(async () => ({ items: [] })),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const now = 1791770400
function mount() {
  const original: Sale = {
    id: 'a'.repeat(32),
    title: '七天降价',
    status: 'active',
    revision: 2,
    start_at: now - 600,
    end_at: now - 600 + 7 * 86400,
    message: '',
    announcement_enabled: true,
    config: {
      models: ['gpt-token'],
      pricing_basis: 'official',
      model_multipliers: { 'gpt-token': 0.14 },
      discount_percent: 0,
      policy: defaultPolicy,
      countdown_mode: 'end',
    },
  }
  let items = [original]
  calls.list.mockImplementation(async () => ({
    items,
    server_time: now,
    default_policy: defaultPolicy,
  }))
  calls.save.mockImplementation(async (input: SaleInput) => {
    const draft: Sale = {
      ...input,
      id: 'b'.repeat(32),
      status: 'draft',
      revision: 1,
      message: '模板未启用',
      announcement_enabled: false,
    }
    items = [draft, original]
    return draft
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelSales />
    </QueryClientProvider>
  )
  return { original, client }
}
it('copies a live activity through the create API and does not enable, publish or send it', async () => {
  const { original, client } = mount()
  fireEvent.click(await screen.findByRole('button', { name: /^复用模板$/ }))
  await waitFor(() => expect(calls.save).toHaveBeenCalledOnce())
  expect(calls.save).toHaveBeenCalledWith(
    expect.objectContaining({
      revision: 0,
      start_at: now + 300,
      end_at: now + 300 + 7 * 86400,
      config: original.config,
    })
  )
  await screen.findByRole('button', { name: '启用定时降价' })
  expect(calls.change).not.toHaveBeenCalled()
  expect(calls.publish).not.toHaveBeenCalled()
  expect(calls.mail).not.toHaveBeenCalled()
  expect(original.status).toBe('active')
  expect(original.revision).toBe(2)
  client.clear()
})
