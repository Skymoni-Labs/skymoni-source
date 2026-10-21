import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ProductImagesEditor } from '@/features/shop-preview/components/product-images'
import { uploadProductImage } from '@/features/shop/api'

import type { SoftwareEntry } from './types'

export function SoftwareDetailsFields(props: {
  form: UseFormReturn<SoftwareEntry>
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const details = useWatch({ control: props.form.control, name: 'details' })
  const name = useWatch({ control: props.form.control, name: 'name' })
  const fields = [
    ['overview', 'Software introduction', 12000],
    ['features', 'Key features (one per line)', 4000],
    ['changelog', "What's new in this version", 4000],
    ['requirements', 'System requirements', 2000],
    ['publisher', 'Publisher', 120],
    ['category', 'Software category', 80],
    ['license', 'License', 120],
    ['updatedAt', 'Last updated', 10],
  ] as const
  return (
    <section
      className='space-y-4 border-t pt-5'
      aria-label={t('Software details')}
    >
      <div>
        <h3 className='font-semibold'>{t('Software details')}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t(
            'Optional fields appear on the public detail page. Leave unknown information blank.'
          )}
        </p>
      </div>
      {fields.map(([key, label, limit], index) => (
        <FormField
          key={key}
          control={props.form.control}
          name={`details.${key}`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t(label)}</FormLabel>
              <FormControl>
                {index < 4 ? (
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    maxLength={limit}
                    disabled={props.disabled}
                  />
                ) : (
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    type={key === 'updatedAt' ? 'date' : 'text'}
                    maxLength={limit}
                    disabled={props.disabled}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
      <ProductImagesEditor
        label={t('Show software screenshots')}
        uploadLabel={t('Choose software screenshots')}
        enabled={details?.screenshotsEnabled !== false}
        images={details?.screenshots ?? []}
        imageLayout={details?.imageLayout ?? 'landscape'}
        name={name}
        disabled={props.disabled}
        onEnabledChange={(value) =>
          props.form.setValue('details.screenshotsEnabled', value, {
            shouldDirty: true,
          })
        }
        onLayoutChange={(value) =>
          props.form.setValue('details.imageLayout', value, {
            shouldDirty: true,
          })
        }
        onChange={(images) =>
          props.form.setValue('details.screenshots', images, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        onBusyChange={props.onBusyChange}
        onUpload={uploadProductImage}
      />
      {props.form.formState.errors.details?.screenshots && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Check screenshot links and upload up to 12 images.')}
        </p>
      )}
    </section>
  )
}
