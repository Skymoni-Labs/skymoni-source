import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorStore } from '@/stores/creator-store'

import { CreatorGallery } from '../gallery'
import { emptyWork, type Work } from '../types'

const published: Work[] = [
  { ...emptyWork(), id: 'web', title: 'Public website', status: 'published' },
  {
    ...emptyWork(),
    id: 'design',
    title: 'Design kit',
    tags: 'Figma',
    category: 'design',
    status: 'published',
  },
  {
    ...emptyWork(),
    id: 'icons',
    title: 'Icon resources',
    category: 'design',
    status: 'published',
  },
]

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
beforeEach(() => {
  localStorage.clear()
  useCreatorStore.setState({ works: [], published, showcase: null, saved: [] })
})
afterEach(cleanup)
function gallery() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SoftwareTestRouter>
        <CreatorGallery />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}

test('choosing a category shows only projects in that category', async () => {
  gallery()
  await userEvent.click(
    screen.getByRole('button', { name: 'Design & resources' })
  )
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(
    screen.getByRole('heading', { name: 'Design kit' })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', {
      name: 'Public website',
    })
  ).not.toBeInTheDocument()
})
test('search matches project tags and presents an actionable empty state for unmatched text', async () => {
  gallery()
  const search = screen.getByRole('textbox', {
    name: 'Search projects, tags or creators',
  })
  await userEvent.type(search, 'Figma')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  await userEvent.clear(search)
  await userEvent.type(search, 'unmatched-project')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByText('No matching projects')).toBeInTheDocument()
  await userEvent.click(
    screen.getAllByRole('button', {
      name: 'Explore everything',
    })[1]
  )
  expect(screen.getAllByRole('article')).toHaveLength(3)
})
test('bookmarking by keyboard adds the project to the saved collection', async () => {
  gallery()
  const first = screen.getAllByRole('article')[0]
  const button = within(first).getByRole('button', { name: 'Save project' })
  button.focus()
  await userEvent.keyboard('{Enter}')
  expect(
    within(first).getByRole('button', { name: 'Remove from saved projects' })
  ).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(useCreatorStore.getState().saved).toEqual(['web'])
})
test('an empty public catalogue never falls back to illustrative projects', () => {
  useCreatorStore.setState({ published: [] })
  gallery()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(screen.getByText('No matching projects')).toBeInTheDocument()
})
test('opening saved projects with no bookmarks explains how to start a collection', async () => {
  gallery()
  await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
  expect(
    screen.getByText('Your inspiration collection starts here')
  ).toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})
