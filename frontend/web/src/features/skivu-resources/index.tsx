import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Image,
  Play,
  Menu,
  Puzzle,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { SkivuPluginInstall } from '@/features/software-center/skivu-plugin-install'
import {
  loadSkivuPlugins,
  skivuPluginQueryKey,
  type SkivuPluginEntry,
} from '@/features/software-center/skivu-plugins'

import {
  loadResourceWallpapers,
  loadSkivuRelease,
  type ResourceWallpaper,
} from './catalog'
import { SkivuExperience, SkivuStory } from './experience'

import '@/styles/skivu-resources.css'

const categories = {
  'ui-preset': '界面包',
  skill: '内容技能',
  'mcp-http': 'MCP 工具',
  'web-plugin': '互动插件',
} as const
const nav = [
  ['探索体验', '#experience'],
  ['软件下载', '#download'],
  ['插件', '#plugins'],
  ['壁纸', '#wallpapers'],
  ['使用指南', '#guide'],
]

function ResourceStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  if (loading) {
    return (
      <p className='sr-status' role='status'>
        正在获取最新资源…
      </p>
    )
  }
  if (!error) return null
  return (
    <div className='sr-status' role='status'>
      <span>资源暂时未能加载，请稍后重试。</span>
      <button type='button' onClick={onRetry}>
        <RefreshCw size={15} />
        重新加载
      </button>
    </div>
  )
}

export function SkivuResources() {
  const initialHash = useRef(window.location.hash)
  const initialAnchorHandled = useRef(false)
  const visitorInteracted = useRef(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [wallpaper, setWallpaper] = useState<ResourceWallpaper | null>(null)
  const [plugin, setPlugin] = useState<SkivuPluginEntry | null>(null)
  const release = useQuery({
    queryKey: ['skivu', 'public-release'],
    queryFn: ({ signal }) => loadSkivuRelease(signal),
    staleTime: 60000,
    retry: 1,
  })
  const plugins = useQuery({
    queryKey: skivuPluginQueryKey,
    queryFn: ({ signal }) => loadSkivuPlugins(signal),
    staleTime: 60000,
    retry: 1,
  })
  const wallpapers = useQuery({
    queryKey: ['skivu', 'wallpapers'],
    queryFn: ({ signal }) => loadResourceWallpapers(signal),
    staleTime: 60000,
    retry: 1,
  })
  useEffect(() => {
    const onScrollIntent = () => {
      visitorInteracted.current = true
    }
    window.addEventListener('wheel', onScrollIntent, { passive: true })
    window.addEventListener('touchmove', onScrollIntent, { passive: true })
    window.addEventListener('pointerdown', onScrollIntent, { passive: true })
    window.addEventListener('keydown', onScrollIntent)
    return () => {
      window.removeEventListener('wheel', onScrollIntent)
      window.removeEventListener('touchmove', onScrollIntent)
      window.removeEventListener('pointerdown', onScrollIntent)
      window.removeEventListener('keydown', onScrollIntent)
    }
  }, [])
  useEffect(() => {
    if (
      initialAnchorHandled.current ||
      !release.isFetched ||
      !plugins.isFetched ||
      !wallpapers.isFetched
    )
      return
    initialAnchorHandled.current = true
    // Restore a deep link after async catalogues have established page height.
    // Leave manual browsing or a newer section choice where the visitor put it.
    if (
      !initialHash.current ||
      visitorInteracted.current ||
      window.location.hash !== initialHash.current
    )
      return
    let id: string
    try {
      id = decodeURIComponent(initialHash.current.slice(1))
    } catch {
      return
    }
    document
      .getElementById(id)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [release.isFetched, plugins.isFetched, wallpapers.isFetched])
  const q = search.trim().toLocaleLowerCase()
  const filtered = (plugins.data?.items ?? []).filter(
    (item) =>
      (category === 'all' || item.format === category) &&
      [item.name, item.description, item.author, item.pluginId]
        .join(' ')
        .toLocaleLowerCase()
        .includes(q)
  )

  useEffect(() => {
    const previous = document.title
    document.title = 'Skivu · 一个属于你的 AI 空间'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className='sr-page' id='home'>
      <a href='#sr-main' className='sr-skip'>
        跳到主要内容
      </a>
      <header className='sr-header'>
        <a className='sr-brand' href='#home' aria-label='Skivu 首页'>
          <img src='/skivu/assets/skivu.png' alt='' width={36} height={36} />
          <strong>
            Skivu<span>你的 AI 空间</span>
          </strong>
        </a>
        <nav
          id='sr-mobile-nav'
          className={mobileOpen ? 'sr-nav is-open' : 'sr-nav'}
          aria-label='Skivu 资源导航'
        >
          {nav.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMobileOpen(false)}>
              {label}
            </a>
          ))}
          <a className='sr-relay' href='/'>
            中转站首页
            <ArrowUpRight size={16} />
          </a>
        </nav>
        <button
          type='button'
          className='sr-menu'
          aria-label={mobileOpen ? '收起导航' : '展开导航'}
          aria-expanded={mobileOpen}
          aria-controls='sr-mobile-nav'
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </header>
      <main id='sr-main'>
        <section className='sr-hero' aria-labelledby='sr-title'>
          <img
            className='sr-hero-backdrop'
            src='/skivu/assets/universe-hero-20261025.webp'
            alt=''
            fetchPriority='high'
          />
          <div className='sr-hero-copy'>
            <p className='sr-eyebrow'>
              <span />
              YOUR UNIVERSE. YOUR RULES.
            </p>
            <h1 id='sr-title'>
              让想象，
              <br />
              <em>有自己的宇宙。</em>
            </h1>
            <p className='sr-lead'>
              一个属于你的 AI 空间。
              <br />
              自由选择模型，定义角色与外观，
              <br />
              让每一次对话，都走向新的可能。
            </p>
            <div className='sr-actions'>
              <a className='sr-button sr-primary' href='#download'>
                <ArrowDownToLine size={18} />
                下载 Skivu
                <ArrowUpRight size={17} />
              </a>
              <a className='sr-button sr-secondary' href='#experience'>
                探索你的空间
                <ArrowRight size={18} />
              </a>
            </div>
            <a className='sr-hero-film' href='#film'>
              <Play size={13} />
              观看品牌短片<span>00:40</span>
            </a>
          </div>
          <div className='sr-hero-coordinate' aria-hidden>
            <span>SKIVU / OPEN UNIVERSE</span>
            <strong>
              无限可能
              <br />
              由你定义
            </strong>
            <span>EXPLORE BEYOND THE ORDINARY ↗</span>
          </div>
          <div className='sr-hero-baseline'>
            <span>SCROLL TO DISCOVER</span>
            <span>
              多模型对话 <i>✦</i> 角色与陪伴 <i>✦</i> 开放插件
            </span>
            <a href='#experience' aria-label='向下探索 Skivu'>
              <ArrowDownToLine size={17} />
            </a>
          </div>
        </section>
        <div className='sr-quick-links' aria-label='资源快捷入口'>
          {[
            {
              icon: Smartphone,
              title: '软件下载',
              note: release.data
                ? `公开版 v${release.data.version}`
                : 'Android 客户端',
              href: '#download',
            },
            {
              icon: Puzzle,
              title: '插件广场',
              note: plugins.data
                ? `${plugins.data.items.length} 款开放插件`
                : '让能力继续延伸',
              href: '#plugins',
            },
            {
              icon: Image,
              title: '云端壁纸',
              note: wallpapers.data
                ? `${wallpapers.data.length} 张精选风景`
                : '找到你的风景',
              href: '#wallpapers',
            },
            {
              icon: BookOpen,
              title: '使用指南',
              note: '从第一步到更多可能',
              href: '#guide',
            },
          ].map((item) => (
            <a key={item.href} href={item.href}>
              <span className='sr-quick-icon'>
                <item.icon size={23} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </div>
              <ArrowUpRight size={17} />
            </a>
          ))}
        </div>

        <SkivuExperience />
        <section
          className='sr-section sr-download'
          id='download'
          aria-labelledby='sr-download-title'
        >
          <div className='sr-download-copy'>
            <p className='sr-eyebrow'>02 / TAKE YOUR SPACE WITH YOU</p>
            <h2 id='sr-download-title'>
              把你的空间，
              <br />
              带在身边。
            </h2>
            <p>
              自由选择模型，延伸对话与创作。
              <br />
              从一个 App 开始，搭建适合自己的 AI 空间。
            </p>
            <div className='sr-download-features'>
              <span>
                <Check />
                多模型对话
              </span>
              <span>
                <Check />
                外观自定义
              </span>
              <span>
                <Check />
                插件扩展
              </span>
              <span>
                <Check />
                角色配置
              </span>
            </div>
          </div>
          <div className='sr-release-card'>
            <div className='sr-release-heading'>
              <img
                src='/skivu/assets/skivu.png'
                alt=''
                width={52}
                height={52}
              />
              <div>
                <h3>Skivu for Android</h3>
                <p>官方公开发布版</p>
              </div>
              <span className='sr-tag'>Android</span>
            </div>
            <ResourceStatus
              loading={release.isPending}
              error={release.isError}
              onRetry={() => void release.refetch()}
            />
            {release.data && (
              <>
                <div className='sr-release-info'>
                  <span>
                    当前版本<strong>v{release.data.version}</strong>
                  </span>
                  <span>
                    安装包大小
                    <strong>
                      {(release.data.size / 1024 ** 2).toFixed(1)} MB
                    </strong>
                  </span>
                  <span>
                    架构<strong>arm64-v8a</strong>
                  </span>
                </div>
                <a
                  className='sr-button sr-primary sr-download-button'
                  href={release.data.url}
                  download
                >
                  <ArrowDownToLine size={18} />
                  下载 Android 安装包
                  <ArrowUpRight size={17} />
                </a>
                <p className='sr-download-note'>
                  <ShieldCheck size={14} />
                  本站直接下载 · 无需跳转 GitHub
                </p>
                <details className='sr-release-notes'>
                  <summary>版本更新与校验信息</summary>
                  <p>{release.data.notes}</p>
                  <small>SHA-256</small>
                  <code>{release.data.sha256}</code>
                </details>
              </>
            )}
          </div>
        </section>

        <section
          className='sr-section'
          id='plugins'
          aria-labelledby='sr-plugins-title'
        >
          <span className='sr-anchor' id='ecosystem' />
          <div className='sr-section-heading'>
            <div>
              <p className='sr-eyebrow'>03 / AN OPEN UNIVERSE</p>
              <h2 id='sr-plugins-title'>给 Skivu，更多可能。</h2>
              <p>界面、技能、工具和互动体验，找到适合你的那一块。</p>
            </div>
            <span className='sr-count'>
              {plugins.data
                ? `${plugins.data.items.length} 个插件`
                : '开放插件目录'}
            </span>
          </div>
          <div className='sr-plugin-toolbar'>
            <div className='sr-filters' aria-label='插件分类'>
              {[['all', '全部插件'], ...Object.entries(categories)].map(
                ([key, label]) => (
                  <button
                    type='button'
                    key={key}
                    aria-pressed={category === key}
                    onClick={() => setCategory(key)}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
            <label className='sr-search'>
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='搜索插件名称或作者'
                aria-label='搜索插件名称或作者'
              />
            </label>
          </div>
          <ResourceStatus
            loading={plugins.isPending}
            error={plugins.isError}
            onRetry={() => void plugins.refetch()}
          />
          {Boolean(
            plugins.data?.unavailableSources.length ||
            plugins.data?.rejectedItems
          ) && (
            <p className='sr-status'>
              部分插件暂未加载，已显示可用目录。
              <button type='button' onClick={() => void plugins.refetch()}>
                重新加载
              </button>
            </p>
          )}
          {plugins.data && !filtered.length && (
            <p className='sr-empty'>
              没有找到匹配的插件，试试其他关键词或分类。
            </p>
          )}
          <div className='sr-plugin-grid'>
            {filtered.map((item) => (
              <article className='sr-plugin-card' key={item.id}>
                <div className='sr-plugin-heading'>
                  <span className={`sr-plugin-icon sr-kind-${item.format}`}>
                    <Puzzle size={25} />
                  </span>
                  <span className='sr-tag'>{categories[item.format]}</span>
                </div>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className='sr-plugin-meta'>
                  <span>{item.author}</span>
                  <span>v{item.version}</span>
                </div>
                <small>适用 Skivu {item.minHostVersion} 及以上</small>
                <div className='sr-plugin-actions'>
                  <button type='button' onClick={() => setPlugin(item)}>
                    查看详情
                    <ArrowUpRight size={15} />
                  </button>
                  <SkivuPluginInstall entry={item} />
                </div>
              </article>
            ))}
          </div>
          <p className='sr-section-note'>
            <ShieldCheck size={15} />
            插件安装和权限确认在 Skivu 内完成。
          </p>
        </section>

        <section
          className='sr-section'
          id='wallpapers'
          aria-labelledby='sr-wallpapers-title'
        >
          <div className='sr-section-heading'>
            <div>
              <p className='sr-eyebrow'>04 / A CHANGE OF SCENERY</p>
              <h2 id='sr-wallpapers-title'>让每次打开，都像你。</h2>
              <p>同一片云端风景，在 Skivu 与 Skymoni 中各自选择。</p>
            </div>
            <button
              type='button'
              className='sr-text-button'
              onClick={() => void wallpapers.refetch()}
              disabled={wallpapers.isFetching}
            >
              <RefreshCw size={16} />
              刷新壁纸
            </button>
          </div>
          <ResourceStatus
            loading={wallpapers.isPending}
            error={wallpapers.isError}
            onRetry={() => void wallpapers.refetch()}
          />
          {wallpapers.data?.length === 0 && (
            <p className='sr-empty'>新的壁纸正在准备中。</p>
          )}
          <div className='sr-wallpaper-grid'>
            {wallpapers.data?.map((item) => (
              <button
                type='button'
                className='sr-wallpaper-card'
                key={item.id}
                onClick={() => setWallpaper(item)}
                aria-label={`预览${item.name}`}
              >
                <div>
                  <img src={item.thumbnail} alt='' loading='lazy' />
                  <span>
                    预览壁纸
                    <ArrowUpRight size={17} />
                  </span>
                </div>
                <h3>{item.name}</h3>
                <p>
                  {item.width} × {item.height}
                  <ArrowUpRight size={18} />
                </p>
              </button>
            ))}
          </div>
          <div className='sr-wallpaper-tip'>
            <Image size={21} />
            <div>
              <strong>在 App 里，直接选。</strong>
              <p>
                Skivu → 设置 → 外观与体验 → 背景 →
                云端壁纸。列表同步更新，当前背景各自保存。
              </p>
            </div>
          </div>
        </section>

        <SkivuStory />
        <section
          className='sr-section sr-guides'
          id='guide'
          aria-labelledby='sr-guides-title'
        >
          <div className='sr-section-heading'>
            <div>
              <p className='sr-eyebrow'>05 / YOUR NEXT STEP</p>
              <h2 id='sr-guides-title'>下一步，轻松一点。</h2>
            </div>
          </div>
          <div className='sr-guide-grid'>
            {[
              {
                icon: BookOpen,
                title: '使用文档',
                text: '了解模型配置、对话和功能使用，从第一步开始。',
                href: '/docs',
                action: '阅读使用指南',
              },
              {
                icon: Puzzle,
                title: '插件怎么安装？',
                text: '打开 App 的插件市场，找到插件，确认权限后启用。',
                href: '#plugins',
                action: '发现适合你的插件',
              },
              {
                icon: Sparkles,
                title: '一起让 Skivu 更好',
                text: '了解内测计划，在社区分享想法和使用反馈。',
                href: '/creators/skivu-beta',
                action: '前往内测中心',
              },
            ].map((item) => (
              <a key={item.href} href={item.href}>
                <item.icon size={25} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <strong>
                  {item.action}
                  <ArrowUpRight size={17} />
                </strong>
              </a>
            ))}
          </div>
        </section>
      </main>
      <footer className='sr-footer'>
        <a className='sr-brand' href='/skivu/'>
          <img src='/skivu/assets/skivu.png' alt='' width={30} height={30} />
          <strong>Skivu</strong>
        </a>
        <p>一个属于你的 AI 空间。</p>
        <a href='/'>
          中转站首页
          <ArrowUpRight size={16} />
        </a>
        <a
          href='https://github.com/skyjjgw/skivu'
          target='_blank'
          rel='noopener noreferrer'
        >
          GitHub 开源
          <ArrowUpRight size={16} />
        </a>
        <a href='/open-source.html'>开源许可</a>
        <a href='/skivu/assets/sources.html'>素材声明</a>
      </footer>

      <Dialog
        open={wallpaper !== null}
        onOpenChange={(open) => {
          if (!open) setWallpaper(null)
        }}
      >
        <DialogContent className='sr-wallpaper-dialog'>
          {wallpaper && (
            <>
              <DialogTitle>{wallpaper.name}</DialogTitle>
              <DialogDescription>
                {wallpaper.description || '为你的 Skivu 选一片风景。'}
              </DialogDescription>
              <img src={wallpaper.url} alt={wallpaper.name} />
              <p>
                {wallpaper.width} × {wallpaper.height} ·{' '}
                {(wallpaper.size / 1024).toFixed(0)} KB
              </p>
              <a
                className='sr-button sr-primary'
                href={wallpaper.url}
                download={`${wallpaper.name}.jpg`}
              >
                <ArrowDownToLine size={17} />
                下载壁纸
              </a>
              <p className='sr-dialog-note'>
                也可在 Skivu 的「外观与体验 → 背景 →
                云端壁纸」中直接选择；预览不会更换 App 背景。
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={plugin !== null}
        onOpenChange={(open) => {
          if (!open) setPlugin(null)
        }}
      >
        <DialogContent className='sr-plugin-dialog'>
          {plugin && (
            <>
              <DialogTitle>{plugin.name}</DialogTitle>
              <DialogDescription>{plugin.description}</DialogDescription>
              <dl>
                <div>
                  <dt>作者</dt>
                  <dd>{plugin.author}</dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>{plugin.version}</dd>
                </div>
                <div>
                  <dt>兼容版本</dt>
                  <dd>Skivu ≥ {plugin.minHostVersion}</dd>
                </div>
                <div>
                  <dt>许可证</dt>
                  <dd>{plugin.license}</dd>
                </div>
              </dl>
              <h3>声明的权限</h3>
              <p>
                {plugin.permissions.length
                  ? plugin.permissions.join(' · ')
                  : '未声明额外权限'}
              </p>
              {plugin.networkDomains.length > 0 && (
                <p>网络域名：{plugin.networkDomains.join(' · ')}</p>
              )}
              <SkivuPluginInstall entry={plugin} />
              <a
                href={plugin.sourceUrl}
                target='_blank'
                rel='noopener noreferrer'
              >
                查看开源项目
                <ArrowUpRight size={15} />
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
