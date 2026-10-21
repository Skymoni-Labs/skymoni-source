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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { NotificationPopover } from '@/components/notification-popover'
import { useNotifications } from '@/hooks/use-notifications'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'
import { usePopupNoticeStore } from '@/stores/popup-notice-store'

import { PopupNoticeHost } from '../components/popup-notice-host'
import type {
  PopupHistoryDetail,
  PopupHistoryItem,
  PopupNoticeDelivery,
} from '../types'

const api = vi.hoisted(() => ({
  getAvailablePopupNotices: vi.fn(),
  acknowledgePopupNotice: vi.fn(),
  getPopupHistory: vi.fn(),
  getPopupHistoryDetail: vi.fn(),
}))
vi.mock('../api', () => api)
vi.mock('@/lib/api', () => ({
  getNotice: vi
    .fn()
    .mockResolvedValue({ success: true, data: 'System notice' }),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    loading: false,
    status: {
      announcements_enabled: true,
      announcements: [{ id: 1, content: 'Timeline event' }],
    },
  }),
}))
vi.mock('@/lib/auth-session', () => ({ resolveAuthentication: vi.fn() }))
const clients: QueryClient[] = []
// jsdom lacks the Web Animations API used by Base UI's real ScrollArea.
Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
})
const popup: PopupNoticeDelivery = {
  id: 1,
  title: 'Welcome popup',
  content: '**Important information**',
  format: 'markdown',
  frequency: 'once',
  revision: 1,
  priority: 0,
  start_at: 0,
  end_at: 0,
  published_at: 100,
}
const historyItem: PopupHistoryItem = {
  id: 41,
  notice_id: 1,
  revision: 1,
  title: popup.title,
  format: popup.format,
  published_at: 100,
  read_at: 200,
}
const detail: PopupHistoryDetail = { ...historyItem, content: popup.content }

function setActor(id = 10, sid = 'session-a') {
  useAuthStore.getState().auth.setBundle({
    access_token: 'test-access',
    token_type: 'Bearer',
    access_expires_at: 9999999999,
    user: { id, username: `user-${id}`, role: 1 },
    session: {
      sid,
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 0,
      last_active_at: 0,
      expires_at: 9999999999,
    },
  })
}

function HeaderHarness() {
  const notifications = useNotifications()
  return (
    <NotificationPopover
      open={notifications.popoverOpen}
      onOpenChange={notifications.setPopoverOpen}
      activeTab={notifications.activeTab}
      onTabChange={notifications.setActiveTab}
      unreadCount={notifications.unreadCount}
      notice={notifications.notice}
      announcements={notifications.announcements}
      loading={notifications.loading}
    />
  )
}

function renderHistory(withHost = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const view = render(
    <QueryClientProvider client={client}>
      {withHost && <PopupNoticeHost />}
      <HeaderHarness />
    </QueryClientProvider>
  )
  return { client, view }
}

async function openHistory() {
  await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  await userEvent.click(
    await screen.findByRole('tab', { name: 'Popup history' })
  )
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset('complete')
  setActor()
  useNotificationStore.setState({
    lastReadNotice: '',
    readAnnouncementKeys: [],
    closedUntilDate: null,
  })
  usePopupNoticeStore.setState({ guestReads: {}, visitDismissals: {} })
  api.getAvailablePopupNotices.mockReset().mockResolvedValue([])
  api.acknowledgePopupNotice.mockReset().mockResolvedValue(undefined)
  api.getPopupHistory.mockReset().mockResolvedValue([historyItem])
  api.getPopupHistoryDetail.mockReset().mockResolvedValue(detail)
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
})

describe('signed-in popup history in the notification module', () => {
  test('a popup closed with X can be reopened from history without another acknowledgement', async () => {
    api.getAvailablePopupNotices.mockResolvedValue([popup])
    api.getPopupHistory.mockImplementation(async () =>
      api.acknowledgePopupNotice.mock.calls.length ? [historyItem] : []
    )
    renderHistory(true)
    const automatic = await screen.findByRole('dialog', { name: popup.title })
    await userEvent.click(
      within(automatic).getByRole('button', { name: 'Close' })
    )
    await waitFor(() =>
      expect(api.acknowledgePopupNotice).toHaveBeenCalledOnce()
    )
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    )
    const reopened = await screen.findByRole('dialog', { name: popup.title })
    expect(
      within(reopened).getByText('Important information')
    ).toBeInTheDocument()
    expect(
      within(reopened).queryByRole('button', { name: 'Got it' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Popup history' })
    ).not.toBeInTheDocument()
    await userEvent.click(
      within(reopened).getAllByRole('button', { name: 'Close' })[0]
    )
    expect(api.acknowledgePopupNotice).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('dialog', { name: popup.title })
    ).not.toBeInTheDocument()
  })

  test.each(['guest', 'checking'] as const)(
    'the %s identity has no private history tab or requests and keeps public notifications',
    async (state) => {
      if (state === 'guest') useAuthStore.getState().auth.reset('complete')
      else useAuthStore.getState().auth.setBootstrapState('checking')
      renderHistory()
      await userEvent.click(
        screen.getByRole('button', { name: 'Notifications' })
      )
      expect(
        await screen.findByRole('tab', { name: 'Notice' })
      ).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Timeline' })).toBeInTheDocument()
      expect(
        screen.queryByRole('tab', { name: 'Popup history' })
      ).not.toBeInTheDocument()
      expect(await screen.findByText('System notice')).toBeInTheDocument()
      expect(api.getPopupHistory).not.toHaveBeenCalled()
      expect(api.getPopupHistoryDetail).not.toHaveBeenCalled()
    }
  )

  test('the existing notice and timeline tabs keep their content and read behavior with history as the third tab', async () => {
    renderHistory()
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(
      (await screen.findAllByRole('tab')).map((tab) => tab.textContent)
    ).toEqual(['Notice', 'Timeline', 'Popup history'])
    expect(await screen.findByText('System notice')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(await screen.findByText('Timeline event')).toBeInTheDocument()
    expect(useNotificationStore.getState().readAnnouncementKeys).toContain(
      'id:1'
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Notice' }))
    expect(await screen.findByText('System notice')).toBeInTheDocument()
    expect(api.getPopupHistory).not.toHaveBeenCalled()
  })

  test('pending history displays loading and then an empty state when no popups were closed', async () => {
    let finish: (items: PopupHistoryItem[]) => void = () => {}
    api.getPopupHistory.mockReturnValueOnce(
      new Promise<PopupHistoryItem[]>((resolve) => {
        finish = resolve
      })
    )
    renderHistory()
    await openHistory()
    expect(
      await screen.findByText('Loading popup history...')
    ).toBeInTheDocument()
    await act(async () => finish([]))
    expect(await screen.findByText('No popup history yet')).toBeInTheDocument()
    expect(
      screen.getByText('Popups appear here after you close them.')
    ).toBeInTheDocument()
  })

  test('history errors have a retry action that can restore the records', async () => {
    api.getPopupHistory.mockRejectedValueOnce(new Error('Offline'))
    renderHistory()
    await openHistory()
    expect(
      await screen.findByText('Unable to load popup history')
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    ).toBeInTheDocument()
  })

  test('load more uses the last receipt cursor and retains the responsive scroll container', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...historyItem,
      id: 60 - index,
      title: `Entry ${index}`,
    }))
    api.getPopupHistory
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ...historyItem, id: 40, title: 'Older popup' }])
    renderHistory()
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Load more' })
    )
    expect(
      await screen.findByRole('button', { name: 'Open popup Older popup' })
    ).toBeInTheDocument()
    expect(api.getPopupHistory).toHaveBeenLastCalledWith(
      10,
      'session-a',
      expect.any(AbortSignal),
      { after_read_at: 200, after_id: 41 }
    )
    const panel = document.querySelector('[data-slot="popover-content"]')
    expect(panel).toHaveClass(
      'max-h-[calc(100dvh-1rem)]',
      'w-[min(26rem,calc(100vw-1rem))]',
      'overflow-y-auto'
    )
    expect(panel?.querySelector('[data-slot="scroll-area"]')).toHaveClass(
      'h-[min(52dvh,28rem)]'
    )
  })

  test('detail loading and errors stay closable and can retry without acknowledging anything', async () => {
    let fail: (error: Error) => void = () => {}
    api.getPopupHistoryDetail.mockReturnValueOnce(
      new Promise<PopupHistoryDetail>((_, reject) => {
        fail = reject
      })
    )
    renderHistory()
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    )
    expect(await screen.findByText('Loading popup...')).toBeInTheDocument()
    await act(async () => fail(new Error('Offline')))
    expect(
      await screen.findByText('Unable to open this popup')
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('dialog', { name: popup.title })
    ).toBeInTheDocument()
    expect(api.acknowledgePopupNotice).not.toHaveBeenCalled()
  })

  test('switching account discards an in-flight private detail and clears the old history cache', async () => {
    let finish: (value: PopupHistoryDetail) => void = () => {}
    api.getPopupHistoryDetail.mockReturnValueOnce(
      new Promise<PopupHistoryDetail>((resolve) => {
        finish = resolve
      })
    )
    const { client } = renderHistory()
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    )
    expect(await screen.findByText('Loading popup...')).toBeInTheDocument()
    await act(async () => setActor(20, 'session-b'))
    await act(async () =>
      finish({ ...detail, content: 'Alice private content' })
    )
    expect(screen.queryByText('Alice private content')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: popup.title })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        client.getQueriesData({
          queryKey: ['popup-notices', 'history', 10, 'session-a'],
        })
      ).toEqual([])
    )
    api.getPopupHistory.mockResolvedValueOnce([])
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('No popup history yet')).toBeInTheDocument()
    expect(api.getPopupHistory).toHaveBeenLastCalledWith(
      20,
      'session-b',
      expect.any(AbortSignal),
      undefined
    )
  })

  test('a new session for the same account unmounts its old open detail and removes cached private content', async () => {
    const { client } = renderHistory()
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    )
    expect(await screen.findByText('Important information')).toBeInTheDocument()
    await act(async () => setActor(10, 'session-new'))
    expect(screen.queryByText('Important information')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        client.getQueriesData({
          queryKey: ['popup-notices', 'history', 10, 'session-a'],
        })
      ).toEqual([])
    )
  })

  test('a reopened history dialog pauses an arriving automatic popup until history is closed', async () => {
    const { client } = renderHistory(true)
    await openHistory()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open popup Welcome popup' })
    )
    const reopened = await screen.findByRole('dialog', { name: popup.title })
    await act(async () =>
      client.setQueryData(['popup-notices', 'available', 10], {
        pages: [{ ...popup, id: 2, title: 'New popup' }].map((item) => [item]),
        pageParams: [undefined],
      })
    )
    expect(
      screen.queryByRole('dialog', { name: 'New popup' })
    ).not.toBeInTheDocument()
    await userEvent.click(
      within(reopened).getAllByRole('button', { name: 'Close' })[0]
    )
    expect(
      await screen.findByRole('dialog', { name: 'New popup' })
    ).toBeInTheDocument()
    expect(api.acknowledgePopupNotice).not.toHaveBeenCalled()
  })
})
