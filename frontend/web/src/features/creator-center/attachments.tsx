import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import { creatorRequest } from './api'

export function CreatorAttachments() {
  const { t } = useTranslation()
  const files = useCreatorStore((s) => s.files)
  const works = useCreatorStore((s) => s.works)
  const releases = useCreatorHubStore((s) => s.releases)
  const [deleting, setDeleting] = useState<string>()
  const [busy, setBusy] = useState(false)
  const unused = files.filter(
    (file) =>
      !works.some((w) => w.attachment?.id === file.id) &&
      !releases.some((r) => r.package?.id === file.id)
  )
  return (
    <section className='ch-panel sf-attachments-panel'>
      <h2>
        <Paperclip aria-hidden />
        {t('Unused attachments')} <small>{unused.length}</small>
      </h2>
      <p className='text-muted-foreground text-sm'>
        20 MB / {t('File')} · 100 MB / {t('Creator')}
      </p>
      {unused.length === 0 && (
        <div className='sf-attachments-empty'>
          <Paperclip aria-hidden />
          <div>
            <strong>附件已整理好</strong>
            <p>
              当前没有未使用的附件。作品与软件版本正在使用的文件会继续保留。
            </p>
          </div>
        </div>
      )}
      {unused.map((file) => (
        <div className='flex justify-between gap-3 border-b py-3' key={file.id}>
          <span className='break-all'>{file.name}</span>
          <Button variant='outline' onClick={() => setDeleting(file.id)}>
            {t('Delete attachment')}
          </Button>
        </div>
      ))}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(undefined)
        }}
        title={t('Delete attachment')}
        desc={t('Delete unused attachment from server?')}
        destructive
        isLoading={busy}
        confirmText={t('Delete')}
        handleConfirm={async () => {
          if (!deleting) return
          setBusy(true)
          try {
            await creatorRequest(`/me/files/${encodeURIComponent(deleting)}`, {
              method: 'delete',
            })
            useCreatorStore.setState({
              files: files.filter((file) => file.id !== deleting),
            })
            setDeleting(undefined)
          } catch (error) {
            handleServerError(error)
          } finally {
            setBusy(false)
          }
        }}
      />
    </section>
  )
}
