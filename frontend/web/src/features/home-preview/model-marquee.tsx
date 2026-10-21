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
import { Anthropic, DeepSeek, Gemini, OpenAI } from '@lobehub/icons'
import { useTranslation } from 'react-i18next'

const models = [
  { name: 'OpenAI', icon: OpenAI },
  { name: 'Claude', icon: Anthropic },
  { name: 'Gemini', icon: Gemini },
  { name: 'DeepSeek', icon: DeepSeek },
] as const

// ScrollingIcons renders vertical icon cards; this strip pairs logos with names horizontally.
export function ModelMarquee() {
  const { t } = useTranslation()

  return (
    <section
      className='hp-model-marquee hp-container'
      aria-labelledby='model-marquee-heading'
    >
      <h2 id='model-marquee-heading'>{t('Connect familiar models')}</h2>
      <div className='hp-model-marquee-viewport'>
        <div className='hp-model-marquee-track'>
          {[0, 1, 2, 3].map((copy) => (
            <ul
              key={copy}
              className='hp-model-marquee-group'
              aria-hidden={copy > 0 ? true : undefined}
            >
              {models.map((model) => (
                <li key={model.name}>
                  <model.icon size={27} aria-hidden='true' />
                  <span>{model.name}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}
