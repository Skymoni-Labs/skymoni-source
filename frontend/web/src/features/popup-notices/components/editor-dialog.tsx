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
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'

import { savePopupNotice, setPopupNoticeState } from '../api'
import {
  popupAudienceLabel,
  popupDurationLabel,
  popupFrequencyLabel,
} from '../lib/labels'
import {
  getPopupDurationDays,
  popupFormSchema,
  type PopupFormValues,
} from '../lib/schema'
import { popupAnnouncementTemplate } from '../lib/template'
import type {
  PopupNotice,
  PopupNoticeInput,
  PopupTemplateContent,
} from '../types'
import { PopupEditorFields } from './editor-fields'
import { PopupContent } from './popup-content'
import { PopupNoticeDialog } from './popup-notice-dialog'
import { PopupTemplateEditor } from './template-editor'
import { PopupTemplateLibrary } from './template-library'

export function PopupEditorDialog(props: {
  notice: PopupNotice | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [preview, setPreview] = useState(false)
  const [confirmTemplate, setConfirmTemplate] = useState(false)
  const [templateLibrary, setTemplateLibrary] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [pendingTemplate, setPendingTemplate] =
    useState<PopupTemplateContent | null>(null)
  const [pendingPublication, setPendingPublication] =
    useState<PopupFormValues | null>(null)
  const durationDays = props.notice ? getPopupDurationDays(props.notice) : 0
  const form = useForm<PopupFormValues>({
    resolver: zodResolver(popupFormSchema),
    defaultValues: {
      benefit_code_id: props.notice?.benefit_code_id ?? 0,
      title: props.notice?.title ?? '',
      content: props.notice?.content ?? '',
      format: props.notice?.format ?? 'auto',
      audience: props.notice?.audience ?? 'all_users',
      target_user_id: props.notice?.target_user_id ?? 0,
      frequency: props.notice?.frequency ?? 'once',
      duration_days: durationDays > 0 ? String(durationDays) : '',
      priority: props.notice?.priority ?? 0,
    },
  })
  const values = useWatch({ control: form.control }) as PopupFormValues
  const save = useMutation({
    mutationFn: async (payload: {
      values: PopupFormValues
      publish: boolean
    }) => {
      const input: PopupNoticeInput = {
        ...payload.values,
        target_user_id:
          payload.values.audience === 'user'
            ? payload.values.target_user_id
            : 0,
        duration_days: Number(payload.values.duration_days),
        start_at: 0,
        end_at: 0,
        revision: props.notice?.revision,
        status: 'draft',
      }
      const notice = await savePopupNotice(input, props.notice?.id)
      // Keep the saved draft recoverable if publishing fails.
      if (payload.publish) {
        try {
          await setPopupNoticeState(notice.id, 'published')
        } catch (error) {
          await queryClient.invalidateQueries({
            queryKey: ['popup-notices', 'admin'],
          })
          toast.info(
            t(
              'The draft was saved, but publishing failed. Publish it from the list after checking the error.'
            )
          )
          props.onClose()
          throw error
        }
      }
    },
    onSuccess: (_, payload) => {
      void queryClient.invalidateQueries({ queryKey: ['popup-notices'] })
      toast.success(
        payload.publish ? t('Popup published') : t('Popup draft saved')
      )
      props.onClose()
    },
    onError: (error) => handleServerError(error),
  })
  const applyTemplate = (template: PopupTemplateContent) => {
    form.setValue('title', template.title, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue('content', template.content, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue('format', template.format, { shouldDirty: true })
    setConfirmTemplate(false)
    setPendingTemplate(null)
  }
  const requestTemplate = (template: PopupTemplateContent) => {
    setTemplateLibrary(false)
    if (form.getValues('title').trim() || form.getValues('content').trim()) {
      setPendingTemplate(template)
      setConfirmTemplate(true)
    } else applyTemplate(template)
  }
  return (
    <>
      <Dialog
        open
        title={props.notice ? t('Edit popup') : t('Create popup')}
        description={t(
          'Choose an audience and preview your content before publishing.'
        )}
        onOpenChange={(open) => {
          if (!open && !save.isPending && !uploadingImage) props.onClose()
        }}
        contentClassName='sm:max-w-5xl'
        showCloseButton={!save.isPending && !uploadingImage}
        footer={
          <>
            <Button
              variant='outline'
              disabled={save.isPending || uploadingImage}
              onClick={() => setPreview(true)}
            >
              {t('Preview')}
            </Button>
            <Button
              variant='outline'
              disabled={save.isPending || uploadingImage}
              onClick={() => {
                void form.handleSubmit((data) =>
                  save.mutate({ values: data, publish: false })
                )()
              }}
            >
              {t('Save draft')}
            </Button>
            <Button
              disabled={save.isPending || uploadingImage}
              onClick={() => {
                void form.handleSubmit(setPendingPublication)()
              }}
            >
              {t('Save and publish')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) =>
              save.mutate({ values: data, publish: false })
            )}
            className='grid min-w-0 gap-6 lg:grid-cols-2'
          >
            <fieldset
              className='min-w-0'
              disabled={save.isPending || uploadingImage}
            >
              <div className='mb-4 flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={save.isPending}
                  onClick={() => setTemplateLibrary(true)}
                >
                  {t('Template library')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={save.isPending}
                  onClick={() => setSavingTemplate(true)}
                >
                  {t('Save as template')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={save.isPending}
                  onClick={() => requestTemplate(popupAnnouncementTemplate(t))}
                >
                  {t('Use announcement template')}
                </Button>
              </div>
              <PopupEditorFields onImageBusyChange={setUploadingImage} />
            </fieldset>
            <section className='min-w-0'>
              <h3 className='mb-3 text-sm font-medium'>{t('Live preview')}</h3>
              <div className='bg-background max-h-[min(58dvh,600px)] overflow-auto rounded-xl border p-4'>
                <h4 className='mb-4 font-semibold'>
                  {values.title || t('Popup title')}
                </h4>
                <PopupContent content={values.content} format={values.format} />
              </div>
            </section>
          </form>
        </Form>
      </Dialog>
      {templateLibrary && (
        <PopupTemplateLibrary
          onClose={() => setTemplateLibrary(false)}
          onApply={requestTemplate}
        />
      )}
      {savingTemplate && (
        <PopupTemplateEditor
          initial={{
            name: '',
            title: values.title,
            content: values.content,
            format: values.format,
          }}
          onClose={() => setSavingTemplate(false)}
        />
      )}
      {preview && (
        <PopupNoticeDialog
          preview
          notice={values}
          onClose={() => setPreview(false)}
        />
      )}
      <ConfirmDialog
        open={confirmTemplate}
        onOpenChange={setConfirmTemplate}
        title={t('Replace popup content with the template?')}
        desc={t(
          'This replaces the title and content. Your audience, frequency, and display duration will stay the same.'
        )}
        confirmText={t('Replace with template')}
        disabled={save.isPending}
        handleConfirm={() => {
          if (pendingTemplate) applyTemplate(pendingTemplate)
        }}
      />
      <ConfirmDialog
        open={pendingPublication !== null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setPendingPublication(null)
        }}
        title={t('Publish popup?')}
        desc={
          <div className='space-y-2'>
            <p>
              {t('Recipients will see this popup when they open the site.')}
            </p>
            <p className='font-medium'>
              {pendingPublication
                ? popupAudienceLabel(pendingPublication.audience, t)
                : ''}
              {pendingPublication?.audience === 'user'
                ? ` (#${pendingPublication.target_user_id})`
                : ''}
            </p>
            <p>
              {pendingPublication
                ? popupFrequencyLabel(pendingPublication.frequency, t)
                : ''}
            </p>
            <p>
              {pendingPublication
                ? popupDurationLabel(
                    Number(pendingPublication.duration_days),
                    t,
                    locale
                  )
                : ''}
            </p>
            <p>
              {t(
                'Saving a draft does not send anything. The display period starts when you publish.'
              )}
            </p>
          </div>
        }
        confirmText={t('Publish')}
        isLoading={save.isPending}
        className='sm:max-w-2xl'
        handleConfirm={() => {
          if (pendingPublication) {
            save.mutate({ values: pendingPublication, publish: true })
          }
        }}
      >
        {pendingPublication && (
          <div className='max-h-[35dvh] overflow-auto rounded-lg border p-3'>
            <h4 className='mb-3 font-medium'>{pendingPublication.title}</h4>
            <PopupContent
              content={pendingPublication.content}
              format={pendingPublication.format}
            />
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
