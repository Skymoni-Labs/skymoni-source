import { useLocation } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ChangePasswordDialog } from '@/features/security/components/dialogs/change-password-dialog'
import { useAuthStore } from '@/stores/auth-store'

export function GitHubPasswordPromptHost() {
  const user = useAuthStore((state) => state.auth.user)
  const session = useAuthStore((state) => state.auth.session)
  const bootstrap = useAuthStore((state) => state.auth.bootstrapState)
  const pathname = useLocation({ select: (location) => location.pathname })
  if (
    bootstrap !== 'complete' ||
    !user ||
    user.has_password !== false ||
    !user.github_id ||
    !session?.sid ||
    session.login_method !== 'oauth:github' ||
    pathname.startsWith('/oauth') ||
    pathname.startsWith('/setup') ||
    ['/sign-in', '/sign-up', '/otp'].includes(pathname)
  ) {
    return null
  }
  return (
    <GitHubPasswordPrompt
      key={`${user.id}:${session.sid}`}
      userId={user.id}
      username={user.username}
    />
  )
}

function GitHubPasswordPrompt(props: { userId: number; username: string }) {
  const { t } = useTranslation()
  const storageKey = `skymoni:github-password-prompt:v1:${props.userId}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'dismissed'
    } catch {
      return true
    }
  })
  const [settingPassword, setSettingPassword] = useState(false)

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(storageKey, 'dismissed')
    } catch {
      // Private browsing/storage restrictions must not prevent dismissal.
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismiss()
        }}
        title={t('Add a password to your account')}
        description={t(
          'You signed in with GitHub. Your skymoni account does not have a login password yet.'
        )}
        contentClassName='sm:max-w-md'
        footer={
          <>
            <Button type='button' variant='outline' onClick={dismiss}>
              {t('Maybe later')}
            </Button>
            <Button
              type='button'
              onClick={() => {
                dismiss()
                setSettingPassword(true)
              }}
            >
              {t('Set Password')}
            </Button>
          </>
        }
      >
        <div className='space-y-4'>
          <div className='bg-muted/40 flex min-w-0 items-center gap-3 rounded-xl border p-3'>
            <IconBadge tone='primary' size='lg'>
              <KeyRound />
            </IconBadge>
            <div className='min-w-0'>
              <p className='text-muted-foreground text-xs'>{t('Username')}</p>
              <p className='text-sm font-semibold break-words'>
                {props.username}
              </p>
            </div>
          </div>
          <p className='text-sm leading-relaxed'>
            {t(
              'Setting a password also lets you sign in with this username and password. Your balance and records stay in the same account.'
            )}
          </p>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'You can keep using GitHub and set a password later in Security & Access.'
            )}
          </p>
        </div>
      </Dialog>
      {settingPassword && (
        <ChangePasswordDialog
          open
          onOpenChange={setSettingPassword}
          username={props.username}
          hasPassword={false}
        />
      )}
    </>
  )
}
