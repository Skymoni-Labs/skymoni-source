import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Form } from '@/components/ui/form'
import { handleServerError } from '@/lib/handle-server-error'

import { resolveSoftwareFeatured } from './featured-selection'
import { softwareFeaturedSchema } from './lib/schema'
import type { SoftwareCatalog, SoftwareFeaturedConfig } from './types'

const placements = [
  {
    name: 'carousel',
    title: 'Main carousel',
    description:
      'Choose up to 5 items. They rotate in this order every 4 seconds.',
    limit: 5,
  },
  {
    name: 'tiles',
    title: 'Right-side cards',
    description: 'Choose up to 3 items. The first card is larger.',
    limit: 3,
  },
] as const

export function SoftwareFeaturedEditor(props: {
  catalog: SoftwareCatalog
  onClose: () => void
  onSave: (config: SoftwareFeaturedConfig) => Promise<void>
}) {
  const { t } = useTranslation()
  const id = useId()
  const automatic = resolveSoftwareFeatured(props.catalog.items)
  const config = props.catalog.featured ?? {
    carousel: automatic.carousel.map((entry) => entry.id),
    tiles: automatic.tiles.map((entry) => entry.id),
  }
  const form = useForm<SoftwareFeaturedConfig>({
    resolver: zodResolver(softwareFeaturedSchema),
    defaultValues: {
      carousel: Array.from(
        { length: 5 },
        (_, index) => config.carousel[index] ?? ''
      ),
      tiles: Array.from({ length: 3 }, (_, index) => config.tiles[index] ?? ''),
    },
  })
  const selected = useWatch({ control: form.control })
  const busy = form.formState.isSubmitting
  const [failed, setFailed] = useState(false)
  const submit = form.handleSubmit(async (value) => {
    setFailed(false)
    try {
      await props.onSave(value)
      props.onClose()
    } catch (error) {
      setFailed(true)
      handleServerError(error)
    }
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose()
      }}
      title={t('Configure recommendations')}
      description={t(
        'Choose published software or tools for each area. Empty areas are hidden. Changes take effect after saving.'
      )}
      contentClassName='sm:max-w-3xl'
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form={id} disabled={busy}>
            {t(busy ? 'Saving...' : 'Save recommendations')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form id={id} onSubmit={submit} className='space-y-5'>
          {placements.map((placement) => {
            const values = selected[placement.name] ?? []
            return (
              <fieldset
                key={placement.name}
                disabled={busy}
                className='min-w-0 space-y-3 rounded-xl border p-4'
              >
                <legend className='px-2 text-sm font-semibold'>
                  {t(placement.title)}
                </legend>
                <p className='text-muted-foreground text-xs'>
                  {t(placement.description)}
                </p>
                {Array.from({ length: placement.limit }, (_, index) => {
                  const value = values[index] ?? ''
                  const entry = props.catalog.items.find(
                    (item) => item.id === value
                  )
                  const label = t('{{area}} position {{number}}', {
                    area: t(placement.title),
                    number: index + 1,
                  })
                  const options = props.catalog.items
                    .filter(
                      (item) =>
                        item.id === value ||
                        (item.published && !values.includes(item.id))
                    )
                    .map((item) => ({
                      value: item.id,
                      label: `${t(item.name, { defaultValue: item.name })} · ${t(item.kind === 'software' ? 'Software' : 'Tool')}${item.published ? '' : ` · ${t('Draft')}`}`,
                      disabled: !item.published,
                    }))
                  return (
                    <div key={index} className='space-y-1'>
                      <div className='flex min-w-0 items-center gap-2'>
                        <span
                          className='bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs'
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <Combobox
                          id={`${id}-${placement.name}-${index}`}
                          aria-label={label}
                          className='min-w-0 flex-1'
                          options={options}
                          value={value}
                          placeholder={t('Select software or tool')}
                          disabled={busy}
                          onValueChange={(next) =>
                            form.setValue(
                              `${placement.name}.${index}`,
                              next ?? '',
                              { shouldDirty: true }
                            )
                          }
                        />
                        {([-1, 1] as const).map((direction) => (
                          <Button
                            key={direction}
                            type='button'
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t(
                              direction < 0
                                ? 'Move {{position}} up'
                                : 'Move {{position}} down',
                              { position: label }
                            )}
                            disabled={
                              busy ||
                              index + direction < 0 ||
                              index + direction >= placement.limit
                            }
                            onClick={() => {
                              const next = Array.from(
                                { length: placement.limit },
                                (_, position) => values[position] ?? ''
                              )
                              ;[next[index], next[index + direction]] = [
                                next[index + direction] ?? '',
                                next[index] ?? '',
                              ]
                              form.setValue(placement.name, next, {
                                shouldDirty: true,
                              })
                            }}
                          >
                            <HugeiconsIcon
                              icon={
                                direction < 0 ? ArrowUp01Icon : ArrowDown01Icon
                              }
                              size={16}
                              aria-hidden
                            />
                          </Button>
                        ))}
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          disabled={busy || !value}
                          aria-label={t('Clear {{position}}', {
                            position: label,
                          })}
                          onClick={() =>
                            form.setValue(`${placement.name}.${index}`, '', {
                              shouldDirty: true,
                            })
                          }
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={16}
                            aria-hidden
                          />
                        </Button>
                      </div>
                      {entry && !entry.published && (
                        <p className='text-muted-foreground pl-8 text-xs'>
                          {t(
                            'This item is unpublished and will stay hidden until published again.'
                          )}
                        </p>
                      )}
                    </div>
                  )
                })}
                {form.formState.errors[placement.name]?.message && (
                  <p role='alert' className='text-destructive text-sm'>
                    {t(form.formState.errors[placement.name]?.message ?? '')}
                  </p>
                )}
              </fieldset>
            )
          })}
          {failed && (
            <p role='alert' className='text-destructive text-sm'>
              {t(
                'Recommendations were not saved. Your selection is kept; please retry.'
              )}
            </p>
          )}
        </form>
      </Form>
    </Dialog>
  )
}
