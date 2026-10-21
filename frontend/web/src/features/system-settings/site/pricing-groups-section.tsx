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
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  BUSINESS_PRICING_GROUPS,
  getPricingGroupLabel,
  isBusinessPricingGroup,
} from '@/features/pricing/lib/group-display'
import {
  parsePricingVisibleGroups,
  pricingGroupSelectionSchema,
  type PricingGroupSelection,
} from '@/features/pricing/lib/group-visibility'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export function PricingGroupsSection(props: {
  defaultValue: string
  groupRatio: string
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const existing = useMemo(() => {
    try {
      const ratios: unknown = JSON.parse(props.groupRatio || '{}')
      if (ratios && typeof ratios === 'object' && !Array.isArray(ratios)) {
        return Object.keys(ratios).filter((group) => group && group !== 'auto')
      }
    } catch {
      /* No configured groups to select. */
    }
    return []
  }, [props.groupRatio])
  const defaults = useMemo(() => {
    const saved = parsePricingVisibleGroups(props.defaultValue)
    const legacy = [
      ...new Set([...BUSINESS_PRICING_GROUPS, ...existing]),
    ].filter(
      (group) => existing.includes(group) && isBusinessPricingGroup(group)
    )
    return {
      groups: (saved ?? legacy).filter((group) => existing.includes(group)),
    }
  }, [existing, props.defaultValue])
  const form = useForm<PricingGroupSelection>({
    resolver: zodResolver(pricingGroupSelectionSchema),
    defaultValues: defaults,
  })
  const selected = useWatch({ control: form.control, name: 'groups' }) ?? []
  useEffect(() => {
    form.reset(defaults)
  }, [defaults, form])

  const onSubmit = async (values: PricingGroupSelection) => {
    try {
      await updateOption.mutateAsync({
        key: 'PricingVisibleGroups',
        value: JSON.stringify(values.groups),
      })
      form.reset(values)
    } catch {
      // Keep the selection available for retry; the shared hook reports the error.
    }
  }

  return (
    <SettingsSection title={t('Edit model square groups')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save displayed groups'
          />
          <p className='text-muted-foreground text-sm'>
            {t(
              'Choose which existing groups appear in the model square. Changes take effect after saving.'
            )}
          </p>
          <FormField
            control={form.control}
            name='groups'
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('Groups displayed in the model square')}
                </FormLabel>
                <FormControl>
                  <MultiSelect
                    options={existing.map((group) => ({
                      value: group,
                      label: getPricingGroupLabel(group, t),
                      hint: group,
                    }))}
                    selected={field.value}
                    onChange={field.onChange}
                    allowCreate={false}
                    placeholder={t('Select existing groups')}
                    maxVisibleChips={6}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Selected groups appear in the model square filters. Groups without visible models show an empty state.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={!existing.length}
              onClick={() =>
                form.setValue('groups', existing, { shouldDirty: true })
              }
            >
              {t('Select all')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={!selected.length}
              onClick={() => form.setValue('groups', [], { shouldDirty: true })}
            >
              {t('Clear selection')}
            </Button>
            <span className='text-muted-foreground text-sm'>
              {t('{{count}} groups selected', { count: selected.length })}
            </span>
          </div>
          {!existing.length && (
            <p className='text-muted-foreground text-sm'>
              {t('No existing groups. Create a group first in group settings.')}
            </p>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
