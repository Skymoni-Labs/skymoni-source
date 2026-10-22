import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Smartphone, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react'
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

import './app-beta-card.css'

export function AppBetaCard({
  redirectTo = '/creators',
}: {
  redirectTo?: string
}) {
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
    <Card className='skivu-beta-card'>
      <CardHeader className='skivu-beta-header'>
        <div className='skivu-beta-heading'>
          <span className='skivu-beta-icon' aria-hidden='true'>
            <FlaskConical size={23} strokeWidth={1.6} />
          </span>
          <div className='skivu-beta-heading-text'>
            <span className='skivu-beta-eyebrow' aria-hidden='true'>
              SKIVU · EARLY ACCESS
            </span>
            <CardTitle className='skivu-beta-title'>
              {t('Skivu App beta')}
            </CardTitle>
          </div>
          {status && (
            <span className='skivu-beta-status' data-status={status}>
              <span aria-hidden='true' />
              {t(betaStatusText[status])}
            </span>
          )}
        </div>
        <CardDescription className='skivu-beta-description'>
          {t(
            'Apply with your community account. Administrators review applications and assign a separate App-only allowance.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='skivu-beta-content'>
        {!user && (
          <Button
            render={<Link to='/sign-in' search={{ redirect: redirectTo }} />}
          >
            {t('Sign in or register to apply')}
          </Button>
        )}
        {user && account.isPending && <p role='status'>{t('Loading...')}</p>}
        {user && account.isError && (
          <div role='alert' className='skivu-beta-notice space-y-3'>
            <p>{t('Unable to load beta status')}</p>
            <Button variant='outline' onClick={() => void account.refetch()}>
              {t('Retry')}
            </Button>
          </div>
        )}
        {(status === 'none' || status === 'rejected') && (
          <form
            className='skivu-beta-application'
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
              className='skivu-beta-note-input'
            />
            <Button
              className='skivu-beta-primary'
              type='submit'
              disabled={mutate.isPending}
            >
              {t('Apply for beta access')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              {t('Registration and application do not grant any allowance.')}
            </p>
          </form>
        )}
        {status === 'pending' && (
          <p className='skivu-beta-notice text-sm'>
            {t(
              'Your application is awaiting administrator review. Refresh this card to check progress.'
            )}
          </p>
        )}
        {account.data?.account.review_note && (
          <p className='skivu-beta-notice text-sm'>
            {t('Review note')}: {account.data.account.review_note}
          </p>
        )}
        {status === 'approved' && (
          <>
            <dl className='skivu-beta-allowance'>
              <div className='skivu-beta-metric skivu-beta-metric-main'>
                <dt>{t('Beta balance')}</dt>
                <dd>{formatQuota(account.data?.account.balance ?? 0)}</dd>
              </div>
              <div className='skivu-beta-metric'>
                <dt>{t('Reserved')}</dt>
                <dd>{formatQuota(account.data?.account.reserved ?? 0)}</dd>
              </div>
              <div className='skivu-beta-metric'>
                <dt>{t('Beta used')}</dt>
                <dd>{formatQuota(account.data?.account.used ?? 0)}</dd>
              </div>
            </dl>
            {!account.data?.app_available && (
              <p className='skivu-beta-connection-note'>
                <ShieldCheck size={15} aria-hidden='true' />
                <span>
                  {t(
                    'App connection is not open yet. Your approved allowance is reserved for the App.'
                  )}
                </span>
              </p>
            )}
            <div className='skivu-beta-pairing'>
              <div className='skivu-beta-pair-field'>
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
                  className='skivu-beta-code'
                />
              </div>
              <Button
                className='skivu-beta-primary'
                disabled={
                  mutate.isPending ||
                  !account.data?.app_available ||
                  code.replaceAll('-', '').trim().length !== 16
                }
                onClick={() => setPairOpen(true)}
              >
                <Smartphone size={15} aria-hidden='true' />
                {t('Connect my App')}
              </Button>
            </div>
            {account.data?.devices?.map((device) => (
              <div key={device.id} className='skivu-beta-device'>
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
            className='skivu-beta-refresh'
            size='sm'
            variant='ghost'
            disabled={account.isFetching}
            onClick={() => void account.refetch()}
          >
            <RefreshCw
              size={13}
              className={account.isFetching ? 'animate-spin' : undefined}
              aria-hidden='true'
            />
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
