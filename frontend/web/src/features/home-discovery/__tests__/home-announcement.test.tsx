import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { HomeAnnouncement } from '../home-announcement'

afterEach(() => vi.restoreAllMocks())

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <HomeAnnouncement />
    </QueryClientProvider>
  )
}

it('retains the current homepage announcement and expands only its first section', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: '# **公告测试**\n第一段公告内容\n\n---\n\n# 历史公告\n较早的公告内容',
    },
  })
  show()
  const title = await screen.findByText('公告测试')
  const summary = title.closest('summary')
  expect(summary).not.toBeNull()
  expect(screen.getByText('第一段公告内容')).not.toBeVisible()
  await userEvent.click(title)
  expect(screen.getByText('第一段公告内容')).toBeVisible()
  expect(screen.queryByText('历史公告')).not.toBeInTheDocument()
  expect(screen.queryByText('较早的公告内容')).not.toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith(
    '/api/notice',
    expect.objectContaining({ headers: { 'Cache-Control': null } })
  )
})

it('does not reserve an empty announcement card when the server has no announcement', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: '  \n  ' } })
  const { container } = show()
  await waitFor(() => expect(get).toHaveBeenCalled())
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})

it('keeps a notice request failure from replacing the homepage with an error card', async () => {
  const get = vi.spyOn(api, 'get').mockRejectedValue(new Error('unavailable'))
  const { container } = show()
  await waitFor(() => expect(get).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})
