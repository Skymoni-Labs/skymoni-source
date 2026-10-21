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
import { useQuery } from '@tanstack/react-query'
import { Boxes, FolderPlus, Pencil, Search, Waypoints } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useCanEditModelPricing } from '@/features/model-pricing/api'

import { getModelGroups, type ModelGroup } from '../model-groups-api'
import { ModelGroupAssignmentDialog } from './model-group-assignment-dialog'

export function ModelGroupsSection() {
  const { t } = useTranslation()
  const canEdit = useCanEditModelPricing()
  const catalog = useQuery({
    queryKey: ['routing-model-groups'],
    queryFn: getModelGroups,
  })
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ModelGroup>()
  const models = useMemo(
    () =>
      (catalog.data?.models ?? []).filter((name) =>
        name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [catalog.data?.models, search]
  )
  if (catalog.isPending) {
    return <LoadingState />
  }
  if (catalog.isError) {
    return <ErrorState onRetry={() => void catalog.refetch()} />
  }
  return (
    <div className='h-full space-y-4 overflow-y-auto pb-6'>
      <div className='grid gap-3 md:grid-cols-2'>
        <div className='bg-primary/5 rounded-xl border p-4'>
          <div className='mb-1 flex items-center gap-2 font-medium'>
            <Boxes className='text-primary size-4' />
            {t('API model groups')}
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Select exact model names here. Users choose these groups when creating API keys.'
            )}
          </p>
        </div>
        <div className='rounded-xl border p-4'>
          <div className='mb-1 flex items-center gap-2 font-medium'>
            <Waypoints className='size-4' />
            {t('Channel routing groups')}
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Channel groups are legacy upstream routing memberships. Channel tags organize providers; personal collections only organize favorites.'
            )}
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('Model groups')}</CardTitle>
          <CardDescription>
            {t(
              'Existing routing groups are preserved. Editing their models converts them to an independent model group.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {catalog.data?.groups.map((group) => (
            <div
              key={group.name}
              className='flex min-w-0 flex-col gap-3 rounded-xl border p-4'
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='truncate font-medium' title={group.name}>
                    {group.name}
                  </p>
                  <p className='text-muted-foreground truncate text-xs'>
                    {group.description || t('No description')}
                  </p>
                </div>
                <Badge variant={group.managed ? 'default' : 'secondary'}>
                  {t(
                    group.managed
                      ? 'Independent model group'
                      : 'Channel-linked group'
                  )}
                </Badge>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('{{count}} models', { count: group.models.length })} ·{' '}
                {group.ratio}× ·{' '}
                {t(group.selectable ? 'User selectable' : 'Hidden from users')}
              </p>
              <div className='flex min-h-10 flex-wrap gap-1'>
                {group.models.slice(0, 3).map((name) => (
                  <Badge
                    key={name}
                    variant='outline'
                    className='max-w-full truncate'
                    title={name}
                  >
                    {name}
                  </Badge>
                ))}
                {group.models.length > 3 && (
                  <Badge variant='outline'>+{group.models.length - 3}</Badge>
                )}
              </div>
              {canEdit && (
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-auto self-start'
                  onClick={() => {
                    setEditing(group)
                    setOpen(true)
                  }}
                  aria-label={`${t('Edit model group')} ${group.name}`}
                >
                  <Pencil className='size-3.5' />
                  {t('Edit group models')}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle>{t('Select models to group')}</CardTitle>
              <CardDescription>
                {t(
                  'New upstream models appear here automatically. Select them to add them to a model group.'
                )}
              </CardDescription>
            </div>
            <Button
              disabled={!canEdit || selected.length === 0}
              onClick={() => {
                setEditing(undefined)
                setOpen(true)
              }}
            >
              <FolderPlus className='size-4' />
              {t('Assign models to a group')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative min-w-48 flex-1'>
              <Search className='text-muted-foreground pointer-events-none absolute top-3 left-3 size-4' />
              <Input
                className='pl-9'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={t('Search models')}
                placeholder={t('Search models')}
              />
            </div>
            <Badge variant='secondary'>
              {t('{{count}} selected', { count: selected.length })}
            </Badge>
            <Button
              variant='ghost'
              disabled={selected.length === 0}
              onClick={() => setSelected([])}
            >
              {t('Clear selection')}
            </Button>
          </div>
          <div className='max-h-96 overflow-auto rounded-lg border'>
            <StaticDataTable
              data={models}
              getRowKey={(name) => name}
              tableProps={{ 'aria-label': t('Models available for grouping') }}
              emptyContent={t('No matching models')}
              columns={[
                {
                  id: 'select',
                  header: (
                    <Checkbox
                      aria-label={t('Select visible models')}
                      disabled={!canEdit || models.length === 0}
                      checked={
                        models.length > 0 &&
                        models.every((name) => selected.includes(name))
                      }
                      onCheckedChange={(checked) =>
                        setSelected((previous) =>
                          checked === true
                            ? [...new Set([...previous, ...models])]
                            : previous.filter((name) => !models.includes(name))
                        )
                      }
                    />
                  ),
                  className: 'w-12',
                  cell: (name) => (
                    <Checkbox
                      aria-label={`${t('Select model')} ${name}`}
                      disabled={!canEdit}
                      checked={selected.includes(name)}
                      onCheckedChange={(checked) =>
                        setSelected((previous) =>
                          checked === true
                            ? [...previous, name]
                            : previous.filter((item) => item !== name)
                        )
                      }
                    />
                  ),
                },
                {
                  id: 'model',
                  header: t('Model name'),
                  cell: (name) => (
                    <span className='font-mono text-xs break-all'>{name}</span>
                  ),
                },
                {
                  id: 'groups',
                  header: t('Independent model groups'),
                  cell: (name) => (
                    <div className='flex flex-wrap gap-1'>
                      {catalog.data?.groups
                        .filter(
                          (group) =>
                            group.managed && group.models.includes(name)
                        )
                        .map((group) => (
                          <Badge key={group.name} variant='secondary'>
                            {group.name}
                          </Badge>
                        ))}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </CardContent>
      </Card>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Model-square display filters and personal collections do not grant API access. Group prices and user visibility remain in Group pricing settings.'
        )}
      </p>
      <ModelGroupAssignmentDialog
        open={open}
        onOpenChange={setOpen}
        models={selected}
        group={editing}
        onSuccess={() => setSelected([])}
      />
    </div>
  )
}
