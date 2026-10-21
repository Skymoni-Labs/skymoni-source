import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ProjectContent } from '../components/project-content'
import { emptyWork } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)

test('imported README renders formatting and source-relative links without executable or tracking media', () => {
  const work = {
    ...emptyWork(),
    title: 'Board',
    blocks: [
      {
        id: 'readme',
        type: 'markdown' as const,
        title: 'README',
        text: '# Hardware guide\n\n- Read the [guide](docs/start.md)\n\n<script>alert(1)</script><iframe src="https://tracker.invalid"></iframe><img src="https://tracker.invalid/pixel"><svg onload="alert(1)"></svg><p style="position:fixed" onclick="alert(1)">Safe text</p>\n\n[Unsafe](javascript:alert(1))',
        url: 'https://github.com/author/board/blob/main/README.md',
        visible: true,
      },
    ],
  }
  const { container } = render(<ProjectContent work={work} />)
  expect(
    screen.getByRole('heading', { name: 'Hardware guide' })
  ).toBeInTheDocument()
  const guide = screen.getByRole('link', { name: 'guide' })
  expect(guide).toHaveAttribute(
    'href',
    'https://github.com/author/board/blob/main/docs/start.md'
  )
  expect(guide).toHaveAttribute('rel', 'noopener noreferrer')
  const readme = container.querySelector('.cc-content-box .prose')
  expect(readme).not.toBeNull()
  expect(
    readme?.querySelector(
      'script, iframe, img, svg, [onclick], [style="position:fixed"]'
    )
  ).toBeNull()
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  expect(screen.getByText('Safe text')).toBeInTheDocument()
})
