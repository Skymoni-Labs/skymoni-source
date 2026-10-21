import { useQuery } from '@tanstack/react-query'
import { Copy, Eye, KeyRound, LockKeyhole, Pencil, Save } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { encryptPassword } from '@/features/auth/lib/password-encryption'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

interface WalletLogin {
  username: string
  password: string
  login_url: string
  note: string
}
interface CredentialStatus {
  configured: boolean
  exists: boolean
  updated_at: number
}
const emptyLogin: WalletLogin = {
  username: '',
  password: '',
  login_url: '',
  note: '',
}

export function UpstreamWalletCredential({ walletID }: { walletID: number }) {
  const id = useId()
  const [unlockKey, setUnlockKey] = useState('')
  const [login, setLogin] = useState<WalletLogin | null>(null)
  const [draft, setDraft] = useState<WalletLogin>(emptyLogin)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const epoch = useRef(0)
  const mounted = useRef(true)
  const request = useRef<AbortController | null>(null)
  const status = useQuery({
    queryKey: ['upstream-wallet-credential-status', walletID],
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{ success: boolean; data: CredentialStatus }>(
            `/api/upstream-wallet/${walletID}/credential`
          )
        ).data
      ).data,
    staleTime: 0,
  })
  const lock = useCallback(() => {
    epoch.current++
    request.current?.abort()
    setLogin(null)
    setDraft(emptyLogin)
    setUnlockKey('')
    setEditing(false)
    setBusy(false)
    setError('')
  }, [])
  useEffect(() => {
    mounted.current = true
    const abortPending = () => request.current?.abort()
    const onHide = () => {
      if (document.hidden) lock()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      mounted.current = false
      abortPending()
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [lock])
  useEffect(() => {
    if (!login && !editing) return
    const timer = setTimeout(lock, 5 * 60_000)
    return () => clearTimeout(timer)
  }, [login, editing, lock])
  const access = async (save: boolean) => {
    if (!unlockKey || busy) return
    const ticket = epoch.current
    const abort = new AbortController()
    request.current = abort
    setBusy(true)
    setError('')
    try {
      const unlock = await encryptPassword(
        unlockKey,
        '/api/upstream-wallet/encryption-key'
      )
      const payload = {
        unlock_key_encrypted: unlock.password_encrypted,
        encryption_key_id: unlock.encryption_key_id,
      }
      if (!mounted.current || ticket !== epoch.current) return
      if (save) {
        const password = await encryptPassword(
          draft.password,
          '/api/upstream-wallet/encryption-key'
        )
        if (!mounted.current || ticket !== epoch.current) return
        if (password.encryption_key_id !== unlock.encryption_key_id) {
          throw new Error('加密配置已更新，请重试')
        }
        requireServerSuccess(
          (
            await api.put(
              `/api/upstream-wallet/${walletID}/credential`,
              {
                ...payload,
                username: draft.username.trim(),
                login_url: draft.login_url.trim(),
                note: draft.note,
                password_encrypted: password.password_encrypted,
              },
              { signal: abort.signal }
            )
          ).data
        )
        if (!mounted.current || ticket !== epoch.current) return
        toast.success('账号密码已保存')
        lock()
        await status.refetch()
      } else if (!status.data?.exists) {
        setEditing(true)
      } else {
        const result = requireServerSuccess(
          (
            await api.post<{ success: boolean; data: WalletLogin }>(
              `/api/upstream-wallet/${walletID}/credential/reveal`,
              payload,
              { signal: abort.signal }
            )
          ).data
        )
        if (mounted.current && ticket === epoch.current) setLogin(result.data)
      }
    } catch (cause: unknown) {
      if (
        mounted.current &&
        ticket === epoch.current &&
        !abort.signal.aborted
      ) {
        const response = (
          cause as { response?: { data?: { message?: string } } }
        ).response
        setError(
          response?.data?.message ||
            (cause instanceof Error ? cause.message : '无法读取，请重试')
        )
      }
    } finally {
      if (mounted.current && ticket === epoch.current) setBusy(false)
    }
  }
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('已复制')
    } catch {
      toast.error('无法复制，请手动选择')
    }
  }
  const viewLabel = busy ? '正在解锁' : '查看密码'
  const accessLabel = status.data?.exists ? viewLabel : '录入凭据'
  return (
    <details
      className='rounded-xl border p-3'
      onToggle={(event) => {
        if (!event.currentTarget.open) lock()
      }}
    >
      <summary className='cursor-pointer text-sm font-medium'>
        <KeyRound className='mr-1.5 inline size-4' />
        账号与密码
      </summary>
      <div className='mt-3 space-y-3'>
        <p className='text-muted-foreground text-xs'>
          仅超级管理员可查看。关闭详情、切换到后台或 5 分钟后自动隐藏。
        </p>
        {status.isError && (
          <p role='alert' className='text-destructive text-xs'>
            暂时无法读取密码记录，请重试。
          </p>
        )}
        {status.data && !status.data.exists && (
          <p className='text-muted-foreground text-xs'>
            尚未录入登录凭据，可以填写并保存。
          </p>
        )}
        {!login && (
          <div className='flex items-end gap-2'>
            <div className='min-w-0 flex-1 space-y-1.5'>
              <Label htmlFor={`${id}-unlock`}>统一查看密钥</Label>
              <Input
                id={`${id}-unlock`}
                type='password'
                autoComplete='off'
                placeholder='输入查看密钥'
                value={unlockKey}
                disabled={busy}
                onChange={(e) => setUnlockKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !editing) {
                    e.preventDefault()
                    void access(false)
                  }
                }}
              />
            </div>
            {!editing && (
              <Button
                variant='outline'
                disabled={busy || !unlockKey || !status.data?.configured}
                onClick={() => void access(false)}
              >
                <Eye className='size-4' />
                {accessLabel}
              </Button>
            )}
          </div>
        )}
        {login && !editing && (
          <div className='bg-muted/35 space-y-3 rounded-lg p-3'>
            <div className='flex items-center justify-between gap-2'>
              <div className='min-w-0'>
                <p className='text-muted-foreground text-xs'>登录账号</p>
                <p className='text-sm break-all'>{login.username}</p>
              </div>
              <Button
                size='icon'
                variant='ghost'
                aria-label='复制登录账号'
                onClick={() => void copy(login.username)}
              >
                <Copy className='size-4' />
              </Button>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='min-w-0'>
                <p className='text-muted-foreground text-xs'>登录密码</p>
                <p
                  className='font-mono text-sm break-all'
                  data-testid='revealed-wallet-password'
                >
                  {login.password}
                </p>
              </div>
              <Button
                size='icon'
                variant='ghost'
                aria-label='复制登录密码'
                onClick={() => void copy(login.password)}
              >
                <Copy className='size-4' />
              </Button>
            </div>
            <a
              className='text-primary inline-block text-xs break-all underline-offset-4 hover:underline'
              href={login.login_url}
              target='_blank'
              rel='noopener noreferrer'
            >
              打开上游登录页 ↗
            </a>
            {login.note && (
              <p className='text-muted-foreground text-xs'>{login.note}</p>
            )}
            <div className='flex gap-2'>
              <Button size='sm' variant='outline' onClick={lock}>
                <LockKeyhole className='size-3.5' />
                隐藏密码
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => {
                  setDraft({ ...login })
                  setEditing(true)
                }}
              >
                <Pencil className='size-3.5' />
                修改记录
              </Button>
            </div>
          </div>
        )}
        {editing && (
          <div className='space-y-3'>
            {(['username', 'password', 'login_url', 'note'] as const).map(
              (field) => (
                <div key={field} className='space-y-1.5'>
                  <Label htmlFor={`${id}-${field}`}>
                    {
                      {
                        username: '登录账号',
                        password: '登录密码',
                        login_url: '登录网址',
                        note: '核验说明',
                      }[field]
                    }
                  </Label>
                  <Input
                    id={`${id}-${field}`}
                    type={field === 'password' ? 'password' : 'text'}
                    autoComplete='off'
                    value={draft[field]}
                    onChange={(e) =>
                      setDraft({ ...draft, [field]: e.target.value })
                    }
                  />
                </div>
              )
            )}
            <div className='flex gap-2'>
              <Button
                size='sm'
                disabled={
                  busy ||
                  !unlockKey ||
                  !draft.username.trim() ||
                  !draft.password ||
                  !draft.login_url.trim()
                }
                onClick={() => void access(true)}
              >
                <Save className='size-3.5' />
                {busy ? '正在保存' : '保存凭据'}
              </Button>
              <Button size='sm' variant='ghost' onClick={lock}>
                取消
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role='alert' className='text-destructive text-xs'>
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
