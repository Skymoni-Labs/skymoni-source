import { createInstance } from 'i18next'
import { expect, test } from 'vitest'

import { lazyLanguageBackend } from '../lazy-languages'
import en from '../locales/en.json'
import zhCN from '../locales/zh.json'

test('switching to an unbundled language loads its real translations and switching back preserves Chinese', async () => {
  const i18n = createInstance().use(lazyLanguageBackend)
  await i18n.init({
    resources: { en, zhCN },
    lng: 'zhCN',
    partialBundledLanguages: true,
    fallbackLng: 'en',
    nsSeparator: false,
  })
  expect(i18n.t('Download')).toBe(zhCN.translation.Download)
  await i18n.changeLanguage('ja')
  const ja = await import('../locales/ja.json')
  expect(i18n.t('Download')).toBe(ja.default.translation.Download)
  await i18n.changeLanguage('zhCN')
  expect(i18n.t('Download')).toBe(zhCN.translation.Download)
})
test('a browser selecting Traditional Chinese receives that dictionary at initialization', async () => {
  const i18n = createInstance().use(lazyLanguageBackend)
  await i18n.init({
    resources: { en, zhCN },
    lng: 'zhTW',
    partialBundledLanguages: true,
    fallbackLng: 'en',
  })
  const zhTW = await import('../locales/zh-TW.json')
  expect(i18n.t('Download')).toBe(zhTW.default.translation.Download)
})
