import type { AxiosRequestConfig } from 'axios'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { loadSiteIdentities } from '@/lib/site-identity'

import { homepageWorks } from './lib/home-examples'
import type { Work } from './types'

export type HomeRequest = <T>(
  path: string,
  options?: AxiosRequestConfig
) => Promise<T>
export type HomeConfig = {
  galleryEnabled: boolean
  marqueeEnabled: boolean
  autoAddCreators: boolean
  revision: string
}
export type HomeExample = {
  id: string
  hidden: boolean
  position: number
  revision: string
}
export type HomeCard = {
  workId: string
  ownerId: number
  image: string
  approvedImage: string
  status: 'review' | 'approved' | 'rejected'
  note: string
  revision: string
  expiresAt: number
  permanent: boolean
  hidden: boolean
  position: number
  updatedAt: number
  ownerPaused: boolean
}
export type HomeAuthor = {
  userId: number
  name: string
  avatar: string
  visible: boolean
  position: number
  sample?: boolean
  profileId?: string
}
export type HomeOrder = {
  id: number
  checkoutId: string
  workId: string
  plan: 'year' | 'permanent'
  credits: number
  expiresAt: number
  permanent: boolean
  createdAt: number
}
export type HomeShowcase = {
  revision: string
  autoAddWorks: boolean
  works: { workId: string; enabled: boolean; position: number }[]
}
export type CreatorHomeState = {
  showcase?: HomeShowcase
  config: HomeConfig
  cards: HomeCard[]
  authors: HomeAuthor[]
  works: Work[]
  orders: HomeOrder[]
  balance: number
  examples?: HomeExample[]
}
export type PublicCreatorHome = {
  source?: 'applications' | 'creator-center'
  showcase?: HomeShowcase
  config: HomeConfig
  works: Work[]
  authors: HomeAuthor[]
  examples?: HomeExample[]
}
export type HomepageShowcase = PublicCreatorHome & {
  source: 'applications' | 'creator-center'
}
export async function loadHomepageShowcase(
  signal?: AbortSignal
): Promise<HomepageShowcase> {
  const home = await loadCreatorHome(signal, true)
  return {
    ...home,
    works: homepageWorks(home),
    source: home.source ?? 'applications',
  }
}
export async function loadCreatorHome(
  signal?: AbortSignal,
  cards = false
): Promise<PublicCreatorHome> {
  const response = await api.get<{ success: boolean; data: PublicCreatorHome }>(
    cards ? '/api/creators/home?view=cards' : '/api/creators/home',
    { signal, skipAuthRefresh: true, skipErrorHandler: true }
  )
  const data = requireServerSuccess(response.data).data
  const identities = await loadSiteIdentities(
    [
      ...data.authors
        .filter((author) => !author.sample)
        .map((author) => author.userId),
      ...data.works
        .filter((work) => !work.sample)
        .map((work) => work.ownerId ?? 0),
    ],
    signal
  )
  return {
    ...data,
    authors: data.authors.map((author) =>
      !author.sample && identities[author.userId]
        ? {
            ...author,
            name: identities[author.userId].name,
            avatar: identities[author.userId].avatar,
          }
        : author
    ),
    works: data.works.map((work) =>
      !work.sample && identities[work.ownerId ?? 0]
        ? { ...work, author: identities[work.ownerId ?? 0].name }
        : work
    ),
  }
}
export function homeError(error: unknown) {
  const response = error as {
    response?: { data?: { message?: string } }
    message?: string
  }
  return (
    response.response?.data?.message || response.message || '操作失败，请重试。'
  )
}
export function homeExpiry(card: { permanent: boolean; expiresAt: number }) {
  if (card.permanent) return '永久展示'
  if (!card.expiresAt) return '尚未开通'
  return `${new Date(card.expiresAt * 1000).toLocaleDateString('zh-CN')} 到期`
}

export async function prepareHomeImage(
  file: File,
  avatar = false
): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error('请选择 5 MB 以内的 PNG、JPEG 或 WebP 图片。')
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('无法读取这张图片，请选择有效的 PNG、JPEG 或 WebP 图片。')
  })
  try {
    const { width, height } = bitmap
    if (!width || !height) throw new Error('无法读取图片尺寸，请换一张重试。')
    const canvas = document.createElement('canvas')
    // Accept source images of any size/aspect ratio. Normalize here so the
    // server still receives its established square/3:4 dimensions and limits.
    for (const targetWidth of avatar ? [256] : [900, 450]) {
      canvas.width = targetWidth
      canvas.height = avatar ? targetWidth : (targetWidth * 4) / 3
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法读取图片，请换一张重试。')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (avatar) {
        const side = Math.min(width, height)
        ctx.drawImage(
          bitmap,
          (width - side) / 2,
          (height - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height
        )
      } else {
        const scale = Math.min(canvas.width / width, canvas.height / height)
        const drawWidth = width * scale
        const drawHeight = height * scale
        ctx.drawImage(
          bitmap,
          (canvas.width - drawWidth) / 2,
          (canvas.height - drawHeight) / 2,
          drawWidth,
          drawHeight
        )
      }
      for (const quality of [0.9, 0.8, 0.68, 0.55, 0.42, 0.3]) {
        const data = canvas.toDataURL('image/jpeg', quality)
        if (
          data.startsWith('data:image/jpeg;base64,') &&
          data.length <= (avatar ? 100000 : 400000)
        ) {
          return data
        }
      }
    }
    throw new Error('图片转换失败，请换一张图片重试。')
  } finally {
    bitmap.close()
  }
}
