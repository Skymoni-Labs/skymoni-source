import { z } from 'zod'

export const safeLink = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value || value === '#installation') return true
    if (/[\\\r\n\0]/.test(value)) return false
    try {
      if (
        value.startsWith('/') &&
        !value.startsWith('//') &&
        !decodeURIComponent(value).includes('..')
      ) {
        return true
      }
      const url = new URL(value)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  }, 'Enter a valid HTTPS link')

const featuredIds = (limit: number) =>
  z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{0,64}$/))
    .max(limit)
    .transform((ids) => ids.filter(Boolean))
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Choose each item only once per area'
    )

export const softwareFeaturedSchema = z.object({
  carousel: featuredIds(5),
  tiles: featuredIds(3),
})

export const softwareEntrySchema = z
  .object({
    downloads: z
      .array(
        z.object({
          platform: z.string().trim().min(1).max(80),
          label: z.string().trim().min(1).max(120),
          url: safeLink.refine(
            (value) => Boolean(value) && value !== '#installation',
            'Enter a valid HTTPS link'
          ),
          filename: z
            .string()
            .max(240)
            .refine(
              (value) => !/[\\/\r\n\0]/.test(value),
              'Enter a filename without a path'
            ),
          kind: z.enum(['installer', 'website', 'cloud']),
          version: z.string().max(60).optional(),
        })
      )
      .max(16)
      .optional(),
    details: z
      .object({
        overview: z.string().max(12000).optional(),
        features: z.string().max(4000).optional(),
        changelog: z.string().max(4000).optional(),
        requirements: z.string().max(2000).optional(),
        publisher: z.string().max(120).optional(),
        category: z.string().max(80).optional(),
        license: z.string().max(120).optional(),
        updatedAt: z
          .string()
          .refine(
            (value) =>
              !value ||
              (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
                !Number.isNaN(Date.parse(value)) &&
                new Date(value).toISOString().slice(0, 10) === value),
            'Enter a valid date'
          )
          .optional(),
        screenshots: z
          .array(
            safeLink.refine(
              (value) => Boolean(value) && value !== '#installation',
              'Enter a valid HTTPS link'
            )
          )
          .max(12)
          .optional(),
        screenshotsEnabled: z.boolean().optional(),
        imageLayout: z.enum(['portrait', 'landscape']).optional(),
      })
      .optional(),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    kind: z.enum(['software', 'tool']),
    name: z.string().trim().min(1, 'Name is required').max(120),
    description: z.string().max(2000),
    platform: z.string().max(200),
    version: z.string().max(60),
    downloadUrl: safeLink,
    filename: z.string().max(240),
    detailUrl: safeLink,
    imageUrl: safeLink,
    appearance: z.enum(['generic', 'drip', 'mail', 'cherry', 'cc']),
    sortOrder: z.number().int().min(-100000).max(100000),
    published: z.boolean(),
  })
  .refine(
    (value) =>
      !value.published ||
      Boolean(value.downloadUrl || value.detailUrl || value.downloads?.length),
    {
      path: ['downloadUrl'],
      message: 'Add an installer or website link before publishing',
    }
  )
