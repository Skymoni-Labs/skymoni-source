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
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Gift } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

import type { Benefit } from '../types'
import { InstructionEditor } from './instruction-editor'

const benefitSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  summary: z.string().max(200),
  category: z.enum(['account', 'license', 'resource', 'custom']),
  tone: z.enum(['violet', 'sky', 'amber']),
  format: z.enum(['markdown', 'html']),
  instructions: z.string().max(12000),
  fields: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().trim().min(1).max(80),
        kind: z.enum(['text', 'secret', 'link']),
        value: z.string().max(4096),
      })
    )
    .min(1)
    .max(20),
  stockMode: z.enum(['individual', 'shared']),
  validityDays: z.number().int().min(0).max(3650),
  enabled: z.boolean(),
})

export function BenefitEditor(props: {
  benefit?: Benefit
  onClose: () => void
  onSave: (benefit: Benefit) => void | Promise<void>
  onUploadImage?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const form = useForm<Benefit>({
    resolver: zodResolver(benefitSchema),
    defaultValues: props.benefit ?? {
      id: crypto.randomUUID(),
      name: '',
      summary: '',
      category: 'custom',
      tone: 'sky',
      format: 'markdown',
      instructions: '',
      fields: [{ id: 'field-1', label: '', kind: 'text', value: '' }],
      stockMode: 'shared',
      validityDays: 0,
      enabled: true,
    },
  })
  const fields = useFieldArray({
    control: form.control,
    name: 'fields',
    keyName: 'formId',
  })
  const values = useWatch({
    control: form.control,
    compute: (current: Benefit) => current,
  })
  const save = form.handleSubmit(async (benefit) => {
    if (uploading) return
    if (
      benefit.fields.some(
        (field) =>
          field.kind === 'link' &&
          field.value &&
          !/^https?:\/\//i.test(field.value)
      )
    ) {
      form.setError('root', {
        message: t('Website fields must use http or https'),
      })
      return
    }
    try {
      await props.onSave(benefit)
      props.onClose()
    } catch (error) {
      handleServerError(error)
    }
  })
  return (
    <Dialog
      open
      title={props.benefit ? t('Edit benefit') : t('Create benefit')}
      description={t(
        'Configure the gift once, then issue codes and deliver it to users.'
      )}
      onOpenChange={(open) => {
        if (!open && !form.formState.isSubmitting && !uploading) props.onClose()
      }}
      contentClassName='sm:max-w-5xl'
      footer={
        <>
          <Button
            variant='outline'
            disabled={form.formState.isSubmitting || uploading}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            disabled={form.formState.isSubmitting || uploading}
            onClick={() => void save()}
          >
            {t('Save benefit')}
          </Button>
        </>
      }
    >
      <form
        className='grid min-w-0 gap-6 lg:grid-cols-[1.2fr_1fr]'
        onSubmit={save}
      >
        <div className='space-y-5'>
          <div className='space-y-2'>
            <Label htmlFor='benefit-name'>{t('Benefit name')}</Label>
            <Input
              id='benefit-name'
              {...form.register('name')}
              placeholder={t('For example: Muse creation gift')}
            />
            {form.formState.errors.name && (
              <p role='alert' className='text-destructive text-xs'>
                {t('Enter a benefit name')}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='benefit-summary'>{t('Short description')}</Label>
            <Input id='benefit-summary' {...form.register('summary')} />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='benefit-category'>{t('Benefit category')}</Label>
              <NativeSelect
                className='w-full'
                id='benefit-category'
                {...form.register('category')}
              >
                <option value='account'>{t('Account benefit')}</option>
                <option value='license'>{t('Activation code')}</option>
                <option value='resource'>{t('Resource link')}</option>
                <option value='custom'>{t('Custom gift')}</option>
              </NativeSelect>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='benefit-stock-mode'>{t('Delivery mode')}</Label>
              <NativeSelect
                className='w-full'
                id='benefit-stock-mode'
                {...form.register('stockMode')}
              >
                <option value='individual'>
                  {t('One independent item per recipient')}
                </option>
                <option value='shared'>
                  {t('Same content for all recipients')}
                </option>
              </NativeSelect>
            </div>
          </div>
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label>{t('Custom delivery fields')}</Label>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() =>
                  fields.append({
                    id: crypto.randomUUID(),
                    label: '',
                    kind: 'text',
                    value: '',
                  })
                }
                disabled={fields.fields.length >= 20}
              >
                <Plus />
                {t('Add field')}
              </Button>
            </div>
            {fields.fields.map((field, index) => (
              <div
                key={field.formId}
                className='bg-muted/20 space-y-2 rounded-xl border p-3'
              >
                <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2'>
                  <Input
                    aria-label={t('Field name {{number}}', {
                      number: index + 1,
                    })}
                    placeholder={t('Field name')}
                    {...form.register(`fields.${index}.label`)}
                  />
                  <NativeSelect
                    className='w-full'
                    aria-label={t('Field type {{number}}', {
                      number: index + 1,
                    })}
                    {...form.register(`fields.${index}.kind`)}
                  >
                    <option value='text'>{t('Text')}</option>
                    <option value='secret'>{t('Sensitive text')}</option>
                    <option value='link'>{t('Website link')}</option>
                  </NativeSelect>
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label={t('Remove field {{number}}', {
                      number: index + 1,
                    })}
                    disabled={fields.fields.length === 1}
                    onClick={() => fields.remove(index)}
                  >
                    <Trash2 className='size-4' />
                  </Button>
                </div>
                <Input
                  aria-label={t('Field value {{number}}', {
                    number: index + 1,
                  })}
                  type={
                    values.fields[index]?.kind === 'secret'
                      ? 'password'
                      : 'text'
                  }
                  autoComplete='off'
                  placeholder={
                    values.stockMode === 'individual'
                      ? t(
                          'Default value; independent values come from inventory'
                        )
                      : t('Content delivered to the user')
                  }
                  {...form.register(`fields.${index}.value`)}
                />
              </div>
            ))}
            {form.formState.errors.fields && (
              <p className='text-destructive text-xs' role='alert'>
                {t('Give every field a name')}
              </p>
            )}
          </div>
          <div className='space-y-2'>
            <div className='flex items-center justify-between gap-3'>
              <NativeSelect
                aria-label={t('Content format')}
                disabled={uploading || form.formState.isSubmitting}
                {...form.register('format')}
              >
                <option value='markdown'>Markdown</option>
                <option value='html'>HTML</option>
              </NativeSelect>
            </div>
            <InstructionEditor
              id='benefit-instructions'
              label={t('Instructions')}
              value={values.instructions}
              format={values.format}
              disabled={uploading || form.formState.isSubmitting}
              onUpload={props.onUploadImage}
              onBusyChange={setUploading}
              onChange={(value) =>
                form.setValue('instructions', value, { shouldDirty: true })
              }
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='benefit-validity'>
                {t('Benefit validity in days')}
              </Label>
              <Input
                id='benefit-validity'
                type='number'
                min={0}
                max={3650}
                {...form.register('validityDays', { valueAsNumber: true })}
              />
              <p className='text-muted-foreground text-xs'>
                {t('Zero means no expiry; starts on redemption.')}
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='benefit-tone'>{t('Cover color')}</Label>
              <NativeSelect
                id='benefit-tone'
                className='w-full'
                {...form.register('tone')}
              >
                <option value='sky'>{t('Cloud blue')}</option>
                <option value='violet'>{t('Soft violet')}</option>
                <option value='amber'>{t('Warm amber')}</option>
              </NativeSelect>
            </div>
          </div>
          <div className='flex items-center justify-between rounded-xl border p-3'>
            <Label htmlFor='benefit-enabled'>
              {t('Enable benefit redemption')}
            </Label>
            <Switch
              id='benefit-enabled'
              checked={values.enabled}
              onCheckedChange={(checked) => form.setValue('enabled', checked)}
            />
          </div>
          {form.formState.errors.validityDays && (
            <p role='alert' className='text-destructive text-xs'>
              {t('Enter validity from 0 to 3650 days')}
            </p>
          )}
          {form.formState.errors.root && (
            <p role='alert' className='text-destructive text-xs'>
              {form.formState.errors.root.message}
            </p>
          )}
        </div>
        <section className='min-w-0 space-y-3'>
          <h3 className='text-sm font-medium'>{t('User preview')}</h3>
          <div className='sticky top-0 space-y-5 rounded-2xl border p-5'>
            <div className='flex size-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950'>
              <Gift />
            </div>
            <div>
              <h3 className='font-semibold'>
                {values.name || t('Benefit name')}
              </h3>
              <p className='text-muted-foreground mt-2 text-sm'>
                {values.summary}
              </p>
            </div>
            {values.fields.map((field, index) => (
              <div className='bg-muted/40 rounded-xl p-3' key={field.id}>
                <p className='text-muted-foreground text-xs'>
                  {field.label ||
                    t('Field name {{number}}', { number: index + 1 })}
                </p>
                <p className='mt-1 text-sm break-all'>
                  {field.kind === 'secret'
                    ? '••••••••'
                    : field.value || t('Assigned after redemption')}
                </p>
              </div>
            ))}
            <RichContent content={values.instructions} mode={values.format} />
          </div>
        </section>
      </form>
    </Dialog>
  )
}
