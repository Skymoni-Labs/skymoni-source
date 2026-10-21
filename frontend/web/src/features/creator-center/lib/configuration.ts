import { z } from 'zod'

import { defaultSettings, emptyWork, settingsFor, type Work } from '../types'
import { blockSchema, isSafeProjectUrl, settingsSchema } from './schema'

const image = z
  .string()
  .max(1800000)
  .refine(
    (value) =>
      !value ||
      /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(
        value
      ) ||
      /^\/branding\/[\w./-]+$/.test(value) ||
      isSafeProjectUrl(value)
  )
const configSchema = z.object({
  format: z.literal('skymoni-project'),
  version: z.literal(1),
  project: z.object({
    title: z.string().max(80),
    summary: z.string().max(160),
    description: z.string().max(12000),
    category: z.enum([
      'website',
      'software',
      'design',
      'article',
      'workflow',
      'other',
    ]),
    tags: z.string().max(120),
    url: z
      .string()
      .max(2000)
      .refine((s) => !s || isSafeProjectUrl(s)),
    cover: image,
    images: z.array(image).max(6),
    style: z.enum([
      'horizon',
      'notes',
      'palette',
      'flow',
      'guide',
      'orbit',
      'cloud',
      'prompt',
    ]),
    blocks: z
      .array(blockSchema)
      .max(24)
      .refine((b) => new Set(b.map((x) => x.id)).size === b.length),
    settings: settingsSchema,
  }),
})

export function serializeProject(work: Work): string {
  const {
    title,
    summary,
    description,
    category,
    tags,
    url,
    cover,
    images,
    style,
  } = work
  return JSON.stringify(
    {
      format: 'skymoni-project',
      version: 1,
      project: {
        title,
        summary,
        description,
        category,
        tags,
        url,
        cover,
        images,
        style,
        blocks: work.blocks ?? [],
        settings: settingsFor(work),
      },
    },
    null,
    2
  )
}
export function parseProject(text: string): Work {
  if (text.length > 8000000) throw new Error('Configuration is too large')
  const data = configSchema.parse(JSON.parse(text))
  return {
    ...emptyWork(),
    ...data.project,
    status: 'draft',
    blocks: data.project.blocks.map((block) => ({
      ...block,
      id: crypto.randomUUID(),
    })),
  }
}
export function duplicateProject(work: Work): Work {
  return {
    ...structuredClone(work),
    id: crypto.randomUUID(),
    title: `${work.title || 'Untitled project'} (copy)`.slice(0, 80),
    sample: false,
    status: 'draft',
    updatedAt: Date.now(),
  }
}

export const templates = [
  {
    id: 'blank',
    label: 'Blank canvas',
    detail: 'Start with your own structure',
    category: 'other',
    style: 'horizon',
    types: [],
  },
  {
    id: 'website',
    label: 'Website & portfolio',
    detail: 'Introduce, showcase, explore',
    category: 'website',
    style: 'horizon',
    types: ['heading', 'text', 'gallery', 'link'],
  },
  {
    id: 'software',
    label: 'Software & tool',
    detail: 'Features, requirements, updates',
    category: 'software',
    style: 'notes',
    types: ['heading', 'list', 'callout', 'heading', 'text'],
  },
  {
    id: 'design',
    label: 'Visual collection',
    detail: 'Let images tell the story',
    category: 'design',
    style: 'palette',
    types: ['gallery', 'text', 'callout'],
  },
  {
    id: 'article',
    label: 'Article & tutorial',
    detail: 'Explain an idea step by step',
    category: 'article',
    style: 'guide',
    types: ['heading', 'text', 'code', 'callout'],
  },
  {
    id: 'workflow',
    label: 'AI & workflow',
    detail: 'Steps, examples, configuration',
    category: 'workflow',
    style: 'flow',
    types: ['heading', 'list', 'code', 'link'],
  },
] as const

export function templateComposition(id: string) {
  const template = templates.find((item) => item.id === id) ?? templates[0]
  const labels: Record<string, string[]> = {
    website: ['What I made', '', '', 'Explore the project'],
    software: ['Features', '', 'Before you start', 'Release notes', ''],
    design: ['', '', 'Usage permissions'],
    article: ['Getting started', '', 'Example', 'A useful tip'],
    workflow: ['How it works', '', 'Configuration', 'Try it yourself'],
  }
  return {
    category: template.category,
    style: template.style,
    blocks: template.types.map((type, index) => ({
      id: crypto.randomUUID(),
      type,
      title: labels[id]?.[index] ?? '',
      text: '',
      url: '',
      visible: true,
    })),
    settings: {
      ...defaultSettings(),
      layout:
        template.id === 'design' ? ('showcase' as const) : ('story' as const),
      showGallery: false,
    },
  }
}
