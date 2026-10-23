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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { handleServerError } from '@/lib/handle-server-error'

import {
  createMailDraft,
  getMailDraftInput,
  getMailTemplateInput,
  previewMail,
  updateMailDraft,
} from '../api'
import {
  mailFormSchema,
  parseRecipientEmails,
  type MailFormValues,
} from '../lib/schema'
import type { MailCampaign, MailInput } from '../types'
import { MailEditorFields } from './editor-fields'
import { MailPreview } from './mail-preview'
import { SkivuBetaMailPanel } from './skivu-beta-panel'

const defaults: MailFormValues = {
  subject: '',
  content: '',
  format: 'text',
  audience: 'emails',
  user_ids: [],
  recipient_emails: '',
}

export function MailComposer(props: {
  draftId?: number | null
  templateId?: number | null
  onSaved: (campaign: MailCampaign) => void
  onCancelEdit?: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<MailFormValues>({
    resolver: zodResolver(mailFormSchema),
    defaultValues: defaults,
  })
  const [html, setHtml] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectingRecipients, setSelectingRecipients] = useState(false)
  const sourceId = props.draftId ?? props.templateId
  const request = useRef({ key: crypto.randomUUID(), fingerprint: '' })
  const draft = useQuery({
    queryKey: ['admin-mail', 'compose', props.draftId, props.templateId],
    queryFn: () => {
      if (props.draftId) return getMailDraftInput(props.draftId)
      if (props.templateId) return getMailTemplateInput(props.templateId)
      throw new Error('No email source selected')
    },
    enabled: sourceId !== null && sourceId !== undefined,
  })
  useEffect(() => {
    request.current = { key: crypto.randomUUID(), fingerprint: '' }
    if (!sourceId) {
      form.reset(defaults)
      setHtml('')
      return
    }
    if (!draft.data) return
    form.reset({
      subject: draft.data.subject,
      content: draft.data.content,
      format: draft.data.format,
      audience: draft.data.audience,
      user_ids: draft.data.user_ids,
      recipient_emails: draft.data.emails.join('\n'),
    })
  }, [draft.data, form, sourceId, props.templateId])
  const preview = useMutation({
    mutationFn: previewMail,
    onSuccess: setHtml,
    onError: (error) => handleServerError(error),
  })
  const save = useMutation({
    mutationFn: (input: MailInput) =>
      props.draftId
        ? updateMailDraft(props.draftId, input)
        : createMailDraft(input),
    onSuccess: (campaign) => {
      void client.invalidateQueries({ queryKey: ['admin-mail'] })
      toast.success(
        props.draftId
          ? t('Email draft updated; nothing has been sent.')
          : t('Email draft saved; nothing has been sent.')
      )
      props.onSaved(campaign)
      form.reset(defaults)
      props.onCancelEdit?.()
      setHtml('')
      request.current = { key: crypto.randomUUID(), fingerprint: '' }
    },
    onError: (error) => handleServerError(error),
  })
  const submit = (values: MailFormValues, action: 'preview' | 'save') => {
    const fingerprint = JSON.stringify(values)
    if (request.current.fingerprint !== fingerprint) {
      request.current = { key: crypto.randomUUID(), fingerprint }
    }
    const input: MailInput = {
      subject: values.subject,
      content: values.content,
      format: values.format,
      audience: values.audience,
      request_key: request.current.key,
      user_ids: values.audience === 'users' ? values.user_ids : [],
      emails:
        values.audience === 'emails'
          ? parseRecipientEmails(values.recipient_emails)
          : [],
    }
    if (action === 'preview') preview.mutate(input)
    else save.mutate(input)
  }
  const busy =
    save.isPending || preview.isPending || uploading || selectingRecipients
  let composerTitle = 'Compose email'
  if (props.draftId) composerTitle = 'Edit email draft'
  else if (props.templateId) composerTitle = 'Reuse email template'
  return (
    <Form {...form}>
      <div className='grid min-w-0 gap-4 xl:grid-cols-2'>
        <SkivuBetaMailPanel
          disabled={busy || draft.isLoading}
          onEdit={() => setHtml('')}
          onBusyChange={setUploading}
        />
        <Card className='min-w-0'>
          <CardHeader>
            <CardTitle>{t(composerTitle)}</CardTitle>
            <CardDescription>
              {props.templateId
                ? t(
                    'Edit this template and save it as a new draft. Review it before sending.'
                  )
                : t(
                    'Save a draft, review the recipients, then confirm sending.'
                  )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {draft.isError && sourceId && (
              <ErrorState
                onRetry={() => {
                  void draft.refetch()
                }}
              />
            )}
            <form
              onSubmit={(event) => {
                void form.handleSubmit((values) => submit(values, 'save'))(
                  event
                )
              }}
            >
              <fieldset
                disabled={
                  busy ||
                  draft.isLoading ||
                  (sourceId !== null && sourceId !== undefined && draft.isError)
                }
                className='min-w-0 space-y-4'
              >
                <MailEditorFields
                  onEdit={() => setHtml('')}
                  onUploadState={setUploading}
                  onRecipientsBusy={setSelectingRecipients}
                />
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy}
                    onClick={() => {
                      void form.handleSubmit((values) =>
                        submit(values, 'preview')
                      )()
                    }}
                  >
                    {preview.isPending ? t('Loading...') : t('Preview')}
                  </Button>
                  {sourceId && (
                    <Button
                      type='button'
                      variant='outline'
                      onClick={props.onCancelEdit}
                    >
                      {t('Stop editing')}
                    </Button>
                  )}
                  <Button type='submit' disabled={busy || draft.isLoading}>
                    {save.isPending
                      ? t('Saving...')
                      : t(
                          props.draftId
                            ? 'Update email draft'
                            : 'Save email draft'
                        )}
                  </Button>
                </div>
              </fieldset>
            </form>
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader>
            <CardTitle>{t('Email preview')}</CardTitle>
            <CardDescription>
              {t('The preview uses the same rendered content as the email.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='max-h-[640px] min-h-64 overflow-auto'>
            {html ? (
              <MailPreview html={html} />
            ) : (
              <EmptyState
                icon={Mail}
                title={t('Preview your email')}
                description={t(
                  'Enter a subject, content and recipients, then click Preview.'
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </Form>
  )
}
