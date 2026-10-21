import { cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'

import { githubCallback } from '../github-api'
import { CreatorGitHubCallback } from '../github-callback'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../github-api', () => ({ githubCallback: vi.fn() }))
afterEach(cleanup)
beforeEach(() => {
  vi.mocked(githubCallback).mockReset()
})

test('Strict Mode exchanges a code once, strips the query, and returns to the GitHub workspace', async () => {
  vi.mocked(githubCallback).mockResolvedValue({ cancelled: false })
  window.history.replaceState(
    {},
    '',
    '/creators/github/callback?code=fixture-code&state=fixture-state'
  )
  render(
    <SoftwareTestRouter>
      <StrictMode>
        <CreatorGitHubCallback code='fixture-code' state='fixture-state' />
      </StrictMode>
    </SoftwareTestRouter>
  )
  expect(
    await screen.findByText(
      'GitHub is connected. Choose a repository to import.'
    )
  ).toBeInTheDocument()
  expect(githubCallback).toHaveBeenCalledTimes(1)
  expect(window.location.search).toBe('')
  expect(
    screen.getByRole('button', { name: 'Return to workspace' })
  ).toHaveAttribute('href', '/creators/workspace?tab=github')
})

test('cancelled and failed exchanges give a useful return path without retrying a one-use code', async () => {
  vi.mocked(githubCallback).mockRejectedValue(new Error('expired'))
  render(
    <SoftwareTestRouter>
      <CreatorGitHubCallback code='expired' state='state' />
    </SoftwareTestRouter>
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Authorization could not be completed.'
  )
  expect(githubCallback).toHaveBeenCalledTimes(1)
})
