import { createInstance } from 'i18next'
import { expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

test('GitHub labels resolve from the real configured translation namespace', async () => {
  const instance = createInstance()
  await instance.init({
    lng: 'zh',
    fallbackLng: 'en',
    resources: { en, zh, 'zh-TW': zhTW },
    nsSeparator: false,
    interpolation: { escapeValue: false },
  })
  expect(instance.t('Connect GitHub')).toBe('连接 GitHub')
  expect(instance.t('GitHub import')).toBe('GitHub 导入')
  expect(instance.t('Page {{page}}', { page: 2 })).toBe('第 2 页')
  await instance.changeLanguage('en')
  expect(instance.t('Connect GitHub')).toBe('Connect GitHub')
  await instance.changeLanguage('zh-TW')
  expect(instance.t('Connect GitHub')).not.toBe('Connect GitHub')
})
