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
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { createChannel, getChannels } from './api'
import type { AddChannelRequest } from './types'

// The channel router registers the collection at "/" and does not promise
// trailing-slash redirects. Validate the client against that server contract.
const router = readFileSync(
  path.resolve(process.cwd(), '../../backend/router/channel-router.go'),
  'utf8'
)

describe('channel collection routes', () => {
  it('loads a filtered page from the registered GET collection route', async () => {
    expect(router).toContain('method: http.MethodGet, path: "/"')
    const params = { p: 2, page_size: 50, status: 'disabled' as const }
    const response = {
      success: true,
      data: { items: [{ id: 2289 }], total: 1 },
    }
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url !== '/api/channel/') throw new Error('404: unregistered route')
      return { data: response }
    })

    expect(await getChannels(params)).toEqual(response)
    expect(get).toHaveBeenCalledWith('/api/channel/', { params })
  })

  it('creates channels using the registered POST collection route', async () => {
    expect(router).toContain('method: http.MethodPost, path: "/"')
    const data: AddChannelRequest = {
      mode: 'single',
      channel: { name: 'Route regression' },
    }
    const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
      if (url !== '/api/channel/') throw new Error('404: unregistered route')
      return { data: { success: true } }
    })

    expect(await createChannel(data)).toEqual({ success: true })
    expect(post).toHaveBeenCalledWith('/api/channel/', data, expect.any(Object))
  })
})
