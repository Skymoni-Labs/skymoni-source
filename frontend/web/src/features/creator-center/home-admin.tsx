import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  ImagePlus,
  LayoutTemplate,
  Pencil,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/stores/auth-store'

import { creatorRequest, loadCreatorWorks } from './api'
import { publicShowcaseWorks } from './lib/showcase'
import {
  homeError,
  homeExpiry,
  loadHomepageShowcase,
  prepareHomeImage,
  type CreatorHomeState,
  type HomeAuthor,
  type HomeCard,
  type HomeConfig,
  type HomeRequest,
  type HomeShowcase,
} from './home-api'
import type { Work } from './types'

import '@/styles/creator-home.css'
import '@/styles/creator-center.css'
import '@/styles/creator-gallery.css'

export function CreatorHomeManagement({
  request = creatorRequest,
  preview = false,
}: {
  request?: HomeRequest
  preview?: boolean
}) {
  const { t } = useTranslation()
  const auth = useAuthStore((s) => s.auth)
  const client = useQueryClient()
  const key = [
    'creator-home-admin',
    preview ? 'preview' : auth.user?.id,
    auth.session?.sid,
  ]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      request<CreatorHomeState>('/admin/home', { signal }),
    enabled: preview || auth.user?.role === 100,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const showcase = useQuery({
    queryKey: ['home-creator-public'],
    queryFn: ({ signal }) => loadHomepageShowcase(signal),
    enabled: preview || auth.user?.role === 100,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  })
  const catalogue = useQuery({
    queryKey: ['creator-home-candidates'],
    queryFn: ({ signal }) => loadCreatorWorks(signal),
    enabled: preview || auth.user?.role === 100,
    retry: false,
  })
  const [tab, setTab] = useState<'showcase' | 'cards' | 'authors'>('showcase')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const update = useMutation({
    mutationFn: (input: { path: string; data: unknown }) =>
      request<CreatorHomeState>(`/admin/home/${input.path}`, {
        method: 'put',
        data: input.data,
      }),
    onSuccess: async (data) => {
      client.setQueryData(key, data)
      setMessage('设置已保存。')
      setError('')
      await client.invalidateQueries({ queryKey: ['home-creator-public'] })
      await client.invalidateQueries({ queryKey: ['creator-home'] })
      await client.invalidateQueries({ queryKey: ['creator-home-candidates'] })
    },
    onError: (err) => {
      setError(homeError(err))
      setMessage('')
    },
  })
  if (!preview && auth.user?.role !== 100) return <p>无权管理首页展示。</p>
  if (query.isPending) return <p role='status'>正在加载首页展示管理…</p>
  if (query.isError) {
    return (
      <div role='alert'>
        <p>{homeError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>重试</Button>
      </div>
    )
  }
  const candidates = publicShowcaseWorks(catalogue.data ?? query.data.works)
  let tabDescription = '勾选要在首页展示的作品，排序数字越小越靠前，修改后点击保存。已开通的展示卡片优先使用；没有时使用作品封面。'
  if (tab === 'cards') {
    tabDescription = '点击列表中的“编辑”设置显示与排序，排序数字越小越靠前。'
  } else if (tab === 'authors') {
    tabDescription =
      '全部已开通的创作者都会列在这里。开启自动加入时，新创作者默认显示；关闭不影响已加入的名单，可手动勾选显示。排序数字越小越靠前。'
  }
  return (
    <div className='ch-home-panel ch-home-admin'>
      <header className='ch-home-heading'>
        <span>HOMEPAGE CURATION</span>
        <h1>首页创作者展示</h1>
        <p>
          {t(
            'Homepage works, display applications and creator portraits are managed separately.'
          )}
        </p>
      </header>
      <HomeConfigForm
        key={query.data.config.revision}
        config={query.data.config}
        busy={update.isPending}
        save={(config) => update.mutate({ path: 'config', data: config })}
      />
      <div
        className='ch-home-admin-tabs'
        role='tablist'
        aria-label='首页展示模块'
      >
        <Button
          variant='ghost'
          role='tab'
          aria-selected={tab === 'showcase'}
          onClick={() => {
            setTab('showcase')
            setMessage('')
            setError('')
          }}
        >
          <LayoutTemplate />
          {t('Current homepage works')}{' '}
          <span>{query.data.showcase?.works.filter((item) => item.enabled).length ?? showcase.data?.works.length ?? 0}</span>
        </Button>
        <button
          type='button'
          role='tab'
          aria-selected={tab === 'cards'}
          onClick={() => {
            setTab('cards')
            setMessage('')
            setError('')
          }}
        >
          <LayoutTemplate />
          {t('Display applications')} <span>{query.data.cards.length}</span>
        </button>
        <button
          type='button'
          role='tab'
          aria-selected={tab === 'authors'}
          onClick={() => {
            setTab('authors')
            setMessage('')
            setError('')
          }}
        >
          <Users />
          创作者头像 <span>{query.data.authors.length}</span>
        </button>
      </div>
      <p className='ch-home-tip'>{tabDescription}</p>
      {tab === 'showcase' && (
        <section aria-label={t('Works shown on the homepage')}>
          {catalogue.isPending && <p role='status'>正在加载可展示作品…</p>}
          {catalogue.isError && <p role='alert'>{homeError(catalogue.error)}</p>}
          {!query.data.config.galleryEnabled && <p role='status'>作品轮播模块已关闭，开启模块后才会显示所选作品。</p>}
          {!catalogue.isPending && !catalogue.isError && (
            <HomeWorkSelectionForm
              key={query.data.showcase?.revision ?? 'initial'}
              selection={query.data.showcase}
              works={candidates}
              busy={update.isPending}
              save={(data) => update.mutate({ path: 'showcase', data })}
            />
          )}
          <Button variant='ghost' disabled={update.isPending} onClick={() => {
            void query.refetch()
            void catalogue.refetch()
            void showcase.refetch()
          }}>刷新作品与配置</Button>
        </section>
      )}
      {tab === 'cards' &&
        (!query.data.cards.length ? (
          <div className='ch-home-empty'>
            <LayoutTemplate />
            <h2>还没有提交的首页卡片</h2>
            <p>创作者从“首页展示卡片”模块上传设计后，在这里审核。</p>
          </div>
        ) : (
          query.data.cards.map((card) => (
            <HomeCardRow
              key={`${card.workId}:${card.revision}`}
              card={card}
              now={query.dataUpdatedAt / 1000}
              work={query.data.works.find((w) => w.id === card.workId)}
              ownerName={
                query.data.authors.find((a) => a.userId === card.ownerId)?.name
              }
              busy={update.isPending}
              save={(data) =>
                update.mutate({
                  path: `cards/${encodeURIComponent(card.workId)}`,
                  data,
                })
              }
            />
          ))
        ))}
      {tab === 'authors' &&
        (!query.data.authors.length ? (
          <div className='ch-home-empty'>
            <Users />
            <h2>暂无创作者</h2>
            <p>新创作者开通身份后会出现在这里。</p>
          </div>
        ) : (
          query.data.authors.map((author) => (
            <HomeAuthorRow
              key={`${author.userId}:${query.dataUpdatedAt}`}
              author={author}
              busy={update.isPending}
              save={(data) =>
                update.mutate({ path: `authors/${author.userId}`, data })
              }
              report={setError}
            />
          ))
        ))}
      {error && (
        <p role='alert' className='ch-home-feedback'>
          {error}
        </p>
      )}
      {message && (
        <p role='status' className='ch-home-feedback ch-home-success'>
          {message}
        </p>
      )}
    </div>
  )
}
function HomeWorkSelectionForm({ selection, works, busy, save }: {
  selection?: HomeShowcase
  works: Work[]
  busy: boolean
  save: (value: HomeShowcase) => void
}) {
  const [draft, setDraft] = useState<HomeShowcase>(() => selection ?? {
    revision: 'initial', autoAddWorks: true,
    works: works.map((work, position) => ({ workId: work.id, enabled: true, position })),
  })
  const [search, setSearch] = useState('')
  const change = (id: string, patch: Partial<HomeShowcase['works'][number]>) => {
    setDraft((value) => ({ ...value, works: value.works.map((item) => item.workId === id ? { ...item, ...patch } : item) }))
  }
  const byId = new Map(works.map((work) => [work.id, work]))
  const rows = draft.works.filter((item) => byId.has(item.workId))
  const visible = rows.filter((item) => {
    const work = byId.get(item.workId)!
    return `${work.title} ${work.author}`.toLowerCase().includes(search.trim().toLowerCase())
  })
  const changed = JSON.stringify(draft) !== JSON.stringify(selection ?? {
    revision: 'initial', autoAddWorks: true,
    works: works.map((work, position) => ({ workId: work.id, enabled: true, position })),
  })
  return <div className='ch-home-work-selection'>
    <section className='ch-home-box ch-home-selection-controls'>
      <div className='ch-home-selection-toolbar'>
        <div><h2>选择首页展示作品</h2><p>已启用 {rows.filter((item) => item.enabled).length} / {rows.length} 件作品</p></div>
        <Button disabled={busy || !changed} onClick={() => save(draft)}>保存展示配置</Button>
      </div>
      <label className='ch-home-selection-check'><input type='checkbox' checked={draft.autoAddWorks} disabled={busy} onChange={(e) => setDraft({ ...draft, autoAddWorks: e.target.checked })} />新公开作品自动加入展示</label>
      <p className='ch-home-tip'>关闭自动加入后，新作品需要手动启用；已勾选的作品继续展示。全部停用可清空首页作品展示。</p>
      <div className='ch-home-selection-toolbar'>
        <Input aria-label='搜索展示作品' placeholder='搜索作品或创作者' value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant='outline' disabled={busy || !visible.length} onClick={() => setDraft({ ...draft, works: draft.works.map((item) => visible.includes(item) ? { ...item, enabled: true } : item) })}>启用筛选结果</Button>
        <Button variant='outline' disabled={busy || !visible.length} onClick={() => setDraft({ ...draft, works: draft.works.map((item) => visible.includes(item) ? { ...item, enabled: false } : item) })}>停用筛选结果</Button>
      </div>
    </section>
    {!rows.length && <p>暂无已公开作品，作品公开后会出现在这里。</p>}
    {!!rows.length && !visible.length && <p>没有匹配的作品。</p>}
    {visible.map((item) => {
      const work = byId.get(item.workId)!
      const cover = work.homePoster || work.cover || work.images?.[0]
      return <section key={work.id} className='ch-home-box ch-home-compact-card ch-home-selection-row'>
        {cover ? <img src={cover} alt={work.title} /> : <div className='ch-home-example-art flex items-center justify-center'><LayoutTemplate aria-hidden /></div>}
        <div className='ch-home-selection-description'><h2><a href={`/creators/works/${encodeURIComponent(work.id)}`}>{work.title}</a></h2><p>{work.author} · 来自创作者中心</p><p className='line-clamp-2'>{work.summary}</p></div>
        <div className='ch-home-selection-actions'>
          <label className='ch-home-selection-check'><input type='checkbox' checked={item.enabled} disabled={busy} onChange={(e) => change(item.workId, { enabled: e.target.checked })} aria-label={`启用展示 ${work.title}`} />{item.enabled ? '已启用' : '已停用'}</label>
          <label className='ch-home-selection-order'>排序<Input type='number' min={0} max={100000} value={item.position} disabled={busy} aria-label={`展示排序 ${work.title}`} onChange={(e) => change(item.workId, { position: Math.min(100000, Math.max(0, Number(e.target.value))) })} /></label>
          <Button variant='outline' render={<a href={`/creators/works/${encodeURIComponent(work.id)}`} />}>查看作品 <ArrowUpRight aria-hidden /></Button>
        </div>
      </section>
    })}
  </div>
}

function HomeConfigForm({
  config,
  busy,
  save,
}: {
  config: HomeConfig
  busy: boolean
  save: (value: HomeConfig) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(config)
  const [editing, setEditing] = useState<'gallery' | 'authors' | null>(null)
  const galleryStatus = config.galleryEnabled ? '首页已显示' : '首页已隐藏'
  const authorStatus = `${config.marqueeEnabled ? '首页已显示' : '首页已隐藏'} · 新创作者${config.autoAddCreators ? '自动加入' : '手动加入'}`
  return (
    <>
      <section className='ch-home-box ch-home-module-list'>
        <h2>首页模块</h2>
        <p>控制首页区域是否展示；具体卡片和作者在下方列表编辑。</p>
        {(['gallery', 'authors'] as const).map((kind) => (
          <div className='ch-home-module-row' key={kind}>
            {kind === 'gallery' ? <LayoutTemplate /> : <Users />}
            <div>
              <h3>{kind === 'gallery' ? '作品轮播' : '创作者头像名单'}</h3>
              <p>{kind === 'gallery' ? galleryStatus : authorStatus}</p>
            </div>
            <Button
              variant='outline'
              disabled={busy}
              aria-label={`编辑${kind === 'gallery' ? '作品轮播模块' : '创作者头像模块'}`}
              onClick={() => {
                setDraft(config)
                setEditing(editing === kind ? null : kind)
              }}
            >
              <Pencil />
              {editing === kind ? '收起' : '编辑'}
            </Button>
          </div>
        ))}
        {editing && (
          <div className='ch-home-inline-editor'>
            <h3>{editing === 'gallery' ? '作品轮播设置' : '创作者头像设置'}</h3>
            {(editing === 'gallery'
              ? [['galleryEnabled', '在首页显示作品轮播']]
              : [
                  ['marqueeEnabled', '在首页显示创作者头像名单'],
                  ['autoAddCreators', '新创作者开通后自动加入名单'],
                ]
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type='checkbox'
                  checked={
                    draft[
                      key as keyof Pick<
                        HomeConfig,
                        'galleryEnabled' | 'marqueeEnabled' | 'autoAddCreators'
                      >
                    ]
                  }
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <p>
              {editing === 'gallery'
                ? '此开关只控制轮播区域的显示，不影响展示套餐价格。'
                : '关闭自动加入不影响已有名单，仍可逐个编辑作者是否显示。'}
            </p>
            <Button disabled={busy} onClick={() => save(draft)}>
              保存设置
            </Button>
            <Button
              variant='ghost'
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              取消
            </Button>
          </div>
        )}
      </section>
      <p className='ch-home-fee-note'>
        <strong>{t('Dedicated homepage card pricing')}</strong>
        <span>5 额度 / 一年 · 10 额度 / 永久</span>
        <small>创作者提交卡片 → 审核通过 → 自行支付 → 首页展示。</small>
      </p>
    </>
  )
}

function HomeCardRow({
  card,
  now,
  work,
  ownerName,
  busy,
  save,
}: {
  card: HomeCard
  now: number
  work?: Work
  ownerName?: string
  busy: boolean
  save: (data: unknown) => void
}) {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState(card.hidden)
  const [position, setPosition] = useState(card.position)
  const [note, setNote] = useState(card.note)
  const [editing, setEditing] = useState(false)
  // The admin snapshot includes every work, including drafts and hidden works.
  // A missing work means the retained application is now a history record.
  if (!work) {
    return (
      <section className='ch-home-box ch-home-compact-card'>
        <img src={card.image} alt={t('Deleted work homepage card')} />
        <div>
          <h2>{t('Deleted work')}</h2>
          <p>
            {ownerName || t('Creator {{id}}', { id: card.ownerId })} ·{' '}
            <span role='status'>{t('Application invalid')}</span>
          </p>
          <p>
            {t(
              'The original work was deleted. This application can no longer be reviewed or displayed.'
            )}
          </p>
          {(card.permanent || card.expiresAt > 0) && <p>{homeExpiry(card)}</p>}
          <small className='break-all'>
            {t('Work ID')}: {card.workId}
          </small>
        </div>
      </section>
    )
  }
  const data = { revision: card.revision, hidden, position, note }
  let status = '尚未开通或已到期'
  if (card.permanent || card.expiresAt > now) {
    status = '已付费开通'
    if (card.ownerPaused) status = '创作者已暂停'
    if (card.hidden) status = '管理员已暂停'
  }
  if (!editing) {
    return (
      <section className='ch-home-box ch-home-compact-card'>
        <img src={card.image} alt={`${work?.title ?? card.workId} 首页卡片`} />
        <div>
          <h2>{work?.title ?? card.workId}</h2>
          <p>
            {work?.author ?? `创作者 ${card.ownerId}`} ·{' '}
            {
              { review: '待审核', approved: '审核通过', rejected: '已退回' }[
                card.status
              ]
            }{' '}
            · {status}
          </p>
          <p>
            {homeExpiry(card)} · 排序 {card.position}
          </p>
        </div>
        <Button
          variant='outline'
          disabled={busy}
          aria-label={`编辑作品 ${work?.title ?? card.workId}`}
          onClick={() => setEditing(true)}
        >
          <Pencil />
          编辑
        </Button>
      </section>
    )
  }
  return (
    <section className='ch-home-box ch-home-review-row'>
      <img src={card.image} alt={`${work?.title ?? card.workId} 首页卡片`} />
      <div>
        <div className='ch-home-row-heading'>
          <h2>{work?.title ?? card.workId}</h2>
          <Button
            variant='ghost'
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            收起编辑
          </Button>
          <span>
            {
              { review: '待审核', approved: '审核通过', rejected: '已退回' }[
                card.status
              ]
            }
          </span>
        </div>
        <p>
          {work?.author ?? `创作者 ${card.ownerId}`} · {homeExpiry(card)}
        </p>
        <p>
          {status}
          {work?.status !== 'published' && ' · 作品未公开，首页不显示'}
        </p>
        {card.ownerPaused && (
          <p>创作者已暂停首页展示；管理员允许显示后，仍需创作者自行恢复。</p>
        )}
        <div className='ch-home-row-controls'>
          <label>
            展示顺序
            <Input
              aria-label={`作品排序 ${work?.title ?? card.workId}`}
              type='number'
              min={0}
              max={100000}
              value={position}
              disabled={busy}
              onChange={(e) => setPosition(Number(e.target.value))}
            />
          </label>
          <label>
            <input
              type='checkbox'
              checked={!hidden}
              disabled={busy}
              onChange={(e) => setHidden(!e.target.checked)}
            />
            允许在首页显示
          </label>
        </div>
        <Textarea
          aria-label={`审核说明 ${work?.title ?? card.workId}`}
          placeholder='审核说明（退回时建议填写修改原因）'
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        <div className='ch-home-row-actions'>
          {card.status === 'review' && (
            <>
              <Button
                disabled={busy || work?.status !== 'published'}
                onClick={() => save({ ...data, decision: 'approve' })}
              >
                通过卡片审核
              </Button>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => save({ ...data, decision: 'reject' })}
              >
                退回修改
              </Button>
            </>
          )}
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => save({ ...data, decision: 'display' })}
          >
            保存显示与排序
          </Button>
        </div>
      </div>
    </section>
  )
}
function HomeAuthorRow({
  author,
  busy,
  save,
  report,
}: {
  author: HomeAuthor
  busy: boolean
  save: (data: HomeAuthor) => void
  report: (error: string) => void
}) {
  const [draft, setDraft] = useState(author)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return (
      <section className='ch-home-box ch-home-author-row'>
        <div className='ch-home-avatar-sample'>
          {author.avatar ? (
            <img src={author.avatar} alt='' />
          ) : (
            <span>{author.name.slice(0, 1)}</span>
          )}
        </div>
        <div>
          <h2>{author.name}</h2>
          <p>
            {author.visible ? '首页已显示' : '首页已隐藏'} · 排序{' '}
            {author.position}
          </p>
          <small>创作者 ID {author.userId}</small>
        </div>
        <Button
          variant='outline'
          disabled={busy}
          aria-label={`编辑创作者 ${author.name}`}
          onClick={() => setEditing(true)}
        >
          <Pencil />
          编辑
        </Button>
      </section>
    )
  }
  return (
    <section className='ch-home-box ch-home-author-row'>
      <div className='ch-home-avatar-sample'>
        {draft.avatar ? (
          <img src={draft.avatar} alt='' />
        ) : (
          <span>{draft.name.slice(0, 1)}</span>
        )}
      </div>
      <div>
        <h2>{draft.name}</h2>
        <small>创作者 ID {draft.userId}</small>
        <label className='ch-home-author-upload'>
          <ImagePlus />
          更换头像
          <input
            type='file'
            accept='image/png,image/jpeg,image/webp'
            aria-label={`头像 ${draft.name}`}
            disabled={busy || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setUploading(true)
              void prepareHomeImage(file, true)
                .then((avatar) => setDraft({ ...draft, avatar }))
                .catch((err) => report(homeError(err)))
                .finally(() => setUploading(false))
            }}
          />
        </label>
        <p className='ch-home-tip'>
          任意比例图片自动居中裁成正方形；建议主体放在中间。PNG / JPEG / WebP，5
          MB 以内。
        </p>
      </div>
      <label className='ch-home-author-toggle'>
        <input
          type='checkbox'
          checked={draft.visible}
          disabled={busy}
          onChange={(e) => setDraft({ ...draft, visible: e.target.checked })}
        />
        首页显示
      </label>
      <label>
        展示顺序
        <Input
          type='number'
          min={0}
          max={100000}
          aria-label={`创作者排序 ${draft.name}`}
          value={draft.position}
          disabled={busy}
          onChange={(e) =>
            setDraft({ ...draft, position: Number(e.target.value) })
          }
        />
      </label>
      <Button
        variant='outline'
        disabled={busy || uploading}
        onClick={() => save(draft)}
      >
        保存作者设置
      </Button>
      <Button
        variant='ghost'
        disabled={busy || uploading}
        onClick={() => {
          setDraft(author)
          setEditing(false)
        }}
      >
        取消编辑
      </Button>
    </section>
  )
}
