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
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { creatorRequest } from '@/features/creator-center/api'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { isUserDeleted, USER_ROLE, USER_STATUS } from '../constants'
import type { User } from '../types'
import { useUsers } from './users-provider'

export function UserCreatorCell({ user }: { user: User }) {
  const { t } = useTranslation()
  const root = useAuthStore((state) => state.auth.user?.role === USER_ROLE.ROOT)
  const { triggerRefresh } = useUsers()
  const query = useQueryClient()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<'grant' | 'ban' | 'unban'>('grant')
  const [busy, setBusy] = useState(false)
  const status = user.creator_status
  let label = t('Not activated')
  let variant: 'neutral' | 'success' | 'warning' = 'neutral'
  if (status === 'active') {
    label = t('Creator active')
    variant = 'success'
  }
  if (status === 'authorized') {
    label = t('Authorized · pending activation')
    variant = 'warning'
  }
  if (status === 'suspended') {
    label = t('Creator suspended')
    variant = 'warning'
  }
  if (!status) label = t('Status unavailable')
  const canGrant =
    root &&
    status === 'none' &&
    !isUserDeleted(user) &&
    user.status === USER_STATUS.ENABLED
  const canModerate =
    root &&
    !!status &&
    status !== 'none' &&
    !isUserDeleted(user) &&
    user.status === USER_STATUS.ENABLED
  const copy = {
    grant: {
      title: t('Enable creator'),
      confirm: t('Authorize activation'),
      success: t('Creator authorized; the user can now activate'),
    },
    ban: {
      title: '封禁创作者身份',
      confirm: '确认封禁创作者',
      success: '创作者身份已封禁',
    },
    unban: {
      title: '解除创作者封禁',
      confirm: '确认解除封禁',
      success: '创作者封禁已解除',
    },
  }[action]
  return (
    <div className='flex items-center gap-2'>
      <StatusBadge
        label={label}
        variant={variant}
        copyable={false}
        className='font-normal'
      />
      {canGrant && (
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setAction('grant')
            setOpen(true)
          }}
          aria-label={t('Enable creator for {{username}}', {
            username: user.username,
          })}
        >
          {t('Enable creator')}
        </Button>
      )}
      {canModerate && (
        <Button
          variant='outline'
          size='sm'
          aria-label={`${status === 'suspended' ? '解除' : ''}封禁 ${user.username} 的创作者身份`}
          onClick={() => {
            setAction(status === 'suspended' ? 'unban' : 'ban')
            setOpen(true)
          }}
        >
          {status === 'suspended' ? '解除封禁' : '封禁创作者'}
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        confirmText={copy.confirm}
        isLoading={busy}
        desc={
          action === 'grant'
            ? t(
                'Authorize {{username}} (ID {{id}}) to become a creator without recharge? They must still complete their profile and accept the creator terms themselves. This does not publish projects or approve software.',
                { username: user.username, id: user.id }
              )
            : `${action === 'ban' ? '封禁' : '解除封禁'} ${user.username}（ID ${user.id}）的创作者身份？${action === 'ban' ? '即使用户正在登录，也会立即停止发布、编辑和作品展示；已打开的创作者页面会收到封禁通知，现有作品保留。' : '恢复封禁前的创作者资格；尚未激活的用户仍需自己完成开通。'}普通社区交流和中转站账号不受影响。`
        }
        handleConfirm={async () => {
          if (busy) return
          setBusy(true)
          try {
            if (action === 'grant') {
              await creatorRequest(`/admin/users/${user.id}/grant`, {
                method: 'post',
              })
            } else {
              await creatorRequest(`/admin/users/${user.id}/status`, {
                method: 'put',
                data: { suspended: action === 'ban', expectedStatus: status },
              })
            }
            toast.success(copy.success)
            setOpen(false)
            triggerRefresh()
            void query.invalidateQueries({ queryKey: ['creator-me'] })
            void query.invalidateQueries({ queryKey: ['creator-public'] })
          } catch (error) {
            handleServerError(error)
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}
