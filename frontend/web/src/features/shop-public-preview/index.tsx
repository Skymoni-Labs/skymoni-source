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
import { ArrowLeft, ArrowRight, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { PublicHeader } from '@/components/layout/components/public-header'
import { Button } from '@/components/ui/button'
import { PreviewHeader } from '@/features/home-preview/header'
import { ProductDialog } from '@/features/shop-preview/components/checkout'
import { Store } from '@/features/shop-preview/components/store'
import type { ShopData, ShopProduct } from '@/features/shop-preview/types'

import { publicPreviewData } from './catalog'

export function PublicStorePreview(props: {
  data?: ShopData
  production?: boolean
}) {
  const { t } = useTranslation()
  const data = props.data || publicPreviewData
  useEffect(() => {
    if (!props.production) document.title = 'skymoni · 商城预览 | New API'
  }, [props.production])
  const [product, setProduct] = useState<ShopProduct | null>(
    () =>
      data.products.find(
        (item) =>
          `#${item.id}` === window.location.hash ||
          (window.location.hash === '#drip' &&
            item.benefit.name.toLowerCase().includes('drip'))
      ) || null
  )
  const [loginTarget, setLoginTarget] = useState<string | null>(null)

  return (
    <>
      {props.production ? <PublicHeader /> : <PreviewHeader />}
      <main className='site-cosmos-shell bg-background text-foreground min-h-screen px-5 pt-24 pb-12 sm:px-7 sm:pt-28'>
        <div className='mx-auto max-w-6xl'>
          <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
            <Button variant='ghost' size='sm' render={<a href='/' />}>
              <ArrowLeft className='size-4' aria-hidden />
              {t('Back to home')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setLoginTarget('/store/orders')}
            >
              {t('Sign in to view orders')}
              <ArrowRight className='size-3.5' aria-hidden />
            </Button>
          </div>
          <Store
            live
            guest
            data={data}
            onSelect={setProduct}
            onOrders={() => setLoginTarget('/store/orders')}
            onLogin={() => setLoginTarget('/store')}
          />
          {!props.production && (
            <p className='text-muted-foreground mt-8 border-t pt-5 text-center text-xs leading-6'>
              {t(
                'Local storefront preview. Product information is copied from the current store; purchases continue on the existing site.'
              )}
            </p>
          )}
          <div className='text-muted-foreground mt-4 text-center text-xs'>
            <a
              href='/open-source.html'
              target='_blank'
              rel='noopener noreferrer'
            >
              New API · QuantumNous
            </a>
          </div>
        </div>
      </main>
      {product && (
        <ProductDialog
          live
          guest
          product={product}
          data={data}
          onClose={() => setProduct(null)}
          onBuy={() => {
            setProduct(null)
            setLoginTarget('/store')
          }}
        />
      )}
      <Dialog
        open={loginTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLoginTarget(null)
        }}
        title={t('Sign in to continue')}
        description={t(
          'Use your site credit to purchase. Your order and delivery details will be saved in your account.'
        )}
        footer={
          <>
            <Button variant='outline' onClick={() => setLoginTarget(null)}>
              {t('Keep browsing')}
            </Button>
            <Button
              role='link'
              render={
                <a
                  href={`${props.production ? '' : 'https://skymoni.com'}/sign-in?redirect=${encodeURIComponent(loginTarget || '/store')}`}
                  target={props.production ? undefined : '_blank'}
                  rel={props.production ? undefined : 'noopener noreferrer'}
                />
              }
            >
              <LogIn className='size-4' aria-hidden />
              {t('Go to sign in')}
            </Button>
          </>
        }
      >
        <p className='text-muted-foreground text-sm leading-7'>
          {t('You can explore products and packages before signing in.')}
        </p>
      </Dialog>
    </>
  )
}
