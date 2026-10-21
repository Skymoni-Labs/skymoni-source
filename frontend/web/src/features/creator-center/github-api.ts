import { creatorRequest } from './api'
import type { Work } from './types'

export type GitHubConnection = {
  configured: boolean
  connected: boolean
  login?: string
  expiresAt?: number
}
export type GitHubRepository = {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  fork: boolean
  archived: boolean
}
export type GitHubDraft = { work: Work; signals: string[]; warnings: string[] }
export const githubStatus = (signal?: AbortSignal) =>
  creatorRequest<GitHubConnection>('/me/github', { signal })
export const githubRepositories = (page: number, signal?: AbortSignal) =>
  creatorRequest<GitHubRepository[]>(`/me/github/repositories?page=${page}`, {
    signal,
  })
export const githubStart = (proof: string) =>
  creatorRequest<{ authorizationUrl: string }>('/me/github/start', {
    method: 'post',
    headers: { 'X-Security-Proof': proof },
  })
export const githubDisconnect = (proof: string) =>
  creatorRequest<{ remoteRevoked: boolean }>('/me/github', {
    method: 'delete',
    headers: { 'X-Security-Proof': proof },
  })
export const githubImport = (repository: string, directory: string) =>
  creatorRequest<GitHubDraft>('/me/github/import', {
    method: 'post',
    data: { repository, directory },
  })
export const githubCallback = (code: string, state: string, denied: boolean) =>
  creatorRequest<{ cancelled: boolean }>('/me/github/callback', {
    method: 'post',
    data: { code, state, denied },
  })

// Treat even a server-returned redirect as untrusted. Never navigate to arbitrary URLs.
export function githubAuthorizationURL(value: string): string {
  const url = new URL(value)
  if (
    url.origin !== 'https://github.com' ||
    url.pathname !== '/login/oauth/authorize' ||
    url.username ||
    url.password
  ) {
    throw new Error('Invalid GitHub authorization URL')
  }
  return url.href
}
