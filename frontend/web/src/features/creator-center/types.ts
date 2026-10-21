export const categories = [
  { id: 'all', label: 'Explore everything' },
  { id: 'website', label: 'Websites & web apps' },
  { id: 'software', label: 'Software & tools' },
  { id: 'design', label: 'Design & resources' },
  { id: 'article', label: 'Articles & guides' },
  { id: 'workflow', label: 'AI & workflows' },
  { id: 'other', label: 'Other creations' },
] as const

export type Category = Exclude<(typeof categories)[number]['id'], 'all'>
export const blockTypes = [
  'heading',
  'text',
  'markdown',
  'gallery',
  'link',
  'code',
  'callout',
  'list',
  'divider',
] as const
export type BlockType = (typeof blockTypes)[number]
export type ContentBlock = {
  id: string
  type: BlockType
  title: string
  text: string
  url: string
  visible: boolean
}
export type ProjectSettings = {
  accent: string
  layout: 'story' | 'showcase' | 'compact'
  coverRatio: 'wide' | 'standard' | 'square'
  showCover: boolean
  showDescription: boolean
  showGallery: boolean
  showFiles: boolean
  showRelated: boolean
  listed: boolean
  buttonLabel: string
  categoryName: string
  usage: string
  links: { id: string; label: string; url: string }[]
  metadata: { id: string; label: string; value: string }[]
}
export function defaultSettings(): ProjectSettings {
  return {
    accent: '#438fe7',
    layout: 'story',
    coverRatio: 'wide',
    showCover: true,
    showDescription: true,
    showGallery: true,
    showFiles: true,
    showRelated: true,
    listed: true,
    buttonLabel: '',
    categoryName: '',
    usage: '',
    links: [],
    metadata: [],
  }
}
export function settingsFor(work: Work): ProjectSettings {
  return { ...defaultSettings(), ...work.settings }
}
export function createBlock(type: BlockType): ContentBlock {
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    text: '',
    url: '',
    visible: true,
  }
}
export type Work = {
  id: string
  title: string
  summary: string
  description: string
  author: string
  category: Category
  tags: string
  url: string
  cover: string
  homePoster?: string
  images: string[]
  attachment?: { id: string; name: string; size: number }
  style:
    | 'horizon'
    | 'notes'
    | 'palette'
    | 'flow'
    | 'guide'
    | 'orbit'
    | 'cloud'
    | 'prompt'
  ownerId?: number
  revision?: string
  reviewNote?: string
  status: 'draft' | 'review' | 'published'
  updatedAt: number
  sample?: boolean
  blocks?: ContentBlock[]
  settings?: ProjectSettings
}

export function categoryLabel(category: Category): string {
  return categories.find((item) => item.id === category)?.label ?? category
}

export function publicationLabel(status: Work['status']): string {
  if (status === 'published') return 'Published'
  if (status === 'review') return 'Pending review'
  return 'Draft'
}

export function emptyWork(): Work {
  return {
    id: crypto.randomUUID(),
    title: '',
    summary: '',
    description: '',
    author: 'You',
    category: 'website',
    tags: '',
    url: '',
    cover: '',
    images: [],
    style: 'horizon',
    status: 'draft',
    updatedAt: Date.now(),
  }
}
