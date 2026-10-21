import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, getFreshAuthHeaders } from '@/lib/api'
import {
  accountIdentity,
  loadSiteIdentities,
  saveAccountIdentity,
} from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  getFreshAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer fixture' })),
}))
const user = {
  id: 7,
  username: 'account',
  role: 1,
  display_name: 'Current',
  setting: { avatar: 'data:image/png;base64,old' },
}
beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.getState().auth.setUser(user)
})
afterEach(() => useAuthStore.getState().auth.reset())

test('batch reads public identity while current account immediately wins a stale projection', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        7: { id: 7, name: 'Stale', username: 'old', avatar: '' },
        8: { id: 8, name: 'Public', username: 'public', avatar: '' },
      },
    },
  })
  const identities = await loadSiteIdentities([7, 7, 8])
  expect(identities[7].name).toBe('Current')
  expect(identities[8].name).toBe('Public')
  expect(api.get).toHaveBeenCalledWith(
    '/api/community/identities',
    expect.objectContaining({ params: { ids: '7,8' } })
  )
})

test('public identity uses the relay display name including email-shaped names, without falling back to login accounts', async () => {
  expect(
    accountIdentity({
      ...user,
      username: 'login@example.com',
      display_name: '',
    }).name
  ).toBe('社区成员')
  expect(
    accountIdentity({ ...user, display_name: 'member@example.com' }).name
  ).toBe('member@example.com')
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        8: { id: 8, name: 'old@example.com', username: 'login', avatar: '' },
      },
    },
  })
  const identities = await loadSiteIdentities([8])
  expect(identities[8].name).toBe('old@example.com')
})

test('saving identity updates the existing account endpoints and refreshes shared auth without touching settings', async () => {
  vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { ...user, display_name: 'Changed', setting: {} },
    },
  })
  await saveAccountIdentity({ name: 'Changed', avatar: '' })
  expect(api.put).toHaveBeenNthCalledWith(
    1,
    '/api/user/self',
    { display_name: 'Changed' },
    expect.any(Object)
  )
  expect(api.put).toHaveBeenNthCalledWith(
    2,
    '/api/user/self/avatar',
    { avatar: '' },
    expect.any(Object)
  )
  expect(useAuthStore.getState().auth.user?.display_name).toBe('Changed')
  expect(useAuthStore.getState().auth.user?.setting).toEqual({})
})

test('account change while preparing authorization cancels all profile writes', async () => {
  vi.mocked(getFreshAuthHeaders).mockImplementationOnce(async () => {
    useAuthStore.getState().auth.setUser({ ...user, id: 8 })
    return {}
  })
  await expect(saveAccountIdentity({ name: 'Wrong account' })).rejects.toThrow(
    'Account changed'
  )
  expect(api.put).not.toHaveBeenCalled()
})

test('unchanged creator fields do not rewrite account data', async () => {
  await saveAccountIdentity({ name: 'Current', avatar: user.setting.avatar })
  expect(api.put).not.toHaveBeenCalled()
  expect(api.get).not.toHaveBeenCalled()
})

test('failed avatar save refreshes actual account state and does not pretend success', async () => {
  vi.mocked(api.put)
    .mockResolvedValueOnce({ data: { success: true } })
    .mockResolvedValueOnce({
      data: { success: false, message: 'Upload denied' },
    })
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { ...user, display_name: 'Saved name' } },
  })
  await expect(
    saveAccountIdentity({ name: 'Saved name', avatar: '' })
  ).rejects.toThrow()
  expect(useAuthStore.getState().auth.user?.display_name).toBe('Saved name')
  expect(useAuthStore.getState().auth.user?.setting).toEqual(user.setting)
})
