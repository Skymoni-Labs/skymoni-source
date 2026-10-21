import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { githubCallback } from './github-api'

export function CreatorGitHubCallback(props: {
  code?: string
  state?: string
  error?: string
}) {
  const { t } = useTranslation()
  const started = useRef(false)
  const valid = !!props.state && !!(props.code || props.error)
  const [result, setResult] = useState<
    'pending' | 'connected' | 'cancelled' | 'failed'
  >(valid ? 'pending' : 'failed')
  useEffect(() => {
    if (started.current) return
    started.current = true
    // Remove the single-use code from history/referrers; keep it in this closure only.
    window.history.replaceState(
      window.history.state,
      '',
      '/creators/github/callback'
    )
    if (!props.state || !valid) return
    void githubCallback(props.code ?? '', props.state, !!props.error).then(
      (response) => setResult(response.cancelled ? 'cancelled' : 'connected'),
      () => setResult('failed')
    )
  }, [props.code, props.state, props.error, valid])
  const labels = {
    pending: 'Completing GitHub authorization...',
    connected: 'GitHub is connected. Choose a repository to import.',
    cancelled:
      'GitHub authorization was cancelled. You can connect again when ready.',
    failed:
      'Authorization could not be completed. Your request may have expired or your login changed. Please return and connect again.',
  }
  return (
    <main className='cc-main cc-shell'>
      <section className='cg-panel'>
        <h1>{t('GitHub connection')}</h1>
        <p role={result === 'failed' ? 'alert' : 'status'}>
          {t(labels[result])}
        </p>
        <Button
          render={<Link to='/creators/workspace' search={{ tab: 'github' }} />}
        >
          {t('Return to workspace')}
        </Button>
      </section>
    </main>
  )
}
