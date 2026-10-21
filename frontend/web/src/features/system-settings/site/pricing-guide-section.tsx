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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PricingConversionGuide } from '@/features/pricing/components/pricing-conversion-guide'
import {
  DEFAULT_PRICING_GUIDE,
  parsePricingGuideConfig,
  pricingGuideSchema,
  type PricingGuideConfig,
} from '@/features/pricing/lib/guide-config'

import {
  SettingsForm,
  SettingsSwitchItem,
  SettingsSwitchContent,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export function PricingGuideSection(props: { defaultValue: string }) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const defaults = useMemo(
    () => parsePricingGuideConfig(props.defaultValue),
    [props.defaultValue]
  )
  const form = useForm<PricingGuideConfig>({
    resolver: zodResolver(pricingGuideSchema),
    defaultValues: defaults,
  })
  const watched = useWatch({ control: form.control })
  const preview: PricingGuideConfig = {
    showConversion: watched.showConversion ?? defaults.showConversion,
    conversionTitle: watched.conversionTitle ?? defaults.conversionTitle,
    conversionContent: watched.conversionContent ?? defaults.conversionContent,
    showSuffix: watched.showSuffix ?? defaults.showSuffix,
    suffixTitle: watched.suffixTitle ?? defaults.suffixTitle,
    suffixContent: watched.suffixContent ?? defaults.suffixContent,
  }
  useEffect(() => {
    form.reset(defaults)
  }, [defaults, form])

  const onSubmit = async (values: PricingGuideConfig) => {
    try {
      await updateOption.mutateAsync({
        key: 'PricingGuideConfig',
        value: JSON.stringify(values),
      })
      form.reset(values)
    } catch {
      // The shared mutation hook shows the error; preserve the unsaved draft.
    }
  }

  const loadDefaultText = () => {
    form.setValue('conversionTitle', t('Model price conversion guide'), {
      shouldDirty: true,
    })
    form.setValue(
      'conversionContent',
      [
        t('Base package conversion basis', {
          price: '{{packagePrice}}',
          credits: '{{packageCredits}}',
        }),
        `${t('1 site USD credit')} ≈ ¥{{creditPrice}} ≈ \${{usdPerCredit}} ${t('real USD equivalent')}`,
        t('Model price conversion formula', {
          creditPrice: '{{creditPrice}}',
          exchangeRate: '{{exchangeRate}}',
        }),
        t('Daily FX reference detail', { date: '{{fxDate}}' }),
        t('Site credit and model token distinction'),
      ].join('\n'),
      { shouldDirty: true }
    )
    form.setValue('suffixTitle', t('Model billing suffixes'), {
      shouldDirty: true,
    })
    form.setValue(
      'suffixContent',
      [
        `-token ${t('Billed by actual input, output, and cache Token usage.')}`,
        `-token-pro ${t('Same base model with backup support for stability; billed by Token.')}`,
        t('Use the full model name; see the model card for pricing.'),
      ].join('\n'),
      { shouldDirty: true }
    )
  }

  return (
    <SettingsSection title={t('Model square guide')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save pricing guide'
          />
          <p className='text-muted-foreground text-sm'>
            {t(
              'Customize the public model square guide. Empty fields use the original default text. These settings change explanations only, not model prices or billing.'
            )}
          </p>
          <div className='flex flex-wrap items-center gap-3'>
            <Button type='button' variant='outline' onClick={loadDefaultText}>
              {t('Load default text for editing')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Load the existing text to edit it. Changes take effect after saving.'
              )}
            </p>
          </div>
          {(
            [
              {
                enabled: 'showConversion',
                title: 'conversionTitle',
                content: 'conversionContent',
                label: 'Model price conversion guide',
                titleLabel: 'Conversion guide title',
                contentLabel: 'Conversion guide content',
              },
              {
                enabled: 'showSuffix',
                title: 'suffixTitle',
                content: 'suffixContent',
                label: 'Model billing suffixes',
                titleLabel: 'Model suffix guide title',
                contentLabel: 'Model suffix guide content',
              },
            ] as const
          ).map((section) => (
            <div
              key={section.enabled}
              className='min-w-0 space-y-4 rounded-xl border p-4'
            >
              <FormField
                control={form.control}
                name={section.enabled}
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t(section.label)}</FormLabel>
                      <FormDescription>
                        {t('Show this section on the model square')}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
              <FormField
                control={form.control}
                name={section.title}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(section.titleLabel)}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={120}
                        placeholder={t(section.label)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={section.content}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(section.contentLabel)}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={7}
                        maxLength={8000}
                        placeholder={t(
                          'Leave empty to use the default content'
                        )}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Plain text; line breaks are preserved. Leave empty to restore the default content.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {section.enabled === 'showConversion' && (
                <p className='text-muted-foreground text-xs break-words'>
                  {t('Supported automatic values')}:{' '}
                  <code>
                    {
                      '{{packagePrice}} · {{packageCredits}} · {{creditPrice}} · {{usdPerCredit}} · {{exchangeRate}} · {{fxDate}}'
                    }
                  </code>
                </p>
              )}
            </div>
          ))}
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h4 className='font-medium'>{t('Live preview')}</h4>
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  form.reset(
                    { ...DEFAULT_PRICING_GUIDE },
                    { keepDefaultValues: true }
                  )
                }
              >
                {t('Use default guide')}
              </Button>
            </div>
            <PricingConversionGuide config={preview} />
            {!preview.showConversion && !preview.showSuffix && (
              <p className='text-muted-foreground text-sm'>
                {t('Both guide sections are hidden.')}
              </p>
            )}
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
