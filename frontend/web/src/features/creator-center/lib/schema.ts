import { z } from 'zod'

import { blockTypes } from '../types'

export function isSafeProjectUrl(value: string): boolean {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => !value || isSafeProjectUrl(value),
    'Enter a full http or https link'
  )
export const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(blockTypes),
  title: z.string().max(120),
  text: z.string().max(12000),
  url: optionalUrl,
  visible: z.boolean(),
})
export const settingsSchema = z.object({
  accent: z.string().regex(/^#[\da-fA-F]{6}$/),
  layout: z.enum(['story', 'showcase', 'compact']),
  coverRatio: z.enum(['wide', 'standard', 'square']),
  showCover: z.boolean(),
  showDescription: z.boolean(),
  showGallery: z.boolean(),
  showFiles: z.boolean(),
  showRelated: z.boolean(),
  listed: z.boolean(),
  buttonLabel: z.string().max(30),
  categoryName: z.string().max(30),
  usage: z.string().max(1500),
  links: z
    .array(
      z.object({
        id: z.string().max(100),
        label: z.string().max(40),
        url: optionalUrl,
      })
    )
    .max(6),
  metadata: z
    .array(
      z.object({
        id: z.string().max(100),
        label: z.string().max(40),
        value: z.string().max(300),
      })
    )
    .max(8),
})
export const compositionSchema = z.object({
  blocks: z
    .array(blockSchema)
    .max(24)
    .refine(
      (blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length
    ),
  settings: settingsSchema,
})

export const projectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Give your project a title (2–80 characters)')
    .max(80, 'Give your project a title (2–80 characters)'),
  summary: z
    .string()
    .trim()
    .min(8, 'Add a short introduction (8–160 characters)')
    .max(160, 'Add a short introduction (8–160 characters)'),
  description: z.string().trim().max(12000),
  category: z.enum([
    'website',
    'software',
    'design',
    'article',
    'workflow',
    'other',
  ]),
  tags: z.string().max(120),
  url: optionalUrl,
})
export type ProjectFields = z.infer<typeof projectSchema>
