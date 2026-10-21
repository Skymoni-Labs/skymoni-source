import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { uploadProductImage } from '@/features/shop/api'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { SoftwareManagement } from '../admin'
import { SoftwareEditor } from '../editor'
import type { SoftwareCatalog, SoftwareEntry } from '../types'

vi.mock('@/lib/api', () => ({
  api: { request: vi.fn(), get: vi.fn() },
  getFreshAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer fixture' })),
}))
vi.mock('@/features/shop/api', () => ({ uploadProductImage: vi.fn() }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key.replaceAll(/{{(\w+)}}/g, (match, field: string) =>
        String(options?.[field] ?? match)
      ),
  }),
}))

const entry: SoftwareEntry = {
  id: 'custom-editor',
  name: 'My Editor',
  kind: 'software',
  description: 'A new editor',
  platform: 'Windows',
  version: '1.0',
  downloadUrl: '',
  filename: '',
  detailUrl: '',
  imageUrl: '',
  appearance: 'generic',
  sortOrder: 10,
  published: false,
}
const uploaded = {
  id: 'fixture-file',
  url: '/api/software/files/fixture-file/Editor.zip',
  filename: 'Editor.zip',
  bytes: 32,
  sha256: 'fixture-checksum',
}
let client: QueryClient
beforeEach(() => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'admin', role: ROLE.SUPER_ADMIN })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(new Blob(['image'], { type: 'image/jpeg' }))
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() }))
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  vi.mocked(api.request).mockImplementation(async (options) => {
    if (options.url?.endsWith('/catalog')) {
      return {
        data: {
          success: true,
          data:
            options.method === 'put'
              ? {
                  ...(options.data as SoftwareCatalog),
                  revision: 'new-revision',
                }
              : { revision: 'fixture', items: [entry] },
        },
      }
    }
    if (options.method === 'post') {
      return { data: { success: true, data: uploaded } }
    }
    return {
      data: {
        success: true,
        data: { items: [], usedBytes: 0, limitBytes: 2147483648 },
      },
    }
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
function renderManager() {
  render(
    <QueryClientProvider client={client}>
      <SoftwareManagement />
    </QueryClientProvider>
  )
}

test('the recommendation configuration saves through the catalog API and later publication edits preserve the selection', async () => {
  const featured = { carousel: [entry.id], tiles: [entry.id] }
  vi.mocked(api.request).mockImplementation(async (options) => ({
    data: {
      success: true,
      data:
        options.method === 'put'
          ? { ...(options.data as SoftwareCatalog), revision: 'updated' }
          : {
              revision: 'fixture',
              items: [
                { ...entry, published: true, detailUrl: 'https://example.com' },
              ],
              featured,
            },
    },
  }))
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Configure recommendations' })
  )
  await user.click(
    screen.getByRole('button', { name: 'Clear Right-side cards position 1' })
  )
  await user.click(screen.getByRole('button', { name: 'Save recommendations' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  await user.click(screen.getByRole('switch', { name: 'Publish My Editor' }))
  await waitFor(() => expect(screen.getByText('Draft')).toBeVisible())
  const writes = vi
    .mocked(api.request)
    .mock.calls.filter(([options]) => options.method === 'put')
  expect(writes).toHaveLength(2)
  expect((writes[0][0].data as SoftwareCatalog).featured).toEqual({
    carousel: [entry.id],
    tiles: [],
  })
  expect((writes[1][0].data as SoftwareCatalog).featured).toEqual({
    carousel: [entry.id],
    tiles: [],
  })
})

test('the administrator uploads a local installer and saves its generated link with the item', async () => {
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Edit My Editor' })
  )
  await user.upload(
    screen.getByLabelText('Upload local installer'),
    new File(['PK\x03\x04fixture'], 'Editor.zip', { type: 'application/zip' })
  )
  await waitFor(() =>
    expect(screen.getByLabelText('Download link')).toHaveValue(uploaded.url)
  )
  await user.click(
    screen.getByRole('switch', { name: 'Published in Software Center' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  const write = vi
    .mocked(api.request)
    .mock.calls.find(([options]) => options.method === 'put')?.[0]
  expect((write?.data as SoftwareCatalog | undefined)?.items[0]).toMatchObject({
    name: 'My Editor',
    downloadUrl: uploaded.url,
    filename: 'Editor.zip',
    published: true,
  })
  expect(screen.getByText('Published')).toBeVisible()
})

test('an administrator can add a custom tool with an external link without uploading a file', async () => {
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Add software or tool' })
  )
  await user.selectOptions(screen.getByLabelText('Category'), 'tool')
  await user.type(screen.getByLabelText('Software or tool name'), 'My Tool')
  await user.type(
    screen.getByLabelText('Website or details link'),
    'https://example.com/tool'
  )
  await user.click(
    screen.getByRole('switch', { name: 'Published in Software Center' })
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByRole('article', { name: 'My Tool' })).toBeVisible()
  const write = vi
    .mocked(api.request)
    .mock.calls.find(([options]) => options.method === 'put')?.[0]
  expect((write?.data as SoftwareCatalog | undefined)?.items[1]).toMatchObject({
    name: 'My Tool',
    kind: 'tool',
    detailUrl: 'https://example.com/tool',
    published: true,
  })
})

test('failed uploads preserve the old link and keep the editor available to retry', async () => {
  vi.mocked(api.request).mockRejectedValue(new Error('Upload failed'))
  const user = userEvent.setup()
  render(
    <SoftwareEditor
      entry={{ ...entry, downloadUrl: 'https://example.com/old.zip' }}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onUploaded={vi.fn()}
    />
  )
  await user.upload(
    screen.getByLabelText('Upload local installer'),
    new File(['fixture'], 'Editor.zip', { type: 'application/zip' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Upload failed. Your previous link was kept.'
  )
  expect(screen.getByLabelText('Download link')).toHaveValue(
    'https://example.com/old.zip'
  )
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
})

test('upload progress disables saving and cancel aborts the upload', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(api.request).mockImplementation((options) => {
    signal = options.signal as AbortSignal
    return new Promise((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true }
      )
    })
  })
  const user = userEvent.setup()
  render(
    <SoftwareEditor
      entry={entry}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onUploaded={vi.fn()}
    />
  )
  await user.upload(
    screen.getByLabelText('Upload local installer'),
    new File(['fixture'], 'Editor.zip', { type: 'application/zip' })
  )
  expect(
    await screen.findByRole('progressbar', { name: 'Upload progress' })
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Cancel upload' }))
  expect(signal?.aborted).toBe(true)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  )
})

test('unsupported and oversized installers are rejected before a request is sent', async () => {
  render(
    <SoftwareEditor
      entry={entry}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onUploaded={vi.fn()}
    />
  )
  fireEvent.change(screen.getByLabelText('Upload local installer'), {
    target: { files: [new File(['<html>'], 'page.html')] },
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unsupported installer format'
  )
  const oversized = new File(['MZ'], 'huge.exe')
  Object.defineProperty(oversized, 'size', { value: 1073741825 })
  fireEvent.change(screen.getByLabelText('Upload local installer'), {
    target: { files: [oversized] },
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose an installer under 1 GB'
  )
  expect(api.request).not.toHaveBeenCalled()
})

test('save failures keep entered content and invalid public links show a field error', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('Conflict'))
  const user = userEvent.setup()
  render(
    <SoftwareEditor
      entry={{ ...entry, published: true }}
      onClose={vi.fn()}
      onSave={onSave}
      onUploaded={vi.fn()}
    />
  )
  await user.type(screen.getByLabelText('Download link'), 'javascript:alert(1)')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByText('Enter a valid HTTPS link')).toBeVisible()
  expect(onSave).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('Download link'))
  await user.type(
    screen.getByLabelText('Download link'),
    'https://example.com/editor.zip'
  )
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(screen.getByLabelText('Download link')).toHaveValue(
    'https://example.com/editor.zip'
  )
})

test('switching to a different account closes the prior editor and denies management access', async () => {
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Edit My Editor' })
  )
  act(() =>
    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'visitor', role: ROLE.USER })
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Access denied')).toBeVisible()
})

test('uploaded installers in use cannot be deleted from the file library', async () => {
  vi.mocked(api.request).mockImplementation(async (options) => ({
    data: {
      success: true,
      data: options.url?.endsWith('/catalog')
        ? {
            revision: 'fixture',
            items: [{ ...entry, downloadUrl: uploaded.url }],
          }
        : { items: [uploaded], usedBytes: 32, limitBytes: 2147483648 },
    },
  }))
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Uploaded installers' })
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Uploaded installers',
  })
  await within(dialog).findByText(/MB · In use/)
  expect(
    within(dialog).getByRole('button', { name: 'Delete Editor.zip' })
  ).toBeDisabled()
})

test('editing software details and uploading screenshots persists them with the catalog', async () => {
  const user = userEvent.setup()
  renderManager()
  await user.click(
    await screen.findByRole('button', { name: 'Edit My Editor' })
  )
  await user.type(
    screen.getByLabelText('Software introduction'),
    'Full editor introduction'
  )
  await user.type(
    screen.getByLabelText('Key features (one per line)'),
    'Edit files{Enter}Export files'
  )
  await user.type(
    screen.getByLabelText('System requirements'),
    'Windows 10 or later'
  )
  vi.mocked(uploadProductImage).mockResolvedValue(
    '/api/shop/images/screenshot.png'
  )
  await user.upload(
    screen.getByLabelText('Choose software screenshots'),
    new File(['png'], 'screen.png', { type: 'image/png' })
  )
  await screen.findByRole('button', { name: 'Remove image 1' })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  const write = vi
    .mocked(api.request)
    .mock.calls.find(([options]) => options.method === 'put')?.[0]
  expect(
    (write?.data as SoftwareCatalog | undefined)?.items[0]?.details
  ).toMatchObject({
    overview: 'Full editor introduction',
    features: 'Edit files\nExport files',
    requirements: 'Windows 10 or later',
    screenshots: ['/api/shop/images/screenshot.png'],
  })
})
