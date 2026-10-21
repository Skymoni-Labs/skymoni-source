import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { getAuthScope } from '@/lib/auth-scope'
import { readCommunityInvite } from '@/lib/community-invite'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { useCommunityAccessPolicy, type Policy } from './access-policy-api'

type Invite = {
  id: string
  suffix: string
  label: string
  uses: number
  maxUses: number
  expiresAt: number
  disabled: boolean
}
export function CommunityAdmissionFields({
  force = false,
}: {
  force?: boolean
}) {
  const community = force || getAuthScope() === 'community'
  const policy = useCommunityAccessPolicy()
  const [invite, setInvite] = useState(readCommunityInvite)
  if (!community) return null
  return (
    <div className='space-y-3 text-sm'>
      {policy.data?.redemptionRequired && (
        <p className='text-muted-foreground'>
          新开通社区需先在中转站兑换额度或完成充值；已开通账号不重复校验。
        </p>
      )}
      {policy.data?.inviteRequired && (
        <div className='space-y-2'>
          <label htmlFor='community-invite'>社区邀请码</label>
          <Input
            id='community-invite'
            value={invite}
            maxLength={100}
            autoComplete='off'
            placeholder='输入管理员提供的邀请码'
            onChange={(event) => {
              const value = event.target.value
              setInvite(value)
              try {
                sessionStorage.setItem('skymoni:community-invite', value.trim())
              } catch {
                /* Keep the field editable. */
              }
            }}
          />
          <p className='text-muted-foreground text-xs'>
            用于首次开通社区，已开通的账号无需重复填写。
          </p>
        </div>
      )}
      {policy.isError && (
        <p role='alert'>暂时无法获取社区准入要求，请稍后重试。</p>
      )}
    </div>
  )
}

export function CommunityAccessManagement() {
  const auth = useAuthStore((s) => s.auth)
  const client = useQueryClient()
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(7)
  const [created, setCreated] = useState('')
  const key = ['community-access-admin', auth.user?.id, auth.session?.sid]
  const state = useQuery({
    queryKey: key,
    enabled: auth.user?.role === 100,
    retry: false,
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{
            success: boolean
            data: { policy: Policy; invites: Invite[] }
          }>('/api/creators/community-access', {
            skipAuthRefresh: true,
            skipErrorHandler: true,
            disableDuplicate: true,
          })
        ).data
      ).data,
  })
  const save = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      requireServerSuccess(
        (
          await api.put<{ success: boolean; data: { code?: string } }>(
            '/api/creators/community-access',
            data,
            { skipAuthRefresh: true, skipErrorHandler: true }
          )
        ).data
      ).data,
    onSuccess: (result) => {
      if (result.code) setCreated(result.code)
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: ['community-access-policy'] })
      toast.success('社区准入设置已保存')
    },
    onError: (error) => handleServerError(error),
  })
  if (auth.user?.role !== 100) return null
  const policy = state.data?.policy
  return (
    <section
      className='sf-access-management sf-admin-panel'
      aria-labelledby='community-access-heading'
    >
      <div>
        <span className='sf-rail-kicker'>COMMUNITY ACCESS</span>
        <h2 id='community-access-heading'>注册与开通规则</h2>
        <p>
          两个条件分别控制；同时开启时，新成员需同时满足。已开通成员保留资格，中转站不受影响。
        </p>
      </div>
      {state.isPending && <p role='status'>正在读取准入设置…</p>}
      {state.isError && (
        <div role='alert'>
          设置加载失败。
          <Button variant='outline' onClick={() => void state.refetch()}>
            重试
          </Button>
        </div>
      )}
      {policy && (
        <div className='sf-access-switches'>
          {(
            [
              {
                key: 'redemptionRequired',
                name: '兑换额度后开通社区',
                text: '开启后，新成员需有成功的额度兑换或充值记录。',
              },
              {
                key: 'inviteRequired',
                name: '社区邀请码',
                text: '开启后，新成员需使用有效的邀请码开通社区。',
              },
            ] as const
          ).map((item) => (
            <div key={item.key}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.text}</p>
              </div>
              <Button
                role='switch'
                aria-checked={policy[item.key]}
                aria-label={item.name}
                variant={policy[item.key] ? 'default' : 'outline'}
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    action: 'policy',
                    ...policy,
                    [item.key]: !policy[item.key],
                  })
                }
              >
                {policy[item.key] ? '已开启' : '已关闭'}
              </Button>
            </div>
          ))}
          <p>
            {!policy.redemptionRequired && !policy.inviteRequired
              ? '当前：免费开放注册与开通。'
              : '当前：按上述条件开放新成员加入。'}
          </p>
        </div>
      )}
      {policy && (
        <div className='sf-access-switches'>
          <div>
            <div>
              <strong>开放创作者开通</strong>
              <p>
                关闭后暂停新的创作者开通，已开通者继续使用。封禁指定创作者请前往中转站“用户”管理。
              </p>
            </div>
            <Button
              role='switch'
              aria-label='开放创作者开通'
              aria-checked={policy.creatorApplicationsOpen !== false}
              disabled={save.isPending}
              variant={
                policy.creatorApplicationsOpen !== false ? 'default' : 'outline'
              }
              onClick={() =>
                save.mutate({
                  action: 'policy',
                  ...policy,
                  creatorApplicationsOpen:
                    policy.creatorApplicationsOpen === false,
                })
              }
            >
              {policy.creatorApplicationsOpen !== false ? '已开启' : '已关闭'}
            </Button>
          </div>
        </div>
      )}
      <div className='sf-access-invite-form'>
        <label>
          备注
          <Input
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder='例如：首批体验成员'
          />
        </label>
        <label>
          使用人数
          <Input
            type='number'
            min={1}
            max={100}
            value={maxUses}
            onChange={(event) => setMaxUses(Number(event.target.value))}
          />
        </label>
        <label>
          有效天数
          <Input
            type='number'
            min={1}
            max={365}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          />
        </label>
        <Button
          disabled={
            save.isPending ||
            !policy ||
            maxUses < 1 ||
            maxUses > 100 ||
            days < 1 ||
            days > 365
          }
          onClick={() => {
            setCreated('')
            save.mutate({ action: 'invite', label, maxUses, days })
          }}
        >
          生成邀请码
        </Button>
      </div>
      {created && (
        <div className='sf-access-created' role='status'>
          <strong>邀请码只在生成时完整显示，请及时保存</strong>
          <code>{created}</code>
          <Button
            variant='outline'
            onClick={() =>
              void navigator.clipboard
                .writeText(created)
                .then(() => toast.success('已复制'))
                .catch(handleServerError)
            }
          >
            复制邀请码
          </Button>
          <Button variant='ghost' onClick={() => setCreated('')}>
            收起
          </Button>
        </div>
      )}
      <div className='sf-access-invites'>
        {state.data?.invites.map((invite) => (
          <div key={invite.id}>
            <div>
              <strong>{invite.label || '社区邀请'}</strong>
              <p>
                尾号 {invite.suffix} · {invite.uses}/{invite.maxUses} 人 ·{' '}
                {new Date(invite.expiresAt * 1000).toLocaleDateString()} 到期
                {invite.disabled ? ' · 已停用' : ''}
              </p>
            </div>
            <Button
              variant='outline'
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  action: 'disable',
                  id: invite.id,
                  disabled: !invite.disabled,
                })
              }
            >
              {invite.disabled ? '启用' : '停用'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
