import { Link, useRouter } from '@tanstack/react-router'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { GeneralError } from '@/features/errors/general-error'

import { AuthSessionUnavailableError } from './lib/session-route-auth'

import './community-authorization.css'

function SessionRecovery({ error }: { error: AuthSessionUnavailableError }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now)
  const seconds = Math.max(0, Math.ceil((error.retryAt - now) / 1000))
  useEffect(() => {
    let active = true
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const retry = window.setTimeout(
      async () => {
        setBusy(true)
        try {
          await router.invalidate()
        } finally {
          if (active) setBusy(false)
        }
      },
      Math.max(0, error.retryAt - Date.now())
    )
    return () => {
      active = false
      window.clearInterval(clock)
      window.clearTimeout(retry)
    }
  }, [error.retryAt, router])
  let label = '重试恢复登录'
  if (seconds > 0) label = `${seconds} 秒后自动重试`
  if (busy) label = '正在恢复登录…'
  return (
    <main className='sky-session-recovery'>
      <section role='alert'>
        <ShieldCheck aria-hidden='true' />
        <h1>正在恢复你的登录状态</h1>
        <p>
          登录续期暂时受限或网络连接中断，页面会在等待后自动重试，请保留此页面。你的登录信息会保留，无需重新输入密码。
        </p>
        <Button
          disabled={busy || seconds > 0}
          onClick={async () => {
            setBusy(true)
            try {
              await router.invalidate()
            } finally {
              setBusy(false)
            }
          }}
        >
          <RefreshCw className={busy ? 'animate-spin' : ''} />
          {label}
        </Button>
        <Link to='/'>返回站点首页</Link>
      </section>
    </main>
  )
}

export function AuthSessionError({ error }: { error: unknown }) {
  return error instanceof AuthSessionUnavailableError ? (
    <SessionRecovery error={error} />
  ) : (
    <GeneralError error={error} />
  )
}
