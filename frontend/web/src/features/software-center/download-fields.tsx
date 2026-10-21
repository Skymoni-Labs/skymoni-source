import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

import type { SoftwareEntry } from './types'

export function SoftwareDownloadFields(props: {
  form: UseFormReturn<SoftwareEntry>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'downloads',
  })
  return (
    <section
      className='space-y-4 border-t pt-5'
      aria-label={t('Platform downloads')}
    >
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h3 className='font-semibold'>{t('Platform downloads')}</h3>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Add official installers, web apps, app stores or cloud drive links for each platform.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.disabled || fields.length >= 16}
          onClick={() =>
            append({
              platform: '',
              label: '',
              url: '',
              filename: '',
              version: '',
              kind: 'installer',
            })
          }
        >
          <Plus aria-hidden />
          {t('Add platform')}
        </Button>
      </div>
      {fields.map((field, index) => (
        <div key={field.id} className='space-y-3 rounded-xl border p-4'>
          <div className='flex items-center justify-between'>
            <span className='text-sm'>
              {t('Platform')} {index + 1}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              disabled={props.disabled}
              aria-label={t('Remove platform {{number}}', {
                number: index + 1,
              })}
              onClick={() => remove(index)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {(
              [
                ['platform', 'Platform'],
                ['label', 'Download label'],
                ['url', 'Download or website URL'],
                ['filename', 'Installer filename'],
                ['version', 'Version'],
              ] as const
            ).map(([key, label]) => (
              <FormField
                key={key}
                control={props.form.control}
                name={`downloads.${index}.${key}`}
                render={({ field: input }) => (
                  <FormItem>
                    <FormLabel>{t(label)}</FormLabel>
                    <FormControl>
                      <Input
                        {...input}
                        value={input.value ?? ''}
                        disabled={props.disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={props.form.control}
              name={`downloads.${index}.kind`}
              render={({ field: input }) => (
                <FormItem>
                  <FormLabel>{t('Download type')}</FormLabel>
                  <FormControl>
                    <NativeSelect
                      {...input}
                      className='w-full'
                      disabled={props.disabled}
                    >
                      <option value='installer'>{t('Direct installer')}</option>
                      <option value='website'>
                        {t('Website or app store')}
                      </option>
                      <option value='cloud'>{t('Cloud drive download')}</option>
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}
      {props.form.formState.errors.downloads?.message && (
        <p role='alert' className='text-destructive text-sm'>
          {t(String(props.form.formState.errors.downloads.message))}
        </p>
      )}
    </section>
  )
}
