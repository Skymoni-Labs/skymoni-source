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
  Gift,
  Plus,
  Upload,
  Ticket,
  Archive,
  Users,
  Pencil,
  PackagePlus,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { RecipientPicker } from '@/features/popup-notices/components/recipient-picker'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import type {
  Benefit,
  BenefitCode,
  InventoryItem,
  BenefitsData,
} from '../types'
import { BenefitCover } from './benefit-cover'
import { BenefitEditor } from './benefit-editor'
import { InventoryManager } from './inventory-manager'

export function BenefitsAdmin(props: {
  data: BenefitsData
  onSave: (benefit: Benefit) => void | Promise<void>
  onUploadImage?: (file: File, signal: AbortSignal) => Promise<string>
  onEdit?: (id: string) => Promise<Benefit>
  live?: boolean
  onInventory: (items: InventoryItem[]) => void | Promise<void>
  onCodes: (codes: BenefitCode[]) => void | Promise<void>
  onToggle: (id: string) => void | Promise<void>
  onCodeToggle?: (code: BenefitCode) => Promise<void>
  onPopup: (id: string) => void
  onConfigure?: (benefit: Benefit) => void
  onCreate?: () => void
  title?: string
  description?: string
  initialTab?: 'benefits' | 'inventory' | 'codes' | 'records'
}) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<string>(props.initialTab || 'benefits')
  const [busy, setBusy] = useState(false)
  const editBenefit = async (benefit: Benefit) => {
    if (props.onConfigure) {
      props.onConfigure(benefit)
      return
    }
    setBusy(true)
    try {
      setEditing(props.onEdit ? await props.onEdit(benefit.id) : benefit)
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (id: string) => {
    setBusy(true)
    try {
      await props.onToggle(id)
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
    }
  }
  const [editing, setEditing] = useState<Benefit | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const benefitName = (id: string) =>
    props.data.benefits.find((row) => row.id === id)?.name ?? id
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <div className='mb-2 flex items-center gap-2 text-xs text-sky-600'>
            <Gift className='size-4' />
            {t('Give a little inspiration')}
          </div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {props.title || t('Benefits')}
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {props.description ||
              t(
                'Define gifts, manage stock and send them with redemption codes.'
              )}
          </p>
        </div>
        <Button
          onClick={() =>
            props.onCreate ? props.onCreate() : setEditing('new')
          }
        >
          <Plus />
          {t('Create benefit')}
        </Button>
      </div>
      <div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
        {[
          {
            label: t('Benefit types'),
            value: props.data.benefits.length,
            icon: Gift,
          },
          {
            label: t('Available inventory'),
            value:
              props.data.inventoryCounts?.available ??
              props.data.inventory.filter(
                (item) =>
                  !item.claimed && (!item.status || item.status === 'available')
              ).length,
            icon: Archive,
          },
          {
            label: t('Issued codes'),
            value: props.data.codes.length,
            icon: Ticket,
          },
          {
            label: t('Redemption records'),
            value: props.data.warehouse.length,
            icon: Users,
          },
        ].map((stat) => (
          <div
            className='bg-card flex items-center justify-between rounded-2xl border p-4'
            key={stat.label}
          >
            <div>
              <p className='text-muted-foreground text-xs'>{stat.label}</p>
              <p className='mt-2 text-2xl font-semibold'>
                {formatNumber(stat.value, locale)}
              </p>
            </div>
            <stat.icon className='size-5 text-sky-500' />
          </div>
        ))}
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        className='gap-5'
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <TabsList aria-label={t('Benefit management sections')}>
            <TabsTrigger value='benefits'>
              {t('Benefit management')}
            </TabsTrigger>
            <TabsTrigger value='inventory'>{t('Inventory')}</TabsTrigger>
            <TabsTrigger value='codes'>{t('Benefit codes')}</TabsTrigger>
            <TabsTrigger value='records'>{t('Redemption records')}</TabsTrigger>
          </TabsList>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setImporting(true)}
            >
              <Upload />
              {t('Import inventory')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setGenerating(true)}
            >
              <Ticket />
              {t('Generate codes')}
            </Button>
          </div>
        </div>
        <TabsContent value='benefits'>
          {props.data.benefits.length === 0 && (
            <p className='text-muted-foreground rounded-xl border p-8 text-center'>
              {t('Create your first benefit to begin')}
            </p>
          )}
          <div className='space-y-4'>
            {props.data.benefits.map((benefit) => (
              <article
                key={benefit.id}
                className='bg-card flex flex-col gap-5 rounded-2xl border p-5 md:flex-row md:items-center'
              >
                <BenefitCover benefit={benefit} compact />
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h2 className='font-semibold'>{benefit.name}</h2>
                    <Badge
                      variant='secondary'
                      className={
                        benefit.enabled
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : ''
                      }
                    >
                      {benefit.enabled ? t('Enabled') : t('Disabled')}
                    </Badge>
                  </div>
                  <p className='text-muted-foreground mt-1.5 text-sm'>
                    {benefit.summary}
                  </p>
                  <div className='text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs'>
                    <span>
                      {benefit.stockMode === 'individual'
                        ? t('Independent inventory')
                        : t('Shared content')}
                    </span>
                    <span>
                      {t('Custom fields')}:{' '}
                      {formatNumber(benefit.fields.length, locale)}
                    </span>
                    <span>
                      {t('Available inventory')}:{' '}
                      {benefit.stockMode === 'shared'
                        ? t('Unlimited')
                        : formatNumber(
                            benefit.availableInventory ??
                              props.data.inventory.filter(
                                (x) =>
                                  x.benefitId === benefit.id &&
                                  !x.claimed &&
                                  (!x.status || x.status === 'available')
                              ).length,
                            locale
                          )}
                    </span>
                  </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => void editBenefit(benefit)}
                  >
                    <Pencil />
                    {t('Configure')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => props.onPopup(benefit.id)}
                  >
                    {t('Link popup')}
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => void toggle(benefit.id)}
                  >
                    {benefit.enabled ? t('Disable') : t('Enable')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value='inventory'>
          {props.live ? (
            <InventoryManager benefits={props.data.benefits} />
          ) : (
            <>
              <StaticDataTable
                tableProps={{ 'aria-label': t('Benefit inventory') }}
                data={props.data.inventory}
                getRowKey={(row) => row.id}
                columns={[
                  {
                    id: 'id',
                    header: t('Inventory item'),
                    cell: (row) => <code>{row.id}</code>,
                  },
                  {
                    id: 'benefit',
                    header: t('Benefit name'),
                    cell: (row) => benefitName(row.benefitId),
                  },
                  {
                    id: 'account',
                    header: t('Delivery content'),
                    cell: (row) =>
                      row.fields.find((field) => field.kind === 'text')
                        ?.value || t('Sensitive text'),
                  },
                  {
                    id: 'state',
                    header: t('Status'),
                    cell: (row) => (
                      <Badge variant='outline'>
                        {row.claimed ? t('Delivered') : t('Available')}
                      </Badge>
                    ),
                  },
                ]}
              />
              <p className='text-muted-foreground mt-3 text-xs'>
                {t(
                  'Independent inventory is assigned once. Sensitive fields are not shown in this list.'
                )}
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value='codes'>
          <div className='mb-4 flex items-center justify-between'>
            <p className='text-muted-foreground text-sm'>
              {t('Copy a code and give it to a user, or attach it to a popup.')}
            </p>
            <CopyButton
              value={props.data.codes.map((code) => code.code).join('\n')}
              variant='outline'
              size='sm'
              aria-label={t('Copy all codes')}
            >
              {t('Copy all codes')}
            </CopyButton>
          </div>
          <StaticDataTable
            tableProps={{ 'aria-label': t('Benefit code list') }}
            data={props.data.codes}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: 'code',
                header: t('Benefit code'),
                cell: (row) => (
                  <div className='flex items-center gap-2'>
                    <code className='text-xs'>{row.code}</code>
                    <CopyButton value={row.code} />
                  </div>
                ),
              },
              {
                id: 'benefit',
                header: t('Benefit name'),
                cell: (row) => benefitName(row.benefitId),
              },
              {
                id: 'mode',
                header: t('Code mode'),
                cell: (row) =>
                  row.mode === 'single'
                    ? t('Single-use code')
                    : t('Shared campaign code'),
              },
              {
                id: 'used',
                header: t('Redeemed / limit'),
                cell: (row) => `${row.claimed} / ${row.limit}`,
              },
              {
                id: 'audience',
                header: t('Eligible recipients'),
                cell: (row) =>
                  row.target === 'all'
                    ? t('All signed-in users')
                    : `#${row.targetUserId ?? ''}`,
              },
              {
                id: 'expires',
                header: t('Valid until'),
                cell: (row) => row.expires || t('No expiry'),
              },
              {
                id: 'state',
                header: t('Status'),
                cell: (row) => (
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={!props.onCodeToggle}
                    onClick={() => {
                      if (props.onCodeToggle) {
                        void props.onCodeToggle(row).catch(handleServerError)
                      }
                    }}
                  >
                    {row.enabled ? t('Disable') : t('Enable')}
                  </Button>
                ),
              },
            ]}
          />
        </TabsContent>
        <TabsContent value='records'>
          <StaticDataTable
            tableProps={{ 'aria-label': t('Benefit redemption records') }}
            data={props.data.warehouse}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: 'user',
                header: t('User'),
                cell: (row) =>
                  row.userId ? `#${row.userId}` : t('Preview user'),
              },
              {
                id: 'benefit',
                header: t('Benefit name'),
                cell: (row) => row.benefit.name,
              },
              {
                id: 'code',
                header: t('Source code'),
                cell: (row) => (
                  <code className='text-xs'>{row.sourceCode}</code>
                ),
              },
              {
                id: 'time',
                header: t('Received on'),
                cell: (row) => row.received,
              },
              {
                id: 'state',
                header: t('Status'),
                cell: (row) => (
                  <Badge variant='outline'>
                    {row.status === 'active' ? t('Available') : t('Expired')}
                  </Badge>
                ),
              },
            ]}
          />
        </TabsContent>
      </Tabs>
      {editing && (
        <BenefitEditor
          benefit={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={props.onSave}
          onUploadImage={props.onUploadImage}
        />
      )}
      {importing && (
        <ImportInventory
          benefits={props.data.benefits}
          onClose={() => setImporting(false)}
          live={props.live}
          onImport={async (items) => {
            await props.onInventory(items)
            setTab('inventory')
          }}
        />
      )}
      {generating && (
        <GenerateCodes
          benefits={props.data.benefits}
          existingCodes={props.data.codes}
          onClose={() => setGenerating(false)}
          live={props.live}
          onGenerate={async (codes) => {
            await props.onCodes(codes)
            setTab('codes')
          }}
        />
      )}
    </div>
  )
}

function ImportInventory(props: {
  benefits: Benefit[]
  onClose: () => void
  live?: boolean
  onImport: (items: InventoryItem[]) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [id, setId] = useState(
    props.benefits.find((row) => row.stockMode === 'individual')?.id ?? ''
  )
  const [text, setText] = useState('')
  const benefit = props.benefits.find((row) => row.id === id)
  const [pending, setPending] = useState(false)
  const submit = async () => {
    if (!benefit || pending) return
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    const rows = lines.map((line) =>
      line.split('----').map((value) => value.trim())
    )
    if (
      !rows.length ||
      rows.some((row) => row.length !== benefit.fields.length)
    ) {
      toast.error(t('Match every row to the field order shown above'))
      return
    }
    if (
      rows.some((row) =>
        row.some(
          (value, index) =>
            benefit.fields[index].kind === 'link' &&
            !/^https?:\/\//i.test(value)
        )
      )
    ) {
      toast.error(t('Website fields must use http or https'))
      return
    }
    setPending(true)
    try {
      await props.onImport(
        rows.map((row) => ({
          id: crypto.randomUUID(),
          benefitId: id,
          claimed: false,
          fields: benefit.fields.map((field, index) => ({
            ...field,
            value: row[index],
          })),
        }))
      )
      toast.success(t('Inventory imported'))
      props.onClose()
    } catch (error) {
      handleServerError(error)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={t('Import inventory')}
      description={t('One item per line. Separate fields with four hyphens.')}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <Button
          disabled={!text.trim() || !benefit || pending}
          onClick={() => void submit()}
        >
          <PackagePlus />
          {t('Import inventory')}
        </Button>
      }
    >
      <div className='space-y-4'>
        <Label htmlFor='inventory-benefit'>{t('Benefit name')}</Label>
        <NativeSelect
          id='inventory-benefit'
          className='w-full'
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {props.benefits
            .filter((row) => row.stockMode === 'individual')
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </NativeSelect>
        <p className='bg-muted rounded-lg p-3 text-xs'>
          {t('Field order')}:{' '}
          {benefit?.fields.map((field) => field.label).join(' → ')}
        </p>
        <Textarea
          aria-label={t('Inventory rows')}
          className='min-h-48 font-mono text-xs'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {!props.live && (
          <Button
            variant='outline'
            onClick={() => {
              if (benefit) {
                setText(
                  Array.from({ length: 2 }, (_, index) =>
                    benefit.fields
                      .map((field) => {
                        if (field.kind === 'link') {
                          return 'https://example.com/demo'
                        }
                        if (field.kind === 'secret') {
                          return `DEMO-password-${index + 9}`
                        }
                        return `preview-${index + 9}@example.com`
                      })
                      .join('----')
                  ).join('\n')
                )
              }
            }}
          >
            {t('Fill sample inventory')}
          </Button>
        )}
      </div>
    </Dialog>
  )
}

function GenerateCodes(props: {
  benefits: Benefit[]
  existingCodes: BenefitCode[]
  onClose: () => void
  live?: boolean
  onGenerate: (codes: BenefitCode[]) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [id, setId] = useState(props.benefits[0]?.id ?? '')
  const [mode, setMode] = useState<'single' | 'campaign'>('single')
  const [count, setCount] = useState('3')
  const [target, setTarget] = useState<'all' | 'user'>('all')
  const [expires, setExpires] = useState('')
  const [targetUserId, setTargetUserId] = useState(0)
  const [pending, setPending] = useState(false)
  const submit = async () => {
    if (pending) return
    const quantity = Number(count)
    if (
      !Number.isInteger(quantity) ||
      quantity < (mode === 'single' ? 1 : 0) ||
      quantity > (mode === 'single' ? 100 : 1000000) ||
      (target === 'user' && props.live && targetUserId <= 0)
    ) {
      toast.error(t('Choose a quantity from 1 to 100 and an expiry date'))
      return
    }
    const codes = Array.from(
      { length: mode === 'single' ? quantity : 1 },
      () => {
        const random = crypto
          .randomUUID()
          .replaceAll('-', '')
          .slice(0, 12)
          .toUpperCase()
        return {
          id: random,
          code: `GIFT-${random}`,
          benefitId: id,
          mode,
          limit: mode === 'single' ? 1 : quantity,
          claimed: 0,
          target,
          targetUserId,
          expires,
          enabled: true,
        }
      }
    )
    if (
      codes.some((code) =>
        props.existingCodes.some((existing) => existing.code === code.code)
      )
    ) {
      toast.error(t('Please generate again'))
      return
    }
    setPending(true)
    try {
      await props.onGenerate(codes)
      toast.success(t('Benefit codes generated'))
      props.onClose()
    } catch (error) {
      handleServerError(error)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={t('Generate codes')}
      description={t(
        'Issue independent codes or one shared code with a claim limit.'
      )}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <Button disabled={pending || !id} onClick={() => void submit()}>
          <Ticket />
          {t('Generate codes')}
        </Button>
      }
    >
      <div className='space-y-5'>
        <div className='space-y-2'>
          <Label htmlFor='codes-benefit'>{t('Benefit name')}</Label>
          <NativeSelect
            className='w-full'
            id='codes-benefit'
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {props.benefits.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='codes-mode'>{t('Code mode')}</Label>
          <NativeSelect
            className='w-full'
            id='codes-mode'
            value={mode}
            onChange={(e) => setMode(e.target.value as 'single' | 'campaign')}
          >
            <option value='single'>{t('Single-use code')}</option>
            <option value='campaign'>{t('Shared campaign code')}</option>
          </NativeSelect>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='codes-count'>
              {mode === 'single'
                ? t('Number of codes')
                : t('Total claim limit')}
            </Label>
            <Input
              id='codes-count'
              type='number'
              min={mode === 'single' ? 1 : 0}
              max={mode === 'single' ? 100 : 1000000}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            {mode === 'campaign' && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Use 0 for unlimited total claims; each account can claim once.'
                )}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='codes-expiry'>{t('Code expiry date')}</Label>
            <Input
              id='codes-expiry'
              type='date'
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='codes-target'>{t('Eligible recipients')}</Label>
          <NativeSelect
            id='codes-target'
            className='w-full'
            value={target}
            onChange={(e) => setTarget(e.target.value as 'all' | 'user')}
          >
            <option value='all'>{t('All signed-in users')}</option>
            <option value='user'>
              {props.live ? t('Single user') : t('Preview user only')}
            </option>
          </NativeSelect>
        </div>
        {props.live && target === 'user' && (
          <RecipientPicker value={targetUserId} onChange={setTargetUserId} />
        )}
        <p className='rounded-xl bg-sky-50 p-3 text-xs leading-relaxed text-sky-800 dark:bg-sky-950 dark:text-sky-200'>
          {t(
            'Every code can be redeemed once per account. Independent inventory is delivered from the selected benefit.'
          )}
        </p>
      </div>
    </Dialog>
  )
}
