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
import { BenefitCodePicker } from '@/features/benefits/components/code-picker'

import { popupAudienceLabel, popupFrequencyLabel } from '../lib/labels'
import type { PopupFormValues } from '../lib/schema'
import { PopupImageUpload } from './image-upload'
import { PopupPriorityInput } from './priority-input'
import { RecipientPicker } from './recipient-picker'

export function PopupEditorFields({
  onImageBusyChange,
}: {
  onImageBusyChange?: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const form = useFormContext<PopupFormValues>()
  const audience = useWatch({ control: form.control, name: 'audience' })
  return (
    <div className='space-y-4'>
      <FormField
        control={form.control}
        name='benefit_code_id'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Linked benefit code')}</FormLabel>
            <FormControl>
              <BenefitCodePicker
                value={field.value ?? 0}
                onChange={field.onChange}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='title'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Popup title')}</FormLabel>
            <FormControl>
              <Input {...field} maxLength={200} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='audience'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Audience')}</FormLabel>
              <FormControl>
                <NativeSelect {...field} className='w-full'>
                  {(['all_users', 'user', 'guest'] as const).map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {popupAudienceLabel(value, t)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='format'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Content format')}</FormLabel>
              <FormControl>
                <NativeSelect {...field} className='w-full'>
                  <NativeSelectOption value='auto'>
                    {t('Automatic detection')}
                  </NativeSelectOption>
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
      </div>
      {audience === 'user' && (
        <FormField
          control={form.control}
          name='target_user_id'
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor='popup-recipient'>{t('Recipient')}</FormLabel>
              <RecipientPicker value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={form.control}
        name='content'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Popup content')}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                rows={12}
                className='resize-y font-mono'
                placeholder={t(
                  'Write plain text, Markdown, or paste HTML here.'
                )}
              />
            </FormControl>
            <p className='text-muted-foreground text-xs'>
              可粘贴邮件 HTML，支持图片、标题、列表和卡片排版。{' '}
              {t(
                'HTML is sanitized. Scripts, forms and embedded pages are not supported.'
              )}
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
      <PopupImageUpload onBusyChange={onImageBusyChange} />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='frequency'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Display frequency')}</FormLabel>
              <FormControl>
                <NativeSelect {...field} className='w-full'>
                  {(['once', 'daily', 'visit'] as const).map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {popupFrequencyLabel(value, t)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='priority'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Priority')}</FormLabel>
              <FormControl>
                <PopupPriorityInput
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <p className='text-muted-foreground text-xs'>
                {t('Higher priority popups appear first (0–100).')}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='duration_days'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Display duration (days)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={1}
                  max={3650}
                  step={1}
                  placeholder={t('Unlimited (leave blank)')}
                  {...field}
                />
              </FormControl>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Leave blank for unlimited display. Enter 1–3650 days; the period starts when published, not when saved as a draft.'
                )}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Daily frequency resets at midnight Beijing time. Visitors are remembered in this browser only.'
        )}
      </p>
    </div>
  )
}
