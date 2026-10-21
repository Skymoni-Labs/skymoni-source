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
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Dialog } from '@/components/dialog'
import { useAuthStore } from '@/stores/auth-store'
import { guestHasRead, usePopupNoticeStore } from '@/stores/popup-notice-store'

import { PopupNoticeHost } from '../components/popup-notice-host'
import type { PopupNoticeDelivery } from '../types'

const api = vi.hoisted(() => ({
  getAvailablePopupNotices: vi.fn(),
  acknowledgePopupNotice: vi.fn(),
}))
const session = vi.hoisted(() => ({ resolveAuthentication: vi.fn() }))
vi.mock('../api', () => api)
vi.mock('@/lib/auth-session', () => session)
const clients: QueryClient[] = []

function notice(
  id = 1,
  frequency: PopupNoticeDelivery['frequency'] = 'once'
): PopupNoticeDelivery {
  return {
    id,
    title: `Popup ${id}`,
    content: 'Welcome to skymoni',
    format: 'text',
    frequency,
    start_at: 0,
    end_at: 0,
    priority: 0,
    revision: 1,
    published_at: 100,
  }
}

function renderHost() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return {
    client,
    view: render(
      <QueryClientProvider client={client}>
        <PopupNoticeHost />
      </QueryClientProvider>
    ),
  }
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset('complete')
  usePopupNoticeStore.setState({ guestReads: {}, visitDismissals: {} })
  api.getAvailablePopupNotices.mockReset().mockResolvedValue([notice()])
  api.acknowledgePopupNotice.mockReset().mockResolvedValue(undefined)
  session.resolveAuthentication.mockReset().mockImplementation(async () => {
    useAuthStore.getState().auth.reset('complete')
    return { kind: 'anonymous' }
  })
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
})

describe('popup delivery', () => {
  test('an idle hintless public visitor resolves identity once before requesting guest popups', async () => {
    let resolveIdentity: () => void = () => {}
    session.resolveAuthentication.mockImplementationOnce(() => {
      useAuthStore.getState().auth.setBootstrapState('checking')
      return new Promise((resolve) => {
        resolveIdentity = () => {
          useAuthStore.getState().auth.reset('complete')
          resolve({ kind: 'anonymous' })
        }
      })
    })
    useAuthStore.getState().auth.reset('idle')
    renderHost()
    expect(session.resolveAuthentication).toHaveBeenCalledOnce()
    expect(api.getAvailablePopupNotices).not.toHaveBeenCalled()
    await act(async () => resolveIdentity())
    expect(
      await screen.findByRole('dialog', { name: 'Popup 1' })
    ).toBeInTheDocument()
    expect(api.getAvailablePopupNotices).toHaveBeenCalledWith(
      null,
      expect.any(AbortSignal),
      undefined
    )
    expect(session.resolveAuthentication).toHaveBeenCalledOnce()
  })

  test('a valid hintless refresh session receives user popups without ever requesting guest popups', async () => {
    session.resolveAuthentication.mockImplementationOnce(async () => {
      useAuthStore.getState().auth.setBootstrapState('checking')
      useAuthStore
        .getState()
        .auth.setUser({ id: 10, username: 'alice', role: 1 })
      useAuthStore.getState().auth.setBootstrapState('complete')
      return { kind: 'authenticated' }
    })
    useAuthStore.getState().auth.reset('idle')
    renderHost()
    expect(
      await screen.findByRole('dialog', { name: 'Popup 1' })
    ).toBeInTheDocument()
    expect(api.getAvailablePopupNotices).toHaveBeenCalledWith(
      10,
      expect.any(AbortSignal),
      undefined
    )
    expect(
      api.getAvailablePopupNotices.mock.calls.some((call) => call[0] === null)
    ).toBe(false)
  })

  test('a transient identity-resolution failure does not repeatedly resolve or assume a guest', async () => {
    session.resolveAuthentication.mockImplementationOnce(async () => {
      useAuthStore.getState().auth.setBootstrapState('checking')
      useAuthStore.getState().auth.setBootstrapState('idle')
      return { kind: 'transient_error' }
    })
    useAuthStore.getState().auth.reset('idle')
    renderHost()
    await waitFor(() =>
      expect(session.resolveAuthentication).toHaveBeenCalledOnce()
    )
    expect(api.getAvailablePopupNotices).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('waits for authentication bootstrap before requesting visitor messages', async () => {
    useAuthStore.getState().auth.setBootstrapState('checking')
    renderHost()
    expect(api.getAvailablePopupNotices).not.toHaveBeenCalled()
    act(() => useAuthStore.getState().auth.setBootstrapState('complete'))
    expect(
      await screen.findByRole('dialog', { name: 'Popup 1' })
    ).toBeInTheDocument()
    expect(api.getAvailablePopupNotices).toHaveBeenCalledWith(
      null,
      expect.any(AbortSignal),
      undefined
    )
  })

  test('keeps its own popup stable after DOM mutations and acknowledges on keyboard close', async () => {
    renderHost()
    const dialog = await screen.findByRole('dialog', { name: 'Popup 1' })
    await act(async () => {
      const marker = document.createElement('span')
      document.body.append(marker)
      marker.remove()
    })
    expect(screen.getByRole('dialog', { name: 'Popup 1' })).toBe(dialog)
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(usePopupNoticeStore.getState().guestReads['1:1']).toBeDefined()
    expect(api.acknowledgePopupNotice).not.toHaveBeenCalled()
  })

  test('a content author nested dialog role does not suppress or reopen the popup', async () => {
    api.getAvailablePopupNotices.mockResolvedValue([
      {
        ...notice(),
        format: 'markdown',
        content: '<div role="dialog">Content inside the popup</div>',
      },
    ])
    renderHost()
    const popup = await screen.findByRole('dialog', { name: 'Popup 1' })
    await act(async () => {
      document.body.append(document.createElement('span'))
    })
    expect(screen.getByRole('dialog', { name: 'Popup 1' })).toBe(popup)
    expect(screen.getByText('Content inside the popup')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Popup 1' })
      ).not.toBeInTheDocument()
    )
  })

  test('defers automatic popup until an existing dialog is closed', async () => {
    const blocker = render(
      <Dialog open title='Existing operation' onOpenChange={() => {}}>
        Keep working
      </Dialog>
    )
    renderHost()
    await waitFor(() =>
      expect(api.getAvailablePopupNotices).toHaveBeenCalledOnce()
    )
    expect(
      screen.queryByRole('dialog', { name: 'Popup 1' })
    ).not.toBeInTheDocument()
    blocker.unmount()
    expect(
      await screen.findByRole('dialog', { name: 'Popup 1' })
    ).toBeInTheDocument()
  })

  test('switching identities never renders the previous user private message', async () => {
    useAuthStore.getState().auth.setUser({ id: 10, username: 'alice', role: 1 })
    api.getAvailablePopupNotices.mockImplementation((userId: number | null) =>
      Promise.resolve(userId === 10 ? [notice(10)] : [])
    )
    const { view } = renderHost()
    expect(
      await screen.findByRole('dialog', { name: 'Popup 10' })
    ).toBeInTheDocument()
    act(() =>
      useAuthStore.getState().auth.setUser({ id: 20, username: 'bob', role: 1 })
    )
    view.rerender(
      <QueryClientProvider client={clients[0]}>
        <PopupNoticeHost />
      </QueryClientProvider>
    )
    expect(
      screen.queryByRole('dialog', { name: 'Popup 10' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.getAvailablePopupNotices).toHaveBeenCalledWith(
        20,
        expect.any(AbortSignal),
        undefined
      )
    )
  })

  test('a failed acknowledgement closes this visit but is not permanently stored for the user', async () => {
    useAuthStore.getState().auth.setUser({ id: 10, username: 'alice', role: 1 })
    api.acknowledgePopupNotice.mockRejectedValue(new Error('Offline'))
    renderHost()
    await screen.findByRole('dialog', { name: 'Popup 1' })
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(api.acknowledgePopupNotice).toHaveBeenCalledWith(
      notice(),
      10,
      expect.any(AbortSignal)
    )
    expect(usePopupNoticeStore.getState().guestReads).toEqual({})
    act(() => usePopupNoticeStore.setState({ visitDismissals: {} }))
    expect(
      await screen.findByRole('dialog', { name: 'Popup 1' })
    ).toBeInTheDocument()
  })

  test('a read first page fetches the next keyset page and delivers its popup', async () => {
    const first = Array.from({ length: 20 }, (_, index) => notice(40 - index))
    usePopupNoticeStore.setState({
      guestReads: Object.fromEntries(
        first.map((item) => [`${item.id}:1`, 100])
      ),
    })
    api.getAvailablePopupNotices
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([notice(20)])
    renderHost()
    expect(
      await screen.findByRole('dialog', { name: 'Popup 20' })
    ).toBeInTheDocument()
    expect(api.getAvailablePopupNotices).toHaveBeenLastCalledWith(
      null,
      expect.any(AbortSignal),
      { after_id: 21, after_priority: 0 }
    )
  })

  test('visit frequency does not repeat on remounting or SPA navigation', async () => {
    api.getAvailablePopupNotices.mockResolvedValue([notice(1, 'visit')])
    const { view, client } = renderHost()
    await screen.findByRole('dialog', { name: 'Popup 1' })
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    view.unmount()
    render(
      <QueryClientProvider client={client}>
        <PopupNoticeHost />
      </QueryClientProvider>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('daily visitors reset at Beijing midnight and new revisions remain unread', () => {
    const beforeMidnight = Date.UTC(2026, 9, 4, 15, 59) / 1000
    const afterMidnight = Date.UTC(2026, 9, 4, 16, 1) / 1000
    expect(
      guestHasRead(
        notice(1, 'daily'),
        { '1:1': beforeMidnight },
        beforeMidnight
      )
    ).toBe(true)
    expect(
      guestHasRead(notice(1, 'daily'), { '1:1': beforeMidnight }, afterMidnight)
    ).toBe(false)
    expect(
      guestHasRead(
        { ...notice(), revision: 2 },
        { '1:1': beforeMidnight },
        beforeMidnight
      )
    ).toBe(false)
  })

  test('blocked browser storage still permits a visitor to close the popup', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked')
    })
    renderHost()
    await screen.findByRole('dialog', { name: 'Popup 1' })
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(usePopupNoticeStore.getState().visitDismissals.guest).toContain(
      '1:1'
    )
  })

  test('an unavailable feed leaves the page usable without a popup', async () => {
    api.getAvailablePopupNotices.mockRejectedValue(new Error('Offline'))
    renderHost()
    await waitFor(() =>
      expect(
        clients[0].getQueryState(['popup-notices', 'available', 'guest'])
          ?.status
      ).toBe('error')
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
