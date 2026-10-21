import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  ArrowRight,
  CircleCheck,
  Droplet,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import { api, getFreshAuthHeaders } from '@/lib/api'
import { resolveAuthentication } from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'

const searchSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
  state: z.string(),
})

type GrantResponse = {
  success: boolean
  data?: { code: string; redirect_uri: string }
  message?: string
}

function callbackURL(redirectURI: string, state: string): URL | null {
  try {
    const url = new URL(redirectURI)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.pathname !== '/callback' ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9_-]{43}$/.test(state)
    ) {
      return null
    }
    url.searchParams.set('state', state)
    return url
  } catch {
    return null
  }
}

function DripAuthorize() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const user = useAuthStore((store) => store.auth.user)
  const [pending, setPending] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState('')
  const callback = callbackURL(search.redirect_uri, search.state)
  const valid =
    search.client_id === 'drip-desktop' &&
    search.code_challenge_method === 'S256' &&
    /^[A-Za-z0-9_-]{43}$/.test(search.code_challenge) &&
    callback !== null

  const cancel = () => {
    if (!callback) return
    callback.searchParams.set('error', 'access_denied')
    window.location.assign(callback.toString())
  }

  const authorize = async () => {
    if (!valid || pending) return
    setPending(true)
    setError('')
    try {
      const headers = await getFreshAuthHeaders()
      const response = await api.post<GrantResponse>(
        '/api/drip/authorize',
        {
          client_id: search.client_id,
          redirect_uri: search.redirect_uri,
          code_challenge: search.code_challenge,
          code_challenge_method: search.code_challenge_method,
        },
        { headers, disableDuplicate: true, skipErrorHandler: true }
      )
      if (!response.data.success || !response.data.data?.code) {
        throw new Error(response.data.message || t('Authorization failed'))
      }
      const destination = callbackURL(
        response.data.data.redirect_uri,
        search.state
      )
      if (!destination) throw new Error(t('Invalid Drip callback'))
      destination.searchParams.set('code', response.data.data.code)
      setRedirecting(true)
      window.location.assign(destination.toString())
    } catch {
      setError(t('Authorization failed. Please try again.'))
      setPending(false)
    }
  }

  return (
    <main className='bg-background flex min-h-svh flex-col items-center justify-center px-4 py-10'>
      <div className='w-full max-w-lg'>
        <div className='mb-6 flex items-center gap-3 px-1'>
          <div className='flex size-9 items-center justify-center rounded-md bg-sky-500 text-white'>
            <Droplet className='size-5' aria-hidden='true' />
          </div>
          <span className='text-foreground text-base font-semibold'>Drip</span>
          <span className='text-muted-foreground ml-auto text-sm'>
            {t('Authorized by Skymoni')}
          </span>
        </div>
        <section className='border-border bg-card overflow-hidden rounded-lg border shadow-sm'>
          <div className='border-border border-b px-6 py-6 sm:px-8'>
            <div className='mb-4 flex size-10 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
              <ShieldCheck className='size-5' aria-hidden='true' />
            </div>
            <h1 className='text-foreground text-xl font-semibold'>
              {t('Authorize Drip sign-in')}
            </h1>
            <p className='text-muted-foreground mt-2 text-sm leading-6'>
              {t(
                'Continue with the Skymoni account shown below, then return to Drip.'
              )}
            </p>
          </div>
          <div className='px-6 py-6 sm:px-8'>
            <div className='border-border bg-muted/35 flex items-center gap-3 rounded-md border p-3'>
              <UserAvatar
                setting={user?.setting}
                name={user?.display_name || user?.username}
                className='size-11 shrink-0'
              />
              <div className='min-w-0 flex-1'>
                <p className='text-foreground truncate text-sm font-semibold'>
                  {user?.display_name || user?.username || '—'}
                </p>
                <p className='text-muted-foreground truncate text-xs'>
                  @{user?.username || '—'}
                </p>
              </div>
              <span className='flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400'>
                <CircleCheck className='size-3.5' aria-hidden='true' />{' '}
                {t('Signed in')}
              </span>
            </div>
            <div className='mt-6 space-y-3 text-sm'>
              <p className='text-foreground font-medium'>
                {t('Drip will receive')}
              </p>
              <p className='text-muted-foreground flex items-center gap-2'>
                <CircleCheck
                  className='size-4 shrink-0 text-emerald-600'
                  aria-hidden='true'
                />{' '}
                {t('Account ID, display name, and avatar')}
              </p>
              <p className='text-muted-foreground flex items-center gap-2'>
                <LockKeyhole
                  className='size-4 shrink-0 text-sky-600'
                  aria-hidden='true'
                />{' '}
                {t('No password, wallet balance, or orders')}
              </p>
            </div>
            {!valid && (
              <Alert variant='destructive' className='mt-4'>
                <AlertDescription>
                  {t('Invalid Drip callback')}
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant='destructive' className='mt-4'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className='mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
              <Button
                variant='outline'
                onClick={cancel}
                disabled={!valid || pending}
                className='sm:min-w-24'
              >
                {t('Cancel')}
              </Button>
              <Button
                onClick={authorize}
                disabled={!valid || pending}
                className='gap-2 sm:min-w-36'
              >
                {pending ? (
                  <LoaderCircle
                    className='size-4 animate-spin'
                    aria-hidden='true'
                  />
                ) : (
                  <ArrowRight className='size-4' aria-hidden='true' />
                )}
                {pending
                  ? redirecting
                    ? t('Returning to Drip...')
                    : t('Confirming authorization...')
                  : t('Authorize and continue')}
              </Button>
            </div>
            {pending && (
              <p
                role='status'
                className='text-muted-foreground mt-3 text-right text-xs'
              >
                {t(
                  'Keep this window open. It will return to Drip automatically.'
                )}
              </p>
            )}
          </div>
        </section>
        <p className='text-muted-foreground mt-5 text-center text-xs'>
          {t('Only authorize the Drip client you are using now.')}
        </p>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/(auth)/drip-authorize')({
  validateSearch: searchSchema,
  beforeLoad: async ({ location }) => {
    await resolveAuthentication()
    const auth = useAuthStore.getState().auth
    if (!auth.user || !auth.accessToken) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  component: DripAuthorize,
})
