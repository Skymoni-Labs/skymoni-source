import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Download,
  Eye,
  FileText,
  LayoutTemplate,
  Link2,
  Monitor,
  Save,
  Send,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { handleServerError } from '@/lib/handle-server-error'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorStore } from '@/stores/creator-store'

import { BlockComposer } from './components/block-composer'
import { CoverArt } from './components/cover-art'
import {
  ProjectAccessLinks,
  ProjectContent,
} from './components/project-content'
import { ProjectMedia } from './components/project-media'
import { ProjectSettingsEditor } from './components/project-settings'
import {
  serializeProject,
  templateComposition,
  templates,
} from './lib/configuration'
import {
  compositionSchema,
  projectSchema,
  type ProjectFields,
} from './lib/schema'
import { categories, settingsFor, type Work } from './types'

export function ProjectEditor(props: {
  work: Work
  onSaved?: (id: string) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const autoApproveWorks = useCreatorAccessStore((s) => s.autoApproveWorks)
  const save = useCreatorStore((state) => state.save)
  const form = useForm<ProjectFields>({
    resolver: zodResolver(projectSchema),
    defaultValues: props.work,
  })
  const values = useWatch({ control: form.control })
  const [images, setImages] = useState(props.work.images)
  const [cover, setCover] = useState(props.work.cover)
  const [attachment, setAttachment] = useState(props.work.attachment)
  const [mediaDirty, setMediaDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState<ProjectFields>()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [blocks, setBlocks] = useState(props.work.blocks ?? [])
  const [settings, setSettings] = useState(settingsFor(props.work))
  const [artStyle, setArtStyle] = useState(props.work.style)
  const [pendingTemplate, setPendingTemplate] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [device, setDevice] = useState('desktop')
  const [pendingSavedId, setPendingSavedId] = useState<string>()
  const notifiedSavedId = useRef<string>(undefined)
  const onSaved = props.onSaved
  const dirty = form.formState.isDirty || mediaDirty
  useEffect(() => {
    if (
      !pendingSavedId ||
      dirty ||
      notifiedSavedId.current === pendingSavedId
    ) {
      return
    }
    notifiedSavedId.current = pendingSavedId
    onSaved?.(pendingSavedId)
  }, [pendingSavedId, dirty, onSaved])
  const current: Work = {
    ...props.work,
    ...values,
    cover,
    images,
    attachment,
    blocks,
    settings,
    style: artStyle,
  }
  function applyTemplate(id: string) {
    const composition = templateComposition(id)
    form.setValue('category', composition.category, { shouldDirty: true })
    setBlocks(
      composition.blocks.map((block) => ({ ...block, title: t(block.title) }))
    )
    setArtStyle(composition.style)
    setSettings({
      ...settings,
      layout: composition.settings.layout,
      showGallery: composition.settings.showGallery,
    })
    setSelectedTemplate(id)
    setPendingTemplate('')
    setMediaDirty(true)
  }
  function exportConfiguration() {
    const url = URL.createObjectURL(
      new Blob([serializeProject(current)], { type: 'application/json' })
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `${current.title || 'my-project'}.skymoni.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function persist(fields: ProjectFields, status: Work['status']) {
    setBusy(true)
    try {
      const result = await save({
        ...props.work,
        ...fields,
        cover,
        images,
        attachment,
        blocks,
        settings,
        style: artStyle,
        status,
        updatedAt: Date.now(),
        sample: false,
      })
      form.reset(fields)
      setMediaDirty(false)
      setSaved(true)
      setPendingSavedId(props.work.id)
      setSaveError('')
      setPending(undefined)
      const message = {
        published: 'Project published',
        draft: 'Draft saved',
        review: 'Project submitted for review',
      }
      toast.success(t(message[result.status]))
      void client.invalidateQueries({ queryKey: ['creator-public'] })
      void client.invalidateQueries({
        queryKey: ['creator-public-profile', String(result.ownerId)],
      })
      void client.invalidateQueries({ queryKey: ['home-creator-public'] })
      void client.invalidateQueries({ queryKey: ['creator-me'] })
    } catch (error) {
      handleServerError(error)
      setPending(undefined)
      setSaveError(
        t('Unable to save. Please retry or refresh if the content has changed.')
      )
    } finally {
      setBusy(false)
    }
  }
  const fields = [
    ['title', 'Project title', 'Give your creation a name'],
    ['summary', 'Short introduction', 'What does it do, and who is it for?'],
    ['tags', 'Tags', 'Separate tags with commas'],
  ] as const
  return (
    <>
      <FormNavigationGuard when={dirty || busy} />
      <div className='cc-editor-top'>
        <div>
          <span className='cc-eyebrow'>YOUR NEXT CREATION</span>
          <h1>
            {t(
              props.work.title
                ? 'Edit your project'
                : 'Let your idea take shape.'
            )}
          </h1>
          <p>
            {t(
              'Start with the story. Add a link, images or files when they help.'
            )}
          </p>
        </div>
        <div className='cc-editor-top-actions'>
          <Button variant='outline' onClick={() => setPreview(true)}>
            <Eye aria-hidden />
            {t('Preview')}
          </Button>
          <Button variant='outline' onClick={exportConfiguration}>
            <Download aria-hidden />
            {t('Export configuration')}
          </Button>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => persist(form.getValues(), 'draft')}
          >
            <Save aria-hidden />
            {t('Save draft')}
          </Button>
        </div>
      </div>
      <section
        className='cc-template-picker'
        aria-label={t('Project templates')}
      >
        <div>
          <LayoutTemplate aria-hidden />
          <strong>{t('A starting point, not a limit.')}</strong>
          <span>{t('Choose a structure. Every block stays editable.')}</span>
        </div>
        <div className='cc-template-grid'>
          {templates.map((template) => (
            <button
              type='button'
              key={template.id}
              aria-pressed={selectedTemplate === template.id}
              onClick={() =>
                blocks.length
                  ? setPendingTemplate(template.id)
                  : applyTemplate(template.id)
              }
            >
              <span className={`cc-template-art cc-template-${template.id}`}>
                <i />
                <i />
                <i />
              </span>
              <strong>{t(template.label)}</strong>
              <small>{t(template.detail)}</small>
            </button>
          ))}
        </div>
      </section>
      <div className='cc-editor-layout'>
        <Form {...form}>
          <form
            id='creator-project-form'
            onSubmit={form.handleSubmit((fields) => {
              if (!compositionSchema.safeParse({ blocks, settings }).success) {
                setSaveError(
                  t(
                    'Check your block links and custom fields. Links must start with http or https.'
                  )
                )
                return
              }
              setSaveError('')
              setPending(fields)
            })}
            className='cc-editor-form'
          >
            <section className='cc-editor-block'>
              <div className='cc-block-heading'>
                <FileText aria-hidden />
                <h2>{t('First, the essentials')}</h2>
                <span>01</span>
              </div>
              <FieldGroup>
                {fields.slice(0, 2).map(([name, label, placeholder]) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t(label)}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            maxLength={name === 'title' ? 80 : 160}
                            placeholder={t(placeholder)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <div className='cc-editor-field-pair'>
                  <FormField
                    control={form.control}
                    name='category'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Project category')}</FormLabel>
                        <FormControl>
                          <NativeSelect className='w-full' {...field}>
                            {categories
                              .filter((item) => item.id !== 'all')
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {t(item.label)}
                                </option>
                              ))}
                          </NativeSelect>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='tags'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Tags')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t('Separate tags with commas')}
                            maxLength={120}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FieldGroup>
            </section>
            <section className='cc-editor-block'>
              <div className='cc-block-heading'>
                <Sparkles aria-hidden />
                <h2>{t('Tell the story')}</h2>
                <span>02</span>
              </div>
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Project description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className='cc-description-input'
                        maxLength={12000}
                        placeholder={t(
                          'Why did you make it? What can people do with it? Include any setup steps or usage permissions.'
                        )}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
            <BlockComposer
              blocks={blocks}
              onChange={(next) => {
                setBlocks(next)
                setMediaDirty(true)
              }}
            />
            <ProjectMedia
              images={images}
              cover={cover}
              attachment={attachment}
              onBusy={setBusy}
              onImages={(next, nextCover) => {
                setImages(next)
                setCover(nextCover)
                setMediaDirty(true)
              }}
              onAttachment={(next) => {
                setAttachment(next)
                setMediaDirty(true)
              }}
            />
            <section className='cc-editor-block'>
              <div className='cc-block-heading'>
                <Link2 aria-hidden />
                <h2>{t('Where can people try it?')}</h2>
                <span>{t('Optional')}</span>
              </div>
              <p>
                {t(
                  'Link to an existing website, app, video or download. Your source code does not need to be shared.'
                )}
              </p>
              <FormField
                control={form.control}
                name='url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Project link')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='https://' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
            <ProjectSettingsEditor
              value={settings}
              onChange={(next) => {
                setSettings(next)
                setMediaDirty(true)
              }}
            />
            {saveError && (
              <p role='alert' className='text-destructive'>
                {saveError}
              </p>
            )}
            <div className='cc-editor-bottom'>
              <span role='status'>
                <Check aria-hidden />
                {t(
                  saved && !form.formState.isDirty && !mediaDirty
                    ? 'Saved on server'
                    : 'Private workspace · Save a draft before leaving'
                )}
              </span>
              <Button className='cc-primary' type='submit' disabled={busy}>
                <Send aria-hidden />
                {t(autoApproveWorks ? 'Publish project' : 'Submit for review')}
              </Button>
            </div>
          </form>
        </Form>
        <aside className='cc-editor-sidebar'>
          <div className='cc-live-preview'>
            <span className='cc-eyebrow'>{t('Your project card')}</span>
            <CoverArt work={current} />
            <span className='cc-category'>
              {settings.categoryName ||
                t(
                  categories.find((item) => item.id === values.category)
                    ?.label ?? 'Websites & web apps'
                )}
            </span>
            <h3>{values.title || t('Untitled project')}</h3>
            <p>
              {values.summary || t('Your short introduction will appear here.')}
            </p>
            <span className='cc-card-author'>
              <span className='cc-avatar'>Y</span>
              {t('You')}
            </span>
            <Button
              variant='outline'
              className='cc-preview-page-action'
              onClick={() => setPreview(true)}
            >
              <Eye aria-hidden />
              {t('Preview project page')}
            </Button>
            <p className='cc-property-note'>
              {t(
                'The configuration includes text, images and appearance. Attachment files are not included.'
              )}
            </p>
          </div>
          <div className='cc-editor-tip'>
            <img src='/branding/skymoni-cloud-friend-transparent.png' alt='' />
            <h3>{t('One project, many possibilities.')}</h3>
            <p>
              {t(
                'A category helps people find you. Links, images and files can be combined in the same project.'
              )}
            </p>
          </div>
          <p className='cc-aside-note'>
            {t(
              'Drafts are private. Only reviewed projects and software versions can be publicly accessed.'
            )}
          </p>
        </aside>
      </div>
      <Dialog
        open={preview}
        onOpenChange={setPreview}
        title={t('Project preview')}
        description={t('Only you can see this draft preview.')}
        contentClassName='cc-preview-dialog'
      >
        <div className='cc-device-switch'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            aria-pressed={device === 'desktop'}
            onClick={() => setDevice('desktop')}
          >
            <Monitor aria-hidden />
            {t('Desktop preview')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            aria-pressed={device === 'mobile'}
            onClick={() => setDevice('mobile')}
          >
            <Smartphone aria-hidden />
            {t('Mobile preview')}
          </Button>
        </div>
        <div className={`cc-page-preview cc-page-preview-${device}`}>
          <h2 className='text-2xl font-bold'>
            {values.title || t('Untitled project')}
          </h2>
          <p className='text-muted-foreground mt-2'>{values.summary}</p>
          <div className='cc-preview-access'>
            <ProjectAccessLinks work={current} />
          </div>
          <ProjectContent work={current} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={Boolean(pendingTemplate)}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate('')
        }}
        title={t('Use this page structure?')}
        desc={t(
          'This replaces the content blocks. Your title, introduction, images, files and custom information are kept.'
        )}
        confirmText={t('Apply template')}
        handleConfirm={() => applyTemplate(pendingTemplate)}
      />
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(undefined)
        }}
        title={t(
          autoApproveWorks
            ? 'Publish this project?'
            : 'Submit this project for review?'
        )}
        desc={t(
          autoApproveWorks
            ? 'This site automatically approves submitted projects. Your project will be published after submission. Saving a draft keeps it private.'
            : 'Administrators will review this project before it appears publicly. Saving a new draft removes its previous public version until reviewed again.'
        )}
        confirmText={t('Submit project')}
        handleConfirm={() => {
          if (pending) persist(pending, 'review')
        }}
      />
    </>
  )
}
