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

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Download,
  MonitorDown,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { BenefitCover } from '@/features/benefits/components/benefit-cover'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  getProductPackages,
  packageStock,
  productForPackage,
} from '../lib/catalog'
import type { ShopData, ShopOrder, ShopProduct } from '../types'
import { Credit } from './credit'
import { ProductDescription } from './product-description'
import { ProductImages } from './product-images'

export function ProductDialog(props: {
  live?: boolean
  guest?: boolean
  product: ShopProduct
  data: ShopData
  onClose: () => void
  onBuy: (packageId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const packages = getProductPackages(props.product)
  const [packageId, setPackageId] = useState(
    packages.find(
      (pack) => packageStock(props.data, props.product, pack.id) > 0
    )?.id || 'default'
  )
  const selection = productForPackage(props.product, packageId) || props.product
  const selectedPackage = packages.find((pack) => pack.id === packageId)
  const stock = packageStock(props.data, props.product, packageId)
  let purchaseLabel = t('Temporarily sold out')
  if (stock > 0) {
    purchaseLabel = props.guest
      ? t('Sign in to buy')
      : t('Buy with wallet credit')
  }
  const downloadAttribute = props.product.attributes?.find(
    (attribute) => attribute.label === 'Windows 下载'
  )
  const validityAttribute = props.product.attributes?.find(
    (attribute) => attribute.label === '使用期限'
  )
  const downloadUrl = downloadAttribute?.value.startsWith('https://')
    ? downloadAttribute.value
    : undefined
  let validityText = validityAttribute?.value
  if (!validityText) {
    validityText =
      selection.benefit.validityDays === 0
        ? t('No expiry')
        : t('{{days}} days after delivery', {
            days: formatNumber(selection.benefit.validityDays, locale),
          })
  }
  const otherAttributes = (props.product.attributes || []).filter(
    (attribute) =>
      attribute !== downloadAttribute && attribute !== validityAttribute
  )
  let packageGridClass = 'grid-cols-1'
  if (packages.length > 2) packageGridClass = 'grid-cols-3'
  else if (packages.length === 2) packageGridClass = 'grid-cols-2'
  return (
    <Dialog
      open
      title={
        <span className='block pr-8'>
          <span className='mb-2 block text-xs font-medium text-sky-700 dark:text-sky-300'>
            {props.product.categoryLabel}
          </span>
          <span className='block text-xl font-semibold sm:text-2xl'>
            {props.product.benefit.name}
          </span>
        </span>
      }
      description={props.product.benefit.summary}
      contentClassName='gap-0 p-0 sm:max-w-[min(1160px,calc(100vw-2rem))] sm:p-0'
      headerClassName='border-b px-5 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-6'
      descriptionClassName='max-w-2xl leading-6'
      bodyClassName='!p-0'
      footerClassName='!mx-0 !mb-0 !flex-row !items-center !justify-between !rounded-none !bg-background px-5 py-3 sm:px-8 sm:py-4'
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <>
          <div className='min-w-0'>
            <p className='text-muted-foreground truncate text-xs'>
              {selectedPackage ? t(selectedPackage.name) : t('Choose package')}
            </p>
            <Credit
              cents={selection.priceCents}
              className='text-lg font-semibold sm:text-xl'
            />
          </div>
          <Button
            className='h-11 shrink-0 rounded-md bg-sky-600 px-5 text-white hover:bg-sky-700'
            disabled={stock === 0}
            onClick={() => props.onBuy(packageId)}
          >
            {purchaseLabel}
            <ArrowUpRight className='ml-1 size-4' aria-hidden />
          </Button>
        </>
      }
    >
      <div className='grid min-w-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,1fr)]'>
        <section className='min-w-0 space-y-5 px-5 py-5 sm:px-7 sm:py-6'>
          {downloadUrl && (
            <Button
              role='link'
              variant='outline'
              size='lg'
              className='h-12 w-full justify-between rounded-md border-slate-300 bg-slate-900 px-4 text-white hover:bg-slate-800 hover:text-white dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100 dark:hover:bg-sky-500/25'
              render={
                <a
                  href={downloadUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              <span className='flex items-center gap-2'>
                <Download className='size-4' aria-hidden />
                {t('Download')} · Windows
              </span>
              <ArrowUpRight className='size-4' aria-hidden />
            </Button>
          )}
          <ProductImages
            enabled={props.product.imagesEnabled}
            imageLayout={props.product.imageLayout}
            images={props.product.images}
            name={props.product.benefit.name}
            showcase={Boolean(downloadUrl)}
          />
          <div
            className={cn(
              'space-y-4',
              ((props.product.imagesEnabled && props.product.images?.length) ||
                downloadUrl) &&
                'border-t pt-4'
            )}
          >
            <h3 className='text-lg font-semibold'>{t('Product details')}</h3>
            <ProductDescription
              content={props.product.content || props.product.benefit.summary}
              mode={props.product.contentFormat || props.product.benefit.format}
            />
          </div>
        </section>
        <aside className='site-glass-inset min-w-0 border-t bg-slate-50/80 px-5 py-6 sm:px-8 lg:border-t-0 lg:border-l lg:py-8 dark:bg-slate-900/50'>
          <div className='lg:sticky lg:top-0'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground text-xs font-medium'>
                {t('Price per item')}
              </span>
              {downloadUrl ? (
                <span className='flex size-11 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'>
                  <MonitorDown className='size-5' aria-hidden />
                </span>
              ) : (
                <BenefitCover benefit={props.product.benefit} compact />
              )}
            </div>
            <Credit
              cents={selection.priceCents}
              className='mt-2 text-4xl font-semibold text-slate-950 dark:text-white'
            />
            <fieldset className='mt-7 min-w-0'>
              <legend className='mb-3 text-sm font-semibold'>
                {t('Choose package')}
              </legend>
              <div className={cn('grid gap-2', packageGridClass)}>
                {packages.map((pack) => {
                  const available =
                    packageStock(props.data, props.product, pack.id) > 0
                  return (
                    <label
                      key={pack.id}
                      className={`focus-within:ring-ring relative flex min-h-19 min-w-0 cursor-pointer flex-col justify-between rounded-md border px-3 py-2.5 transition-colors focus-within:ring-2 ${
                        packageId === pack.id
                          ? 'border-sky-600 bg-sky-50 text-sky-950 dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-100'
                          : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950/60'
                      } ${!available ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                      <input
                        type='radio'
                        name='shop-choose-package'
                        value={pack.id}
                        checked={packageId === pack.id}
                        disabled={!available}
                        onChange={() => setPackageId(pack.id)}
                        className='sr-only'
                      />
                      <span className='text-sm leading-tight font-semibold break-words'>
                        {t(pack.name)}
                      </span>
                      <Credit
                        cents={pack.priceCents}
                        className='mt-2 text-xs font-medium [&_span:last-child]:hidden'
                      />
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <dl className='mt-7 space-y-0 border-y text-sm'>
              <div className='flex items-center justify-between gap-4 py-3'>
                <dt className='text-muted-foreground flex items-center gap-2'>
                  <PackageCheck
                    className='size-4 text-emerald-600'
                    aria-hidden
                  />
                  {t('Delivery mode')}
                </dt>
                <dd className='font-medium'>
                  {selection.delivery === 'instant'
                    ? t('Instant delivery')
                    : t('Manual delivery')}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-4 border-t py-3'>
                <dt className='text-muted-foreground flex items-center gap-2'>
                  <Clock3 className='size-4 text-amber-600' aria-hidden />
                  {t('Validity')}
                </dt>
                <dd className='text-right font-medium'>{validityText}</dd>
              </div>
              {otherAttributes.map((attribute) => (
                <div
                  key={`${attribute.label}:${attribute.value}`}
                  className='flex items-center justify-between gap-4 border-t py-3'
                >
                  <dt className='text-muted-foreground flex items-center gap-2'>
                    <ShieldCheck className='size-4 text-sky-600' aria-hidden />
                    {attribute.label}
                  </dt>
                  <dd className='max-w-[55%] text-right font-medium break-words'>
                    {attribute.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className='text-muted-foreground mt-5 flex items-start gap-2 text-xs leading-5'>
              <Sparkles
                className='mt-0.5 size-3.5 shrink-0 text-sky-600'
                aria-hidden
              />
              {props.live
                ? t(
                    'Review the product terms and delivery mode before purchasing.'
                  )
                : t(
                    'This preview uses fictional accounts. Actual product terms will be set by the administrator.'
                  )}
            </p>
          </div>
        </aside>
      </div>
    </Dialog>
  )
}

export function CheckoutDialog(props: {
  product: ShopProduct
  balanceCents: number
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const insufficient = props.balanceCents < props.product.priceCents
  const [paying, setPaying] = useState(false)
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false)
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open && !paying) props.onClose()
      }}
      title={t('Confirm your purchase')}
      desc={t('Check the product and wallet deduction before continuing.')}
      confirmText={t('Confirm payment')}
      disabled={insufficient || !refundPolicyAccepted}
      isLoading={paying}
      handleConfirm={async () => {
        if (paying || insufficient || !refundPolicyAccepted) return
        setPaying(true)
        try {
          await props.onConfirm()
        } finally {
          setPaying(false)
        }
      }}
    >
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <BenefitCover benefit={props.product.benefit} compact />
          <div>
            <p className='font-medium'>{props.product.benefit.name}</p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Quantity: 1')}
            </p>
          </div>
        </div>
        <dl className='site-glass-inset space-y-3 rounded-xl border bg-slate-50/50 p-4 text-sm dark:bg-slate-900'>
          <div className='flex justify-between gap-2'>
            <dt>{t('Current balance')}</dt>
            <dd>
              <Credit cents={props.balanceCents} />
            </dd>
          </div>
          <div className='flex justify-between gap-2'>
            <dt>{t('Wallet deduction')}</dt>
            <dd className='font-semibold'>
              <Credit cents={props.product.priceCents} />
            </dd>
          </div>
          <div className='flex justify-between gap-2 border-t pt-3'>
            <dt>{t('Balance after purchase')}</dt>
            <dd>
              {insufficient ? (
                t('Insufficient balance')
              ) : (
                <Credit cents={props.balanceCents - props.product.priceCents} />
              )}
            </dd>
          </div>
        </dl>
        {insufficient && (
          <p role='alert' className='text-sm text-red-600'>
            {t('Not enough wallet credit')}
          </p>
        )}
        <p className='text-muted-foreground flex items-start gap-2 text-xs leading-5'>
          {props.product.delivery === 'instant' ? (
            <PackageCheck className='mt-0.5 size-4 shrink-0' />
          ) : (
            <Clock3 className='mt-0.5 size-4 shrink-0' />
          )}
          {props.product.delivery === 'instant'
            ? t('Account details will appear in My warehouse after payment.')
            : t(
                'The order will wait for administrator delivery after payment.'
              )}
        </p>
        <Alert className='border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'>
          <AlertTitle className='text-amber-900 dark:text-amber-200'>
            {t('Purchase notice')}
          </AlertTitle>
          <AlertDescription className='text-amber-900/90 dark:text-amber-200/90'>
            {t(
              'There is no online self-service refund option. Please review the product and delivery details before paying. For delivery, account, or payment issues, contact customer support. Applicable legal rights remain unaffected.'
            )}
          </AlertDescription>
        </Alert>
        <FieldGroup>
          <Field orientation='horizontal' data-disabled={paying}>
            <Checkbox
              id='shop-refund-policy'
              checked={refundPolicyAccepted}
              disabled={paying}
              onCheckedChange={setRefundPolicyAccepted}
            />
            <FieldLabel
              htmlFor='shop-refund-policy'
              className='text-sm leading-5 font-normal'
            >
              {t(
                'I understand there is no online self-service refund option and will contact customer support about issues.'
              )}
            </FieldLabel>
          </Field>
        </FieldGroup>
      </div>
    </ConfirmDialog>
  )
}

export function PurchaseSuccess(props: {
  order: ShopOrder
  onClose: () => void
  onOrders: () => void
  onView: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      title={t('Purchase complete')}
      description={t('Your order has been saved.')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Continue shopping')}
          </Button>
          <Button
            onClick={
              props.order.status === 'delivered' ? props.onView : props.onOrders
            }
          >
            {props.order.status === 'delivered'
              ? t('View delivery')
              : t('View order')}
          </Button>
        </>
      }
    >
      <div className='space-y-4 py-2 text-center'>
        <CheckCircle2 className='mx-auto size-12 text-emerald-500' />
        <h3 className='text-lg font-semibold'>{props.order.name}</h3>
        <p className='text-muted-foreground text-sm'>
          {props.order.status === 'delivered'
            ? t('Delivered to My warehouse')
            : t('Paid · awaiting manual delivery')}
        </p>
        <p className='text-muted-foreground font-mono text-xs'>
          {props.order.id}
        </p>
        <Credit
          cents={props.order.priceCents}
          className='text-xl font-semibold'
        />
      </div>
    </Dialog>
  )
}
