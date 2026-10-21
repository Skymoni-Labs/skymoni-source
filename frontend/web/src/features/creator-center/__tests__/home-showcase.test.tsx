import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { CreatorHomeShowcase } from '../home-showcase'

test('moved homepage section preserves real creator links and excludes example authors', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  })
  client.setQueryData(['home-creator-public'], {
    config: { galleryEnabled: false, marqueeEnabled: true },
    works: [],
    authors: [
      {
        userId: 8,
        name: 'Ada',
        avatar: '/ada.png',
        visible: true,
        position: 0,
      },
      { userId: 0, name: 'Example', sample: true, visible: true, position: 1 },
    ],
  })
  render(
    <QueryClientProvider client={client}>
      <CreatorHomeShowcase />
    </QueryClientProvider>
  )
  const links = screen.getAllByRole('link', { name: /Ada/ })
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) {
    expect(link).toHaveAttribute('href', '/creators/people/8')
  }
  expect(screen.queryByText('Example')).not.toBeInTheDocument()
  client.clear()
})
