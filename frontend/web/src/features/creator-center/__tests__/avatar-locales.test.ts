import { createInstance } from 'i18next'
import { expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'

test('avatar upload and accessible image names translate in every supported locale', async () => {
  const resources = { en, fr, ja, ru, vi, zhTW, zhCN }
  const i18n = createInstance()
  await i18n.init({ resources, lng: 'zhCN', fallbackLng: false })
  expect(i18n.t('Upload picture')).toBe('上传头像')
  expect(i18n.t('Profile picture of {{name}}', { name: 'Moni' })).toBe(
    'Moni的头像'
  )
  for (const language of Object.keys(resources)) {
    await i18n.changeLanguage(language)
    expect(i18n.exists('Upload picture')).toBe(true)
    expect(i18n.exists('Profile picture of {{name}}')).toBe(true)
    expect(i18n.t('Profile picture of {{name}}', { name: 'Moni' })).toContain(
      'Moni'
    )
  }
})
