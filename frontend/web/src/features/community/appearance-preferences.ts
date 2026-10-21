export type CommunityAppearancePreferences = {
  cursor: 'cloud' | 'star' | 'native'
  effects: boolean
}
export const appearanceKey = 'skymoni:community-appearance:v1'
export const defaultAppearance: CommunityAppearancePreferences = {
  cursor: 'cloud',
  effects: true,
}

export function readAppearance(): CommunityAppearancePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(appearanceKey) || 'null')
    return {
      cursor: ['cloud', 'star', 'native'].includes(value?.cursor)
        ? value.cursor
        : defaultAppearance.cursor,
      effects:
        typeof value?.effects === 'boolean'
          ? value.effects
          : defaultAppearance.effects,
    }
  } catch {
    return defaultAppearance
  }
}

export function saveAppearance(value: CommunityAppearancePreferences) {
  try {
    localStorage.setItem(appearanceKey, JSON.stringify(value))
  } catch {
    /* Preferences remain usable without storage. */
  }
}
