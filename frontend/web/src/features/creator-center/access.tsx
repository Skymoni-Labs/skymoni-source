import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CircleCheck,
  Globe,
  Layers3,
  LockKeyhole,
  Package,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useCommunityAccessPolicy } from '@/features/community/access-policy-api'
import { handleServerError } from '@/lib/handle-server-error'
import { accountIdentity } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorHubStore } from '@/stores/creator-hub-store'

import { categories, type Category } from './types'

export function CreatorAccessGate({ children }: { children: ReactNode }) {
  const mode = useCreatorAccessStore((state) => state.mode)
  const suspended = useCreatorAccessStore((state) => state.suspended)
  if (suspended) {
    return (
      <main className='cc-main cc-shell sf-state' role='alert'>
        <LockKeyhole aria-hidden />
        <h1>创作者身份已被封禁</h1>
        <p>发布、编辑、上传与创作者管理已暂停，已保存的作品会保留。</p>
        <p>
          你仍可使用中转站和参与普通社区交流。如需恢复创作者权限，请联系管理员。
        </p>
        <Button render={<Link to='/creators' />}>返回社区交流</Button>
      </main>
    )
  }
  if (mode === 'creator') return children
  return <CreatorActivation gated />
}

export function CreatorActivation({ gated = false }: { gated?: boolean }) {
  const { t } = useTranslation()
  const mode = useCreatorAccessStore((state) => state.mode)
  const suspended = useCreatorAccessStore((state) => state.suspended)
  const policy = useCommunityAccessPolicy()
  const applicationsOpen = policy.data?.creatorApplicationsOpen !== false
  const manuallyGranted = useCreatorAccessStore(
    (state) => state.manuallyGranted
  )
  const apply = useCreatorAccessStore((state) => state.apply)
  const profile = useCreatorHubStore((state) => state.profile)
  const [busy, setBusy] = useState(false)
  const user = useAuthStore((state) => state.auth.user)
  const [name, setName] = useState(
    user ? accountIdentity(user).name : profile.name
  )
  const [bio, setBio] = useState(profile.bio)
  const [direction, setDirection] = useState<Category>('website')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  let statusLabel = 'Creator identity is not active'
  if (mode === 'visitor') statusLabel = 'Sign in to become a creator'
  if (mode === 'creator') statusLabel = 'Creator identity is active'
  const benefits = [
    {
      icon: Globe,
      title: 'A home for your projects',
      text: 'Build a creator profile and introduce what you make.',
    },
    {
      icon: Layers3,
      title: 'Create in your own way',
      text: 'Arrange text, pictures, links and files into a project.',
    },
    {
      icon: Package,
      title: 'Submit your own software',
      text: 'Manage versions and send releases for platform review.',
    },
  ]
  const steps = [
    {
      icon: UserRound,
      label: 'Use your skymoni account',
      done: mode !== 'visitor',
    },
    {
      icon: Wallet,
      label: manuallyGranted
        ? 'Administrator authorization received'
        : 'Redeem any credit code successfully',
      done: mode === 'eligible' || mode === 'creator',
    },
    {
      icon: Sparkles,
      label: 'Introduce yourself and activate',
      done: mode === 'creator',
    },
  ]
  return (
    <main className='cc-main cs-access-main'>
      <div className='cc-shell'>
        <div className='cs-access-layout'>
          <section className='cs-access-intro'>
            <span className='cc-eyebrow'>YOUR NEXT CHAPTER</span>
            <h1>
              {t('From discovering ideas,')}
              <br />
              <em>{t('to sharing your own.')}</em>
            </h1>
            <p>
              {t(
                'Explore freely. When you are ready to share, activate a creator identity with your existing skymoni account.'
              )}
            </p>
            <div className='cs-access-benefits'>
              {benefits.map((benefit) => (
                <div key={benefit.title}>
                  <span>
                    <benefit.icon aria-hidden />
                  </span>
                  <div>
                    <h2>{t(benefit.title)}</h2>
                    <p>{t(benefit.text)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link className='cs-text-link' to='/creators'>
              {t('Keep exploring projects')}
              <ArrowRight aria-hidden />
            </Link>
          </section>
          <section
            className='cs-access-panel'
            aria-label={t('Creator activation')}
          >
            <span className='cs-access-lock'>
              <LockKeyhole aria-hidden />
            </span>
            <span className='cs-access-status'>{t(statusLabel)}</span>
            <h2>
              {t(
                mode === 'creator'
                  ? 'Your creative space is ready.'
                  : 'Open your creative space.'
              )}
            </h2>
            <p>
              {t(
                gated
                  ? 'Publishing, project management and software submissions become available after activation. Browsing projects stays open to everyone.'
                  : '名称和头像与站点账号同步；创作简介单独保留。开通自愿，不收取额外开通费。'
              )}
            </p>
            <ol className='cs-activation-steps'>
              {steps.map((step, index) => (
                <li key={step.label} data-done={step.done}>
                  <span>{step.done ? <Check aria-hidden /> : index + 1}</span>
                  <strong>{t(step.label)}</strong>
                  {step.done && <CircleCheck aria-label={t('Completed')} />}
                </li>
              ))}
            </ol>
            {mode === 'visitor' && (
              <div className='cs-activation-next'>
                <p>
                  {t(
                    'Already have a skymoni account? Sign in with it. New visitors can register a relay account first.'
                  )}
                </p>
                <Button
                  className='cc-primary'
                  render={<a href='/sign-in?redirect=%2Fcreators%2Fjoin' />}
                >
                  {t('Sign in to skymoni')}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            )}
            {mode === 'member' && (
              <div className='cs-activation-next'>
                <p>
                  {t(
                    'No qualifying recharge yet. Redeem any credit code in your wallet, including promotional codes. Direct gifts and current balance alone do not qualify.'
                  )}
                </p>
                <Button className='cc-primary' render={<a href='/wallet' />}>
                  {t('Go to wallet')}
                  <ArrowRight aria-hidden />
                </Button>
                <small>
                  {t(
                    'After a successful credit-code redemption, return here to activate. Previous redemptions count even if the balance is spent or the code expires or is deleted.'
                  )}
                </small>
              </div>
            )}
            {suspended && (
              <p role='alert' className='cs-form-error'>
                你的创作者身份已被封禁。创作功能和作品展示暂停，社区交流与中转站账号不受影响；如有疑问请联系管理员。
              </p>
            )}
            {!suspended && !applicationsOpen && mode !== 'creator' && (
              <p role='status'>暂未开放新的创作者开通，请稍后再来。</p>
            )}
            {mode === 'eligible' && !suspended && applicationsOpen && (
              <form
                className='cs-activation-form'
                onSubmit={async (event) => {
                  event.preventDefault()
                  setError('')
                  if (!name.trim() || !bio.trim() || !accepted) {
                    setError(
                      t(
                        'Complete your name, introduction and opening instructions.'
                      )
                    )
                    return
                  }
                  try {
                    setBusy(true)
                    await apply({
                      name: name.trim(),
                      bio: bio.trim(),
                      direction,
                      accepted,
                    })
                    toast.success(t('Creator identity activated'))
                  } catch (error) {
                    handleServerError(error)
                    setError(
                      t(
                        'Unable to save. Please retry or refresh if the content has changed.'
                      )
                    )
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <div className='cs-qualified'>
                  <CircleCheck aria-hidden />
                  {t(
                    manuallyGranted
                      ? 'Administrator authorized · ready to activate'
                      : 'Recharge condition met · ready to activate'
                  )}
                </div>
                <label>
                  {t('Creator display name')}
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={20}
                    required
                  />
                </label>
                <label>
                  {t('Main creative direction')}
                  <NativeSelect
                    value={direction}
                    onChange={(event) =>
                      setDirection(event.target.value as Category)
                    }
                  >
                    {categories
                      .filter((category) => category.id !== 'all')
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {t(category.label)}
                        </option>
                      ))}
                  </NativeSelect>
                </label>
                <label>
                  {t('A short creator introduction')}
                  <Textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={180}
                    required
                  />
                </label>
                <details className='cs-opening-instructions'>
                  <summary>{t('Creator terms · 2026-10-08')}</summary>
                  <p>
                    {t(
                      'Publish only content you own or are authorized to share. Do not upload illegal, infringing or malicious content. You retain your rights and authorize skymoni to store, display and distribute the files you submit after review. You may withdraw or delete your works. The platform may reject or remove content that violates these terms. Activation requires a successful credit-code redemption or paid recharge and does not grant software center administration.'
                    )}
                  </p>
                </details>
                <label className='cs-consent'>
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(value) => setAccepted(value === true)}
                  />
                  {t('I agree to the creator terms above.')}
                </label>
                {error && (
                  <p role='alert' className='cs-form-error'>
                    {error}
                  </p>
                )}
                <Button type='submit' className='cc-primary' disabled={busy}>
                  {t('Activate creator')}
                  <ArrowRight aria-hidden />
                </Button>
              </form>
            )}
            {mode === 'creator' && (
              <Button
                className='cc-primary'
                render={<Link to='/creators/workspace' />}
              >
                {t('Enter creative workspace')}
                <ArrowRight aria-hidden />
              </Button>
            )}
            <p className='cs-access-preview-note'>
              {t(
                'Your skymoni account provides sign-in. The server verifies your credit-code redemption or recharge history before creator activation.'
              )}
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
