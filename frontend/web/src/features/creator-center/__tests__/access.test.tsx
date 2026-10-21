import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorAccessStore } from '@/stores/creator-access-store'

import { CreatorAccessGate } from '../access'

const admission = vi.hoisted(() => ({ open: true }))
vi.mock('@/features/community/access-policy-api', () => ({
  useCommunityAccessPolicy: () => ({
    data: { creatorApplicationsOpen: admission.open },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)
beforeEach(() => {
  admission.open = true
  localStorage.clear()
  useCreatorAccessStore.getState().hydrate(null)
})

test('closing new creator applications removes activation controls for eligible users', () => {
  admission.open = false
  useCreatorAccessStore.setState({ mode: 'eligible' })
  render(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Private editor</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.getByRole('status')).toHaveTextContent('暂未开放新的创作者开通')
  expect(screen.queryByText('Activate creator')).not.toBeInTheDocument()
})

test('suspended creators cannot reactivate themselves and see the limited ban scope', () => {
  useCreatorAccessStore.setState({ mode: 'creator', suspended: true })
  render(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Private editor</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    '社区交流与中转站账号不受影响'
  )
  expect(screen.queryByText('Private editor')).not.toBeInTheDocument()
  expect(screen.queryByText('Activate creator')).not.toBeInTheDocument()
})
test('a forged preview identity in browser storage cannot open creator-only controls', () => {
  localStorage.setItem('skymoni-creator-access-preview-v1', 'creator')
  render(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Upload private project</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.queryByText('Upload private project')).not.toBeInTheDocument()
  expect(screen.getByText('Sign in to become a creator')).toBeInTheDocument()
})
test('an ordinary member sees the recharge requirement and no activation form', () => {
  useCreatorAccessStore.setState({ mode: 'member' })
  render(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Upload private project</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.getByText('Go to wallet')).toBeInTheDocument()
  expect(screen.queryByText('Activate creator')).not.toBeInTheDocument()
})
test('a verified creator can open the editor and logout closes it immediately', () => {
  useCreatorAccessStore.setState({ mode: 'creator' })
  const view = render(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Upload private project</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.getByText('Upload private project')).toBeInTheDocument()
  useCreatorAccessStore.getState().hydrate(null)
  view.rerender(
    <SoftwareTestRouter>
      <CreatorAccessGate>
        <button type='button'>Upload private project</button>
      </CreatorAccessGate>
    </SoftwareTestRouter>
  )
  expect(screen.queryByText('Upload private project')).not.toBeInTheDocument()
})
