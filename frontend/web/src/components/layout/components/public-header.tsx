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
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Smartphone } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { DEFAULT_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'
import { PublicHeaderGlass, PublicHeaderLinks } from './public-header-glass'

const AUTH_PROMPT_SECONDS = 5
const TOP_NAV_GAP = 13
const FLOATING_NAV_GAP = 0

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  navLinkOverrides?: Record<
    string,
    Partial<Pick<TopNavLink, 'href' | 'requiresAuth'>>
  >
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navLayout, setNavLayout] = useState<{
    width?: number
    gap: number
    compact: boolean
  }>({ gap: TOP_NAV_GAP, compact: false })
  const brandRef = useRef<HTMLDivElement>(null)
  const desktopRef = useRef<HTMLDivElement>(null)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const links = (dynamicLinks.length > 0 ? dynamicLinks : navLinks).map(
    (link) => ({ ...link, ...props.navLinkOverrides?.[link.href] })
  )

  let logoContent: ReactNode = (
    <HeaderLogo
      src={systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className='size-full rounded-lg object-contain'
    />
  )
  if (customLogo) logoContent = customLogo
  if (loading) logoContent = <Skeleton className='size-full rounded-lg' />

  let authContent = (
    <Button
      size='sm'
      className='h-9 rounded-lg px-4 text-sm font-medium'
      render={<Link to='/sign-in' />}
    >
      {t('Sign in')}
    </Button>
  )
  if (isAuthenticated) {
    authContent = (
      <div className='public-header-account flex items-center [&_[data-slot=avatar]]:size-8 [&>button]:size-8'>
        <ProfileDropdown />
      </div>
    )
  }
  if (loading) authContent = <Skeleton className='h-9 w-20 rounded-lg' />

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const brand = brandRef.current
    const desktop = desktopRef.current
    const group = desktop?.querySelector<HTMLElement>('.public-header-links')
    if (!brand || !desktop || !group) return
    const update = () => {
      const buttons = [
        ...group.querySelectorAll<HTMLElement>('a.public-header-link'),
      ]
      const textButtonsWidth = buttons.reduce(
        (sum, button) => sum + button.getBoundingClientRect().width,
        0
      )
      const toolbarWidth =
        desktop.getBoundingClientRect().width -
        group.getBoundingClientRect().width
      // Include the fixed brand gap, the original inner padding, and outer gutters.
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const base =
        brand.getBoundingClientRect().width +
        toolbarWidth +
        rem * 0.5 +
        rem * (scrolled ? 1.375 : 1) +
        rem
      const available = document.documentElement.clientWidth
      const minimumWidth = base + textButtonsWidth
      const compact = window.innerWidth < 1024 || minimumWidth > available
      const gaps = Math.max(0, buttons.length - 1)
      const desiredGap = scrolled ? FLOATING_NAV_GAP : TOP_NAV_GAP
      const gap = gaps
        ? Math.max(0, Math.min(desiredGap, (available - minimumWidth) / gaps))
        : 0
      const width = compact ? available - 16 : minimumWidth + gap * gaps
      setNavLayout((previous) =>
        Math.abs((previous.width || 0) - width) < 0.25 &&
        Math.abs(previous.gap - gap) < 0.025 &&
        previous.compact === compact
          ? previous
          : { width, gap, compact }
      )
    }
    const observer = new ResizeObserver(update)
    observer.observe(brand)
    observer.observe(desktop)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [scrolled, loading, isAuthenticated])

  useEffect(() => {
    if (!navLayout.compact) setMobileOpen(false)
  }, [navLayout.compact])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (link.requiresAuth) {
        event.preventDefault()
        if (closeMobile) {
          setMobileOpen(false)
        }
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: t(link.title),
          href: link.href,
        })
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
      }
    },
    [t]
  )

  return (
    <>
      <header className='pointer-events-none fixed inset-x-0 top-0 z-50'>
        <div
          style={{ width: navLayout.width }}
          className={cn(
            'pointer-events-auto mx-auto w-fit max-w-full px-2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
            scrolled ? 'pt-3' : 'pt-0'
          )}
        >
          <nav
            className={cn(
              'public-header-nav flex items-center justify-between gap-2 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
              scrolled
                ? 'public-header-glass-nav h-14 rounded-full pr-1.5 pl-4'
                : 'h-[4.25rem] px-2 lg:h-[4.5rem]'
            )}
            data-floating={scrolled || undefined}
          >
            {scrolled && <PublicHeaderGlass />}
            {/* Logo */}
            <div
              ref={brandRef}
              className='@container/system-brand flex w-max shrink-0 items-center gap-1 lg:min-w-28'
            >
              <Link
                to={homeUrl}
                className='group flex w-max shrink-0 items-center gap-2.5'
              >
                <div
                  className='public-header-brand-icon flex size-8 shrink-0 items-center justify-center transition-all duration-300 group-hover:scale-105'
                  data-default-logo={
                    (!customLogo && systemLogo === DEFAULT_LOGO) || undefined
                  }
                >
                  {logoContent}
                  {!customLogo && systemLogo === DEFAULT_LOGO && !loading && (
                    <img
                      src='/branding/skymoni-navigation-contrast-v1.png'
                      alt={displaySiteName}
                      className='public-header-brand-contrast'
                      width={28}
                      height={28}
                    />
                  )}
                </div>
                <span
                  className='max-w-48 truncate text-base font-semibold tracking-tight'
                  title={displaySiteName}
                >
                  {loading ? (
                    <Skeleton className='h-4 w-16' />
                  ) : (
                    displaySiteName
                  )}
                </span>
              </Link>
            </div>

            {/* Desktop nav */}
            <div
              ref={desktopRef}
              aria-hidden={navLayout.compact || undefined}
              inert={navLayout.compact}
              className={cn(
                'flex w-max shrink-0 items-center gap-0.5',
                navLayout.compact &&
                  'pointer-events-none invisible absolute right-0'
              )}
            >
              <PublicHeaderLinks gap={navLayout.gap}>
                {links.map((link) => {
                  const isActive = pathname === link.href
                  if (link.external) {
                    return (
                      <a
                        key={`${link.title}:${link.href}`}
                        href={link.href}
                        title={t(link.title)}
                        target='_blank'
                        rel='noopener noreferrer'
                        aria-disabled={link.disabled}
                        tabIndex={link.disabled ? -1 : undefined}
                        onClick={(event) => handleNavLinkClick(event, link)}
                        className={cn(
                          'public-header-link text-muted-foreground hover:text-foreground shrink-0 rounded-full px-2 py-2 text-[15px] font-medium whitespace-nowrap transition-colors duration-200 xl:px-3 xl:text-base',
                          link.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {t(link.title)}
                      </a>
                    )
                  }
                  return (
                    <Link
                      key={`${link.title}:${link.href}`}
                      to={link.href}
                      title={t(link.title)}
                      aria-current={isActive ? 'page' : undefined}
                      disabled={link.disabled}
                      onClick={(event) => handleNavLinkClick(event, link)}
                      className={cn(
                        'public-header-link shrink-0 rounded-full px-2 py-2 text-[15px] font-medium whitespace-nowrap transition-colors duration-200 xl:px-3 xl:text-base',
                        isActive
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                        link.disabled && 'pointer-events-none opacity-50'
                      )}
                    >
                      {t(link.title)}
                    </Link>
                  )
                })}
              </PublicHeaderLinks>

              {(showLanguageSwitcher ||
                showThemeSwitch ||
                showNotifications) && (
                <div className='bg-border/40 mx-2 h-4 w-px' />
              )}

              {showLanguageSwitcher && <LanguageSwitcher />}
              {showThemeSwitch && <ThemeSwitch glass />}
              {showNotifications && (
                <NotificationPopover
                  open={notifications.popoverOpen}
                  onOpenChange={notifications.setPopoverOpen}
                  unreadCount={notifications.unreadCount}
                  activeTab={notifications.activeTab}
                  onTabChange={notifications.setActiveTab}
                  notice={notifications.notice}
                  announcements={notifications.announcements}
                  loading={notifications.loading}
                />
              )}

              {showAuthButtons && (
                <>
                  <div className='bg-border/40 mx-1 h-4 w-px' />
                  {authContent}
                </>
              )}
            </div>

            {/* Mobile: compact actions + hamburger */}
            <div
              className={cn(
                'shrink-0 items-center gap-1.5',
                navLayout.compact ? 'flex' : 'hidden'
              )}
            >
              <Button
                variant='outline'
                size='sm'
                role='link'
                className='ad-mobile-entry max-[359px]:hidden'
                render={<Link to='/app' />}
              >
                <Smartphone size={14} aria-hidden='true' />
                {t('Download App')}
              </Button>
              {showThemeSwitch && <ThemeSwitch glass />}
              {showAuthButtons && !loading && isAuthenticated && (
                <ProfileDropdown />
              )}
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={t('Toggle navigation menu')}
                aria-expanded={mobileOpen}
              >
                <div className='relative size-4'>
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[7px] rotate-45' : 'top-[3px]'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[7px] -rotate-45' : 'top-[11px]'
                    )}
                  />
                </div>
              </Button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile full-screen overlay */}
      <div
        aria-hidden={!mobileOpen || !navLayout.compact}
        inert={!mobileOpen || !navLayout.compact}
        className={cn(
          'site-glass-mobile-nav bg-background/98 fixed inset-0 z-40 overflow-y-auto backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
          !navLayout.compact && 'hidden',
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div className='flex min-h-full flex-col justify-between px-8 pt-20 pb-10'>
          <nav className='flex flex-col gap-1'>
            {links.map((link, i) => {
              const isActive = pathname === link.href
              const linkClassName = cn(
                'flex items-center gap-3 py-3 text-base font-medium tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                mobileOpen
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-4 opacity-0',
                isActive ? 'text-foreground' : 'text-muted-foreground',
                link.disabled && 'pointer-events-none opacity-50'
              )
              const transitionStyle = {
                transitionDelay: mobileOpen ? `${100 + i * 50}ms` : '0ms',
              }
              if (link.external) {
                return (
                  <a
                    key={`${link.title}:${link.href}`}
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={link.disabled}
                    tabIndex={link.disabled ? -1 : undefined}
                    onClick={(event) => handleNavLinkClick(event, link, true)}
                    className={linkClassName}
                    style={transitionStyle}
                  >
                    {t(link.title)}
                  </a>
                )
              }
              return (
                <Link
                  key={`${link.title}:${link.href}`}
                  to={link.href}
                  disabled={link.disabled}
                  onClick={(event) => handleNavLinkClick(event, link, true)}
                  className={linkClassName}
                  style={transitionStyle}
                >
                  {t(link.title)}
                </Link>
              )
            })}
          </nav>

          <div
            className={cn(
              'flex flex-col gap-3 transition-all duration-500',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            )}
            style={{ transitionDelay: mobileOpen ? '250ms' : '0ms' }}
          >
            {showAuthButtons && (
              <Link
                to={isAuthenticated ? '/dashboard' : '/sign-in'}
                onClick={() => setMobileOpen(false)}
                className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
              >
                {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
