/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { SecurityProtection } from '..'
import { protectionApi } from '../api'
import { banIsActive, isSafeBanIP, validateConfig } from '../policy'
import type {
  ConfigSnapshot,
  ProtectionBan,
  ProtectionOverview,
} from '../types'

const settings: ConfigSnapshot = {
  revision: 7,
  updated_at: 1793000000,
  updated_by: 1,
  config: {
    enabled: false,
    mode: 'observe',
    registration_ip_hour_limit: 20,
    registration_window_seconds: 3600,
    first_checkin_cooldown_seconds: 3600,
    new_account_age_seconds: 604800,
    ip_daily_new_user_limit: 5,
    burst_window_seconds: 600,
    burst_new_user_threshold: 6,
    burst_rapid_user_threshold: 3,
    rapid_claim_seconds: 60,
    auto_ip_window_seconds: 3600,
    auto_ip_new_user_threshold: 20,
    auto_ip_denied_threshold: 10,
    auto_ip_ban_seconds: 900,
    allowlist_ips: [],
    allowlist_user_ids: [],
    retention_days: 30,
  },
}
const health: ProtectionOverview = {
  enabled: false,
  mode: 'observe',
  revision: 7,
  healthy: true,
  active_user_bans: 0,
  active_ip_bans: 0,
  events_24h: 0,
  denied_24h: 0,
  observed_24h: 0,
  last_event_at: 0,
}
const sampleBan: ProtectionBan = {
  id: 42,
  subject_type: 'user',
  user_id: 123,
  ip: '',
  scope: 'checkin',
  source: 'manual',
  reason: '已核实短时重复领奖',
  rule: '',
  created_at: 1793000000,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  revoked_at: 0,
  operator_id: 1,
}
let snapshot: ConfigSnapshot
let banItems: ProtectionBan[]
let eventItems: unknown[]
let eventTotal = 0

beforeEach(() => {
  snapshot = structuredClone(settings)
  banItems = []
  eventItems = []
  eventTotal = 0
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url, options) => {
    let data: unknown = snapshot
    if (url.endsWith('/overview')) data = health
    if (url.endsWith('/events')) {
      data = {
        items: eventItems,
        total: eventTotal,
        page: options?.params?.page || 1,
        page_size: 20,
      }
    }
    if (url.endsWith('/bans')) {
      data = {
        items: banItems,
        total: banItems.length,
        page: options?.params?.page || 1,
        page_size: 20,
      }
    }
    return { data: { success: true, data } }
  })
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <SecurityProtection />
    </QueryClientProvider>
  )
  return { client, ...view }
}

it.each([0, 1, 10])(
  'does not render or request root management data for role %i',
  async (role) => {
    useAuthStore.getState().auth.setUser({ id: 8, username: 'member', role })
    const post = vi.spyOn(api, 'post')
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('仅超级管理员')
    expect(api.get).not.toHaveBeenCalled()
    await expect(protectionApi.config()).rejects.toMatchObject({ status: 403 })
    await expect(
      protectionApi.createBan({
        subject_type: 'user',
        user_id: 9,
        scope: 'account',
        duration_seconds: 900,
        reason: '已核实异常行为',
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(post).not.toHaveBeenCalled()
  }
)

it.each(['observe', 'enforce'] as const)(
  'saves the switch and %s mode with the expected revision and no credential fields',
  async (mode) => {
    const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      snapshot = {
        ...snapshot,
        revision: 8,
        config: (body as { config: ConfigSnapshot['config'] }).config,
      }
      return { data: { success: true, data: snapshot } }
    })
    show()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('switch', { name: '自动防护总开关' })
    )
    await user.selectOptions(screen.getByLabelText('运行模式'), mode)
    await user.click(screen.getByRole('button', { name: '保存防护配置' }))
    await screen.findByText('防护配置已保存，当前版本 #8。')
    expect(put).toHaveBeenCalledWith(
      '/api/security-protection/config',
      {
        expected_revision: 7,
        config: { ...settings.config, enabled: true, mode },
      },
      { skipErrorHandler: true, skipBusinessError: true }
    )
    expect(screen.getByRole('button', { name: '保存防护配置' })).toBeDisabled()
    expect(
      screen.getByText(/已存在的人工限制、历史 IP 封禁继续有效/)
    ).toBeVisible()
    expect(JSON.stringify(put.mock.calls)).not.toMatch(
      /password|access_token|authorization|api_key/i
    )
  }
)

it('preserves unsaved changes across tabs and does not refetch config on record refresh', async () => {
  show()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('switch', { name: '自动防护总开关' })
  )
  await user.click(screen.getByRole('tab', { name: '检测事件' }))
  await user.click(screen.getByRole('button', { name: '刷新记录' }))
  await user.click(screen.getByRole('tab', { name: '防护配置' }))
  expect(screen.getByRole('switch', { name: '自动防护总开关' })).toBeChecked()
  expect(
    vi.mocked(api.get).mock.calls.filter(([url]) => url.endsWith('/config'))
  ).toHaveLength(1)
})

it('keeps the draft on revision conflict, never displays raw server data, and reloads explicitly', async () => {
  const put = vi.spyOn(api, 'put').mockRejectedValue({
    response: {
      status: 409,
      data: {
        code: 'security_revision_conflict',
        message: 'secret-token-should-never-render',
      },
    },
  })
  show()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('switch', { name: '自动防护总开关' })
  )
  await user.click(screen.getByRole('button', { name: '保存防护配置' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '配置已被其他管理员更新'
  )
  expect(screen.getByRole('switch', { name: '自动防护总开关' })).toBeChecked()
  expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument()
  expect(put).toHaveBeenCalledTimes(1)
  snapshot = { ...snapshot, revision: 9 }
  await user.click(screen.getByRole('button', { name: '放弃修改并载入最新' }))
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: '自动防护总开关' })
    ).not.toBeChecked()
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a saving state and keeps failures retryable without losing edited values', async () => {
  let reject: (reason: unknown) => void = () => undefined
  vi.spyOn(api, 'put').mockImplementation(
    () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise
      })
  )
  show()
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('switch', { name: '自动防护总开关' })
  )
  await user.click(screen.getByRole('button', { name: '保存防护配置' }))
  expect(
    await screen.findByRole('button', { name: '正在保存…' })
  ).toBeDisabled()
  expect(
    screen.getByRole('switch', { name: '自动防护总开关' })
  ).toHaveAttribute('data-disabled')
  await act(async () => reject({ response: { status: 503 } }))
  expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
  expect(screen.getByRole('switch', { name: '自动防护总开关' })).toBeChecked()
  expect(screen.getByRole('button', { name: '保存防护配置' })).toBeEnabled()
})

it('creates a scoped temporary ban only after confirmation and revokes that exact record with a reason', async () => {
  const post = vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (url.endsWith('/revoke')) {
      banItems = [{ ...sampleBan, revoked_at: Math.floor(Date.now() / 1000) }]
    } else banItems = [{ ...sampleBan, ...(body as Partial<ProtectionBan>) }]
    return { data: { success: true, data: banItems[0] } }
  })
  show()
  const user = userEvent.setup()
  await screen.findByRole('switch', { name: '自动防护总开关' })
  await user.click(screen.getByRole('tab', { name: '账号与 IP 限制' }))
  await user.type(screen.getByLabelText('目标用户 ID'), '123')
  await user.type(screen.getByLabelText('处置原因'), '已核实短时重复领奖')
  await user.click(screen.getByRole('button', { name: '检查并限制' }))
  const confirm = await screen.findByRole('dialog', { name: '确认临时限制' })
  expect(post).not.toHaveBeenCalled()
  await user.click(within(confirm).getByRole('button', { name: '确认限制' }))
  const revoke = await screen.findByRole('button', { name: '撤销限制 #42' })
  expect(post).toHaveBeenCalledWith(
    '/api/security-protection/bans',
    {
      subject_type: 'user',
      user_id: 123,
      scope: 'checkin',
      duration_seconds: 3600,
      reason: '已核实短时重复领奖',
    },
    expect.anything()
  )
  await user.click(revoke)
  const dialog = await screen.findByRole('dialog', { name: '撤销限制 #42' })
  expect(
    within(dialog).getByRole('button', { name: '确认撤销' })
  ).toBeDisabled()
  await user.type(within(dialog).getByLabelText('撤销原因'), '已复核为正常用户')
  await user.click(within(dialog).getByRole('button', { name: '确认撤销' }))
  await screen.findByText('已撤销')
  expect(post).toHaveBeenLastCalledWith(
    '/api/security-protection/bans/42/revoke',
    { reason: '已复核为正常用户' },
    expect.anything()
  )
  expect(
    screen.queryByRole('button', { name: '撤销限制 #42' })
  ).not.toBeInTheDocument()
})

it('blocks self-lockout and broad network targets before any mutation request', async () => {
  const post = vi.spyOn(api, 'post')
  show()
  const user = userEvent.setup()
  await screen.findByRole('switch', { name: '自动防护总开关' })
  await user.click(screen.getByRole('tab', { name: '账号与 IP 限制' }))
  await user.type(screen.getByLabelText('目标用户 ID'), '1')
  await user.type(screen.getByLabelText('处置原因'), '确认异常行为')
  await user.click(screen.getByRole('button', { name: '检查并限制' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '不能限制当前管理员'
  )
  await user.selectOptions(screen.getByLabelText('限制类型'), 'ip')
  await user.type(screen.getByLabelText('精确公网 IP'), '198.51.100.0/24')
  await user.click(screen.getByRole('button', { name: '检查并限制' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('不接受网段')
  expect(post).not.toHaveBeenCalled()
  expect(screen.queryByRole('option', { name: /永久/ })).not.toBeInTheDocument()
})

it('hides loaded data and clears security cache when the server revokes root access', async () => {
  const { client } = show()
  await screen.findByRole('switch', { name: '自动防护总开关' })
  vi.mocked(api.get).mockRejectedValue({
    response: { status: 403, data: { code: 'forbidden' } },
  })
  await userEvent.click(screen.getByRole('button', { name: '刷新记录' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('管理员权限已失效')
  expect(screen.queryByTestId('security-console')).not.toBeInTheDocument()
  await waitFor(() =>
    expect(
      client.getQueryData(['security-protection', 1, 'config'])
    ).toBeUndefined()
  )
})

it('renders narrow-screen event cards and pagination without tables or unbounded raw payloads', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 360,
  })
  eventItems = [
    {
      id: 4,
      user_id: 123,
      ip: '2001:db8:1234:5678:abcd:abcd:abcd:abcd',
      ip_prefix: '2001:db8:1234:5678::/64',
      kind: 'checkin_attempt',
      route: '/api/user/checkin',
      rule: 'burst_new_accounts',
      decision: 'observed',
      scope: 'checkin',
      request_id: 'security-request-42',
      policy_revision: 7,
      evidence: { burst_new_uids: 8, private_secret_field: 'must-not-render' },
      summary: '同一出口短时出现多名新账号',
      new_user: true,
      rapid: true,
      created_at: 1793e6,
      content: 'private-chat-must-not-render',
      token: 'private-key-must-not-render',
    },
  ]
  eventTotal = 21
  show()
  const user = userEvent.setup()
  await screen.findByRole('switch', { name: '自动防护总开关' })
  await user.click(screen.getByRole('tab', { name: '检测事件' }))
  const list = await screen.findByRole('list', { name: '检测事件记录' })
  expect(
    await within(list).findByText('同一出口短时出现多名新账号')
  ).toBeVisible()
  expect(within(list).getByText('只观察')).toBeVisible()
  expect(list).toHaveClass('min-w-0')
  expect(within(list).getByText(/2001:db8:1234/)).toHaveClass('break-all')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.queryByText(/private-chat|private-key/)).not.toBeInTheDocument()
  await user.click(within(list).getByText('规则依据与请求追踪'))
  expect(within(list).getByText('security-request-42')).toBeVisible()
  expect(within(list).getByText('窗口内新账号数')).toBeVisible()
  expect(
    within(list).queryByText(/must-not-render|private_secret_field/)
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '检测事件下一页' }))
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      '/api/security-protection/events',
      expect.objectContaining({ params: { page: 2, page_size: 20 } })
    )
  )
})

it('distinguishes account, reward, IP and registration restrictions using the explicit event scope', async () => {
  const scopes = ['account', 'checkin', 'ip', 'registration']
  eventItems = scopes.map((scope, index) => ({
    id: index + 10,
    user_id: 123,
    ip: '198.51.100.2',
    kind: 'access_denied',
    scope,
    decision: 'denied',
    rule: 'manual_restriction',
    summary: '已核实的限制事件',
    created_at: 1793000000,
  }))
  eventTotal = 4
  show()
  await screen.findByRole('switch', { name: '自动防护总开关' })
  await userEvent.click(screen.getByRole('tab', { name: '检测事件' }))
  const list = await screen.findByRole('list', { name: '检测事件记录' })
  for (const label of ['账号限制', '暂缓领奖', 'IP 限制', '暂缓注册']) {
    expect(await within(list).findByText(label, { exact: true })).toBeVisible()
  }
})

describe('policy boundary validation', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.1.1',
    '224.0.0.1',
    '198.51.100.1/24',
    'example.com',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:7f00:1',
  ])('rejects unsupported ban target %s', (ip) =>
    expect(isSafeBanIP(ip)).toBe(false)
  )
  it.each(['198.51.100.2', '2001:db8::123'])(
    'accepts one exact public IP %s',
    (ip) => expect(isSafeBanIP(ip)).toBe(true)
  )
  it('keeps cooldown zero valid, rejects contradictory thresholds and expires bans immediately', () => {
    expect(
      validateConfig({ ...settings.config, first_checkin_cooldown_seconds: 0 })
    ).toBeNull()
    expect(
      validateConfig({ ...settings.config, burst_rapid_user_threshold: 8 })
    ).toMatch(/不能大于/)
    expect(banIsActive({ ...sampleBan, expires_at: 20 }, 21)).toBe(false)
    expect(banIsActive({ ...sampleBan, expires_at: 0 }, 21)).toBe(true)
    expect(
      banIsActive({ ...sampleBan, expires_at: 0, revoked_at: 10 }, 21)
    ).toBe(false)
  })
})
