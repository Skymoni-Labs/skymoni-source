import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { creatorRequest } from '../api'
import type { ReviewCatalog } from '../lib/review'

type Policy = NonNullable<ReviewCatalog['reviewPolicy']>

export function CreatorReviewPolicySetting({
  policy = { autoApproveWorks: false, revision: 'initial' },
  onChange,
  onRefresh,
  request = creatorRequest,
}: {
  policy?: Policy
  onChange: (policy: Policy) => void
  onRefresh: () => void
  request?: typeof creatorRequest
}) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: (autoApproveWorks: boolean) =>
      request<Policy>('/admin/review-policy', {
        method: 'put',
        data: { autoApproveWorks, revision: policy.revision },
      }),
    onSuccess: (saved) => {
      onChange(saved)
      setError('')
      setMessage(
        saved.autoApproveWorks
          ? '已开启，新提交的作品将直接发布。'
          : '已关闭，新提交的作品需要管理员审核。'
      )
    },
    onError: (error) => {
      setMessage('')
      setError(getServerErrorMessage(error, '保存失败，请刷新后重试。'))
      onRefresh()
    },
  })
  return (
    <section
      className='bg-muted/20 mb-5 rounded-xl border p-5'
      aria-label='作品审核设置'
    >
      <div className='flex items-center justify-between gap-6'>
        <div className='space-y-1.5'>
          <label
            htmlFor='creator-auto-approve'
            className='text-sm font-semibold'
          >
            作品自动通过审核
          </label>
          <p
            id='creator-auto-approve-description'
            className='text-muted-foreground text-sm leading-6'
          >
            开启后，创作者提交作品或重新提交修改时直接发布；关闭后恢复人工审核。草稿不会公开，已有待审核作品保留原状态。
          </p>
          <p className='text-muted-foreground text-xs'>
            软件版本与首页付费展示卡片仍按各自流程处理。
          </p>
        </div>
        <Switch
          id='creator-auto-approve'
          aria-label='作品自动通过审核'
          aria-describedby='creator-auto-approve-description'
          checked={policy.autoApproveWorks}
          disabled={mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </div>
      {mutation.isPending && (
        <p role='status' className='mt-3 text-sm'>
          正在保存…
        </p>
      )}
      {message && (
        <p role='status' className='mt-3 text-sm'>
          {message}
        </p>
      )}
      {error && (
        <p role='alert' className='text-destructive mt-3 text-sm'>
          {error}
        </p>
      )}
    </section>
  )
}
