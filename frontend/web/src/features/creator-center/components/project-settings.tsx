import {
  LayoutTemplate,
  Link2,
  Palette,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { ProjectSettings } from '../types'

export function ProjectSettingsEditor(props: {
  value: ProjectSettings
  onChange: (settings: ProjectSettings) => void
}) {
  const { t } = useTranslation()
  const value = props.value
  const patch = (next: Partial<ProjectSettings>) =>
    props.onChange({ ...value, ...next })
  const colors = [
    '#438fe7',
    '#8180d7',
    '#4caa99',
    '#dd9d63',
    '#dc86aa',
    '#66758c',
  ]
  return (
    <section className='cc-editor-block cc-settings'>
      <div className='cc-block-heading'>
        <SlidersHorizontal aria-hidden />
        <h2>{t('Make it your own')}</h2>
        <span>{t('Optional')}</span>
      </div>
      <details open>
        <summary>
          <Palette aria-hidden />
          {t('Appearance & layout')}
        </summary>
        <div className='cc-settings-body'>
          <div className='cc-layout-options'>
            {(['story', 'showcase', 'compact'] as const).map((layout) => (
              <Button
                key={layout}
                type='button'
                variant='outline'
                aria-pressed={value.layout === layout}
                onClick={() => patch({ layout })}
              >
                <LayoutTemplate aria-hidden />
                {t(
                  {
                    story: 'Story layout',
                    showcase: 'Visual showcase',
                    compact: 'Compact layout',
                  }[layout]
                )}
              </Button>
            ))}
          </div>
          <label className='cc-control-label'>
            {t('Accent color')}
            <div className='cc-color-options'>
              {colors.map((color) => (
                <button
                  key={color}
                  type='button'
                  aria-label={color}
                  aria-pressed={value.accent === color}
                  style={{ backgroundColor: color }}
                  onClick={() => patch({ accent: color })}
                />
              ))}
              <Input
                aria-label={t('Custom accent color')}
                type='color'
                value={value.accent}
                onChange={(e) => patch({ accent: e.target.value })}
              />
            </div>
          </label>
          <label className='cc-control-label'>
            {t('Cover proportions')}
            <NativeSelect
              value={value.coverRatio}
              onChange={(e) =>
                patch({
                  coverRatio: e.target.value as ProjectSettings['coverRatio'],
                })
              }
            >
              <option value='wide'>{t('Wide · 16:9')}</option>
              <option value='standard'>{t('Standard · 4:3')}</option>
              <option value='square'>{t('Square · 1:1')}</option>
            </NativeSelect>
          </label>
          <div className='cc-visibility-options'>
            {(
              [
                ['showCover', 'Show cover'],
                ['showDescription', 'Show introduction'],
                ['showGallery', 'Show image section'],
                ['showFiles', 'Show attachments'],
                ['showRelated', 'Show related projects'],
                ['listed', 'Include in the local gallery'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type='checkbox'
                  checked={value[key]}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
      <details>
        <summary>
          <Link2 aria-hidden />
          {t('Buttons & access links')}
        </summary>
        <div className='cc-settings-body'>
          <label className='cc-control-label'>
            {t('Primary button text')}
            <Input
              value={value.buttonLabel}
              maxLength={30}
              placeholder={t('Visit project')}
              onChange={(e) => patch({ buttonLabel: e.target.value })}
            />
          </label>
          <p className='cc-property-note'>
            {t(
              'Add a demo, repository, documentation, video or community link. All are optional.'
            )}
          </p>
          {value.links.map((link, index) => (
            <div className='cc-custom-row' key={link.id}>
              <Input
                aria-label={t('Link label {{number}}', { number: index + 1 })}
                maxLength={40}
                placeholder={t('Button text')}
                value={link.label}
                onChange={(e) =>
                  patch({
                    links: value.links.map((item) =>
                      item.id === link.id
                        ? { ...item, label: e.target.value }
                        : item
                    ),
                  })
                }
              />
              <Input
                aria-label={t('Link URL {{number}}', { number: index + 1 })}
                maxLength={2000}
                placeholder='https://'
                value={link.url}
                onChange={(e) =>
                  patch({
                    links: value.links.map((item) =>
                      item.id === link.id
                        ? { ...item, url: e.target.value }
                        : item
                    ),
                  })
                }
              />
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                aria-label={t('Remove link {{number}}', { number: index + 1 })}
                onClick={() =>
                  patch({
                    links: value.links.filter((item) => item.id !== link.id),
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={value.links.length >= 6}
            onClick={() =>
              patch({
                links: [
                  ...value.links,
                  { id: crypto.randomUUID(), label: '', url: '' },
                ],
              })
            }
          >
            <Plus aria-hidden />
            {t('Add access link')}
          </Button>
        </div>
      </details>
      <details>
        <summary>
          <SlidersHorizontal aria-hidden />
          {t('Custom information & permissions')}
        </summary>
        <div className='cc-settings-body'>
          <label className='cc-control-label'>
            {t('Custom type label')}
            <Input
              maxLength={30}
              value={value.categoryName}
              placeholder={t('For example: Music, 3D model, Photography')}
              onChange={(e) => patch({ categoryName: e.target.value })}
            />
          </label>
          {value.metadata.map((field, index) => (
            <div className='cc-custom-row' key={field.id}>
              <Input
                aria-label={t('Field name {{number}}', { number: index + 1 })}
                maxLength={40}
                placeholder={t('Field name')}
                value={field.label}
                onChange={(e) =>
                  patch({
                    metadata: value.metadata.map((item) =>
                      item.id === field.id
                        ? { ...item, label: e.target.value }
                        : item
                    ),
                  })
                }
              />
              <Input
                aria-label={t('Field value {{number}}', { number: index + 1 })}
                maxLength={300}
                placeholder={t('Field value')}
                value={field.value}
                onChange={(e) =>
                  patch({
                    metadata: value.metadata.map((item) =>
                      item.id === field.id
                        ? { ...item, value: e.target.value }
                        : item
                    ),
                  })
                }
              />
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                aria-label={t('Remove field {{number}}', { number: index + 1 })}
                onClick={() =>
                  patch({
                    metadata: value.metadata.filter(
                      (item) => item.id !== field.id
                    ),
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={value.metadata.length >= 8}
            onClick={() =>
              patch({
                metadata: [
                  ...value.metadata,
                  { id: crypto.randomUUID(), label: '', value: '' },
                ],
              })
            }
          >
            <Plus aria-hidden />
            {t('Add custom field')}
          </Button>
          <label className='cc-control-label'>
            {t('Usage permissions')}
            <Textarea
              rows={3}
              maxLength={1500}
              value={value.usage}
              placeholder={t(
                'Describe how others may use your work. Sharing source code is optional.'
              )}
              onChange={(e) => patch({ usage: e.target.value })}
            />
          </label>
        </div>
      </details>
    </section>
  )
}
