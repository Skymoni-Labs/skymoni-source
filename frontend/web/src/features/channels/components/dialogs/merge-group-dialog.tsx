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
import { FolderPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getGroups, mergeChannelGroup } from '../../api'

type MergeGroupDialogProps = {
  ids: number[]
  onClose: () => void
  onSuccess: () => void
}

export function MergeGroupDialog(props: MergeGroupDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [group, setGroup] = useState<string | null>(null)
  const groups = useQuery({
    queryKey: ['channel-routing-groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
  })
  const options = (groups.data?.data ?? [])
    .filter((name) => name !== 'auto')
    .map((name) => ({ value: name, label: name }))
  const merge = useMutation({
    mutationFn: () => mergeChannelGroup(props.ids, group ?? ''),
    onSuccess: (result) => {
      toast.success(
        t(
          'Added {{updated}} channel(s) to {{group}}; {{unchanged}} already in this group.',
          {
            ...result,
            group,
          }
        )
      )
      void queryClient.invalidateQueries({ queryKey: ['channels'] })
      void queryClient.invalidateQueries({ queryKey: ['pricing'] })
      props.onSuccess()
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !merge.isPending) props.onClose()
      }}
      title={t('Add channels to routing group')}
      description={t(
        'Add {{count}} selected channel(s) to an existing group.',
        {
          count: props.ids.length,
        }
      )}
      contentClassName='sm:max-w-md'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            disabled={merge.isPending}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            disabled={
              !group ||
              !options.some((item) => item.value === group) ||
              merge.isPending ||
              groups.isError ||
              groups.isFetching ||
              props.ids.length === 0
            }
            onClick={() => merge.mutate()}
          >
            <FolderPlus className='size-4' />
            {merge.isPending
              ? t('Adding to group...')
              : t('Confirm add to group')}
          </Button>
        </>
      }
    >
      <div className='space-y-2'>
        <Label htmlFor='merge-channel-group'>{t('Target group')}</Label>
        <Combobox
          id='merge-channel-group'
          options={options}
          value={group}
          onValueChange={setGroup}
          placeholder={groups.isPending ? t('Loading...') : t('Select a group')}
          searchPlaceholder={t('Search groups')}
          emptyText={t('No groups available')}
          disabled={merge.isPending || groups.isPending || groups.isError}
          className='w-full'
        />
        {groups.isError && (
          <Button
            variant='outline'
            size='sm'
            onClick={() => void groups.refetch()}
          >
            {t('Retry')}
          </Button>
        )}
      </div>
      <div className='bg-muted/50 text-muted-foreground space-y-2 rounded-lg p-3 text-sm'>
        <p>
          {t(
            'Existing groups are kept. Channels already in the target group are skipped.'
          )}
        </p>
        <p>
          {t(
            'All models in the selected channels join this group, subject to its model restrictions. The current model search does not limit this operation.'
          )}
        </p>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('To group only selected models, use Models > Model groups.')}
      </p>
      <p className='text-muted-foreground text-xs'>
        {t(
          'To create a new group, add it in System settings > Group pricing first.'
        )}
      </p>
    </Dialog>
  )
}
