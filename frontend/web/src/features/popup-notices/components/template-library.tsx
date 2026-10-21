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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  StaticRowActions,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { deletePopupTemplate, listPopupTemplates } from '../api'
import type { PopupTemplate, PopupTemplateContent } from '../types'
import { PopupContent } from './popup-content'
import { PopupTemplateEditor } from './template-editor'

export function PopupTemplateLibrary(props: {
  onClose: () => void
  onApply: (template: PopupTemplateContent) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [editor, setEditor] = useState<PopupTemplate | null | undefined>()
  const [preview, setPreview] = useState<PopupTemplate | null>(null)
  const [removing, setRemoving] = useState<PopupTemplate | null>(null)
  const query = useQuery({
    queryKey: ['popup-templates', page, keyword],
    queryFn: () => listPopupTemplates(page, keyword),
  })
  const remove = useMutation({
    mutationFn: (template: PopupTemplate) =>
      deletePopupTemplate(template.id, template.revision),
    onSuccess: () => {
      setRemoving(null)
      if (page > 1 && query.data?.items.length === 1) setPage(page - 1)
      void queryClient.invalidateQueries({ queryKey: ['popup-templates'] })
      toast.success(t('Template deleted'))
    },
    onError: (error) => handleServerError(error),
  })
  const columns: StaticDataTableColumn<PopupTemplate>[] = [
    {
      id: 'name',
      header: t('Template name'),
      cell: (template) => (
        <div className='max-w-64 break-words'>
          <p className='font-medium'>{template.name}</p>
          <p className='text-muted-foreground text-xs'>{template.title}</p>
        </div>
      ),
    },
    {
      id: 'format',
      header: t('Content format'),
      cell: (template) =>
        template.format === 'auto' ? t('Automatic detection') : template.format,
    },
    {
      id: 'actions',
      header: t('Actions'),
      className: 'text-right',
      cell: (template) => (
        <div className='flex justify-end gap-1'>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setPreview(template)}
          >
            {t('Preview')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => props.onApply(template)}
          >
            {t('Use template')}
          </Button>
          <StaticRowActions
            editLabel={t('Edit popup template')}
            deleteLabel={t('Delete template')}
            menuLabel={t('Template actions')}
            onEdit={() => setEditor(template)}
            onDelete={() => setRemoving(template)}
          />
        </div>
      ),
    },
  ]
  return (
    <>
      <Dialog
        open
        title={t('Popup template library')}
        description={t(
          'Create as many templates as you need. Applying a template copies only its title, content, and format.'
        )}
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
        contentClassName='sm:max-w-4xl'
      >
        <div className='space-y-4'>
          <div className='flex flex-wrap gap-2'>
            <form
              className='flex min-w-0 flex-1 gap-2'
              onSubmit={(event) => {
                event.preventDefault()
                setPage(1)
                setKeyword(search.trim())
              }}
            >
              <Input
                value={search}
                maxLength={100}
                aria-label={t('Search templates')}
                placeholder={t('Search templates')}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type='submit' variant='outline'>
                {t('Search')}
              </Button>
            </form>
            <Button onClick={() => setEditor(null)}>
              <Plus />
              {t('Create template')}
            </Button>
          </div>
          {query.isLoading && <LoadingState />}
          {query.isError && (
            <ErrorState
              onRetry={() => {
                void query.refetch()
              }}
            />
          )}
          {query.data && (
            <>
              <StaticDataTable
                columns={columns}
                data={query.data.items}
                getRowKey={(template) => template.id}
                emptyContent={
                  <EmptyState
                    title={t('No matching templates')}
                    description={t(
                      'Create a template, or save the current popup content as a template.'
                    )}
                  />
                }
              />
              <div className='flex items-center justify-between gap-2'>
                <span className='text-muted-foreground text-sm'>
                  {t('Total')} {formatNumber(query.data.total, locale)}
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    disabled={page <= 1 || query.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('Previous')}
                  </Button>
                  <span>{formatNumber(page, locale)}</span>
                  <Button
                    variant='outline'
                    disabled={page * 20 >= query.data.total || query.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Dialog>
      {editor !== undefined && (
        <PopupTemplateEditor
          template={editor ?? undefined}
          onClose={() => setEditor(undefined)}
        />
      )}
      {preview && (
        <Dialog
          open
          title={preview.name}
          description={t('Template preview')}
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
        >
          <h4 className='mb-4 font-semibold'>{preview.title}</h4>
          <PopupContent content={preview.content} format={preview.format} />
        </Dialog>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemoving(null)
        }}
        destructive
        title={t('Delete template?')}
        desc={t('Deleting this template does not change existing popups.')}
        confirmText={t('Delete template')}
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (removing) remove.mutate(removing)
        }}
      />
    </>
  )
}
