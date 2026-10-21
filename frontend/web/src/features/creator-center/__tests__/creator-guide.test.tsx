import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { CreatorGuide } from '../components/creator-guide'

afterEach(cleanup)

async function view(context: 'edit' | 'github', language = 'en') {
  const i18n = createInstance()
  await i18n.init({ lng: language, fallbackLng: 'en', resources: { en, zh } })
  return render(
    <I18nextProvider i18n={i18n}>
      <CreatorGuide context={context} />
    </I18nextProvider>
  )
}

test('keyboard help opens the editing step, expands other steps and returns focus without leaving the editor', async () => {
  await view('edit')
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: 'Usage guide' })
  await user.tab()
  expect(trigger).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(
    await screen.findByRole('dialog', { name: 'Creator Space guide' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /Make the draft your own/ })
  ).toHaveAttribute('aria-expanded', 'true')
  expect(
    screen.getByText(/A cover is optional; upload your own/)
  ).toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: /Preview, save and submit for review/ })
  )
  expect(
    screen.getByText(/Opening this guide does not save or submit/)
  ).toBeInTheDocument()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  await waitFor(() => expect(trigger).toHaveFocus())
  await user.click(trigger)
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('GitHub context uses real Chinese translations and starts with repository instructions', async () => {
  await view('github', 'zh')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '使用教程' }))
  expect(
    await screen.findByRole('dialog', { name: '创作者中心使用教程' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /连接 GitHub，选择仓库/ })
  ).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(/skills\/my-skill/)).toHaveTextContent(
    '不要填写 GitHub 网址'
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})
