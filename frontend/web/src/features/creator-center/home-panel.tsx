import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Check,
  Clock3,
  ImagePlus,
  Infinity as InfinityIcon,
  LayoutTemplate,
  Pause,
  Play,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { accountIdentity, saveAccountIdentity } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'

import { creatorRequest } from './api'
import {
  homeError,
  homeExpiry,
  prepareHomeImage,
  type CreatorHomeState,
  type HomeOrder,
  type HomeRequest,
} from './home-api'

import '@/styles/creator-home.css'

export function CreatorHomepagePanel({
  request = creatorRequest,
  preview = false,
}: {
  request?: HomeRequest
  preview?: boolean
}) {
  const auth = useAuthStore((s) => s.auth)
  const client = useQueryClient()
  const key = [
    'creator-home',
    preview ? 'preview' : auth.user?.id,
    auth.session?.sid,
  ]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<CreatorHomeState>('/me/home', { signal }),
    gcTime: 0,
    retry: false,
  })
  const [selected, setSelected] = useState('')
  const [image, setImage] = useState('')
  const [plan, setPlan] = useState<'year' | 'permanent'>('year')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const checkout = useRef({ key: '', id: '' })
  const published =
    query.data?.works.filter(
      (w) => w.status === 'published' && w.settings?.listed !== false
    ) ?? []
  const work = published.find((w) => w.id === selected) ?? published[0]
  const card = query.data?.cards.find((c) => c.workId === work?.id)
  const storedAuthor = query.data?.authors[0]
  const author =
    !preview && auth.user && storedAuthor
      ? { ...storedAuthor, ...accountIdentity(auth.user) }
      : storedAuthor
  const cost = plan === 'year' ? 5 : 10
  const poster = image || card?.image
  const refresh = async () => {
    await query.refetch()
    await client.invalidateQueries({ queryKey: ['home-creator-public'] })
    await client.invalidateQueries({ queryKey: ['creator-home-admin'] })
  }
  const submit = useMutation({
    mutationFn: () =>
      request<CreatorHomeState>(
        `/me/home/cards/${encodeURIComponent(work?.id ?? '')}`,
        {
          method: 'put',
          data: { image: poster, revision: card?.revision ?? '' },
        }
      ),
    onSuccess: async () => {
      setImage('')
      setMessage('卡片已提交审核。审核通过后，可确认支付并开始展示。')
      await refresh()
    },
    onError: (err) => setError(homeError(err)),
  })
  const purchase = useMutation({
    mutationFn: () => {
      const token = `${work?.id}:${card?.revision}:${plan}`
      if (checkout.current.key !== token) {
        checkout.current = { key: token, id: crypto.randomUUID() }
      }
      return request<HomeOrder>(
        `/me/home/cards/${encodeURIComponent(work?.id ?? '')}/purchase`,
        {
          method: 'post',
          data: {
            plan,
            revision: card?.revision,
            checkoutId: checkout.current.id,
            confirm: true,
          },
        }
      )
    },
    onSuccess: async () => {
      setConfirm(false)
      setMessage(
        card?.ownerPaused
          ? '支付成功，展示资格已更新；卡片仍暂停，可手动恢复。'
          : '支付成功，你的作品已进入首页展示。'
      )
      await refresh()
    },
    onError: (err) => {
      setConfirm(false)
      setError(homeError(err))
    },
  })
  const display = useMutation({
    mutationFn: (paused: boolean) =>
      request<CreatorHomeState>(
        `/me/home/cards/${encodeURIComponent(work?.id ?? '')}/display`,
        {
          method: 'put',
          data: { paused, revision: card?.revision },
        }
      ),
    onSuccess: async (_data, paused) => {
      setMessage(
        paused
          ? '已暂停首页展示，购买资格保留。'
          : '已恢复首页展示，无需再次支付。'
      )
      await refresh()
    },
    onError: (err) => setError(homeError(err)),
  })
  const avatar = useMutation({
    mutationFn: async (value: string) => {
      const result = await request<CreatorHomeState>('/me/home/avatar', {
        method: 'put',
        data: { avatar: value },
      })
      if (!preview) await saveAccountIdentity({ avatar: value })
      return result
    },
    onSuccess: async () => {
      setMessage('头像已同步至中转站和社区。')
      await refresh()
    },
    onError: (err) => setError(homeError(err)),
  })
  const pending =
    busy ||
    submit.isPending ||
    purchase.isPending ||
    display.isPending ||
    avatar.isPending
  if (query.isPending) return <p role='status'>正在加载首页展示…</p>
  if (query.isError) {
    return (
      <div role='alert'>
        <p>{homeError(query.error)}</p>
        <Button onClick={() => void query.refetch()}>重试</Button>
      </div>
    )
  }
  const canPay =
    !!card &&
    card.status === 'approved' &&
    !card.hidden &&
    !card.permanent &&
    !image &&
    query.data.config.galleryEnabled
  let payLabel = `确认支付 ${cost} 额度`
  const purchased =
    !!card?.approvedImage && !!(card.permanent || card.expiresAt)
  const valid =
    purchased && (card.permanent || card.expiresAt > query.dataUpdatedAt / 1000)
  const paused = !!card?.ownerPaused
  const canRestore = valid && !card?.hidden && query.data.config.galleryEnabled
  const displayAction = paused ? '恢复展示' : '暂停展示'
  let displayStatus = '尚未开通首页展示'
  if (purchased) {
    displayStatus = '正在首页展示'
    if (!query.data.config.galleryEnabled) {
      displayStatus = '首页作品展示暂时关闭'
    }
    if (paused) displayStatus = '你已暂停首页展示'
    if (!valid) displayStatus = '展示已到期'
    if (card.hidden) displayStatus = '管理员已暂停展示'
  }
  if (card?.permanent) payLabel = '已开通永久展示'
  else if (
    card?.expiresAt &&
    card.expiresAt > query.dataUpdatedAt / 1000 &&
    plan === 'year'
  ) {
    payLabel = '支付 5 额度续期一年'
  }
  return (
    <div className='ch-home-panel'>
      <header className='ch-home-heading'>
        <span>HOME SPOTLIGHT</span>
        <h1>给你的作品，一个首页位置。</h1>
        <p>自己设计一张展示卡片，让更多人发现你的创作。</p>
      </header>
      <div className='ch-home-steps'>
        <span>
          <i>1</i>选择已发布作品
        </span>
        <span>
          <i>2</i>上传卡片并审核
        </span>
        <span>
          <i>3</i>支付后开始展示
        </span>
      </div>
      <div className='ch-home-layout'>
        <div className='ch-home-form'>
          <section className='ch-home-box'>
            <h2>
              <LayoutTemplate />
              首页展示卡片
            </h2>
            <label htmlFor='home-work'>展示哪个作品</label>
            <NativeSelect
              id='home-work'
              value={work?.id ?? ''}
              disabled={pending || !published.length}
              onChange={(e) => {
                setSelected(e.target.value)
                setImage('')
                setError('')
                setMessage('')
              }}
            >
              {!published.length && (
                <option value=''>暂无可展示的已发布作品</option>
              )}
              {published.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </NativeSelect>
            {!published.length && (
              <p>
                先在创作工作台发布作品，通过审核后即可选择。
                <Link to='/creators/studio'>去创作 →</Link>
              </p>
            )}
            <div className='ch-home-upload'>
              <ImagePlus />
              <strong>上传你的卡片图片</strong>
              <span>推荐 900 × 1200 px · 其他尺寸自动适配为 3:4</span>
              <small>PNG / JPEG / WebP · 5 MB 以内 · 不限制原图比例</small>
              <Input
                type='file'
                accept='image/png,image/jpeg,image/webp'
                aria-label='上传首页展示卡片'
                disabled={pending || !work}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setBusy(true)
                  setError('')
                  setMessage('')
                  void prepareHomeImage(file)
                    .then(setImage)
                    .catch((err) => setError(homeError(err)))
                    .finally(() => setBusy(false))
                }}
              />
            </div>
            <p className='ch-home-tip'>
              卡片会自动等比例缩放并居中放入 3:4
              画布，完整保留图片，不拉伸、不裁切。
              非推荐比例可能出现留白，小图放大后清晰度可能降低，请以右侧预览为准。
            </p>
            {card && (
              <div className='ch-home-status'>
                <span>
                  {
                    {
                      review: '卡片审核中',
                      approved: '卡片已通过审核',
                      rejected: '卡片需修改',
                    }[card.status]
                  }
                </span>
                <span>{homeExpiry(card)}</span>
                {card.hidden && <span>管理员已暂停展示</span>}
                {card.note && <p>{card.note}</p>}
              </div>
            )}
            {card?.approvedImage && image && (
              <p>新卡片需要重新审核；审核期间已开通的展示继续使用原卡片。</p>
            )}
            <Button
              disabled={
                !poster ||
                !work ||
                pending ||
                (!image && card?.status !== 'rejected')
              }
              onClick={() => {
                setError('')
                setMessage('')
                submit.mutate()
              }}
            >
              {submit.isPending ? '提交中…' : '提交卡片审核'}
            </Button>
          </section>
          <section className='ch-home-box'>
            <h2>
              {paused ? <Pause /> : <Play />}
              展示管理
            </h2>
            <p role='status'>{displayStatus}</p>
            <p>
              暂停仅将卡片从首页轮播中隐藏，作品详情与购买资格保留；恢复无需再次支付。
              暂停不退款、不延长有效期，一年套餐仍按原到期日计时。
            </p>
            <Button
              variant='outline'
              disabled={pending || !purchased || (paused && !canRestore)}
              onClick={() => {
                setError('')
                setMessage('')
                display.mutate(!paused)
              }}
            >
              {paused ? <Play /> : <Pause />}
              {display.isPending ? '更新中…' : displayAction}
            </Button>
            {!purchased && (
              <small>卡片审核通过并支付后，即可自行暂停或恢复。</small>
            )}
            {paused && !canRestore && (
              <small>
                恢复需展示资格有效、作品正常公开，且管理员已允许展示。
              </small>
            )}
          </section>
          <section className='ch-home-box'>
            <h2>
              <Sparkles />
              选择展示时长
            </h2>
            <div className='ch-home-plans'>
              {(['year', 'permanent'] as const).map((value) => (
                <label key={value} data-selected={plan === value}>
                  <input
                    type='radio'
                    name='home-plan'
                    value={value}
                    checked={plan === value}
                    onChange={() => setPlan(value)}
                    disabled={pending}
                  />
                  {value === 'year' ? <Clock3 /> : <InfinityIcon />}
                  <strong>{value === 'year' ? '一年展示' : '永久展示'}</strong>
                  <b>
                    {value === 'year' ? 5 : 10}
                    <small> 额度</small>
                  </b>
                  <span>
                    {value === 'year'
                      ? '支付后起算一年，可手动续期'
                      : '一次支付，长期保留展示资格'}
                  </span>
                  {plan === value && <Check className='ch-home-plan-check' />}
                </label>
              ))}
            </div>
            <p className='ch-home-wallet'>
              <Wallet />
              钱包余额{' '}
              <strong>
                {query.data.balance.toLocaleString('zh-CN', {
                  maximumFractionDigits: 4,
                })}{' '}
                额度
              </strong>
            </p>
            <p>
              按作品支付，参与首页轮播；不自动续费。年费升级永久需另付 10
              额度。作品或账号被下架时，首页同步隐藏。
            </p>
            {!query.data.config.galleryEnabled && (
              <p role='status'>管理员暂时关闭了首页作品展示，当前不可支付。</p>
            )}
            <Button
              className='cc-primary'
              disabled={!canPay || pending || query.data.balance < cost}
              onClick={() => {
                setError('')
                setMessage('')
                setConfirm(true)
              }}
            >
              {payLabel}
            </Button>
            {!canPay && !card?.permanent && (
              <small className='ch-home-payment-note'>
                卡片通过审核后可支付；提交审核不会扣款。
              </small>
            )}
            {canPay && query.data.balance < cost && (
              <p role='alert'>余额不足，请先到钱包充值。</p>
            )}
          </section>
        </div>
        <aside className='ch-home-preview'>
          <span>首页展示预览</span>
          <div className='ch-home-poster'>
            {poster ? (
              <img src={poster} alt='首页卡片预览' />
            ) : (
              <div>
                <LayoutTemplate />
                <strong>
                  你的设计
                  <br />
                  在这里亮相
                </strong>
                <span>推荐 900 × 1200</span>
                <small>自动适配 3 : 4</small>
              </div>
            )}
          </div>
          <h3>{work?.title || '你的作品标题'}</h3>
          <p>{work?.author || '创作者'}</p>
          <small>首页会以弧形卡片轮播展示，点击进入作品详情。</small>
        </aside>
      </div>
      <section className='ch-home-box ch-home-avatar'>
        <div className='ch-home-avatar-sample'>
          {author?.avatar ? (
            <img src={author.avatar} alt='' />
          ) : (
            <span>{author?.name?.slice(0, 1) || '你'}</span>
          )}
        </div>
        <div>
          <h2>首页创作者头像</h2>
          <p>
            新创作者默认加入首页滚动名单。管理员可以调整显示、顺序和头像；与作品付费展示分别管理。
          </p>
          <small>
            {author?.visible ? '当前加入滚动名单' : '当前未在滚动名单展示'} ·
            任意比例图片自动居中裁成正方形 · PNG / JPEG / WebP · 5 MB 以内
          </small>
          <Input
            type='file'
            accept='image/png,image/jpeg,image/webp'
            aria-label='上传创作者头像'
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setBusy(true)
              setError('')
              void prepareHomeImage(file, true)
                .then((value) => avatar.mutateAsync(value))
                .catch((err) => setError(homeError(err)))
                .finally(() => setBusy(false))
            }}
          />
        </div>
      </section>
      {error && (
        <p className='ch-home-feedback' role='alert'>
          {error}
        </p>
      )}
      {message && (
        <p className='ch-home-feedback ch-home-success' role='status'>
          {message}
        </p>
      )}
      {!!query.data.orders.length && (
        <section className='ch-home-box'>
          <h2>展示记录</h2>
          {query.data.orders.map((order) => (
            <p className='ch-home-order' key={order.id}>
              <strong>
                {query.data.works.find((w) => w.id === order.workId)?.title ??
                  order.workId}
              </strong>
              <span>
                {order.credits} 额度 · {homeExpiry(order)}
              </span>
              <small>
                {new Date(order.createdAt * 1000).toLocaleDateString('zh-CN')}
              </small>
            </p>
          ))}
        </section>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={(value) => {
          if (!purchase.isPending) setConfirm(value)
        }}
        title={`支付 ${cost} 额度，${plan === 'year' ? '展示一年' : '永久展示'}`}
        desc={
          <span>
            将从钱包扣除 {cost} 额度，为「{work?.title}」开通
            {plan === 'year' ? '一年' : '永久'}首页展示。
            {preview ? '这是本地测试支付，不会扣除线上余额。' : ''}
          </span>
        }
        confirmText={`确认支付 ${cost} 额度`}
        handleConfirm={() => purchase.mutateAsync().then(() => undefined)}
        isLoading={purchase.isPending}
      />
    </div>
  )
}
