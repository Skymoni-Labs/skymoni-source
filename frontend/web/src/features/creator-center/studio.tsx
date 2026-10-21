import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  CirclePlus,
  Copy,
  Files,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { useCreatorStore } from '@/stores/creator-store'

import { ProjectEditor } from './editor'
import { duplicateProject, parseProject } from './lib/configuration'
import { publicationLabel, emptyWork, type Category } from './types'

export function CreatorStudio(props: { edit?: string; category?: Category }) {
  const { t } = useTranslation()
  const works = useCreatorStore((state) => state.works)
  const remove = useCreatorStore((state) => state.remove)
  const save = useCreatorStore((state) => state.save)
  const navigate = useNavigate()
  const importInput = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<string>()
  const blank = useMemo(() => {
    const work = emptyWork()
    if (props.edit?.startsWith('new-')) work.id = props.edit.slice(4)
    if (props.category) work.category = props.category
    return work
  }, [props.edit, props.category])
  const work = works.find((item) => item.id === props.edit) ?? blank
  return (
    <main className='cc-main'>
      <div className='cc-shell cc-studio-shell'>
        <div className='cc-studio-header'>
          <Button variant='ghost' render={<Link to='/creators/projects' />}>
            <ArrowLeft aria-hidden />
            {t('Back to projects')}
          </Button>
          <span>
            <Sparkles aria-hidden />
            {t('Creator Studio')}
          </span>
        </div>
        <div className='cc-studio-layout'>
          <aside className='cc-studio-nav'>
            <div className='cc-studio-profile'>
              <span className='cc-avatar'>Y</span>
              <div>
                <strong>{t('My creative space')}</strong>
                <span>{t('Creative workspace')}</span>
              </div>
            </div>
            <Button
              className='cc-new-project'
              variant='outline'
              render={
                <Link
                  to='/creators/studio'
                  search={{ edit: `new-${blank.id}` }}
                />
              }
            >
              <CirclePlus aria-hidden />
              {t('New project')}
            </Button>
            <Button
              variant='ghost'
              className='cc-import-project'
              onClick={() => importInput.current?.click()}
            >
              <Upload aria-hidden />
              {t('Import configuration')}
            </Button>
            <input
              ref={importInput}
              type='file'
              accept='.json,application/json'
              className='sr-only'
              aria-label={t('Choose project configuration')}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                if (file.size > 8000000) {
                  toast.error(
                    t('Choose a project configuration smaller than 8 MB')
                  )
                  return
                }
                void file
                  .text()
                  .then(async (text) => {
                    const imported = parseProject(text)
                    await save(imported)
                    void navigate({
                      to: '/creators/studio',
                      search: { edit: imported.id },
                    })
                    toast.success(t('Configuration imported as a new draft'))
                  })
                  .catch(() =>
                    toast.error(
                      t(
                        'Unable to import. Choose a valid skymoni project configuration.'
                      )
                    )
                  )
              }}
            />
            <h2>
              <Files aria-hidden />
              {t('My projects')}
              <small>{works.length}</small>
            </h2>
            {works.length === 0 && (
              <p className='cc-aside-note'>
                {t('Your saved drafts will appear here.')}
              </p>
            )}
            <div className='cc-draft-list'>
              {works.map((item) => (
                <div
                  key={item.id}
                  className={props.edit === item.id ? 'cc-draft-active' : ''}
                >
                  <Link to='/creators/studio' search={{ edit: item.id }}>
                    <strong>{item.title || t('Untitled project')}</strong>
                    <span>{t(publicationLabel(item.status))}</span>
                  </Link>
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    className='cc-draft-duplicate'
                    aria-label={t('Duplicate project {{title}}', {
                      title: item.title,
                    })}
                    onClick={async () => {
                      try {
                        const copy = duplicateProject(item)
                        await save(copy)
                        void navigate({
                          to: '/creators/studio',
                          search: { edit: copy.id },
                        })
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
                    <Copy aria-hidden />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('Delete project {{title}}', {
                      title: item.title,
                    })}
                    onClick={() => setDeleting(item.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <div className='cc-studio-nav-foot'>
              <span>{t('Need some inspiration?')}</span>
              <Link to='/creators'>
                {t('Explore the community')}
                <ArrowUpRight aria-hidden />
              </Link>
            </div>
          </aside>
          <div className='cc-studio-content'>
            <ProjectEditor
              key={work.id}
              work={work}
              onSaved={(id) => {
                if (props.edit === id) return
                void navigate({
                  to: '/creators/studio',
                  search: { edit: id },
                  replace: true,
                })
              }}
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
        title={t('Delete project?')}
        desc={t(
          'This deletes this project and its software submissions. Other projects are kept.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={async () => {
          if (!deleting) return
          try {
            await remove(deleting)
            setDeleting(undefined)
          } catch (error) {
            handleServerError(error)
            toast.error(
              t(
                'Unable to save. Please retry or refresh if the content has changed.'
              )
            )
          }
        }}
      />
    </main>
  )
}
