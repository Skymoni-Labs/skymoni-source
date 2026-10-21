/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useNavigate } from '@tanstack/react-router'
import { User, Wallet, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/user-avatar'
import useDialogState from '@/hooks/use-dialog'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useUserDisplay } from '@/hooks/use-user-display'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export function ProfileDropdown(props: { context?: 'creator' } = {}) {
  const creatorContext = props.context === 'creator'
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName, roleLabel } = useUserDisplay(user)
  const isSuperAdmin = user?.role === ROLE.SUPER_ADMIN
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const isSecurityVisible = useIsSidebarModuleVisible('/security')

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              aria-label={t('Account menu')}
              className={
                creatorContext ? 'relative size-8 p-0' : 'relative size-6 p-0'
              }
            />
          }
        >
          <UserAvatar
            className='size-6'
            setting={user?.setting}
            name={displayName}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' sideOffset={8} className='w-56'>
          <div className='flex items-center gap-2 px-1.5 py-1.5'>
            <UserAvatar
              className='size-8'
              setting={user?.setting}
              name={displayName}
            />
            <div className='flex flex-1 flex-col gap-0.5 overflow-hidden'>
              <p className='text-foreground truncate text-sm font-medium'>
                {displayName}
              </p>
              <div className='flex items-center gap-1.5'>
                <span className='text-muted-foreground text-xs'>
                  {roleLabel}
                </span>
                {user?.group && (
                  <>
                    <span className='text-muted-foreground text-xs'>·</span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {String(user.group)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() =>
              navigate(
                creatorContext
                  ? {
                      to: '/creators/members/$memberId',
                      params: { memberId: String(user?.id ?? 0) },
                    }
                  : { to: '/profile' }
              )
            }
          >
            <User className='size-4' />
            {creatorContext ? '论坛个人资料' : t('Profile')}
          </DropdownMenuItem>

          {creatorContext && (
            <DropdownMenuItem
              onClick={() => navigate({ to: '/creators/profile' })}
            >
              <User className='size-4' />
              我的创作主页
            </DropdownMenuItem>
          )}
          {!creatorContext && (
            <DropdownMenuItem
              onClick={() =>
                navigate({ href: '/community-authorize?returnTo=%2Fcreators' })
              }
            >
              <ShieldCheck className='size-4' />
              社区登录授权
            </DropdownMenuItem>
          )}
          {!creatorContext && isSecurityVisible && (
            <DropdownMenuItem onClick={() => navigate({ to: '/security' })}>
              <ShieldCheck className='size-4' />
              {t('Security & Access')}
            </DropdownMenuItem>
          )}

          {!creatorContext && isWalletVisible && (
            <DropdownMenuItem onClick={() => navigate({ to: '/wallet' })}>
              <Wallet className='size-4' />
              {t('Wallet')}
            </DropdownMenuItem>
          )}

          {isSuperAdmin && (
            <DropdownMenuItem
              onClick={() =>
                navigate(
                  creatorContext
                    ? { to: '/creators/moderation' as const }
                    : {
                        to: '/system-settings/site/$section' as const,
                        params: { section: 'system-info' },
                      }
                )
              }
            >
              <Settings className='size-4' />
              {t(creatorContext ? 'Community management' : 'System Settings')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            <LogOut className='size-4' />
            {t('Sign out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog
        open={!!open}
        onOpenChange={setOpen}
        destination={creatorContext ? 'creator' : undefined}
      />
    </>
  )
}
