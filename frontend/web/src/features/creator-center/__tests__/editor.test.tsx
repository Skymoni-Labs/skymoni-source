import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorStore } from '@/stores/creator-store'

import { creatorRequest } from '../api'
import { ProjectEditor } from '../editor'
import { emptyWork, type Work } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../api', () => ({ creatorRequest: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => {
  vi.mocked(creatorRequest)
    .mockReset()
    .mockImplementation(async (_path, options) => ({
      ...options?.data,
      revision: 'saved-revision',
    }))
  localStorage.clear()
  useCreatorStore.setState({ works: [], saved: [] })
  useCreatorAccessStore.setState({ autoApproveWorks: false })
})
afterEach(cleanup)
function editor(onSaved?: (id: string) => void, work: Work = emptyWork()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SoftwareTestRouter>
        <ProjectEditor work={work} onSaved={onSaved} />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
  return work
}
test('an incomplete project can be saved as a draft without passing publication validation', async () => {
  const onSaved = vi.fn()
  const work = editor(onSaved)
  await userEvent.type(
    screen.getByLabelText('Project title'),
    'My little project'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await waitFor(() =>
    expect(useCreatorStore.getState().works[0]).toMatchObject({
      id: work.id,
      title: 'My little project',
      status: 'draft',
    })
  )
  expect(creatorRequest).toHaveBeenCalledWith(
    `/me/works/${work.id}`,
    expect.objectContaining({ method: 'put' })
  )
  expect(localStorage.getItem('skymoni-creator-preview-v1')).toBeNull()
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(work.id))
})
test('submitting an empty project marks required fields invalid and does not save a review', async () => {
  editor()
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Submit for review' })[0]
  )
  await waitFor(() =>
    expect(screen.getByLabelText('Project title')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  )
  expect(
    screen.getByText('Give your project a title (2–80 characters)')
  ).toBeInTheDocument()
  expect(useCreatorStore.getState().works).toHaveLength(0)
})
test('a valid project combines a category and link, then submits to the server only after confirmation', async () => {
  editor()
  await userEvent.type(screen.getByLabelText('Project title'), 'Paper reader')
  await userEvent.type(
    screen.getByLabelText('Short introduction'),
    'A helpful little reading workflow.'
  )
  await userEvent.type(
    screen.getByLabelText('Project description'),
    'Read a paper, collect useful ideas, and organize your notes in one place.'
  )
  await userEvent.selectOptions(
    screen.getByLabelText('Project category'),
    'workflow'
  )
  await userEvent.type(
    screen.getByLabelText('Project link'),
    'https://example.com'
  )
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Submit for review' })[0]
  )
  expect(
    await screen.findByText('Submit this project for review?')
  ).toBeInTheDocument()
  expect(useCreatorStore.getState().works).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Submit project' }))
  await waitFor(() =>
    expect(useCreatorStore.getState().works[0]).toMatchObject({
      category: 'workflow',
      url: 'https://example.com',
      status: 'review',
    })
  )
})
test('an unsafe project URL blocks submission and explains the URL requirement', async () => {
  editor()
  await userEvent.type(
    screen.getByLabelText('Project link'),
    'javascript:alert(1)'
  )
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Submit for review' })[0]
  )
  expect(
    await screen.findByText('Enter a full http or https link')
  ).toBeInTheDocument()
  expect(screen.getByLabelText('Project link')).toHaveAttribute(
    'aria-invalid',
    'true'
  )
})
test('a server failure keeps the draft unsaved and presents an error', async () => {
  editor()
  vi.mocked(creatorRequest).mockRejectedValueOnce(
    new Error('Network unavailable')
  )
  await userEvent.type(screen.getByLabelText('Project title'), 'Still editing')
  await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(
    await screen.findByText(
      'Unable to save. Please retry or refresh if the content has changed.'
    )
  ).toBeInTheDocument()
  expect(useCreatorStore.getState().works).toHaveLength(0)
  expect(screen.getByLabelText('Project title')).toHaveValue('Still editing')
})

test('auto approval publishes immediately and reports the authoritative server status', async () => {
  useCreatorAccessStore.setState({ autoApproveWorks: true })
  vi.mocked(creatorRequest).mockImplementation(async (_path, options) => ({
    ...options?.data,
    status: 'published',
    ownerId: 7,
    revision: 'auto-approved-revision',
  }))
  editor()
  await userEvent.type(screen.getByLabelText('Project title'), 'My new project')
  await userEvent.type(
    screen.getByLabelText('Short introduction'),
    'A useful project introduction.'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Publish project' }))
  await screen.findByText('Publish this project?')
  await userEvent.click(screen.getByRole('button', { name: 'Submit project' }))
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith('Project published')
  )
  expect(useCreatorStore.getState().works[0].status).toBe('published')
  expect(useCreatorStore.getState().published[0].status).toBe('published')
  expect(creatorRequest).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      data: expect.objectContaining({ status: 'review' }),
    })
  )
})

test.each([false, true])(
  'the review policy (%s) shows just one publication action',
  (autoApproveWorks) => {
    useCreatorAccessStore.setState({ autoApproveWorks })
    editor()
    expect(
      screen.getAllByRole('button', {
        name: autoApproveWorks ? 'Publish project' : 'Submit for review',
      })
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', {
        name: autoApproveWorks ? 'Submit for review' : 'Publish project',
      })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save draft' })
    ).toBeInTheDocument()
  }
)

test('adding a detailed cover to an existing project keeps its content and sends an image within the server limit', async () => {
  const work: Work = {
    ...emptyWork(),
    title: 'Existing project',
    summary: 'Keep the existing introduction.',
    description: 'Existing instructions and description.',
    url: 'https://example.com/project',
    revision: 'existing-revision',
    status: 'published',
  }
  const close = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2400, height: 1500, close }))
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    function (this: HTMLCanvasElement, callback) {
      const bytes = this.width >= 1600 ? 800000 : 260000
      callback(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }))
    }
  )
  try {
    editor(undefined, work)
    await userEvent.upload(
      screen.getByLabelText('Choose project images'),
      new File(['detailed-cover'], 'cover.png', { type: 'image/png' })
    )
    await screen.findByRole('img', { name: 'Project image {{number}}' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit for review' })
    )
    await screen.findByText('Submit this project for review?')
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit project' })
    )
    await waitFor(() => expect(creatorRequest).toHaveBeenCalled())
    const saved = vi.mocked(creatorRequest).mock.calls[0][1]?.data as Work
    expect(saved).toMatchObject({
      id: work.id,
      title: work.title,
      summary: work.summary,
      description: work.description,
      url: work.url,
      revision: work.revision,
      status: 'review',
    })
    expect(saved.cover).toMatch(/^data:image\/jpeg;base64,/)
    expect(saved.cover.length).toBeLessThanOrEqual(400000)
    expect(saved.images).toEqual([saved.cover])
    expect(close).toHaveBeenCalledOnce()
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
