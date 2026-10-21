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

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'

import type { Benefit, InventoryItem } from '../types'

const actionKeys = {
  disable: 'Disable',
  enable: 'Enable',
  remove: 'Delete',
  restore: 'Restore inventory',
} as const
type Action = keyof typeof actionKeys
export function InventoryEditor({
  item,
  onClose,
  onSave,
}: {
  item: InventoryItem
  onClose: () => void
  onSave: (item: InventoryItem, reason: string, sync: boolean) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [fields, setFields] = useState(item.fields.map((f) => ({ ...f })))
  const [reason, setReason] = useState('')
  const [sync, setSync] = useState(false)
  const [pending, setPending] = useState(false)
  const readOnly = item.status === 'reserved' || item.status === 'removed'
  const delivered = item.status === 'delivered'
  const submit = async () => {
    if (pending || readOnly) return
    setPending(true)
    try {
      await onSave({ ...item, fields }, reason, sync)
    } catch (e) {
      handleServerError(e)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={`${t('Inventory item')} #${item.id}`}
      description={item.benefitName}
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      footer={
        <>
          <Button variant='outline' disabled={pending} onClick={onClose}>
            {t('Close')}
          </Button>
          {!readOnly && (
            <Button
              disabled={
                pending ||
                fields.some((f) => !f.value.trim()) ||
                (delivered && (!reason.trim() || !sync))
              }
              onClick={() => void submit()}
            >
              {t('Save changes')}
            </Button>
          )}
        </>
      }
    >
      <FieldGroup>
        {readOnly && (
          <Alert>
            <AlertDescription>
              {t(
                item.status === 'reserved'
                  ? 'This inventory is reserved by a pending order. Deliver or refund the order before editing.'
                  : 'Restore deleted inventory before editing.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {delivered && (
          <Alert>
            <AlertDescription>
              {t(
                'Editing delivered credentials updates the buyer warehouse and fulfilled order. It will not change payment or make this inventory available again.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {fields.map((f, index) => (
          <Field key={f.id}>
            <FieldLabel htmlFor={`stock-field-${f.id}`}>{f.label}</FieldLabel>
            {f.kind === 'secret' ? (
              <PasswordInput
                id={`stock-field-${f.id}`}
                value={f.value}
                readOnly={readOnly}
                disabled={pending}
                autoComplete='off'
                maxLength={4096}
                onChange={(e) =>
                  setFields((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, value: e.target.value } : row
                    )
                  )
                }
              />
            ) : (
              <Input
                id={`stock-field-${f.id}`}
                value={f.value}
                readOnly={readOnly}
                disabled={pending}
                autoComplete='off'
                maxLength={4096}
                onChange={(e) =>
                  setFields((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, value: e.target.value } : row
                    )
                  )
                }
              />
            )}
            <CopyButton
              value={f.value}
              variant='outline'
              size='sm'
              aria-label={`${t('Copy')} ${f.label}`}
            >
              {t('Copy')} {f.label}
            </CopyButton>
          </Field>
        ))}
        {!readOnly && (
          <Field>
            <FieldLabel htmlFor='stock-edit-reason'>
              {t(delivered ? 'Change reason' : 'Change reason (optional)')}
            </FieldLabel>
            <Textarea
              id='stock-edit-reason'
              value={reason}
              maxLength={500}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {delivered && (
          <Field orientation='horizontal'>
            <Checkbox
              id='stock-delivery-sync'
              checked={sync}
              disabled={pending}
              onCheckedChange={(checked) => setSync(checked === true)}
            />
            <FieldLabel htmlFor='stock-delivery-sync'>
              {t('Confirm updating the buyer warehouse')}
            </FieldLabel>
          </Field>
        )}
        <section className='space-y-2'>
          <h3 className='font-medium'>{t('Inventory change history')}</h3>
          <p className='text-muted-foreground text-xs'>
            {t('Imported on')}{' '}
            {item.createdAt
              ? new Date(item.createdAt * 1000).toLocaleString(locale)
              : '—'}
          </p>
          {item.history?.map((event) => (
            <div key={event.id} className='rounded-lg border p-3 text-xs'>
              <p>
                {new Date(event.createdAt * 1000).toLocaleString(locale)} · #
                {event.actorId} ·{' '}
                {t(
                  event.action === 'edit'
                    ? 'Edit'
                    : actionKeys[event.action as Action]
                )}
              </p>
              {event.reason && (
                <p className='mt-2 break-words whitespace-pre-wrap'>
                  {event.reason}
                </p>
              )}
            </div>
          ))}
        </section>
      </FieldGroup>
    </Dialog>
  )
}

export function AddInventory({
  benefits,
  onClose,
  onSave,
}: {
  benefits: Benefit[]
  onClose: () => void
  onSave: (item: InventoryItem) => Promise<void>
}) {
  const { t } = useTranslation()
  const [id, setId] = useState(
    benefits.find((b) => b.stockMode === 'individual')?.id || ''
  )
  const [fields, setFields] = useState(
    benefits
      .find((b) => b.id === id)
      ?.fields.map((f) => ({ ...f, value: '' })) || []
  )
  const [pending, setPending] = useState(false)
  const submit = async () => {
    setPending(true)
    try {
      await onSave({ id: '', benefitId: id, fields, claimed: false })
    } catch (e) {
      handleServerError(e)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={t('Add inventory item')}
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      footer={
        <Button
          disabled={
            pending || !fields.length || fields.some((f) => !f.value.trim())
          }
          onClick={() => void submit()}
        >
          {t('Save')}
        </Button>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='stock-add-resource'>
            {t('Benefit name')}
          </FieldLabel>
          <NativeSelect
            id='stock-add-resource'
            value={id}
            disabled={pending}
            onChange={(e) => {
              setId(e.target.value)
              setFields(
                benefits
                  .find((b) => b.id === e.target.value)
                  ?.fields.map((f) => ({ ...f, value: '' })) || []
              )
            }}
          >
            {benefits
              .filter((b) => b.stockMode === 'individual')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        {fields.map((f, index) => (
          <Field key={f.id}>
            <FieldLabel htmlFor={`stock-add-${f.id}`}>{f.label}</FieldLabel>
            <Input
              id={`stock-add-${f.id}`}
              type={f.kind === 'secret' ? 'password' : 'text'}
              value={f.value}
              autoComplete='off'
              disabled={pending}
              maxLength={4096}
              onChange={(e) =>
                setFields((current) =>
                  current.map((row, i) =>
                    i === index ? { ...row, value: e.target.value } : row
                  )
                )
              }
            />
          </Field>
        ))}
      </FieldGroup>
    </Dialog>
  )
}
