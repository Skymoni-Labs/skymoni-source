import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { About } from '..'
import { getAboutContent } from '../api'

vi.mock('../api', () => ({ getAboutContent: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => <div>{props.children}</div>,
}))
vi.mock('@/components/animate-in-view', () => ({
  AnimateInView: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
}))
vi.mock('@/components/rich-content', () => ({
  RichContent: (props: {
    content: string
    mode: string
    htmlVariant?: string
  }) => (
    <article aria-label={props.htmlVariant || props.mode}>
      {props.content}
    </article>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderAbout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })
  return render(
    <QueryClientProvider client={client}>
      <RouterContextProvider router={router}>
        <About />
      </RouterContextProvider>
    </QueryClientProvider>
  )
}

test('an empty configured About shows the brand page and a reachable three-step API guide', async () => {
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: '',
  })
  renderAbout()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
    'A place for your ideas.'
  )
  expect(
    screen.getByRole('link', { name: 'Quick start guide' })
  ).toHaveAttribute('href', '#guide')
  const guide = screen.getByRole('region', {
    name: 'Your first connection, step by step.',
  })
  expect(guide).toHaveAttribute('id', 'guide')
  expect(within(guide).getAllByRole('listitem')).toHaveLength(3)
  expect(within(guide).getByText('https://skymoni.com/v1')).toBeVisible()
  for (const [name, href] of [
    ['Explore models', '/pricing'],
    ['Explore software', '/software'],
    ['Explore the store', '/store'],
  ]) {
    expect(
      screen
        .getAllByRole('link', { name })
        .every((link) => link.getAttribute('href') === href)
    ).toBe(true)
  }
  expect(
    screen.getByRole('link', { name: 'Get corresponding source' })
  ).toHaveAttribute('href', '/open-source.html#source')
})

test('administrator Markdown replaces the default brand page', async () => {
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: '# Custom introduction',
  })
  renderAbout()
  expect(
    await screen.findByRole('article', { name: 'markdown' })
  ).toHaveTextContent('# Custom introduction')
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
})

test('administrator HTML keeps isolated rendering', async () => {
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: '<section>Custom page</section>',
  })
  renderAbout()
  expect(
    await screen.findByRole('article', { name: 'isolated' })
  ).toHaveTextContent('Custom page')
})

test('administrator URL keeps the existing sandboxed embed', async () => {
  vi.mocked(getAboutContent).mockResolvedValue({
    success: true,
    message: '',
    data: 'https://example.com/about',
  })
  renderAbout()
  expect(await screen.findByTitle('About')).toHaveAttribute(
    'src',
    'https://example.com/about'
  )
  expect(screen.getByTitle('About')).toHaveAttribute(
    'sandbox',
    'allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
  )
})
