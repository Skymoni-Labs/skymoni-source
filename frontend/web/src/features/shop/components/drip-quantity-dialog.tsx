import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getProductPackages } from '@/features/shop-preview/lib/catalog'
import type { ShopProduct } from '@/features/shop-preview/types'
import { handleServerError } from '@/lib/handle-server-error'

export function DripQuantityDialog(props: {
  product: ShopProduct
  onClose: () => void
  onSave: (remaining: Record<string, number>) => Promise<void>
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      getProductPackages(props.product).map((pack) => [
        pack.id,
        String(props.product.stockByPackage?.[pack.id] ?? 0),
      ])
    )
  )
  const [saving, setSaving] = useState(false)
  const packages = getProductPackages(props.product)
  const remaining = Object.fromEntries(
    packages.map((pack) => [pack.id, Number(values[pack.id])])
  )
  const valid = packages.every((pack) => {
    const value = values[pack.id]
    return /^\d+$/.test(value ?? '') && remaining[pack.id] <= 1_000_000
  })
  let saveLabel = t('Save quantities')
  if (!props.product.generatedSales) saveLabel = t('Enable order-time creation')
  if (saving) saveLabel = t('Saving...')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) props.onClose()
      }}
      title={t('Drip sale quantities')}
      description={t('Set remaining sale quantities for each Drip package.')}
      footer={
        <>
          <Button variant='outline' disabled={saving} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!valid || saving}
            onClick={() => {
              setSaving(true)
              void props
                .onSave(remaining)
                .catch(handleServerError)
                .finally(() => setSaving(false))
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Each purchase uses one sale slot and creates its own voucher. A successful refund returns one slot. Existing orders remain available.'
          )}
        </p>
        {packages.map((pack) => (
          <div key={pack.id} className='space-y-2'>
            <Label htmlFor={`drip-quantity-${pack.id}`}>{pack.name}</Label>
            <Input
              id={`drip-quantity-${pack.id}`}
              type='number'
              min={0}
              max={1_000_000}
              step={1}
              value={values[pack.id] ?? ''}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [pack.id]: event.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
    </Dialog>
  )
}
