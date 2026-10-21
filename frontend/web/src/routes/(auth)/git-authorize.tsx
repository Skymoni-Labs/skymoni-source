import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { LoaderCircle, ArrowRight, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveAuthentication } from '@/lib/auth-session'
import { api, getFreshAuthHeaders } from '@/lib/api'
import { safeGitCallback } from '@/features/auth/lib/git-sso'
import { useAuthStore } from '@/stores/auth-store'

const searchSchema = z.object({
  request: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  method: z.enum(['account', 'github', 'register']).default('account'),
})

function GitAuthorize() {
  const search = Route.useSearch()
  const user = useAuthStore(s => s.auth.user)
  const started = useRef(false)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const authorize = async () => {
    setPending(true)
    setError('')
    try {
      const check = await api.get('/git-sso/request', { params: { request: search.request }, skipErrorHandler: true })
      if (!check.data.success) throw new Error('登录请求已过期，请返回 Git 网站重新登录。')
      const headers = await getFreshAuthHeaders()
      const result = await api.post('/git-sso/grant', { request: search.request }, { headers, disableDuplicate: true, skipErrorHandler: true })
      const destination = safeGitCallback(result.data.data?.redirect_uri)
      if (!result.data.success || !destination) throw new Error('暂时无法完成登录，请重试或返回 Git 网站。')
      window.location.assign(destination)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录暂时不可用，请重试。')
      setPending(false)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    void authorize()
  }, [])
  return (
    <main className='bg-background flex min-h-svh items-center justify-center px-4 py-10'>
      <section className='bg-card border-border w-full max-w-md rounded-2xl border p-8 shadow-lg'>
        <GitBranch className='mb-5 size-10 text-sky-500' aria-hidden='true' />
        <h1 className='text-xl font-semibold'>返回 Skymoni Git</h1>
        <p className='text-muted-foreground mt-3 text-sm'>正在使用中转站账号 {user?.display_name || user?.username} 登录。</p>
        <p className='text-muted-foreground mt-2 text-xs'>Git 会关联你的账号标识、昵称和邮箱。</p>
        {pending ? <p role='status' className='mt-6 flex items-center gap-2 text-sm'><LoaderCircle className='size-4 animate-spin' /> 正在完成登录，请稍候…</p> : <>
          <p role='alert' className='mt-5 text-sm text-red-500'>{error}</p>
          <Button onClick={() => void authorize()} className='mt-5 gap-2'><ArrowRight className='size-4' />重试登录</Button>
        </>}
        <a className='text-muted-foreground mt-6 block text-xs underline' href='https://git.skymoni.com/class-git/user/login'>返回 Git 登录页</a>
      </section>
    </main>
  )
}

export const Route = createFileRoute('/(auth)/git-authorize')({
  validateSearch: searchSchema,
  beforeLoad: async ({ search, location }) => {
    await resolveAuthentication()
    if (search.method === 'github') {
      throw redirect({ to: '/sign-in', search: { redirect: `/git-authorize?request=${search.request}&method=account`, provider: 'github' } })
    }
    const { auth } = useAuthStore.getState()
    if (!auth.user || !auth.accessToken) {
      if (search.method === 'register') throw redirect({ to: '/sign-up', search: { redirect: location.href } })
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  component: GitAuthorize,
})
