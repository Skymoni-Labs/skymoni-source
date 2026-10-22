import { useMutation, useQuery } from '@tanstack/react-query'
import { Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

type Authorization = {
  user_code: string
  device_name: string
  expires_at: number
  state: string
}

export function AppAccountAuthorization({
  initialCode = '',
}: {
  initialCode?: string
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const sid = useAuthStore((s) => s.auth.session?.sid)
  const [code, setCode] = useState(initialCode)
  const [confirmed, setConfirmed] = useState(false)
  const [outcome, setOutcome] = useState('')
  const request = useQuery({
    queryKey: ['app-account-authorization', user?.id, sid, code],
    enabled: /^[A-Za-z0-9_-]{16}$/.test(code),
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await api.get('/api/app-account/authorization', {
        params: { code },
        signal,
        skipErrorHandler: true,
      })
      return requireServerSuccess(response.data).data as Authorization
    },
  })
  const decide = useMutation({
    mutationFn: async (decision: 'approve' | 'deny') => {
      const response = await api.post(
        '/api/app-account/authorization',
        { user_code: code, decision },
        { skipErrorHandler: true }
      )
      requireServerSuccess(response.data)
      return decision
    },
    onSuccess: setOutcome,
    onError: (error) => {
      handleServerError(error)
      void request.refetch()
    },
  })
  const pending = request.data?.state === 'pending' && !outcome
  return (
    <main className='mx-auto w-full max-w-xl p-4 sm:py-10'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Smartphone size={20} />
            {t('Sign in to Skivu')}
          </CardTitle>
          <CardDescription>
            {t('Authorize the Skivu App on your own phone.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <p>
            {t('Account')}:{' '}
            <strong>{user?.display_name || user?.username}</strong>
          </p>
          <div className='space-y-2'>
            <Label htmlFor='app-user-code'>
              {t('Code displayed in the App')}
            </Label>
            <Input
              id='app-user-code'
              value={code}
              maxLength={16}
              autoComplete='off'
              spellCheck={false}
              className='font-mono tracking-wider'
              disabled={decide.isPending || !!outcome}
              onChange={(event) => {
                setCode(event.target.value.trim())
                setConfirmed(false)
              }}
            />
          </div>
          {request.isFetching && <p role='status'>{t('Loading...')}</p>}
          {request.isError && (
            <div role='alert' className='space-y-2'>
              <p>
                {t(
                  'This authorization is invalid or expired. Start sign-in again in the App.'
                )}
              </p>
              <Button variant='outline' onClick={() => void request.refetch()}>
                {t('Retry')}
              </Button>
            </div>
          )}
          {request.data && (
            <p>
              {t('Device')}: {request.data.device_name}
            </p>
          )}
          {pending && (
            <>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'The App can access your available chat models, balance and chat service. Chats use your existing relay wallet or subscription.'
                )}
              </p>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'You can revoke this App sign-in from the website security session list.'
                )}
              </p>
              <div className='flex items-start gap-2'>
                <Checkbox
                  id='app-own-phone'
                  checked={confirmed}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                <Label htmlFor='app-own-phone' className='leading-5'>
                  {t(
                    'I opened this request in my own App and the code matches. Do not authorize a code sent by someone else.'
                  )}
                </Label>
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  disabled={decide.isPending}
                  onClick={() => decide.mutate('deny')}
                >
                  {t('Deny')}
                </Button>
                <Button
                  disabled={
                    !confirmed || decide.isPending || request.isFetching
                  }
                  onClick={() => decide.mutate('approve')}
                >
                  {t('Allow Skivu sign-in')}
                </Button>
              </div>
            </>
          )}
          {(outcome === 'approve' ||
            (!outcome && request.data?.state === 'approved')) && (
            <p role='status'>
              {t('Authorized. Return to the App to finish signing in.')}
            </p>
          )}
          {(outcome === 'deny' ||
            (!outcome && request.data?.state === 'denied')) && (
            <p role='status'>
              {t('Authorization denied. You can close this page.')}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
