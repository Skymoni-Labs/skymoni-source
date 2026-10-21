import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'

import type { PricingModel } from '../types'
import {
  deleteUserModelGroup,
  saveUserModelGroup,
  userModelGroupsQueryKey,
  type UserModelGroup,
} from '../user-model-groups-api'

type Draft = { id?: number; name: string; modelNames: string[] }

export function UserModelGroupsSection(props: {
  defaultOpen?: boolean
  groups: UserModelGroup[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  models: PricingModel[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserModelGroup | null>(null)
  const availableModels = useMemo(
    () =>
      [...props.models]
        .map((model) => model.model_name)
        .sort((a, b) => a.localeCompare(b)),
    [props.models]
  )
  const save = useMutation({
    mutationFn: (value: Draft) =>
      saveUserModelGroup(
        { name: value.name.trim(), model_names: value.modelNames },
        value.id
      ),
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: userModelGroupsQueryKey })
      props.onSelect(group.id)
      setDraft(null)
      toast.success(t('Model group saved'))
    },
    onError: (error) => handleServerError(error),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteUserModelGroup(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: userModelGroupsQueryKey })
      if (props.selectedId === id) props.onSelect(null)
      setDeleteTarget(null)
      toast.success(t('Model group deleted'))
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <Collapsible
      defaultOpen={props.defaultOpen ?? true}
      className='border-border/70 border-b pb-3'
    >
      <div className='flex items-center justify-between gap-2 py-2.5'>
        <CollapsibleTrigger className='group flex min-w-0 flex-1 items-center justify-between text-left'>
          <span className='text-foreground text-sm font-semibold'>
            {t('My model groups')}
          </span>
          <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180' />
        </CollapsibleTrigger>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('Create model group')}
          disabled={props.groups.length >= 50}
          onClick={() => {
            setDraft({ name: '', modelNames: [] })
          }}
        >
          <Plus className='size-4' />
        </Button>
      </div>
      <CollapsibleContent>
        <p className='text-muted-foreground mb-2 text-xs'>
          {t(
            'Personal model groups only organize this list; API billing groups are unchanged.'
          )}
        </p>
        <div className='flex flex-wrap gap-1.5'>
          {props.groups.map((group) => (
            <div
              key={group.id}
              className='flex max-w-full items-center gap-0.5'
            >
              <Button
                type='button'
                size='sm'
                variant={
                  props.selectedId === group.id ? 'secondary' : 'outline'
                }
                aria-pressed={props.selectedId === group.id}
                title={group.name}
                className='h-auto max-w-32 px-2 py-1 text-xs'
                onClick={() =>
                  props.onSelect(
                    props.selectedId === group.id ? null : group.id
                  )
                }
              >
                <span className='truncate'>{group.name}</span>
                <span className='text-muted-foreground ml-1'>
                  {group.model_names.length}
                </span>
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={t('Edit {{name}}', { name: group.name })}
                onClick={() => {
                  setDraft({
                    id: group.id,
                    name: group.name,
                    modelNames: [...group.model_names],
                  })
                }}
              >
                <Pencil className='size-3.5' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={t('Delete {{name}}', { name: group.name })}
                onClick={() => setDeleteTarget(group)}
              >
                <Trash2 className='size-3.5' />
              </Button>
            </div>
          ))}
          {props.groups.length === 0 && (
            <span className='text-muted-foreground text-xs'>
              {t('No personal model groups yet')}
            </span>
          )}
        </div>
      </CollapsibleContent>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? t('Edit model group') : t('Create model group')}
        description={t(
          'Choose up to 100 currently available models. This only changes your personal model list.'
        )}
        contentClassName='sm:max-w-lg'
        bodyClassName='space-y-3'
        footer={
          <>
            <Button variant='outline' onClick={() => setDraft(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={!draft?.name.trim() || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {t('Save')}
            </Button>
          </>
        }
      >
        <Input
          value={draft?.name ?? ''}
          maxLength={40}
          aria-label={t('Group name')}
          placeholder={t('Group name')}
          onChange={(event) =>
            setDraft((current) =>
              current ? { ...current, name: event.target.value } : null
            )
          }
        />
        <MultiSelect
          options={availableModels.map((name) => ({
            label: name,
            value: name,
          }))}
          selected={draft?.modelNames ?? []}
          placeholder={t('Search models')}
          maxVisibleChips={6}
          onChange={(names) =>
            setDraft((current) =>
              current ? { ...current, modelNames: names.slice(0, 100) } : null
            )
          }
        />
        <p className='text-muted-foreground text-xs'>
          {t('{{count}} selected', { count: draft?.modelNames.length ?? 0 })}
        </p>
      </Dialog>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('Delete model group')}
        desc={t(
          'Delete this personal model group? Your API access and billing will not change.'
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={remove.isPending}
        handleConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </Collapsible>
  )
}
