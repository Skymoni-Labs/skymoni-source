import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { TopicCollection } from '../components/showcase'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

test('interest cards expand to fit their icon and wrapping title instead of inheriting a fixed button height', () => {
  render(<TopicCollection onChoose={vi.fn()} />)

  const collection = screen.getByRole('region', { name: 'Explore by interest' })
  const cards = within(collection).getAllByRole('button')
  expect(cards).toHaveLength(4)
  for (const card of cards) {
    expect(card).toHaveClass('h-auto', 'whitespace-normal')
    expect(card).not.toHaveClass('h-8', 'whitespace-nowrap')
  }
})

test('activating an interest card by keyboard selects its project category', async () => {
  const onChoose = vi.fn()
  render(<TopicCollection onChoose={onChoose} />)

  screen
    .getByRole('button', {
      name: /Make everyday work easier/,
    })
    .focus()
  await userEvent.keyboard('{Enter}')

  expect(onChoose).toHaveBeenCalledWith('software')
})
