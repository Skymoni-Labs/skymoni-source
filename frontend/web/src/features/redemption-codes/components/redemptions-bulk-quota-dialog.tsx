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
import { useMutation } from '@tanstack/react-query'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { getCurrencyLabel } from '@/lib/currency'
import { getEditableQuotaStep, parseQuotaFromDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import { batchUpdateRedemptionQuota } from '../api'
import type { Redemption } from '../types'

type Props = {
  targets: Redemption[] | null
  onClose: () => void
  onUpdated: (targets: Redemption[]) => void
}

export function RedemptionsBulkQuotaDialog(props: Props) {
  const { t } = useTranslation()
  const formId = useId()
  const formSchema = z.object({
    quota_dollars: z.number().positive(t('Quota must be a positive number')),
  })
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { quota_dollars: 0 },
  })

  const update = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (!props.targets?.length) {
        return 0
      }
      const quota = parseQuotaFromDollars(values.quota_dollars)
      if (!Number.isSafeInteger(quota) || quota <= 0) {
        throw new Error(t('Quota must be a positive number'))
      }
      const result = await batchUpdateRedemptionQuota(
        props.targets.map((code) => code.id),
        quota
      )
      if (!result.success) throw createServerError(result)
      return result.data ?? 0
    },
    onSuccess: (count) => {
      if (!props.targets?.length) {
        return
      }
      toast.success(
        t('Updated quota for {{count}} redemption codes', { count })
      )
      props.onUpdated(props.targets)
      form.reset()
      props.onClose()
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <Dialog
      open={props.targets !== null}
      onOpenChange={(open) => {
        if (!open && !update.isPending) {
          form.reset()
          props.onClose()
        }
      }}
      title={t('Reset selected quotas')}
      description={t(
        'Set a new quota for {{count}} selected unused codes. Redeemed codes cannot be changed.',
        { count: props.targets?.length ?? 0 }
      )}
      contentClassName='sm:max-w-md'
      footer={
        <>
          <Button
            variant='outline'
            onClick={props.onClose}
            disabled={update.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button form={formId} type='submit' disabled={update.isPending}>
            {update.isPending ? t('Saving...') : t('Reset quota')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit((values) => update.mutate(values))}
        >
          <FormField
            control={form.control}
            name='quota_dollars'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Quota ({{currency}})', { currency: getCurrencyLabel() })}
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min={getEditableQuotaStep()}
                    step={getEditableQuotaStep()}
                    onChange={(event) =>
                      field.onChange(Number.parseFloat(event.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
