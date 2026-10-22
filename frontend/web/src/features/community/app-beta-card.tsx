import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Smartphone, FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  betaApply,
  betaPair,
  betaRevokeDevice,
  betaSelf,
  betaStatusText,
} from './app-beta-api'

export function AppBetaCard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const sid = useAuthStore((state) => state.auth.session?.sid)
  const [application, setApplication] = useState('')
  const [code, setCode] = useState('')
  const [pairOpen, setPairOpen] = useState(false)
  const [removeID, setRemoveID] = useState<string | null>(null)
  const account = useQuery({
    queryKey: ['app-beta-self', user?.id, sid],
    queryFn: ({ signal }) => betaSelf(signal),
    enabled: !!user,
    retry: false,
  })
  const mutate = useMutation({
    mutationFn: async (action: 'apply' | 'pair' | 'remove') => {
      if (action === 'apply') await betaApply(application)
      if (action === 'pair') await betaPair(code)
      if (action === 'remove' && removeID) await betaRevokeDevice(removeID)
    },
    onSuccess: () => {
      setPairOpen(false)
      setRemoveID(null)
      setCode('')
      toast.success(t('Saved successfully'))
      void account.refetch()
    },
    onError: (error) => handleServerError(error),
  })
  const status = account.data?.account.status
  return (
    <Card className='border-primary/15 bg-card/80 my-4'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <FlaskConical size={18} />
          {t('Skivu App beta')}
        </CardTitle>
        <CardDescription>
          {t(
            'Apply with your community account. Administrators review applications and assign a separate App-only allowance.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {!user && (
          <Button
            render={<Link to='/sign-in' search={{ redirect: '/creators' }} />}
          >
            {t('Sign in or register to apply')}
          </Button>
        )}
        {user && account.isPending && <p role='status'>{t('Loading...')}</p>}
        {user && account.isError && (
          <div role='alert'>
            <p>{t('Unable to load beta status')}</p>
            <Button variant='outline' onClick={() => void account.refetch()}>
              {t('Retry')}
            </Button>
          </div>
        )}
        {status && <p className='font-medium'>{t(betaStatusText[status])}</p>}
        {(status === 'none' || status === 'rejected') && (
          <form
            className='space-y-2'
            onSubmit={(event) => {
              event.preventDefault()
              mutate.mutate('apply')
            }}
          >
            <Label htmlFor='beta-application'>
              {t('Application note (optional)')}
            </Label>
            <Textarea
              id='beta-application'
              maxLength={1000}
              value={application}
              onChange={(event) => setApplication(event.target.value)}
              placeholder={t('Tell us what you would like to test')}
            />
            <Button type='submit' disabled={mutate.isPending}>
              {t('Apply for beta access')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              {t('Registration and application do not grant any allowance.')}
            </p>
          </form>
        )}
        {status === 'pending' && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'Your application is awaiting administrator review. Refresh this card to check progress.'
            )}
          </p>
        )}
        {account.data?.account.review_note && (
          <p className='text-sm'>
            {t('Review note')}: {account.data.account.review_note}
          </p>
        )}
        {status === 'approved' && (
          <>
            <div className='flex flex-wrap gap-x-5 gap-y-1 text-sm'>
              <span>
                {t('Beta balance')}:{' '}
                <strong>
                  {formatQuota(account.data?.account.balance ?? 0)}
                </strong>
              </span>
              <span>
                {t('Reserved')}:{' '}
                {formatQuota(account.data?.account.reserved ?? 0)}
              </span>
              <span>
                {t('Beta used')}: {formatQuota(account.data?.account.used ?? 0)}
              </span>
            </div>
            {!account.data?.app_available && (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'App connection is not open yet. Your approved allowance is reserved for the App.'
                )}
              </p>
            )}
            <div className='flex flex-wrap items-end gap-2'>
              <div className='space-y-1'>
                <Label htmlFor='beta-pair'>
                  {t('Pairing code shown in the App')}
                </Label>
                <Input
                  id='beta-pair'
                  value={code}
                  maxLength={19}
                  autoComplete='off'
                  onChange={(event) => setCode(event.target.value)}
                  placeholder='ABCD-EF01-2345-6789'
                />
              </div>
              <Button
                disabled={
                  mutate.isPending ||
                  !account.data?.app_available ||
                  code.replaceAll('-', '').trim().length !== 16
                }
                onClick={() => setPairOpen(true)}
              >
                {t('Connect my App')}
              </Button>
            </div>
            {account.data?.devices.map((device) => (
              <div
                key={device.id}
                className='flex items-center justify-between gap-2 text-sm'
              >
                <span className='flex items-center gap-2'>
                  <Smartphone size={16} />
                  {device.label || t('Android device')}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={mutate.isPending}
                  onClick={() => setRemoveID(device.id)}
                >
                  {t('Remove device')}
                </Button>
              </div>
            ))}
          </>
        )}
        {user && (
          <Button
            size='sm'
            variant='ghost'
            disabled={account.isFetching}
            onClick={() => void account.refetch()}
          >
            {t('Refresh status')}
          </Button>
        )}
      </CardContent>
      <ConfirmDialog
        open={pairOpen}
        onOpenChange={setPairOpen}
        title={t('Connect my App')}
        desc={t(
          'Only enter a code from the Skivu App on your own phone. This device will be allowed to spend your beta allowance.'
        )}
        confirmText={t('Connect')}
        isLoading={mutate.isPending}
        handleConfirm={() => mutate.mutate('pair')}
      />
      <ConfirmDialog
        open={!!removeID}
        onOpenChange={(open) => !open && setRemoveID(null)}
        title={t('Remove device')}
        desc={t('This device will immediately lose beta access.')}
        destructive
        isLoading={mutate.isPending}
        handleConfirm={() => mutate.mutate('remove')}
      />
    </Card>
  )
}
