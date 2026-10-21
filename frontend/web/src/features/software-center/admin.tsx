import { Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Download,
  FileArchive,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SettingsSection } from '@/features/system-settings/components/settings-section'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { getServerErrorStatus } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  deleteSoftwareFile,
  loadSoftwareCatalog,
  loadSoftwareFiles,
  saveSoftwareCatalog,
} from './api'
import { SoftwareEditor } from './editor'
import { SoftwareFeaturedEditor } from './featured-editor'
import type { SoftwareEntry, SoftwareFile } from './types'

export function SoftwareManagement() {
  const actor = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  return <SoftwareAdministrator key={actor} />
}

function SoftwareAdministrator() {
  const { t } = useTranslation()
  const auth = useAuthStore((state) => state.auth)
  const client = useQueryClient()
  const [editor, setEditor] = useState<SoftwareEntry | null>(null)
  const [query, setQuery] = useState('')
  const [filesOpen, setFilesOpen] = useState(false)
  const [featuredOpen, setFeaturedOpen] = useState(false)
  const [deleting, setDeleting] = useState<SoftwareEntry | SoftwareFile | null>(
    null
  )
  const key = ['software', 'admin', auth.user?.id, auth.session?.sid]
  const catalog = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadSoftwareCatalog(signal),
    enabled: auth.user?.role === ROLE.SUPER_ADMIN,
    gcTime: 0,
  })
  const files = useQuery({
    queryKey: [...key, 'files'],
    queryFn: ({ signal }) => loadSoftwareFiles(signal),
    enabled: filesOpen && auth.user?.role === ROLE.SUPER_ADMIN,
    gcTime: 0,
  })
  const save = useMutation({
    mutationFn: saveSoftwareCatalog,
    meta: { errorToast: false },
    onError: (error) => {
      if (getServerErrorStatus(error) === 409) void catalog.refetch()
    },
    onSuccess: async (value) => {
      client.setQueryData(key, value)
      await client.invalidateQueries({ queryKey: ['software', 'public'] })
      toast.success(t('Saved successfully'))
    },
  })
  const refreshFiles = () => {
    void client.invalidateQueries({ queryKey: [...key, 'files'] })
  }
  const update = async (items: SoftwareEntry[]) => {
    if (!catalog.data) return
    const featured = catalog.data.featured
    const existing = new Set(items.map((item) => item.id))
    await save.mutateAsync({
      ...catalog.data,
      items,
      ...(featured
        ? {
            featured: {
              carousel: featured.carousel.filter((id) => existing.has(id)),
              tiles: featured.tiles.filter((id) => existing.has(id)),
            },
          }
        : {}),
    })
  }
  if (auth.user?.role !== ROLE.SUPER_ADMIN) {
    return <ErrorState title={t('Access denied')} />
  }
  if (catalog.isPending) return <LoadingState />
  if (catalog.isError) {
    return <ErrorState onRetry={() => void catalog.refetch()} />
  }
  const items = catalog.data.items
  const visible = items.filter((entry) =>
    `${entry.name} ${entry.description} ${entry.platform}`
      .toLowerCase()
      .includes(query.toLowerCase())
  )
  let filesContent = <LoadingState />
  if (files.isError) {
    filesContent = <ErrorState onRetry={() => void files.refetch()} />
  } else if (files.data) {
    filesContent = (
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t('Storage used')}: {(files.data.usedBytes / 1024 / 1024).toFixed(1)}{' '}
          MB / {(files.data.limitBytes / 1024 / 1024 / 1024).toFixed(0)} GB
        </p>
        {!files.data.items.length && (
          <EmptyState title={t('No uploaded installers yet')} />
        )}
        {files.data.items.map((file) => {
          const used = items.some((entry) => entry.downloadUrl === file.url)
          return (
            <article
              key={file.id}
              className='flex min-w-0 items-center gap-3 rounded-lg border p-3'
            >
              <FileArchive className='shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='text-sm break-words'>{file.filename}</p>
                <p className='text-muted-foreground text-xs'>
                  {(file.bytes / 1024 / 1024).toFixed(1)} MB ·{' '}
                  {t(used ? 'In use' : 'Unused')}
                </p>
                <p className='text-muted-foreground mt-1 font-mono text-[10px] break-all'>
                  SHA-256: {file.sha256}
                </p>
              </div>
              <CopyButton
                value={new URL(file.url, window.location.origin).href}
                aria-label={t('Copy download link')}
              />
              <Button
                variant='ghost'
                size='icon'
                disabled={used}
                aria-label={t('Delete {{name}}', { name: file.filename })}
                onClick={() => setDeleting(file)}
              >
                <Trash2 />
              </Button>
            </article>
          )
        })}
      </div>
    )
  }
  return (
    <SettingsSection title={t('Software management')}>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <p className='text-muted-foreground max-w-xl text-sm'>
          {t(
            'Manage software and tools here. Published items appear on the public Software Center.'
          )}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={save.isPending}
            onClick={() => setFeaturedOpen(true)}
          >
            <HugeiconsIcon icon={Settings01Icon} size={16} aria-hidden />
            {t('Configure recommendations')}
          </Button>
          <Button variant='outline' onClick={() => setFilesOpen(true)}>
            <FileArchive />
            {t('Uploaded installers')}
          </Button>
          <Button
            variant='outline'
            render={
              <a href='/software' target='_blank' rel='noopener noreferrer' />
            }
          >
            <ArrowUpRight />
            {t('View Software Center')}
          </Button>
          <Button
            disabled={save.isPending || items.length >= 200}
            onClick={() =>
              setEditor({
                id: crypto.randomUUID(),
                kind: 'software',
                name: '',
                description: '',
                platform: '',
                version: '',
                downloadUrl: '',
                filename: '',
                detailUrl: '',
                imageUrl: '',
                appearance: 'generic',
                sortOrder: (items.at(-1)?.sortOrder || 0) + 10,
                published: false,
              })
            }
          >
            <Plus />
            {t('Add software or tool')}
          </Button>
        </div>
      </div>
      <Input
        aria-label={t('Search software and tools')}
        placeholder={t('Search software and tools')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className='max-w-sm'
      />
      <div className='space-y-3'>
        {!visible.length && (
          <EmptyState title={t('No software or tools found')} />
        )}
        {visible.map((entry) => (
          <article
            key={entry.id}
            aria-label={entry.name}
            className='bg-card flex min-w-0 flex-wrap items-center gap-4 rounded-xl border p-4 sm:p-5'
          >
            <div className='bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl'>
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt=''
                  className='size-full object-cover'
                />
              ) : (
                <Download size={20} />
              )}
            </div>
            <div className='min-w-0 flex-1 basis-48'>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='font-semibold break-words'>
                  {t(entry.name, { defaultValue: entry.name })}
                </h3>
                <Badge variant='outline'>
                  {t(entry.kind === 'software' ? 'Software' : 'Tool')}
                </Badge>
                {entry.version && (
                  <span className='text-muted-foreground text-xs'>
                    v{entry.version}
                  </span>
                )}
              </div>
              <p className='text-muted-foreground mt-1 line-clamp-2 text-sm break-words'>
                {t(entry.description, { defaultValue: entry.description })}
              </p>
              <p className='text-muted-foreground mt-2 text-xs'>
                {entry.platform} · {t('Sort order')}: {entry.sortOrder}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Switch
                aria-label={t('Publish {{name}}', { name: entry.name })}
                checked={entry.published}
                disabled={save.isPending}
                onCheckedChange={(published) => {
                  void update(
                    items.map((item) =>
                      item.id === entry.id ? { ...item, published } : item
                    )
                  ).catch(handleServerError)
                }}
              />
              <span className='text-muted-foreground mr-2 text-xs'>
                {t(entry.published ? 'Published' : 'Draft')}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={save.isPending}
                aria-label={t('Edit {{name}}', { name: entry.name })}
                onClick={() => setEditor({ ...entry })}
              >
                <Pencil />
                {t('Edit')}
              </Button>
              <Button
                variant='ghost'
                size='icon'
                disabled={save.isPending}
                aria-label={t('Delete {{name}}', { name: entry.name })}
                onClick={() => setDeleting(entry)}
              >
                <Trash2 />
              </Button>
            </div>
          </article>
        ))}
      </div>
      {featuredOpen && (
        <SoftwareFeaturedEditor
          catalog={catalog.data}
          onClose={() => setFeaturedOpen(false)}
          onSave={async (featured) => {
            await save.mutateAsync({ ...catalog.data, featured })
          }}
        />
      )}
      {editor && (
        <SoftwareEditor
          entry={editor}
          onClose={() => setEditor(null)}
          onUploaded={refreshFiles}
          onSave={async (entry) => {
            const next = items.some((item) => item.id === entry.id)
              ? items.map((item) => (item.id === entry.id ? entry : item))
              : [...items, entry]
            await update(next)
            setEditor(null)
          }}
        />
      )}
      <Dialog
        open={filesOpen}
        onOpenChange={setFilesOpen}
        title={t('Uploaded installers')}
        description={t(
          'Copy links to reuse an installer. Only files unused by all software and tools can be deleted.'
        )}
      >
        {filesContent}
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('Confirm deletion')}
        desc={t(
          deleting && 'url' in deleting
            ? 'Permanently delete this unused installer? Its download link will stop working.'
            : 'Remove this item from Software Center? Its uploaded installer will remain in Uploaded installers.'
        )}
        destructive
        confirmText={t('Delete')}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        handleConfirm={async () => {
          if (!deleting) return
          try {
            if ('url' in deleting) {
              await deleteSoftwareFile(deleting.id)
              refreshFiles()
            } else {
              await update(items.filter((entry) => entry.id !== deleting.id))
            }
            setDeleting(null)
          } catch (error) {
            handleServerError(error)
          }
        }}
      />
    </SettingsSection>
  )
}
