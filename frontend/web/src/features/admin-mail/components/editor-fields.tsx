import { useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { SaleMailInsert } from '@/features/model-sales/mail-insert'

import type { MailFormValues } from '../lib/schema'
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
import { MailImageUpload } from './image-upload'
import { MailRecipientPicker } from './recipient-picker'

export function MailEditorFields(props: {
  onEdit: () => void
  onUploadState?: (busy: boolean) => void
  onRecipientsBusy?: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const form = useFormContext<MailFormValues>()
  const audience = useWatch({ control: form.control, name: 'audience' })
  return (
    <div className='space-y-4'>
      <FormField
        control={form.control}
        name='subject'
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('Email subject')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                maxLength={200}
                onChange={(event) => {
                  field.onChange(event)
                  props.onEdit()
                }}
              />
            </FormControl>
            <FormMessage>
              {fieldState.error && t(fieldState.error.message ?? '')}
            </FormMessage>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='audience'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Recipients')}</FormLabel>
            <FormControl>
              <NativeSelect {...field}>
                <NativeSelectOption value='emails'>
                  {t('Enter email addresses directly')}
                </NativeSelectOption>
                <NativeSelectOption value='users'>
                  {t('Selected users (one or more)')}
                </NativeSelectOption>
                <NativeSelectOption value='all_users'>
                  {t('All active users with email')}
                </NativeSelectOption>
              </NativeSelect>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {audience === 'users' && (
        <FormField
          control={form.control}
          name='user_ids'
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('Add recipients')}</FormLabel>
              <MailRecipientPicker
                value={field.value}
                onBusyChange={props.onRecipientsBusy}
                onChange={(ids) => {
                  field.onChange(ids)
                  props.onEdit()
                }}
              />
              <FormMessage>
                {fieldState.error && t(fieldState.error.message ?? '')}
              </FormMessage>
            </FormItem>
          )}
        />
      )}
      {audience === 'emails' && (
        <FormField
          control={form.control}
          name='recipient_emails'
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t('Recipient email addresses')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} placeholder='name@example.com' />
              </FormControl>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Enter one address per line, or separate with commas or semicolons. Recipients do not need a site account. Duplicate addresses are merged.'
                )}
              </p>
              <FormMessage>
                {fieldState.error && t(fieldState.error.message ?? '')}
              </FormMessage>
            </FormItem>
          )}
        />
      )}
      {audience !== 'emails' && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Uses bound account emails. Disabled accounts, missing emails and duplicate addresses are skipped. Recipient lists are frozen when the draft is saved.'
          )}
        </p>
      )}
      <FormField
        control={form.control}
        name='format'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Content format')}</FormLabel>
            <FormControl>
              <NativeSelect
                {...field}
                onChange={(event) => {
                  field.onChange(event)
                  props.onEdit()
                }}
              >
                <NativeSelectOption value='text'>
                  {t('Plain text')}
                </NativeSelectOption>
                <NativeSelectOption value='markdown'>
                  Markdown
                </NativeSelectOption>
                <NativeSelectOption value='html'>HTML</NativeSelectOption>
              </NativeSelect>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <SaleMailInsert onEdit={props.onEdit} />
      <MailImageUpload
        onEdit={props.onEdit}
        onBusyChange={props.onUploadState}
      />
      <FormField
        control={form.control}
        name='content'
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>{t('Email content')}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                rows={10}
                className='min-h-48 resize-y'
                onChange={(event) => {
                  field.onChange(event)
                  props.onEdit()
                }}
              />
            </FormControl>
            <FormMessage>
              {fieldState.error && t(fieldState.error.message ?? '')}
            </FormMessage>
          </FormItem>
        )}
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          '支持上传 PNG、JPEG、GIF 图片（每张最多 5 MiB，每封最多 4 张）。上传图片随邮件内嵌发送；外部图片、脚本、表单与自定义样式会被过滤。正文最多 64 KiB。'
        )}
      </p>
    </div>
  )
}
