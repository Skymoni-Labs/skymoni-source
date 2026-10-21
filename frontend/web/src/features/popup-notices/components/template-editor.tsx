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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { savePopupTemplate } from '../api'
import { popupTemplateSchema, type PopupTemplateForm } from '../lib/schema'
import type { PopupTemplate, PopupTemplateInput } from '../types'
import { PopupContent } from './popup-content'

export function PopupTemplateEditor(props: {
  template?: PopupTemplate
  initial?: PopupTemplateInput
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = useForm<PopupTemplateForm>({
    resolver: zodResolver(popupTemplateSchema),
    defaultValues: props.template ??
      props.initial ?? { name: '', title: '', content: '', format: 'auto' },
  })
  const values = useWatch({ control: form.control }) as PopupTemplateForm
  const save = useMutation({
    mutationFn: (data: PopupTemplateForm) =>
      savePopupTemplate(
        { ...data, revision: props.template?.revision },
        props.template?.id
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['popup-templates'] })
      toast.success(t('Template saved'))
      props.onClose()
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <Dialog
      open
      title={
        props.template ? t('Edit popup template') : t('Save popup template')
      }
      description={t(
        'Templates have no quantity limit and are saved on the server. Saving a template does not publish a popup.'
      )}
      onOpenChange={(open) => {
        if (!open && !save.isPending) props.onClose()
      }}
      showCloseButton={!save.isPending}
      contentClassName='sm:max-w-4xl'
      footer={
        <Button
          disabled={save.isPending}
          onClick={() => {
            void form.handleSubmit((data) => save.mutate(data))()
          }}
        >
          {t('Save template')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => save.mutate(data))}
          className='grid min-w-0 gap-6 lg:grid-cols-2'
        >
          <div className='min-w-0 space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Template name')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={100} autoFocus />
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
            <FormField
              control={form.control}
              name='content'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Popup content')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={10} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <section className='min-w-0' aria-label={t('Live preview')}>
            <h3 className='mb-3 text-sm font-medium'>{t('Live preview')}</h3>
            <div className='max-h-[55dvh] overflow-auto rounded-xl border p-4'>
              <h4 className='mb-4 font-semibold'>
                {values.title || t('Popup title')}
              </h4>
              <PopupContent content={values.content} format={values.format} />
            </div>
          </section>
        </form>
      </Form>
    </Dialog>
  )
}
