import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getShopRefundQuote } from '../../api'
import { ShopRefundDialog } from '../refund-dialog'

vi.mock('../../api', () => ({ getShopRefundQuote: vi.fn() }))

const order = {
  id: '901',
  name: 'Drip',
  status: 'delivered',
  priceCents: 20000,
} as Parameters<typeof ShopRefundDialog>[0]['order']

const quote = vi.mocked(getShopRefundQuote)
afterEach(() => quote.mockReset())

function view(onRefund = vi.fn(async () => {})) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ShopRefundDialog order={order} onClose={onClose} onRefund={onRefund} />
    </QueryClientProvider>
  )
  return { onRefund, onClose }
}

describe('ShopRefundDialog', () => {
  it('blocks confirmation until the live quote arrives and a reason is entered', async () => {
    let resolveQuote!: (value: Awaited<ReturnType<typeof getShopRefundQuote>>) => void
    quote.mockReturnValue(new Promise((resolve) => { resolveQuote = resolve }))
    const { onRefund } = view()
    const confirm = screen.getByRole('button', { name: 'Confirm refund' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Checking refundable balance...')).toBeInTheDocument()
    resolveQuote({ refundCents: 5000, refundQuota: 125000, priceCents: 20000 })
    await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument())
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Refund reason' }), {
      target: { value: 'Customer request' },
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(onRefund).toHaveBeenCalledWith('Customer request'))
  })

  it('keeps confirmation disabled when the refund quote fails', async () => {
    quote.mockRejectedValue(new Error('upstream unavailable'))
    view()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm refund' })).toBeDisabled())
    expect(quote).toHaveBeenCalledWith('901', expect.any(AbortSignal))
  })
})
