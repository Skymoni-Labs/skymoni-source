import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'

import { communityRequest } from './api'
import type { Topic } from './types'

export function TopicTrashButton(props: {
  topic: Topic
  onChanged?: () => void
  disabled?: boolean
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const deleted = Boolean(props.topic.deleted)
  const mutation = useMutation({
    mutationFn: () =>
      communityRequest(`/topics/${props.topic.id}/trash`, {
        method: 'put',
        data: { deleted: !deleted, revision: props.topic.revision },
      }),
    onSuccess: () => {
      setOpen(false)
      props.onChanged?.()
      void client.invalidateQueries({
        queryKey: ['community-topic', props.topic.id],
      })
      void client.invalidateQueries({ queryKey: ['community-topics'] })
      void client.invalidateQueries({ queryKey: ['community-meta'] })
      void client.invalidateQueries({ queryKey: ['community-admin'] })
      toast.success(deleted ? '话题已恢复' : '话题已移入回收站')
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <>
      <Button
        type='button'
        variant={deleted ? 'outline' : 'destructive'}
        size='sm'
        disabled={props.disabled || mutation.isPending}
        onClick={() => setOpen(true)}
      >
        {deleted ? <RotateCcw /> : <Trash2 />}
        {deleted ? '恢复话题' : '删除话题'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value)
        }}
        title={deleted ? '恢复这个话题？' : '删除这个话题？'}
        desc={
          deleted
            ? '话题和原有回复将恢复，原有隐藏或关闭设置会保留。'
            : '话题及其回复将移入回收站，其他人将无法查看。你可以从话题回收站恢复。'
        }
        confirmText={deleted ? '确认恢复' : '移入回收站'}
        destructive={!deleted}
        isLoading={mutation.isPending}
        handleConfirm={() => mutation.mutate()}
      />
    </>
  )
}
