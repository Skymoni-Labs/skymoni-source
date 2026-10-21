import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Credit } from '@/features/shop-preview/components/credit'
import type { ShopOrder } from '@/features/shop-preview/types'
import { handleServerError } from '@/lib/handle-server-error'

import { getShopRefundQuote } from '../api'

export function ShopRefundDialog(props: {
  order: ShopOrder
  onClose: () => void
  onRefund: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [settling, setSettling] = useState(false)
  const quote = useQuery({
    queryKey: ['shop', 'refund-quote', props.order.id],
    gcTime: 0,
    queryFn: ({ signal }) => getShopRefundQuote(props.order.id, signal),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !settling) props.onClose()
      }}
      title={t('Order credit refund')}
      description={`${t('Order')} #${props.order.id} · ${props.order.name}`}
      footer={
        <>
          <Button variant='outline' disabled={settling} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={settling || reason.trim().length < 2 || !quote.data}
            onClick={() => {
              setSettling(true)
              void props
                .onRefund(reason.trim())
                .catch(handleServerError)
                .finally(() => setSettling(false))
            }}
          >
            {settling ? t('Processing...') : t('Confirm refund')}
          </Button>
        </>
      }
    >
      <div className='space-y-4 text-sm'>
        <div className='flex justify-between border-b pb-3'>
          <span>{t('Refund to customer')}</span>
          <Credit
            cents={quote.data?.refundCents ?? 0}
            className='font-semibold'
          />
        </div>
        {quote.isPending && <p>{t('Checking refundable balance...')}</p>}
        {quote.isError && <ErrorState onRetry={() => void quote.refetch()} />}
        <p className='text-muted-foreground'>
          {props.order.status === 'pending' &&
            props.order.productId === '3' &&
            t('The Drip sale slot returns after a successful refund.')}
          {props.order.status === 'pending' &&
            props.order.productId !== '3' &&
            t(
              'The reserved stock will return to inventory and the full credit will be refunded.'
            )}
          {props.order.status !== 'pending' &&
            t(
              'Used Drip orders are refunded in site credit based on remaining traffic and time. The final amount is recalculated when you confirm; other active orders remain available.'
            )}
        </p>
        <div className='space-y-2'>
          <Label htmlFor='shop-refund-reason'>{t('Refund reason')}</Label>
          <Textarea
            id='shop-refund-reason'
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t(
              'Enter the customer request and verification result'
            )}
          />
        </div>
      </div>
    </Dialog>
  )
}
