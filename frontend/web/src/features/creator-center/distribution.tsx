import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Download,
  FileBox,
  Package,
  Pencil,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { handleServerError } from '@/lib/handle-server-error'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import { downloadFile, storeFile } from './lib/files'
import { emptyRelease, type CreatorRelease } from './lib/hub'
import { publicationLabel } from './types'

const permissions = [
  ['Manage own projects and versions', 'Creator'],
  ['Submit software or tool links', 'Creator'],
  ['Approve software center listings', 'Administrator'],
  ['Manage recommendations and other publishers', 'Administrator'],
] as const

export function DistributionPanel() {
  const { t } = useTranslation()
  const works = useCreatorStore((state) => state.works)
  const ownSoftware = works.filter(
    (work) => work.category === 'software' && !work.sample
  )
  const releases = useCreatorHubStore((state) => state.releases)
  const saveRelease = useCreatorHubStore((state) => state.saveRelease)
  const withdraw = useCreatorHubStore((state) => state.withdrawRelease)
  const [form, setForm] = useState<CreatorRelease>(emptyRelease)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  function update<K extends keyof CreatorRelease>(
    key: K,
    value: CreatorRelease[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setError('')
  }
  async function persist(status: 'draft' | 'review') {
    setBusy(true)
    try {
      await saveRelease({ ...form, status, updatedAt: Date.now() }, works)
      setForm(emptyRelease())
      setDirty(false)
      setError('')
      toast.success(
        t(
          status === 'review'
            ? 'Software version submitted for review'
            : 'Version draft saved'
        )
      )
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'This version and platform already have a submission'
      ) {
        setError(t('This version and platform already have a submission'))
      } else {
        setError(
          t(
            'Choose your own software project, enter a version and release notes (8 characters), and add a valid download link or package.'
          )
        )
      }
    } finally {
      setBusy(false)
    }
  }
  async function attach(file: File) {
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError(t('Choose a non-empty file under 20 MB'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const id = await storeFile(file)
      update('package', { id, name: file.name, size: file.size })
    } catch (error) {
      handleServerError(error)
      setError(t('Unable to upload. Check file type and storage space.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <FormNavigationGuard when={dirty || busy} />
      <header className='ch-page-heading'>
        <span className='cc-eyebrow'>FROM IDEA TO RELEASE</span>
        <h1>{t('Software submissions')}</h1>
        <p>
          {t(
            'Your project is the story. A release is the version people download.'
          )}
        </p>
      </header>
      <div className='ch-distribution-notice'>
        <ShieldCheck aria-hidden />
        <div>
          <strong>{t('Creator submits. Administrator reviews.')}</strong>
          <span>
            {t(
              'Manage only your own software. Approved versions appear on your project page; software center curation stays with administrators.'
            )}
          </span>
        </div>
      </div>
      <div className='ch-distribution-layout'>
        <div>
          <section className='ch-panel'>
            <div className='ch-section-title'>
              <h2>
                <Package aria-hidden />
                {t('Prepare a software version')}
              </h2>
              <span className='ch-outline-badge'>{t('Platform review')}</span>
            </div>
            {!ownSoftware.length ? (
              <div className='ch-distribution-empty'>
                <FileBox aria-hidden />
                <h3>{t('Start with your own software project')}</h3>
                <p>
                  {t(
                    'Create a software project first. Only your own software can be submitted here.'
                  )}
                </p>
                <Button
                  className='cc-primary'
                  render={
                    <Link
                      to='/creators/studio'
                      search={{ category: 'software' }}
                    />
                  }
                >
                  {t('Create a software project')}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            ) : (
              <form
                className='ch-release-form'
                onSubmit={(event) => {
                  event.preventDefault()
                  persist('review')
                }}
              >
                <div>
                  <Label htmlFor='release-project'>
                    {t('Software project')}
                  </Label>
                  <NativeSelect
                    id='release-project'
                    value={form.projectId}
                    disabled={busy}
                    onChange={(e) => {
                      setForm((current) => ({
                        ...current,
                        projectId: e.target.value,
                        package: undefined,
                        downloadUrl: '',
                      }))
                      setDirty(true)
                    }}
                  >
                    <option value=''>{t('Choose your software')}</option>
                    {ownSoftware.map((work) => (
                      <option key={work.id} value={work.id}>
                        {work.title || t('Untitled project')}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className='ch-form-pair'>
                  <div>
                    <Label htmlFor='release-version'>{t('Version')}</Label>
                    <Input
                      id='release-version'
                      placeholder='1.0.0'
                      maxLength={50}
                      value={form.version}
                      onChange={(e) => update('version', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor='release-platform'>
                      {t('Release platform')}
                    </Label>
                    <NativeSelect
                      id='release-platform'
                      value={form.platform}
                      onChange={(e) =>
                        update(
                          'platform',
                          e.target.value as CreatorRelease['platform']
                        )
                      }
                    >
                      {[
                        'Windows',
                        'macOS',
                        'Linux',
                        'Android',
                        'iOS',
                        'Web',
                      ].map((platform) => (
                        <option key={platform}>{platform}</option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <div>
                  <Label htmlFor='release-download'>
                    {t('Download or official tool link')}
                  </Label>
                  <Input
                    id='release-download'
                    type='url'
                    placeholder='https://'
                    maxLength={2000}
                    value={form.downloadUrl}
                    onChange={(e) => update('downloadUrl', e.target.value)}
                  />
                </div>
                <div className='ch-package-zone'>
                  <Upload aria-hidden />
                  <div>
                    <Label htmlFor='release-package'>
                      {t('Or choose a local package')}
                    </Label>
                    <p>
                      {t(
                        'Up to 20 MB in this prototype. Files stay in this browser; no public download link is generated.'
                      )}
                    </p>
                    <Input
                      id='release-package'
                      type='file'
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void attach(file)
                      }}
                    />
                  </div>
                </div>
                {form.package && (
                  <div className='ch-package-file'>
                    <FileBox aria-hidden />
                    <span>
                      {form.package.name}
                      <small>
                        {(form.package.size / 1024 / 1024).toFixed(2)} MB ·{' '}
                        {t('Stored on this device only')}
                      </small>
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => update('package', undefined)}
                    >
                      {t('Remove attachment')}
                    </Button>
                  </div>
                )}
                <div>
                  <Label htmlFor='release-notes'>{t('Release notes')}</Label>
                  <Textarea
                    id='release-notes'
                    rows={4}
                    maxLength={6000}
                    value={form.notes}
                    placeholder={t(
                      'What is new, and what should people know before installing?'
                    )}
                    onChange={(e) => update('notes', e.target.value)}
                  />
                </div>
                <details className='ch-release-extra'>
                  <summary>{t('Source, usage and store link')}</summary>
                  <div>
                    <Label htmlFor='release-provenance'>
                      {t('Software provenance')}
                    </Label>
                    <NativeSelect
                      id='release-provenance'
                      value={form.provenance}
                      onChange={(e) =>
                        update(
                          'provenance',
                          e.target.value as CreatorRelease['provenance']
                        )
                      }
                    >
                      <option value='original'>
                        {t('My original software')}
                      </option>
                      <option value='authorized'>
                        {t('Shared with permission')}
                      </option>
                      <option value='open-source'>
                        {t('Open source project')}
                      </option>
                    </NativeSelect>
                  </div>
                  <div>
                    <Label htmlFor='release-license'>
                      {t('Usage or license note')}
                    </Label>
                    <Input
                      id='release-license'
                      maxLength={300}
                      value={form.license}
                      onChange={(e) => update('license', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor='release-source'>
                      {t('Source or authorization reference')}
                    </Label>
                    <Input
                      id='release-source'
                      type='url'
                      placeholder='https://'
                      maxLength={2000}
                      value={form.sourceUrl}
                      onChange={(e) => update('sourceUrl', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor='release-store'>
                      {t('Optional store link')}
                    </Label>
                    <Input
                      id='release-store'
                      type='url'
                      placeholder='https://skymoni.com/store'
                      maxLength={2000}
                      value={form.storeUrl}
                      onChange={(e) => update('storeUrl', e.target.value)}
                    />
                    <p>
                      {t(
                        'For invitation codes or optional services. Downloading the software remains a separate action.'
                      )}
                    </p>
                  </div>
                </details>
                {error && (
                  <p role='alert' className='ch-form-error'>
                    {error}
                  </p>
                )}
                {busy && <p role='status'>{t('Preparing attachment…')}</p>}
                <div className='ch-release-actions'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy}
                    onClick={() => persist('draft')}
                  >
                    <Save aria-hidden />
                    {t('Save version draft')}
                  </Button>
                  <Button className='cc-primary' type='submit' disabled={busy}>
                    <Send aria-hidden />
                    {t('Submit software for review')}
                  </Button>
                </div>
              </form>
            )}
          </section>
          <section className='ch-release-history'>
            <div className='ch-section-title'>
              <h2>{t('Version history')}</h2>
              <small>{releases.length}</small>
            </div>
            {releases.length ? (
              releases.map((release) => (
                <article key={release.id} className='ch-release-record'>
                  <Package aria-hidden />
                  <div>
                    <strong>
                      {works.find((work) => work.id === release.projectId)
                        ?.title || t('Project unavailable')}
                    </strong>
                    <span>
                      {release.version} · {release.platform} ·{' '}
                      {t(publicationLabel(release.status))}
                    </span>
                    <p>{release.notes}</p>
                  </div>
                  <div className='ch-release-record-actions'>
                    {release.package && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('Download package')}
                        onClick={() => {
                          const file = release.package
                          if (!file) return
                          void downloadFile(file.id, file.name).catch(() =>
                            toast.error(t('Attachment unavailable'))
                          )
                        }}
                      >
                        <Download aria-hidden />
                      </Button>
                    )}
                    {release.status === 'review' ? (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={dirty || busy}
                        onClick={async () => {
                          try {
                            await withdraw(release.id)
                          } catch (error) {
                            handleServerError(error)
                            toast.error(
                              t(
                                'Unable to save. Please retry or refresh if the content has changed.'
                              )
                            )
                          }
                        }}
                      >
                        <RotateCcw aria-hidden />
                        {t('Withdraw submission')}
                      </Button>
                    ) : (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={dirty || busy}
                        onClick={() => {
                          setForm({ ...release })
                          setError('')
                        }}
                      >
                        <Pencil aria-hidden />
                        {t('Edit version')}
                      </Button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className='ch-empty-inline'>
                <Package aria-hidden />
                <strong>{t('Your first release starts here.')}</strong>
                <p>
                  {t(
                    'Saved versions and review status will appear in this list.'
                  )}
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className='ch-distribution-rail'>
          <section className='ch-panel'>
            <h2>
              <ShieldCheck aria-hidden />
              {t('Who can do what?')}
            </h2>
            <p>
              {t(
                'Keep publishing simple, and keep site administration separate.'
              )}
            </p>
            <div className='ch-permission-list'>
              {permissions.map(([label, role]) => (
                <div key={label}>
                  <Check aria-hidden />
                  <span>{t(label)}</span>
                  <small>{t(role)}</small>
                </div>
              ))}
            </div>
          </section>
          <section className='ch-panel'>
            <h2>{t('One project, two places to discover it.')}</h2>
            <div className='ch-destination'>
              <FileBox aria-hidden />
              <div>
                <strong>{t('Creator Space')}</strong>
                <span>
                  {t('The story, images, creator profile and project details.')}
                </span>
              </div>
            </div>
            <div className='ch-flow-arrow'>
              <ArrowRight aria-hidden />
            </div>
            <div className='ch-destination'>
              <Package aria-hidden />
              <div>
                <strong>{t('Software center')}</strong>
                <span>
                  {t(
                    'Approved versions, platform requirements and download links.'
                  )}
                </span>
              </div>
            </div>
            <p>
              {t(
                'Software center listings should use the same project and release data after approval.'
              )}
            </p>
            <Button variant='outline' render={<Link to='/software' />}>
              {t('View software center')}
              <ArrowRight aria-hidden />
            </Button>
          </section>
        </aside>
      </div>
    </>
  )
}
