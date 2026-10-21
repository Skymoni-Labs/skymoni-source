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
import { Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const MODEL_NAME_GUIDE = [
  {
    suffix: '-token',
    descriptionKey: 'Billed by actual input, output, and cache Token usage.',
  },
  {
    suffix: '-token-pro',
    descriptionKey:
      'Same base model with backup support for stability; billed by Token.',
  },
] as const

export function PricingModelNameGuide(
  props: { title?: string; content?: string; separated?: boolean } = {}
) {
  const { t } = useTranslation()

  return (
    <div
      className={
        props.separated === false
          ? 'text-xs leading-relaxed'
          : 'border-t pt-2 text-xs leading-relaxed'
      }
    >
      <div className='mb-1 flex items-center gap-2'>
        <Tag aria-hidden='true' className='size-4 shrink-0 text-sky-600' />
        <h3 className='text-sm font-semibold'>
          {props.title || t('Model billing suffixes')}
        </h3>
      </div>
      {props.content?.trim() ? (
        <p className='text-muted-foreground break-words whitespace-pre-wrap'>
          {props.content}
        </p>
      ) : (
        <>
          <dl
            aria-label={props.title || t('Model billing suffixes')}
            className='space-y-1'
          >
            {MODEL_NAME_GUIDE.map((item) => (
              <div key={item.descriptionKey}>
                <dt className='text-foreground inline font-medium'>
                  <code className='font-mono'>{item.suffix}</code>
                </dt>{' '}
                <dd className='text-muted-foreground inline'>
                  {t(item.descriptionKey)}
                </dd>
              </div>
            ))}
          </dl>
          <p className='text-muted-foreground mt-1'>
            {t('Use the full model name; see the model card for pricing.')}
          </p>
        </>
      )}
    </div>
  )
}
