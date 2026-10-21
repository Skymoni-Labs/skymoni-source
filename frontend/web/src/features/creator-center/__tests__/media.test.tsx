import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { ProjectMedia } from '../components/project-media'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)
test('selecting more images than the remaining capacity explains the six-image project limit', async () => {
  render(
    <ProjectMedia
      images={['one', 'two', 'three', 'four', 'five']}
      cover='one'
      attachment={undefined}
      onImages={vi.fn()}
      onAttachment={vi.fn()}
      onBusy={vi.fn()}
    />
  )
  await userEvent.upload(screen.getByLabelText('Choose project images'), [
    new File(['one'], 'one.png', { type: 'image/png' }),
    new File(['two'], 'two.png', { type: 'image/png' }),
  ])
  expect(
    await screen.findByText('Up to 6 images per project')
  ).toBeInTheDocument()
})
test('a cover selection updates the chosen cover while preserving the other images', async () => {
  const change = vi.fn()
  render(
    <ProjectMedia
      images={['one', 'two']}
      cover='one'
      attachment={undefined}
      onImages={change}
      onAttachment={vi.fn()}
      onBusy={vi.fn()}
    />
  )
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Use image {{number}} as cover' })[1]
  )
  expect(change).toHaveBeenCalledWith(['one', 'two'], 'two')
})
test('an empty attachment is rejected before an upload request', async () => {
  const change = vi.fn()
  render(
    <ProjectMedia
      images={[]}
      cover=''
      attachment={undefined}
      onImages={vi.fn()}
      onAttachment={change}
      onBusy={vi.fn()}
    />
  )
  await userEvent.upload(
    screen.getByLabelText('Choose project attachment'),
    new File([], 'empty.txt', { type: 'text/plain' })
  )
  expect(
    await screen.findByText('Choose a non-empty file under 20 MB')
  ).toBeInTheDocument()
  expect(change).not.toHaveBeenCalled()
})
