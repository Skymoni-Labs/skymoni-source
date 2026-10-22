import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Bookmark,
  Trash2,
  CircleHelp,
  Code2,
  Compass,
  FileText,
  FolderOpen,
  GitBranch,
  Home,
  Image,
  LayoutGrid,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  UserRound,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { CommunitySignupLabel } from '@/features/community/access-copy'
import { useAuthStore } from '@/stores/auth-store'

import { CreatorGuide } from '../creator-center/components/creator-guide'
import { loadCommunityMeta } from './api'
import { CommunityAppearance } from './appearance'
import { CommunityModuleTransition } from './module-transition'
import { CommunityNotifications } from './notifications'
import { DaylightCloudBackground, SkyCloudCompanion } from './sky-decorations'
import { CommunityTopicLinks } from './topic-navigation'
import { categoryFallback } from './types'

function CommunitySidebar(props: { onNavigate?: () => void }) {
  const user = useAuthStore((state) => state.auth.user)
  const location = useRouterState({ select: (state) => state.location })
  const workspaceTab =
    new URLSearchParams(location.searchStr).get('tab') ?? 'overview'
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 60000,
    retry: false,
  })
  const categories = meta.data?.categories ?? categoryFallback
  return (
    <nav
      className='sf-sidebar-nav'
      aria-label='社区导航'
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('a[href]')
        ) {
          props.onNavigate?.()
        }
      }}
    >
      <div className='sf-nav-group'>
        <Link
          to='/creators'
          activeOptions={{ exact: true, includeSearch: true }}
          activeProps={{ 'aria-current': 'page' }}
        >
          <MessageCircle />
          全部话题
        </Link>
        <Link
          to='/creators'
          search={{ view: 'new' }}
          activeOptions={{ exact: true, includeSearch: true }}
          activeProps={{ 'aria-current': 'page' }}
        >
          <Sparkles />
          最新发布
        </Link>

        <Link
          to='/creators'
          search={{ view: 'bookmarks' }}
          activeOptions={{ exact: true, includeSearch: true }}
          activeProps={{ 'aria-current': 'page' }}
        >
          <Bookmark />
          收藏的话题
        </Link>
        <Link
          to='/creators'
          search={{ view: 'mine' }}
          activeOptions={{ exact: true, includeSearch: true }}
          activeProps={{ 'aria-current': 'page' }}
        >
          <FileText />
          我的话题
        </Link>
      </div>
      {user && (
        <div className='sf-nav-group'>
          <Link
            to='/creators'
            search={{ view: 'trash' }}
            activeOptions={{ exact: true, includeSearch: true }}
          >
            <Trash2 />
            话题回收站
          </Link>
        </div>
      )}
      <div className='sf-nav-group'>
        <h2>应用与体验</h2>
        <a href='/skivu/'>
          <Sparkles />
          探索 Skivu
        </a>
        <Link
          to='/creators/skivu-beta'
          activeProps={{ 'aria-current': 'page' }}
        >
          <CircleHelp />
          内测中心
        </Link>
      </div>
      <details
        className='sf-nav-group sf-category-section'
        open={location.pathname === '/creators'}
      >
        <summary>
          话题分类 <span>{categories.length}</span>
          <ChevronDown aria-hidden />
        </summary>
        {categories.map((category) => (
          <Link
            key={category.id}
            to='/creators'
            search={{ category: category.id }}
            activeOptions={{ exact: true, includeSearch: true }}
            activeProps={{ 'aria-current': 'page' }}
          >
            <i
              className='sf-category-dot'
              style={{ backgroundColor: category.color }}
            />
            {category.name}
            {category.topics > 0 && <small>{category.topics}</small>}
          </Link>
        ))}
        {user?.role === 100 && (
          <Link
            to='/creators/moderation'
            hash='community-categories'
            className='sf-category-manage-link'
          >
            <Plus />
            添加 / 管理分类
          </Link>
        )}
      </details>
      <div className='sf-nav-group'>
        <h2>作品与创作</h2>
        <Link to='/creators/projects' activeProps={{ 'aria-current': 'page' }}>
          <LayoutGrid />
          作品广场
        </Link>
        <Link
          to='/creators/workspace'
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'overview'
              ? 'page'
              : undefined
          }
        >
          <FolderOpen />
          工作台总览
        </Link>
        <Link
          to='/creators/workspace'
          search={{ tab: 'projects' }}
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'projects'
              ? 'page'
              : undefined
          }
        >
          <LayoutGrid />
          我的作品
        </Link>
        <Link
          to='/creators/workspace'
          search={{ tab: 'saved' }}
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'saved'
              ? 'page'
              : undefined
          }
        >
          <Bookmark />
          收藏的作品
        </Link>
        <Link to='/creators/studio' activeProps={{ 'aria-current': 'page' }}>
          <Plus />
          发布 / 编辑作品
        </Link>
        <Link
          to='/creators/workspace'
          search={{ tab: 'github' }}
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'github'
              ? 'page'
              : undefined
          }
        >
          <GitBranch />
          GitHub 导入
        </Link>
        <Link
          to='/creators/workspace'
          search={{ tab: 'distribution' }}
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'distribution'
              ? 'page'
              : undefined
          }
        >
          <Code2 />
          软件版本与附件
        </Link>
        <Link
          to='/creators/workspace'
          search={{ tab: 'homepage' }}
          aria-current={
            location.pathname === '/creators/workspace' &&
            workspaceTab === 'homepage'
              ? 'page'
              : undefined
          }
        >
          <Image />
          首页展示卡片
        </Link>
        <Link to='/creators/profile' activeProps={{ 'aria-current': 'page' }}>
          <UserRound />
          我的创作主页
        </Link>
        <Link to='/creators/explore' activeProps={{ 'aria-current': 'page' }}>
          <Compass />
          高级作品筛选
        </Link>
      </div>
      {user?.role === 100 && (
        <div className='sf-nav-group'>
          <h2>社区管理</h2>
          <Link to='/creators/moderation' hash='community-categories'>
            <LayoutGrid />
            分类管理
          </Link>
          <Link
            to='/creators/moderation'
            activeProps={{ 'aria-current': 'page' }}
          >
            <Settings2 />
            论坛与举报管理
          </Link>
          <Link to='/creators/manage' activeProps={{ 'aria-current': 'page' }}>
            <Settings2 />
            作品审核与展示管理
          </Link>
        </div>
      )}
      <div className='sf-nav-group sf-sidebar-footer'>
        <Link
          to='/creators/guidelines'
          activeProps={{ 'aria-current': 'page' }}
        >
          <CircleHelp />
          社区指南
        </Link>
        <a href='/'>
          <Home />
          API 中转站
          <ArrowUpRight />
        </a>
        <a href='/open-source.html'>
          <Code2 />
          开源与许可
        </a>
      </div>
    </nav>
  )
}

export function CommunityLayout(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const navigate = useNavigate()
  const searchString = useRouterState({
    select: (state) => state.location.searchStr,
  })
  const [searchDraft, setSearchDraft] = useState({
    route: searchString,
    value: new URLSearchParams(searchString).get('q') ?? '',
  })
  const search =
    searchDraft.route === searchString
      ? searchDraft.value
      : (new URLSearchParams(searchString).get('q') ?? '')
  const setSearch = (value: string) =>
    setSearchDraft({ route: searchString, value })
  const [menu, setMenu] = useState(false)
  let section = '社区交流'
  for (const [pattern, label] of [
    [/\/workspace/, '创作者工作台'],
    [/\/studio/, '作品编辑器'],
    [/\/(moderation|manage)/, '社区管理'],
    [/\/(profile|people|members)/, '个人主页'],
    [/\/(projects|explore|works)/, '作品与灵感'],
    [/\/new|\/edit$/, '分享与创作'],
    [/\/guidelines/, '社区指南'],
    [/\/skivu-beta/, 'Skivu 内测中心'],
  ] as const) {
    if (pattern.test(pathname)) {
      section = label
      break
    }
  }
  useEffect(() => {
    const previous = document.title
    document.title = 'skymoni 社区'
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <div className='hp-page cc-page cp-platform community-shell'>
      <DaylightCloudBackground />
      <a className='cp-skip-link' href='#creator-content'>
        {t('Skip to content')}
      </a>
      <header className='sf-header'>
        <div className='sf-header-inner'>
          <Sheet open={menu} onOpenChange={setMenu}>
            <SheetTrigger
              className='sf-menu-toggle'
              render={
                <Button variant='ghost' size='icon' aria-label='打开社区导航' />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side='left' className='sf-mobile-sidebar'>
              <SheetTitle>skymoni 社区</SheetTitle>
              <CommunitySidebar onNavigate={() => setMenu(false)} />
            </SheetContent>
          </Sheet>
          <Link to='/creators' className='sf-brand' aria-label='skymoni 社区'>
            <span className='sf-brand-mark'>
              <img
                src='/branding/skymoni-cloud-friend-transparent.png'
                alt=''
                width={44}
                height={44}
              />
            </span>
            <strong>
              skymoni<span>社区</span>
            </strong>
          </Link>
          <nav className='sf-module-nav' aria-label='社区模块'>
            <Link
              to='/creators'
              activeOptions={{ exact: true }}
              aria-current={
                /^\/creators(?:$|\/(?:topics|new|moderation|members|guidelines))/.test(
                  pathname
                )
                  ? 'page'
                  : undefined
              }
            >
              <MessageCircle />
              论坛交流
            </Link>
            <Link
              to='/creators/projects'
              activeOptions={{ exact: true }}
              aria-current={
                /^\/creators\/(?:projects|explore|works|people)(?:\/|$)/.test(
                  pathname
                )
                  ? 'page'
                  : undefined
              }
            >
              <LayoutGrid />
              作品广场
            </Link>
            <Link
              to='/creators/workspace'
              activeOptions={{ exact: true }}
              aria-current={
                /^\/creators\/(?:workspace|studio|profile|manage|join|github)(?:\/|$)/.test(
                  pathname
                )
                  ? 'page'
                  : undefined
              }
            >
              <FolderOpen />
              创作者工作台
            </Link>
            <CommunityTopicLinks />
          </nav>
          <form
            className='sf-header-search'
            role='search'
            onSubmit={(event) => {
              event.preventDefault()
              void navigate({
                to: '/creators',
                search: { q: search.trim() || undefined },
              })
            }}
          >
            <Search aria-hidden />
            <Input
              aria-label='搜索论坛话题'
              placeholder='搜索论坛话题…'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label='清空社区搜索'
                onClick={() => {
                  setSearch('')
                  void navigate({ to: '/creators', search: {} })
                }}
              >
                <X />
              </Button>
            )}
            <Button
              size='icon'
              type='submit'
              variant='ghost'
              aria-label='搜索社区'
            >
              <Search />
            </Button>
          </form>
          <div className='sf-header-actions'>
            <span className='sf-guide'>
              <CreatorGuide />
            </span>
            <span className='sf-language'>
              <LanguageSwitcher />
            </span>
            <CommunityAppearance />
            {user && <CommunityNotifications />}
            {user ? (
              <ProfileDropdown context='creator' />
            ) : (
              <>
                <Button
                  variant='ghost'
                  size='sm'
                  render={
                    <Link
                      to='/sign-in'
                      search={{ redirect: pathname + searchString }}
                    />
                  }
                >
                  登录
                </Button>
                <Button
                  className='sf-login'
                  size='sm'
                  render={
                    <Link
                      to='/sign-up'
                      search={{ redirect: pathname + searchString }}
                    />
                  }
                >
                  <CommunitySignupLabel />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className='sf-frame'>
        <aside className='sf-sidebar'>
          <CommunitySidebar />
          <SkyCloudCompanion />
        </aside>
        <div id='creator-content' className='sf-main' tabIndex={-1}>
          <CommunityModuleTransition>
            {pathname !== '/creators' && (
              <div className='sf-section-bar'>
                <nav aria-label='当前位置'>
                  <Link to='/creators'>社区</Link>
                  <ChevronRight aria-hidden />
                  <span>{section}</span>
                </nav>
                <Link to='/creators/guidelines'>
                  <CircleHelp />
                  使用指南
                </Link>
              </div>
            )}
            {props.children}
          </CommunityModuleTransition>
          <footer className='sf-footer'>
            <span>skymoni 社区 · 分享、交流、一起创造</span>
            <Link to='/creators/guidelines'>社区指南</Link>
            <a href='/open-source.html'>开源许可</a>
          </footer>
        </div>
      </div>
    </div>
  )
}
