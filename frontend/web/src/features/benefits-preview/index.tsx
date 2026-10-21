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
  Archive,
  Wallet,
  Gift,
  Megaphone,
  RotateCcw,
  ChevronRight,
  FlaskConical,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { BenefitsAdmin } from './components/admin'
import { PopupBenefitLink, BenefitClaimPopup } from './components/popup-link'
import { RedeemBenefitDialog } from './components/redeem-dialog'
import { PreviewWallet } from './components/wallet'
import { Warehouse } from './components/warehouse'
import { redeemPreviewBenefit } from './lib/redeem'
import { createPreviewData } from './lib/seed'
import type { PreviewView } from './types'

export function BenefitsPreview() {
  const { t } = useTranslation()
  const [data, setData] = useState(() => {
    const sample = createPreviewData()
    // Preview the live site's initial empty state without changing server data.
    if (
      new URLSearchParams(window.location.search).get('warehouse') === 'empty'
    ) {
      sample.warehouse = []
    }
    return sample
  })
  const [view, setView] = useState<PreviewView>('warehouse')
  const [redeemCode, setRedeemCode] = useState<string | null>(null)
  const [linkedBenefit, setLinkedBenefit] = useState('muse')
  const [resetting, setResetting] = useState(false)
  const [announcement, setAnnouncement] = useState(false)
  const pages = [
    { id: 'wallet' as const, label: t('Wallet'), icon: Wallet, group: 'user' },
    {
      id: 'warehouse' as const,
      label: t('My warehouse'),
      icon: Archive,
      group: 'user',
    },
    { id: 'admin' as const, label: t('Benefits'), icon: Gift, group: 'admin' },
    {
      id: 'popup' as const,
      label: t('Popup notifications'),
      icon: Megaphone,
      group: 'admin',
    },
  ]
  const redeem = (code: string) => {
    const result = redeemPreviewBenefit(data, code, '2026-10-05')
    if (!result.success) {
      toast.error(t(result.errorKey))
      return null
    }
    setData(result.data)
    return result.item
  }
  const openPopup = (id: string) => {
    setLinkedBenefit(id)
    setView('popup')
  }
  return (
    <div className='text-foreground dark:bg-background min-h-dvh bg-slate-50/60'>
      <header className='bg-background/95 sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur sm:px-6'>
        <div className='flex items-center gap-2.5'>
          <img
            src='/branding/skymoni-cloud-friend.png'
            alt=''
            className='size-9 object-contain'
          />
          <span className='text-xl font-semibold tracking-tight'>skymoni</span>
          <Badge
            variant='outline'
            className='ml-2 hidden text-xs text-sky-600 sm:inline-flex'
          >
            <FlaskConical className='size-3' />
            {t('Local preview')}
          </Badge>
        </div>
        <div className='flex items-center gap-3'>
          <Button
            variant='ghost'
            size='sm'
            aria-label={t('Reset sample data')}
            onClick={() => setResetting(true)}
          >
            <RotateCcw className='size-3.5' />
            <span className='hidden sm:inline'>{t('Reset sample data')}</span>
          </Button>
          <div className='flex size-8 items-center justify-center rounded-full border bg-sky-50'>
            <img
              src='/branding/skymoni-cloud-friend.png'
              alt={t('Preview user')}
              className='size-7 object-contain'
            />
          </div>
        </div>
      </header>
      <div className='flex min-h-[calc(100dvh-4rem)]'>
        <aside className='bg-background sticky top-16 hidden h-[calc(100dvh-4rem)] w-52 shrink-0 flex-col border-r px-3 py-7 lg:flex'>
          <nav aria-label={t('Preview navigation')} className='space-y-7'>
            {['user', 'admin'].map((group) => (
              <div key={group}>
                <p className='text-muted-foreground mb-2 px-3 text-[11px] tracking-wider'>
                  {group === 'user' ? t('Personal') : t('Admin')}
                </p>
                <div className='space-y-1'>
                  {pages
                    .filter((page) => page.group === group)
                    .map((page) => (
                      <Button
                        variant='ghost'
                        key={page.id}
                        onClick={() => setView(page.id)}
                        aria-current={view === page.id ? 'page' : undefined}
                        className={cn(
                          'h-10 w-full justify-start gap-3 rounded-xl px-3 text-sm font-normal',
                          view === page.id &&
                            'bg-sky-50 font-medium text-sky-700 hover:bg-sky-50 dark:bg-sky-950 dark:text-sky-300'
                        )}
                      >
                        <page.icon className='size-4' />
                        {page.label}
                      </Button>
                    ))}
                </div>
              </div>
            ))}
          </nav>
          <div className='mt-auto rounded-xl border border-sky-100 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950'>
            <p className='text-xs font-medium text-sky-800 dark:text-sky-200'>
              {t('Preview workspace')}
            </p>
            <p className='text-muted-foreground mt-1.5 text-[11px] leading-relaxed'>
              {t('Sample data only. No live accounts or messages are used.')}
            </p>
          </div>
        </aside>
        <main className='min-w-0 flex-1'>
          <div className='bg-background flex gap-2 overflow-x-auto border-b px-3 py-2 lg:hidden'>
            {pages.map((page) => (
              <Button
                key={page.id}
                variant={view === page.id ? 'secondary' : 'ghost'}
                size='sm'
                onClick={() => setView(page.id)}
                aria-current={view === page.id ? 'page' : undefined}
                className='shrink-0'
              >
                <page.icon className='size-4' />
                {page.label}
              </Button>
            ))}
          </div>
          <div className='mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8 xl:px-12'>
            <div className='mb-7 flex flex-wrap items-center justify-between gap-2'>
              <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                <span>skymoni</span>
                <ChevronRight className='size-3' />
                <span>{pages.find((page) => page.id === view)?.label}</span>
              </div>
              <span className='text-muted-foreground text-[11px]'>
                {t('Interactive preview · changes reset on reload')}
              </span>
            </div>
            {view === 'warehouse' && (
              <Warehouse
                items={data.warehouse}
                hideAnnouncement={data.warehouse.length === 0}
                onRedeem={() => setRedeemCode('')}
                onPopup={() => setAnnouncement(true)}
              />
            )}
            {view === 'wallet' && (
              <PreviewWallet
                onRedeem={setRedeemCode}
                onWarehouse={() => setView('warehouse')}
              />
            )}
            {view === 'admin' && (
              <BenefitsAdmin
                data={data}
                onSave={(benefit) => {
                  setData((previous) => ({
                    ...previous,
                    benefits: previous.benefits.some(
                      (row) => row.id === benefit.id
                    )
                      ? previous.benefits.map((row) =>
                          row.id === benefit.id ? benefit : row
                        )
                      : [benefit, ...previous.benefits],
                  }))
                  toast.success(t('Benefit saved'))
                }}
                onInventory={(items) =>
                  setData((previous) => ({
                    ...previous,
                    inventory: [...items, ...previous.inventory],
                  }))
                }
                onCodes={(codes) =>
                  setData((previous) => ({
                    ...previous,
                    codes: [...codes, ...previous.codes],
                  }))
                }
                onToggle={(id) =>
                  setData((previous) => ({
                    ...previous,
                    benefits: previous.benefits.map((row) =>
                      row.id === id ? { ...row, enabled: !row.enabled } : row
                    ),
                  }))
                }
                onPopup={openPopup}
              />
            )}
            {view === 'popup' && (
              <PopupBenefitLink
                key={linkedBenefit}
                data={data}
                benefitId={linkedBenefit}
                onBenefit={setLinkedBenefit}
                onRedeem={setRedeemCode}
              />
            )}
          </div>
        </main>
      </div>
      {announcement && (
        <BenefitClaimPopup
          title='一份创作资源，送给爱探索的你 ☁️'
          content={
            '### 给灵感加一点旋律\n\n领取 Muse 创作资源，获得一份独立演示账号。兑换成功后，账号和使用说明会保存在 **我的仓库**。'
          }
          format='markdown'
          code='SKY-MUSE-2026'
          onClose={() => setAnnouncement(false)}
          onRedeem={setRedeemCode}
        />
      )}
      {redeemCode !== null && (
        <RedeemBenefitDialog
          initialCode={redeemCode}
          onClose={() => setRedeemCode(null)}
          onRedeem={redeem}
          onWarehouse={() => {
            setRedeemCode(null)
            setView('warehouse')
          }}
        />
      )}
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title={t('Reset the preview?')}
        desc={t('This only restores fictional sample data in this preview.')}
        handleConfirm={() => {
          setData(createPreviewData())
          setResetting(false)
          setView('warehouse')
        }}
        confirmText={t('Reset sample data')}
      />
    </div>
  )
}
