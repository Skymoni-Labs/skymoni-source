import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { userAvatarSource } from '@/lib/avatar'
import { useAuthStore } from '@/stores/auth-store'

import { MemberAvatar, MemberName } from '../shared'

// jsdom does not load AvatarImage resources. Browser QA checks actual image loading.
vi.mock('@/components/user-avatar', () => ({
  UserAvatar: (props: {
    setting?: string | Record<string, unknown>
    name?: string
    className?: string
  }) => (
    <img
      src={userAvatarSource(props.setting)}
      alt={props.name}
      className={props.className}
    />
  ),
}))

const author = {
  id: 1,
  name: 'Historical name',
  username: 'old',
  avatar: 'data:image/png;base64,aGVsbG8=',
}
afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
})

test('community uses the same image and default as the relay account', async () => {
  const view = render(
    <>
      <MemberAvatar author={author} small />
      <MemberName author={author} />
    </>
  )
  expect(await screen.findByRole('img')).toHaveAttribute('src', author.avatar)
  expect(screen.getByText('Historical name')).toBeInTheDocument()
  view.rerender(<MemberAvatar author={{ ...author, avatar: '' }} />)
  expect(await screen.findByRole('img')).toHaveAttribute(
    'src',
    '/skymoni-avatar.png'
  )
})

test('own name, picture and removal update immediately without waiting for the topic cache', async () => {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'account',
    display_name: 'Site name',
    role: 1,
    setting: { avatar: 'data:image/jpeg;base64,c2l0ZQ==' },
  })
  render(
    <>
      <MemberAvatar author={author} />
      <MemberName author={author} />
    </>
  )
  expect(await screen.findByRole('img')).toHaveAttribute(
    'src',
    'data:image/jpeg;base64,c2l0ZQ=='
  )
  expect(screen.getByText('Site name')).toBeInTheDocument()
  act(() =>
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'account',
      display_name: 'Changed',
      role: 1,
      setting: {},
    })
  )
  expect(screen.getByText('Changed')).toBeInTheDocument()
  expect(await screen.findByRole('img')).toHaveAttribute(
    'src',
    '/skymoni-avatar.png'
  )
})

test('switching accounts does not use the new account identity for old authors', async () => {
  useAuthStore.getState().auth.setUser({
    id: 2,
    username: 'someone-else',
    role: 1,
    display_name: 'Other',
    setting: {},
  })
  render(
    <>
      <MemberAvatar author={author} />
      <MemberName author={author} />
    </>
  )
  expect(screen.getByText('Historical name')).toBeInTheDocument()
  expect(await screen.findByRole('img')).toHaveAttribute('src', author.avatar)
})

test('member display names match the relay even when email-shaped; missing names use a generic label', () => {
  const view = render(
    <MemberName author={{ ...author, name: 'old@example.com' }} />
  )
  expect(screen.getByText('old@example.com')).toBeInTheDocument()
  act(() =>
    useAuthStore.getState().auth.setUser({
      id: author.id,
      username: 'login-account',
      display_name: '',
      role: 1,
    })
  )
  view.rerender(<MemberName author={author} />)
  expect(screen.getByText('社区成员')).toBeInTheDocument()
  expect(screen.queryByText('login-account')).not.toBeInTheDocument()
  expect(screen.queryByText('old@example.com')).not.toBeInTheDocument()
})
