import type { BackendModule } from 'i18next'

// The common English/Simplified Chinese dictionaries stay synchronous. Other
// languages are cached chunks loaded only when detected or selected by a visitor.
const loaders = {
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
}

export const lazyLanguageBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    const load = loaders[language as keyof typeof loaders]
    if (!load || namespace !== 'translation') {
      callback(null, {})
      return
    }
    void load().then(
      // i18next's backend interface is callback-based; dynamic imports are promises.
      // eslint-disable-next-line promise/no-callback-in-promise
      (resource) => callback(null, resource.default.translation),
      // eslint-disable-next-line promise/no-callback-in-promise
      (error: unknown) =>
        // eslint-disable-next-line promise/no-callback-in-promise
        callback(
          error instanceof Error ? error : new Error('Unable to load language'),
          false
        )
    )
  },
}
