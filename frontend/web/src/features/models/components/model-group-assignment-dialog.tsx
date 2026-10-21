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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getModelGroups,
  saveModelGroup,
  type ModelGroup,
  type ModelGroupCatalog,
} from '../model-groups-api'

type AssignmentProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: string[]
  group?: ModelGroup
  onSuccess?: () => void
}

export function ModelGroupAssignmentDialog(props: AssignmentProps) {
  const { t } = useTranslation()
  const catalog = useQuery({
    queryKey: ['routing-model-groups'],
    queryFn: getModelGroups,
    enabled: props.open,
  })
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t(props.group ? 'Edit model group' : 'Assign models to a group')}
      description={t(
        'Model groups define the models an API key can call. Channel memberships stay unchanged.'
      )}
      contentClassName='sm:max-w-xl'
    >
      {catalog.isPending && <LoadingState />}
      {catalog.isError && <ErrorState onRetry={() => void catalog.refetch()} />}
      {catalog.data && !catalog.isError && props.open && (
        <AssignmentForm
          key={props.group?.name ?? 'new'}
          {...props}
          catalog={catalog.data}
        />
      )}
    </Dialog>
  )
}

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((name) => name !== 'auto' && !/[,\n\r\t]/.test(name)),
  ratio: z.number().finite().nonnegative(),
  description: z.string().max(1000),
  selectable: z.boolean(),
})

function AssignmentForm(
  props: AssignmentProps & { catalog: ModelGroupCatalog }
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'create' | 'merge' | 'replace'>(
    props.group ? 'replace' : 'create'
  )
  const [models, setModels] = useState(props.group?.models ?? props.models)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [failure, setFailure] = useState(false)
  const [expectedVersion] = useState(props.catalog.version)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: props.group?.name ?? '',
      ratio: 1,
      description: '',
      selectable: true,
    },
  })
  const save = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      saveModelGroup({
        ...values,
        mode,
        models,
        expected_version: expectedVersion,
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          'routing-model-groups',
          'groups',
          'channel-routing-groups',
          'user-groups',
          'user-models',
          'api-key-models',
          'pricing',
          'models',
          'system-settings',
          'options',
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      )
      toast.success(t('Model group saved'))
      props.onOpenChange(false)
      props.onSuccess?.()
    },
    onError: (error) => {
      setFailure(true)
      handleServerError(error)
    },
  })
  const options = [...new Set([...props.catalog.models, ...models])]
    .sort()
    .map((name) => ({ label: name, value: name }))
  const validEmpty = models.length > 0 || (mode === 'replace' && confirmEmpty)
  return (
    <Form {...form}>
      <form
        className='space-y-4'
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        {!props.group && (
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value as 'create' | 'merge')
              form.setValue('name', '')
              setFailure(false)
            }}
          >
            <TabsList className='w-full'>
              <TabsTrigger value='create'>
                {t('Create model group')}
              </TabsTrigger>
              <TabsTrigger value='merge'>
                {t('Add to existing model group')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t(mode === 'merge' ? 'Target model group' : 'Group name')}
              </FormLabel>
              <FormControl>
                {mode === 'merge' ? (
                  <Combobox
                    id='target-model-group'
                    aria-label={t('Target model group')}
                    options={props.catalog.groups.map((group) => ({
                      label: group.name,
                      value: group.name,
                    }))}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? '')}
                    disabled={save.isPending}
                  />
                ) : (
                  <Input
                    {...field}
                    disabled={!!props.group || save.isPending}
                    placeholder={t('For example: deepseek or coding')}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='space-y-2'>
          <Label htmlFor='group-members'>{t('Selected models')}</Label>
          <MultiSelect
            id='group-members'
            options={options}
            selected={models}
            onChange={(values) => {
              setModels(values)
              setConfirmEmpty(false)
            }}
            disabled={save.isPending}
            maxVisibleChips={5}
          />
        </div>
        {mode === 'create' && (
          <>
            <FormField
              control={form.control}
              name='ratio'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Group multiplier')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      min={0}
                      step={0.0001}
                      disabled={save.isPending}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ''
                            ? Number.NaN
                            : Number(event.target.value)
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Group description')}</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={save.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='selectable'
              render={({ field }) => (
                <FormItem className='flex items-center gap-2'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      disabled={save.isPending}
                    />
                  </FormControl>
                  <FormLabel>{t('User selectable')}</FormLabel>
                </FormItem>
              )}
            />
          </>
        )}
        <p className='bg-muted/50 text-muted-foreground rounded-lg p-3 text-xs leading-relaxed'>
          {t(
            mode === 'merge'
              ? 'Existing group models and prices are kept. Only the selected models are added.'
              : 'Only selected models belong to this group. Available upstream channels are matched automatically, without changing channel groups.'
          )}
        </p>
        {mode === 'replace' && models.length === 0 && (
          <div className='flex items-center gap-2'>
            <Checkbox
              id='confirm-empty-model-group'
              checked={confirmEmpty}
              onCheckedChange={(checked) => setConfirmEmpty(checked === true)}
            />
            <Label htmlFor='confirm-empty-model-group'>
              {t('I understand that this group will have no callable models.')}
            </Label>
          </div>
        )}
        {failure && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'Save failed. Your selections are kept; refresh the group list if another administrator changed it.'
            )}
          </p>
        )}
        <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
          {failure && (
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                props.onOpenChange(false)
                void queryClient.invalidateQueries({
                  queryKey: ['routing-model-groups'],
                })
              }}
            >
              {t('Refresh group list')}
            </Button>
          )}
          <Button
            type='button'
            variant='outline'
            disabled={save.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' disabled={!validEmpty || save.isPending}>
            {t(save.isPending ? 'Saving...' : 'Save model group')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
