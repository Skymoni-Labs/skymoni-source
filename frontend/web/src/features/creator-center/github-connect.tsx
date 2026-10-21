import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, GitFork, Loader2, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { IconGithub } from '@/assets/brand-icons/icon-github'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecureVerificationDialog } from '@/features/auth/secure-verification/components/secure-verification-dialog'
import { useSecureVerification } from '@/features/auth/secure-verification/hooks/use-secure-verification'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorStore } from '@/stores/creator-store'

import { CreatorGuide } from './components/creator-guide'
import {
  githubAuthorizationURL,
  githubDisconnect,
  githubImport,
  githubRepositories,
  githubStart,
  githubStatus,
  type GitHubDraft,
  type GitHubRepository,
} from './github-api'

const warningLabels: Record<string, string> = {
  README_TRUNCATED:
    'The README was shortened. The original remains available on GitHub.',
  README_MISSING:
    'No readable README was found. Add a project description before submitting.',
  FORK_ATTRIBUTION:
    'This is a fork. Check upstream authorship and licenses before submitting.',
  LICENSE_REVIEW:
    'No clear repository license was detected. Check the source before redistributing files.',
  COVER_OPTIONAL: 'A cover is optional. You can add screenshots in the editor.',
  RELEASE_UNAVAILABLE:
    'Release information could not be read. You can add a release link later.',
}

export function CreatorGitHubConnect() {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const sid = useAuthStore((s) => s.auth.session?.sid)
  const queryClient = useQueryClient()
  const verification = useSecureVerification()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const status = useQuery({
    queryKey: ['creator-github', userId, sid],
    queryFn: ({ signal }) => githubStatus(signal),
    retry: false,
  })
  const connect = useMutation({
    mutationFn: async () => {
      const proof = await verification.requestVerification({
        scope: 'creator.github.connect',
        title: t('Connect GitHub'),
        description: t(
          'Verify your skymoni account before connecting a repository source.'
        ),
      })
      if (!proof) return
      const result = await githubStart(proof.proof_token)
      // An external OAuth redirect cannot use the internal SPA router.
      window.location.assign(githubAuthorizationURL(result.authorizationUrl))
    },
  })
  const disconnect = useMutation({
    mutationFn: async () => {
      const proof = await verification.requestVerification({
        scope: 'creator.github.disconnect',
        title: t('Disconnect GitHub'),
      })
      if (!proof) return null
      return githubDisconnect(proof.proof_token)
    },
    onSuccess: async (result) => {
      if (!result) return
      setDisconnectOpen(false)
      queryClient.removeQueries({ queryKey: ['creator-github-repositories'] })
      await status.refetch()
      if (!result.remoteRevoked) {
        toast.info(
          t(
            'Disconnected locally. You can also revoke the app in GitHub Settings → Applications.'
          )
        )
      }
    },
  })
  return (
    <section className='cg-panel' aria-label={t('GitHub import')}>
      <div className='cg-heading'>
        <span className='cg-icon'>
          <IconGithub aria-hidden />
        </span>
        <div>
          <h2>{t('Bring your GitHub projects here.')}</h2>
          <p>
            {t(
              'Connect your account, choose a public repository and turn it into an editable private draft.'
            )}
          </p>
        </div>
        {status.data?.connected && (
          <span className='cg-connected'>
            <Check aria-hidden />@{status.data.login}
          </span>
        )}
      </div>
      <div className='cg-guide-hint'>
        <div>
          <strong>{t('First GitHub import?')}</strong>
          <span>{t('Connect → Import → Customize → Review')}</span>
        </div>
        <CreatorGuide context='github' />
      </div>
      {status.isPending && <p role='status'>{t('Loading...')}</p>}
      {status.isError && (
        <div role='alert'>
          <p>{t('Unable to load GitHub connection.')}</p>
          <Button variant='outline' onClick={() => void status.refetch()}>
            {t('Retry')}
          </Button>
        </div>
      )}
      {status.data && !status.data.configured && (
        <p role='status'>
          {t(
            'GitHub authorization is being configured. Please check back later.'
          )}
        </p>
      )}
      {status.data?.configured && (
        <>
          <div className='cg-actions'>
            <Button
              onClick={() => connect.mutate()}
              disabled={connect.isPending || disconnect.isPending}
            >
              {connect.isPending ? (
                <Loader2 className='animate-spin' aria-hidden />
              ) : (
                <IconGithub aria-hidden />
              )}
              {t(status.data.connected ? 'Reconnect GitHub' : 'Connect GitHub')}
            </Button>
            {status.data.connected && (
              <Button
                variant='ghost'
                onClick={() => setDisconnectOpen(true)}
                disabled={connect.isPending || disconnect.isPending}
              >
                {t('Disconnect')}
              </Button>
            )}
            <span>
              {t(
                'Public repositories only · No code execution · Private draft first'
              )}
            </span>
          </div>
          {status.data.connected && (
            <GitHubRepositoryPicker
              key={`${userId}:${sid}:${status.data.login}`}
            />
          )}
        </>
      )}
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={t('Disconnect GitHub?')}
        desc={t(
          'Existing projects stay in your workspace. Future imports require a new authorization.'
        )}
        handleConfirm={() => disconnect.mutate()}
        isLoading={disconnect.isPending}
        confirmText={t('Disconnect')}
      />
      <SecureVerificationDialog {...verification.dialogProps} />
    </section>
  )
}

export function GitHubRepositoryPicker() {
  const { t } = useTranslation()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const sid = useAuthStore((s) => s.auth.session?.sid)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GitHubRepository | null>(null)
  const [directory, setDirectory] = useState('')
  const [result, setResult] = useState<GitHubDraft | null>(null)
  const repos = useQuery({
    queryKey: ['creator-github-repositories', userId, sid, page],
    queryFn: ({ signal }) => githubRepositories(page, signal),
    retry: false,
  })
  const importing = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Choose a repository first')
      return githubImport(selected.full_name, directory.trim())
    },
    onSuccess: async (draft) => {
      useCreatorStore.setState((state) => ({
        works: [
          draft.work,
          ...state.works.filter((w) => w.id !== draft.work.id),
        ],
      }))
      setResult(draft)
      await queryClient.invalidateQueries({ queryKey: ['creator-me'] })
    },
  })
  const filtered = (repos.data ?? []).filter((r) =>
    `${r.full_name} ${r.description ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
  )
  return (
    <div className='cg-picker'>
      <div className='cg-picker-title'>
        <h3>{t('Choose a public repository')}</h3>
        <span>
          {t(
            'Only repositories owned by your connected GitHub account are listed.'
          )}
        </span>
      </div>
      <Label htmlFor='github-repository-search' className='sr-only'>
        {t('Search this page')}
      </Label>
      <div className='cg-search'>
        <Search aria-hidden />
        <Input
          id='github-repository-search'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search this page')}
        />
      </div>
      {repos.isPending && <p role='status'>{t('Loading repositories...')}</p>}
      {repos.isError && (
        <div role='alert'>
          <p>
            {t(
              'Unable to read repositories. Retry or reconnect GitHub if authorization was revoked.'
            )}
          </p>
          <Button variant='outline' onClick={() => void repos.refetch()}>
            {t('Retry')}
          </Button>
        </div>
      )}
      {repos.data && !filtered.length && (
        <p>{t('No matching public repositories on this page.')}</p>
      )}
      <div className='cg-repositories' aria-label={t('Public repositories')}>
        {filtered.map((repo) => (
          <Button
            variant='outline'
            key={repo.id}
            className='cg-repository'
            aria-pressed={selected?.id === repo.id}
            disabled={importing.isPending}
            onClick={() => {
              setSelected(repo)
              setResult(null)
            }}
          >
            <span className='cg-repo-icon'>
              <IconGithub aria-hidden />
            </span>
            <span>
              <strong>{repo.full_name}</strong>
              <span>
                {repo.description || t('Add a description after importing.')}
              </span>
              <small>
                {repo.language}
                {repo.fork && (
                  <>
                    {' '}
                    · <GitFork aria-hidden />
                    {t('Fork')}
                  </>
                )}
                {repo.archived && <> · {t('Archived')}</>}
              </small>
            </span>
            {selected?.id === repo.id && <Check aria-hidden />}
          </Button>
        ))}
      </div>
      <div className='cg-pagination'>
        <Button
          variant='ghost'
          disabled={page <= 1 || importing.isPending || repos.isPending}
          onClick={() => {
            setPage(page - 1)
            setSelected(null)
          }}
        >
          {t('Previous')}
        </Button>
        <span>{t('Page {{page}}', { page })}</span>
        <Button
          variant='ghost'
          disabled={
            !repos.data ||
            repos.data.length < 30 ||
            page >= 100 ||
            importing.isPending
          }
          onClick={() => {
            setPage(page + 1)
            setSelected(null)
          }}
        >
          {t('Next')}
        </Button>
      </div>
      <Label htmlFor='github-project-directory'>
        {t('Project subdirectory (optional)')}
      </Label>
      <Input
        id='github-project-directory'
        placeholder='skills/my-skill'
        value={directory}
        maxLength={300}
        disabled={importing.isPending}
        onChange={(e) => setDirectory(e.target.value)}
      />
      <p className='cg-hint'>
        {t(
          'Leave blank to import the repository root. For a collection, enter one project folder. No images are required.'
        )}
      </p>
      <Button
        disabled={!selected || importing.isPending || !!result}
        onClick={() => importing.mutate()}
      >
        {importing.isPending ? (
          <Loader2 className='animate-spin' aria-hidden />
        ) : (
          <ArrowRight aria-hidden />
        )}
        {t('Import as private draft')}
      </Button>
      {result && (
        <div className='cg-result' role='status'>
          <h3>{t('Your private draft is ready.')}</h3>
          <p>{result.work.title}</p>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>
                {t(
                  warningLabels[warning] ||
                    'Review the imported content before submitting.'
                )}
              </li>
            ))}
          </ul>
          <Button
            render={
              <Link to='/creators/studio' search={{ edit: result.work.id }} />
            }
          >
            {t('Review and edit draft')}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      )}
    </div>
  )
}
