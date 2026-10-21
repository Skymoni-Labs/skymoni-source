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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { getProductPackages, packageStock } from '../lib/catalog'
import type { ShopData, ShopProduct } from '../types'

export function StockDialog(props: {
  product: ShopProduct
  data: ShopData
  onClose: () => void
  onAdd: (packageId: string, count: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [packageId, setPackageId] = useState('default')
  const [count, setCount] = useState('5')
  const valid =
    /^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= 100
  return (
    <Dialog
      open
      title={t('Add sample stock')}
      description={props.product.benefit.name}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => props.onAdd(packageId, Number(count))}
          >
            {t('Generate sample stock')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='stock-package'>{t('Choose package')}</Label>
          <NativeSelect
            id='stock-package'
            value={packageId}
            className='w-full'
            onChange={(e) => setPackageId(e.target.value)}
          >
            {getProductPackages(props.product).map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='stock-count'>{t('Sample inventory count')}</Label>
          <Input
            id='stock-count'
            inputMode='numeric'
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t('Enter an integer from 1 to 100.')}
          </p>
        </div>
        <p className='text-xs'>
          {t('{{stock}} available', {
            stock: formatNumber(
              packageStock(props.data, props.product, packageId),
              locale
            ),
          })}
        </p>
        <p className='text-muted-foreground text-xs leading-5'>
          {t(
            'Stock import uses fictional sample data here. Production will support encrypted account inventory and batch import.'
          )}
        </p>
      </div>
    </Dialog>
  )
}
