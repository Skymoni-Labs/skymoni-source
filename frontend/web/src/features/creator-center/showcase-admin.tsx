import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Image,
  LayoutDashboard,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { creatorRequest } from './api'
import {
  cleanShowcaseLayout,
  orderedShowcaseWorks,
  showcaseSlots,
  type ShowcaseAdminData,
  type ShowcaseLayout,
} from './lib/showcase-layout'
import { type Work, categoryLabel } from './types'

const slotNames = ['左侧主推', '右侧上方', '右侧下方']

function PreviewCard({ work, primary }: { work?: Work; primary?: boolean }) {
  return (
    <div
      className={`bg-card overflow-hidden rounded-2xl border ${primary ? 'grid sm:grid-cols-2 lg:row-span-2' : 'grid grid-cols-[32%_1fr]'}`}
    >
      <div
        className={`bg-muted relative flex items-center justify-center ${primary ? 'min-h-44' : 'min-h-28'}`}
      >
        {work?.cover ? (
          <img
            src={work.cover}
            alt=''
            className='absolute inset-0 size-full object-cover'
          />
        ) : (
          <Image aria-hidden className='text-muted-foreground/50 size-8' />
        )}
      </div>
      <div
        className={`flex min-w-0 flex-col justify-center gap-2 ${primary ? 'p-5' : 'p-3'}`}
      >
        <span className='text-primary flex items-center gap-1 text-xs'>
          <Sparkles className='size-3' aria-hidden />
          {primary ? '值得驻足的作品' : '创作者作品'}
        </span>
        <strong className={`${primary ? 'text-xl' : 'text-sm'} break-words`}>
          {work?.title ?? '等待公开作品'}
        </strong>
        <p className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
          {work?.summary ?? '作品发布后会自动补位'}
        </p>
        {work && primary && (
          <span className='text-muted-foreground mt-3 text-xs'>
            {work.author}
          </span>
        )}
      </div>
    </div>
  )
}

export function CreatorShowcaseManagement() {
  const auth = useAuthStore((s) => s.auth)
  const key = ['creator-showcase-admin', auth.user?.id, auth.session?.sid]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      creatorRequest<ShowcaseAdminData>('/admin/showcase', { signal }),
    gcTime: 0,
    refetchInterval: 60000,
  })
  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  return (
    <ShowcaseEditor
      key={`${query.data.config.revision}:${auth.user?.id}:${auth.session?.sid}`}
      data={query.data}
      onRefresh={() => void query.refetch()}
    />
  )
}

export function ShowcaseEditor({
  data,
  onRefresh,
}: {
  data: ShowcaseAdminData
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const auth = useAuthStore((s) => s.auth)
  const [draft, setDraft] = useState(() =>
    cleanShowcaseLayout(data.config, data.works)
  )
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)
  const [savedConfig, setSavedConfig] = useState(data.config)
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedConfig)
  const ordered = orderedShowcaseWorks(data.works, draft.orderedIds)
  const slots = showcaseSlots(
    data.works,
    draft.dailyRandom && data.dailyPreview ? data.dailyPreview : draft
  )
  const unavailable =
    savedConfig.spotlightIds.some(
      (id) => id && !data.works.some((work) => work.id === id)
    ) ||
    savedConfig.orderedIds.some(
      (id) => !data.works.some((work) => work.id === id)
    )
  const mutation = useMutation({
    mutationFn: (next: ShowcaseLayout) =>
      creatorRequest<ShowcaseAdminData>('/admin/showcase', {
        method: 'put',
        data: next,
      }),
    onSuccess: (next, submitted) => {
      client.setQueryData(
        ['creator-showcase-admin', auth.user?.id, auth.session?.sid],
        next
      )
      for (const key of ['creator-public', 'creator-admin']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
      setSaved(true)
      setSavedConfig(next.config)
      setDraft(cleanShowcaseLayout(next.config, next.works))
      if (submitted.dailyRandom !== savedConfig.dailyRandom) {
        toast.success(
          submitted.dailyRandom
            ? t('Daily random recommendations enabled')
            : t('Manual recommendations restored')
        )
      } else {
        toast.success('推荐编排已保存')
      }
    },
  })
  function change(next: ShowcaseLayout) {
    setSaved(false)
    setDraft(next)
  }
  function chooseSlot(index: number, id: string) {
    const ids = [...draft.spotlightIds] as ShowcaseLayout['spotlightIds']
    const previous = ids[index]
    const occupied = id ? ids.indexOf(id) : -1
    ids[index] = id
    if (occupied >= 0 && occupied !== index) ids[occupied] = previous
    change({ ...draft, spotlightIds: ids })
  }
  function moveSlot(index: number, target: number) {
    const ids = [...draft.spotlightIds] as ShowcaseLayout['spotlightIds']
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    change({ ...draft, spotlightIds: ids })
  }
  function moveWork(id: string, offset: number) {
    const ids = ordered.map((work) => work.id)
    const index = ids.indexOf(id),
      target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    change({ ...draft, orderedIds: ids })
  }
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='flex items-center gap-2 text-lg font-semibold'>
            <LayoutDashboard className='text-primary size-5' aria-hidden />
            作品广场编排
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            指定推荐位置，安排作品顺序。保存后同步到公开作品广场。
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={dirty || mutation.isPending}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden />
            刷新
          </Button>
          <Button
            size='sm'
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate(draft)}
          >
            <Save aria-hidden />
            {mutation.isPending ? '保存中…' : '保存编排'}
          </Button>
        </div>
      </div>
      {saved && (
        <p
          role='status'
          className='flex items-center gap-2 text-sm text-emerald-600'
        >
          <Check className='size-4' aria-hidden />
          编排已保存
        </p>
      )}
      {mutation.isError && (
        <div
          role='alert'
          className='border-destructive/30 bg-destructive/5 rounded-xl border p-3 text-sm'
        >
          <p>{getServerErrorMessage(mutation.error, '保存失败，请重试。')}</p>
          <Button
            className='mt-2'
            variant='outline'
            size='sm'
            onClick={onRefresh}
          >
            重新加载最新编排
          </Button>
        </div>
      )}
      {unavailable && (
        <p
          role='status'
          className='rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm'
        >
          部分作品已下架或不再公开，前台已自动补位。保存后将清理这些失效选择。
        </p>
      )}
      <fieldset disabled={mutation.isPending} className='space-y-6'>
        <section className='bg-card rounded-2xl border p-4 sm:p-5'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h4 className='font-semibold'>推荐区</h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                左侧主推 + 右侧两张卡片；自动补位不会重复展示。
              </p>
            </div>
            <div className='flex flex-wrap items-center justify-end gap-3'>
              <Button
                variant={draft.dailyRandom ? 'default' : 'outline'}
                size='sm'
                aria-pressed={!!draft.dailyRandom}
                onClick={() =>
                  mutation.mutate({
                    ...cleanShowcaseLayout(draft, data.works),
                    dailyRandom: !draft.dailyRandom,
                    enabled: draft.dailyRandom ? draft.enabled : true,
                  })
                }
              >
                <Shuffle aria-hidden />
                {t('Daily random recommendations')}
              </Button>
              <Switch
                aria-label='显示推荐区'
                checked={draft.enabled}
                onCheckedChange={(enabled) => change({ ...draft, enabled })}
              />
            </div>
          </div>
          <p className='text-muted-foreground mb-4 text-xs' role='status'>
            {draft.dailyRandom
              ? t(
                  'Automatically updates at midnight Beijing time. No manual save needed.'
                )
              : t(
                  'Enable daily random recommendations to rotate published projects automatically.'
                )}
            {draft.dailyRandom && data.dailyPreview?.rotationDate && (
              <span className='ml-2'>
                {t('Today’s recommendations')}: {data.dailyPreview.rotationDate}
              </span>
            )}
          </p>
          <div className='grid gap-3 lg:grid-cols-3'>
            {slotNames.map((name, index) => (
              <div key={name} className='rounded-xl border p-3'>
                <div className='mb-3 flex items-center justify-between'>
                  <label
                    htmlFor={`showcase-slot-${index}`}
                    className='text-sm font-medium'
                  >
                    {name}
                  </label>
                  <div className='flex gap-1'>
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      aria-label={`${name}上移`}
                      disabled={!!draft.dailyRandom || index === 0}
                      onClick={() => moveSlot(index, index - 1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      aria-label={`${name}下移`}
                      disabled={!!draft.dailyRandom || index === 2}
                      onClick={() => moveSlot(index, index + 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </div>
                </div>
                <NativeSelect
                  id={`showcase-slot-${index}`}
                  value={draft.dailyRandom ? '' : draft.spotlightIds[index]}
                  disabled={!!draft.dailyRandom}
                  onChange={(event) => chooseSlot(index, event.target.value)}
                >
                  <NativeSelectOption value=''>
                    {draft.dailyRandom
                      ? t('Selected automatically each day')
                      : '自动补位'}
                  </NativeSelectOption>
                  {data.works.map((work) => (
                    <NativeSelectOption key={work.id} value={work.id}>
                      {work.title} · {work.author}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p className='text-muted-foreground mt-2 truncate text-xs'>
                  当前展示：{slots[index]?.title ?? '暂无公开作品'}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section aria-label='推荐区预览' className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='text-sm font-semibold'>布局预览</h4>
            <Badge variant='outline'>
              {draft.enabled ? '推荐区已开启' : '推荐区已关闭'}
            </Badge>
          </div>
          {draft.enabled ? (
            <div className='grid gap-3 lg:grid-cols-[1.65fr_1fr]'>
              <PreviewCard work={slots[0]} primary />
              <PreviewCard work={slots[1]} />
              <PreviewCard work={slots[2]} />
            </div>
          ) : (
            <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
              公开页面将直接显示作品列表和分类入口。
            </div>
          )}
        </section>
        <section className='bg-card overflow-hidden rounded-2xl border'>
          <div className='flex flex-wrap items-center justify-between gap-3 border-b p-4'>
            <div>
              <h4 className='font-semibold'>
                作品列表顺序{' '}
                <span className='text-muted-foreground ml-1 text-sm font-normal'>
                  {data.works.length} 个作品
                </span>
              </h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                影响“精选”排序和自动补位；最新发布等其他排序仍由访客选择。
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              disabled={!draft.orderedIds.length}
              onClick={() => change({ ...draft, orderedIds: [] })}
            >
              <RotateCcw aria-hidden />
              恢复默认顺序
            </Button>
          </div>
          <div className='relative m-4'>
            <Search
              className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2'
              aria-hidden
            />
            <Input
              className='pl-9'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='搜索作品或创作者'
              aria-label='搜索编排作品'
            />
          </div>
          <div className='max-h-96 overflow-y-auto px-4 pb-4'>
            {ordered
              .filter((work) =>
                `${work.title} ${work.author}`
                  .toLowerCase()
                  .includes(search.trim().toLowerCase())
              )
              .map((work) => {
                const index = ordered.findIndex((item) => item.id === work.id)
                return (
                  <div
                    key={work.id}
                    className='flex items-center gap-3 border-b py-3 last:border-b-0'
                  >
                    <span className='text-muted-foreground w-6 shrink-0 text-center text-xs tabular-nums'>
                      {index + 1}
                    </span>
                    <div className='bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg'>
                      {work.cover ? (
                        <img
                          src={work.cover}
                          alt=''
                          className='size-full object-cover'
                        />
                      ) : (
                        <Image
                          className='text-muted-foreground size-5'
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>
                        {work.title}
                      </p>
                      <p className='text-muted-foreground mt-1 truncate text-xs'>
                        {work.author} · {t(categoryLabel(work.category))}
                      </p>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={`上移 ${work.title}`}
                      disabled={index === 0}
                      onClick={() => moveWork(work.id, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={`下移 ${work.title}`}
                      disabled={index === ordered.length - 1}
                      onClick={() => moveWork(work.id, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </div>
                )
              })}
            {!data.works.length && (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                暂无可编排的公开作品。请先在作品审核中通过发布。
              </p>
            )}
            {!!data.works.length &&
              !ordered.some((work) =>
                `${work.title} ${work.author}`
                  .toLowerCase()
                  .includes(search.trim().toLowerCase())
              ) && (
                <p className='text-muted-foreground py-8 text-center text-sm'>
                  没有匹配的作品
                </p>
              )}
          </div>
        </section>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-muted-foreground text-xs'>
            {dirty ? '有尚未保存的修改' : '当前编排已同步'}
            ；下架、不公开或停用创作者的作品自动退出展示。
          </p>
          <Button
            variant='outline'
            size='sm'
            disabled={!dirty}
            onClick={() => change(cleanShowcaseLayout(savedConfig, data.works))}
          >
            撤销修改
          </Button>
        </div>
      </fieldset>
    </div>
  )
}
