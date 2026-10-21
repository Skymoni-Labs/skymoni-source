/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { History, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import type { PlaygroundConversationSummary } from '../../conversations-api'

export interface PlaygroundHistoryProps {
  conversations: PlaygroundConversationSummary[]
  activeID: number | null
  busy: boolean
  disabled: boolean
  saveError: boolean
  hasRecoverableDraft: boolean
  hasLegacyConversation: boolean
  onNew: () => Promise<void>
  onSelect: (id: number) => Promise<void>
  onRename: (id: number, title: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onImportLegacy: () => Promise<void>
  onRestoreDraft: () => void
  onRetrySave: () => Promise<void>
}

function HistoryList(
  props: PlaygroundHistoryProps & { onNavigate?: () => void }
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [query, setQuery] = useState('')
  const [editingID, setEditingID] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingID, setDeletingID] = useState<number | null>(null)
  const disabled = props.busy || props.disabled
  const matches = props.conversations.filter((item) =>
    `${item.title} ${item.model}`
      .toLocaleLowerCase(locale)
      .includes(query.toLocaleLowerCase(locale))
  )

  const saveTitle = async () => {
    const title = editingTitle.trim()
    if (!editingID || !title) return
    await props.onRename(editingID, title)
    setEditingID(null)
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='space-y-3 border-b p-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2 font-semibold'>
            <History className='size-4' aria-hidden='true' />
            {t('Chat history')}
          </div>
          <Button
            type='button'
            size='icon-sm'
            variant='outline'
            title={t('New chat')}
            aria-label={t('New chat')}
            disabled={disabled}
            onClick={() => {
              void props.onNew().then(props.onNavigate)
            }}
          >
            <Plus />
          </Button>
        </div>
        <div className='relative'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-4'
            aria-hidden='true'
          />
          <Input
            className='pl-8'
            aria-label={t('Search conversations')}
            placeholder={t('Search conversations')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-1 p-2'>
          {matches.length === 0 && (
            <p className='text-muted-foreground px-2 py-8 text-center text-sm'>
              {query
                ? t('No matching conversations')
                : t('No saved conversations yet')}
            </p>
          )}
          {matches.map((item) => (
            <div
              key={item.id}
              className={cn(
                'group flex items-start gap-1 rounded-lg p-1 transition-colors',
                props.activeID === item.id
                  ? 'bg-primary/10'
                  : 'hover:bg-muted/60'
              )}
            >
              {editingID === item.id ? (
                <div className='flex min-w-0 flex-1 flex-col gap-1 p-1'>
                  <Input
                    autoFocus
                    aria-label={t('Conversation title')}
                    maxLength={80}
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveTitle()
                      if (event.key === 'Escape') setEditingID(null)
                    }}
                  />
                  <div className='flex gap-1'>
                    <Button
                      size='xs'
                      disabled={!editingTitle.trim()}
                      onClick={() => void saveTitle()}
                    >
                      {t('Save')}
                    </Button>
                    <Button
                      size='xs'
                      variant='ghost'
                      onClick={() => setEditingID(null)}
                    >
                      {t('Cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    type='button'
                    variant='ghost'
                    className='h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left whitespace-normal'
                    disabled={disabled}
                    aria-current={
                      props.activeID === item.id ? 'page' : undefined
                    }
                    onClick={() => {
                      void props.onSelect(item.id).then(props.onNavigate)
                    }}
                  >
                    <span className='w-full truncate font-medium'>
                      {item.title === 'New chat' ? t('New chat') : item.title}
                    </span>
                    <span className='text-muted-foreground w-full truncate text-xs'>
                      {new Intl.DateTimeFormat(locale, {
                        month: 'short',
                        day: 'numeric',
                      }).format(item.updated_at * 1000)}
                      {item.model ? ` · ${item.model}` : ''}
                    </span>
                  </Button>
                  <div className='flex shrink-0 pt-1 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100'>
                    <Button
                      type='button'
                      size='icon-xs'
                      variant='ghost'
                      disabled={disabled}
                      aria-label={t('Rename conversation')}
                      title={t('Rename conversation')}
                      onClick={() => {
                        setEditingID(item.id)
                        setEditingTitle(item.title)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type='button'
                      size='icon-xs'
                      variant='ghost'
                      disabled={disabled}
                      aria-label={t('Delete conversation')}
                      title={t('Delete conversation')}
                      onClick={() => setDeletingID(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {(props.saveError ||
        props.hasRecoverableDraft ||
        props.hasLegacyConversation) && (
        <div className='space-y-2 border-t p-3 text-xs'>
          {props.saveError && (
            <div className='text-destructive space-y-1'>
              <p>
                {t(
                  'Conversation could not be saved. Your local draft is kept.'
                )}
              </p>
              <Button
                size='xs'
                variant='outline'
                onClick={() =>
                  void props.onRetrySave().catch(handleServerError)
                }
              >
                <RotateCcw /> {t('Retry save')}
              </Button>
            </div>
          )}
          {props.hasRecoverableDraft && (
            <Button
              size='sm'
              variant='outline'
              className='w-full'
              onClick={props.onRestoreDraft}
            >
              {t('Restore unsaved draft')}
            </Button>
          )}
          {props.hasLegacyConversation && (
            <Button
              size='sm'
              variant='outline'
              className='w-full'
              disabled={disabled}
              onClick={() => void props.onImportLegacy()}
            >
              {t('Import previous local chat')}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deletingID !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingID(null)
        }}
        title={t('Delete conversation')}
        desc={t('This conversation will be permanently deleted.')}
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (deletingID === null) return
          void props.onDelete(deletingID).then(() => setDeletingID(null))
        }}
      />
    </div>
  )
}

export function PlaygroundHistory(props: PlaygroundHistoryProps) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <aside className='site-glass-bar bg-background/70 hidden min-h-0 w-64 shrink-0 flex-col border-r lg:flex'>
        <HistoryList {...props} />
      </aside>
      <div className='absolute top-3 left-3 z-10 lg:hidden'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          aria-label={t('Chat history')}
          onClick={() => setMobileOpen(true)}
        >
          <History /> {t('History')}
        </Button>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side='left' className='w-80 max-w-[85vw] gap-0 p-0'>
          <SheetHeader className='sr-only'>
            <SheetTitle>{t('Chat history')}</SheetTitle>
            <SheetDescription>
              {t('Open or manage your saved conversations')}
            </SheetDescription>
          </SheetHeader>
          <HistoryList {...props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
