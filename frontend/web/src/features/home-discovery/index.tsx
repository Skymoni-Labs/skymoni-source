import { Anthropic, DeepSeek, Gemini, OpenAI } from '@lobehub/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Code2,
  Download,
  Mail,
  Monitor,
  Palette,
  ShoppingBag,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { PublicHeader } from '@/components/layout/components/public-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreatorHomeShowcase } from '@/features/creator-center/home-showcase'
import { AppDownload } from '@/features/home-preview/app-download'
import { HomeFooter } from '@/features/home-preview/footer'
import { PreviewHero } from '@/features/home-preview/hero'
import { ModelMarquee } from '@/features/home-preview/model-marquee'
import { HeroTerminalDemo } from '@/features/home/components/hero-terminal-demo'
import { SupportedApplications } from '@/features/home/components/supported-applications'
import { publicPreviewProducts } from '@/features/shop-public-preview/catalog'
import { loadPublicSoftware } from '@/features/software-center/api'
import { SoftwareArtwork } from '@/features/software-center/artwork'

import { HomeAnnouncement } from './home-announcement'

import '@/styles/home-preview.css'
import '@/styles/software-center.css'
import '@/styles/creator-center.css'
import '@/styles/home-discovery.css'
import '@/styles/creator-home.css'
import '@/styles/home-readability.css'

const cloud = '/branding/skymoni-cloud-friend-transparent.png'
const ideaScenes = [
  {
    label: '聊一聊',
    title: '把一个问题，聊成新的想法。',
    detail: '从聊天、写作到理解代码，找到合拍的 AI。',
    action: '发现模型',
    href: '/pricing',
    icon: Boxes,
    tone: 'blue',
  },
  {
    label: '做点东西',
    title: '让工具，接住你的下一步。',
    detail: '找一款编程助手，把脑海里的点子做出来。',
    action: '发现好工具',
    href: '/software',
    icon: Code2,
    tone: 'mint',
  },
  {
    label: '找点灵感',
    title: '下一份灵感，也许就在这里。',
    detail: '看看别人的作品，或分享自己的小小创造。',
    action: '看看创作',
    href: '/creators',
    icon: Palette,
    tone: 'violet',
  },
]

function IdeaSwitcher() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [canCycle, setCanCycle] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const playing = canCycle && !hovered && !focused
  useEffect(() => {
    const node = cardRef.current
    if (!node) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const sync = () =>
      setCanCycle(visible && !document.hidden && !motion.matches)
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { threshold: 0.35 }
    )
    observer.observe(node)
    motion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      motion.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(
      () => setActive((value) => (value + 1) % ideaScenes.length),
      4000
    )
    return () => window.clearTimeout(timer)
  }, [active, playing])
  const scene = ideaScenes[active]
  const Icon = scene.icon
  return (
    <div
      ref={cardRef}
      className={`hn-idea-switcher hn-tone-${scene.tone}`}
      data-playing={playing}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false)
        }
      }}
    >
      <div className='hn-idea-tabs' role='group' aria-label='选一个灵感起点'>
        <span>
          <img src={cloud} alt='' /> 今天想…
        </span>
        {ideaScenes.map((item, index) => (
          <button
            key={item.label}
            type='button'
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            {item.label}
            {active === index && (
              <i key={active} className='hn-idea-progress' aria-hidden />
            )}
          </button>
        ))}
      </div>
      <a className='hn-idea-scene' key={scene.label} href={scene.href}>
        <span className='hn-path-icon'>
          <Icon />
        </span>
        <span className='hn-idea-copy'>
          <strong>{scene.title}</strong>
          <small>{scene.detail}</small>
        </span>
        <span className='hn-idea-action'>
          {scene.action}
          <ArrowUpRight />
        </span>
      </a>
    </div>
  )
}

function useMotionSections() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const sections = [
      ...node.querySelectorAll<HTMLElement>(
        '.hn-hero, .ad-section, .hn-software-wrap, .hn-creators, .hn-avatar-marquee, .hn-more-wrap'
      ),
    ]
    const visible = new Set<Element>()
    const sync = () =>
      sections.forEach((section) => {
        section.dataset.motion =
          visible.has(section) && !document.hidden ? 'running' : 'paused'
      })
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target)
          else visible.delete(entry.target)
        })
        sync()
      },
      { rootMargin: '40px' }
    )
    sections.forEach((section) => observer.observe(section))
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])
  return ref
}

function DiscoveryHero() {
  return (
    <section
      className='hn-hero hn-centered-hero'
      id='discover'
      aria-labelledby='hn-heading'
    >
      <h1 className='sr-only' id='hn-heading'>
        skymoni，连接模型、工具与创作。
      </h1>
      <PreviewHero creatorEntry trackingEyes />
    </section>
  )
}

function ModelDiscovery() {
  return (
    <section
      className='hn-shell hn-section hn-models'
      id='models'
      aria-labelledby='hn-model-heading'
    >
      <AnimateInView className='hn-model-copy'>
        <p className='hn-kicker'>
          <span>01</span> MODEL ACCESS
        </p>
        <h2 id='hn-model-heading'>
          一个入口，
          <br />
          连接更多 AI 的能力。
        </h2>
        <p className='hn-description'>
          从聊天、写作到开发，把熟悉的模型接入你的工作流。先看看价格与支持的协议，再选择适合自己的方式。
        </p>
        <div className='hn-providers' aria-label='模型提供商'>
          <span>
            <OpenAI />
            OpenAI
          </span>
          <span>
            <Anthropic />
            Claude
          </span>
          <span>
            <Gemini.Color />
            Gemini
          </span>
          <span>
            <DeepSeek.Color />
            DeepSeek
          </span>
        </div>
        <div className='hn-actions'>
          <Button className='hn-primary' render={<a href='/pricing' />}>
            逛逛模型广场 <ArrowRight aria-hidden />
          </Button>
          <a className='hn-text-link' href='/about'>
            接入文档 <ArrowUpRight />
          </a>
        </div>
        <IdeaSwitcher />
        <SupportedApplications className='hn-supported' />
      </AnimateInView>
      <AnimateInView className='hn-terminal' delay={100}>
        <div className='hn-terminal-label'>
          <span />
          <span>一个接口，几种熟悉的方式。</span>
          <Code2 />
        </div>
        <HeroTerminalDemo className='hn-terminal-window' />
        <p>点击切换协议，看看请求与响应如何连接。</p>
      </AnimateInView>
      <AnimateInView className='hn-marquee'>
        <ModelMarquee />
      </AnimateInView>
    </section>
  )
}

const softwareTabs = [
  {
    id: 'selected',
    label: '精选推荐',
    ids: ['skymoni-mail', 'codex', 'cursor'],
  },
  {
    id: 'own',
    label: 'skymoni 软件',
    ids: ['drip', '96b2ad63-7355-4fe9-b7e8-92a8ac85abd8', 'skymoni-mail'],
  },
  { id: 'code', label: '编程工具', ids: ['codex', 'cursor', 'trae'] },
]

function SoftwareDiscovery() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('selected')
  const query = useQuery({
    queryKey: ['software-public'],
    queryFn: ({ signal }) => loadPublicSoftware(signal),
    staleTime: 60_000,
    retry: false,
  })
  const published = query.data?.items.filter((item) => item.published) ?? []
  const selected =
    softwareTabs.find((item) => item.id === tab) ?? softwareTabs[0]
  const rows = selected.ids.flatMap(
    (id) => published.find((item) => item.id === id) ?? []
  )
  return (
    <section
      className='hn-software-wrap'
      id='software'
      aria-labelledby='hn-software-heading'
    >
      <div className='hn-shell hn-section'>
        <AnimateInView className='hn-section-heading'>
          <div>
            <p className='hn-kicker'>
              <span>02</span> MADE FOR YOUR EVERYDAY
            </p>
            <h2 id='hn-software-heading'>把好工具，装进日常。</h2>
            <p>自己的软件，喜欢的工具，都有一个好找的入口。</p>
          </div>
          <a className='hn-text-link' href='/software'>
            探索软件中心 <ArrowRight />
          </a>
        </AnimateInView>
        <div className='hn-software-grid'>
          <AnimateInView>
            <Link
              className='hn-drip-feature'
              to='/software/$softwareId'
              params={{ softwareId: 'drip' }}
            >
              <div className='hn-drip-heading'>
                <span>
                  <img src='/static/software/drip-0.3.28.png' alt='' /> Drip
                  浏览器
                </span>
                <Badge variant='outline'>skymoni 软件</Badge>
              </div>
              <h3>给浏览，留一片自己的空间。</h3>
              <p>
                管理订阅、切换节点。让打开浏览器的那一刻，
                <br />
                也可以有一点自己的节奏。
              </p>
              <span className='hn-feature-link'>
                了解 Drip <ArrowUpRight />
              </span>
              <div className='hn-browser'>
                <div>
                  <span>
                    <i />
                    <i />
                    <i />
                  </span>
                  <small>Drip Browser</small>
                  <Monitor />
                </div>
                <img
                  src={publicPreviewProducts[0].coverUrl}
                  alt='Drip 浏览器的新标签页'
                  loading='lazy'
                />
              </div>
              <span className='hn-drip-platform'>
                <Monitor /> Windows <span>·</span> macOS
              </span>
            </Link>
          </AnimateInView>
          <AnimateInView className='hn-software-list' delay={100}>
            <div
              className='hn-software-tabs'
              role='group'
              aria-label='首页软件分类'
            >
              {softwareTabs.map((item) => (
                <Button
                  key={item.id}
                  variant='ghost'
                  size='sm'
                  aria-pressed={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div className='hn-software-rows'>
              {rows.map((entry) => (
                <Link
                  className='hn-software-row'
                  key={entry.id}
                  to='/software/$softwareId'
                  params={{ softwareId: entry.id }}
                >
                  <SoftwareArtwork entry={entry} />
                  <div>
                    <h3>{t(entry.name, { defaultValue: entry.name })}</h3>
                    <p>
                      {t(entry.description, {
                        defaultValue: entry.description,
                      })}
                    </p>
                    <span>{entry.platform}</span>
                  </div>
                  <ArrowUpRight />
                </Link>
              ))}
              {query.isLoading && (
                <div className='hn-catalog-message'>正在发现好工具…</div>
              )}
              {query.isError && (
                <div className='hn-catalog-message'>
                  软件目录暂时未能加载。
                  <Button variant='ghost' onClick={() => void query.refetch()}>
                    重新加载
                  </Button>
                </div>
              )}
              {!query.isLoading && !query.isError && !rows.length && (
                <div className='hn-catalog-message'>
                  更多工具，去软件中心看看。
                  <a href='/software'>
                    浏览软件中心 <ArrowRight />
                  </a>
                </div>
              )}
            </div>
            <div className='hn-software-note'>
              <Download />
              <div>
                <strong>免费下载，无需登录。</strong>
                <p>先看看详情，再找到适合你的版本。</p>
              </div>
            </div>
            <a href='/software' className='hn-list-footer'>
              还有更多好工具 <ArrowRight />
            </a>
          </AnimateInView>
        </div>
        <div className='hn-store-note'>
          <ShoppingBag />
          需要线路套餐或邮箱注册码？
          <a href='/store'>
            去商城看看 <ArrowUpRight />
          </a>
        </div>
      </div>
    </section>
  )
}

function MorePossibilities() {
  return (
    <section
      className='hn-more-wrap'
      id='resources'
      aria-labelledby='hn-more-heading'
    >
      <div className='hn-shell hn-section'>
        <AnimateInView className='hn-section-heading'>
          <div>
            <p className='hn-kicker'>
              <span>04</span> ALWAYS A LITTLE MORE
            </p>
            <h2 id='hn-more-heading'>接下来，也为你准备好了。</h2>
          </div>
          <span className='hn-more-subtitle'>
            让工具、资源与日常，自然地连在一起。
          </span>
        </AnimateInView>
        <div className='hn-more-grid hn-more-grid-with-git'>
          {[
            {
              title: 'Skymoni Git · 代码托管',
              label: '把代码与协作，放在一起。',
              description:
                '免费 200 MB，支持各种语言。中转站账号登录，可网页上传、团队协作或导入 GitHub 仓库。',
              href: 'https://git.skymoni.com/class-git/',
              icon: Code2,
              tone: 'blue',
            },
            {
              title: '数字商城',
              label: '为工具箱，添一点。',
              description: '线路套餐、账号与邮箱注册码，在这里找到。',
              href: '/store',
              icon: ShoppingBag,
              tone: 'peach',
            },
            {
              title: '专属邮箱',
              label: '一个属于你的地址。',
              description: '用 @skymoni.com，收下日常里的重要消息。',
              href: 'https://mail.skymoni.com',
              icon: Mail,
              tone: 'mint',
            },
            {
              title: '我的仓库',
              label: '买到的资源，有处安放。',
              description: '账号、卡密与使用说明，放在一起更好找。',
              href: '/warehouse',
              icon: Archive,
              tone: 'violet',
            },
          ].map(
            ({ title, label, description, href, icon: Icon, tone }, index) => (
              <AnimateInView key={title} delay={index * 60}>
                <a className={`hn-resource-card hn-tone-${tone}`} href={href}>
                  <span className='hn-path-icon'>
                    <Icon />
                  </span>
                  <span className='hn-resource-title'>{title}</span>
                  <h3>{label}</h3>
                  <p>{description}</p>
                  <ArrowUpRight className='hn-resource-arrow' />
                </a>
              </AnimateInView>
            )
          )}
        </div>
        <AnimateInView>
          <div className='hn-closing'>
            <img src={cloud} alt='' />
            <div>
              <h2>每个好想法，都有下一步。</h2>
              <p>从一个模型、一件工具，或你的第一份作品开始。</p>
            </div>
            <a href='#discover'>
              回到顶部 <ArrowRight />
            </a>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}

export function HomeDiscovery() {
  const motionRef = useMotionSections()
  return (
    <>
      <PublicHeader />
      <div className='hp-page hn-page' ref={motionRef}>
        <main>
          <HomeAnnouncement />
          <DiscoveryHero />
          <AppDownload />
          <ModelDiscovery />
          <SoftwareDiscovery />
          <CreatorHomeShowcase />
          <MorePossibilities />
        </main>
        <HomeFooter />
      </div>
    </>
  )
}
