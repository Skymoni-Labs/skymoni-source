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
import { useEffect, useState } from 'react'

type AndroidRelease = { version: string; url: string; available: boolean }
const unavailable: AndroidRelease = { version: '', url: '', available: false }

export function parseAndroidRelease(input: unknown): AndroidRelease {
  const item = input as Record<string, unknown>
  if (
    !item ||
    item.package !== 'com.skymoni.mobile' ||
    item.platform !== 'Android' ||
    typeof item.version !== 'string' ||
    !/^\d+(?:\.\d+){1,3}$/.test(item.version) ||
    typeof item.available !== 'boolean'
  ) {
    throw new Error('Invalid release')
  }
  if (!item.available || item.status === 'maintenance') {
    return { ...unavailable, version: item.version }
  }
  if (
    typeof item.url !== 'string' ||
    typeof item.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(item.sha256) ||
    item.signing_certificate_sha256 !==
      '92f62d96f7c13e38230477b0394e98234b69820379b6981c19e6cbe4225b9e48'
  ) {
    throw new Error('Invalid signed release')
  }
  const url = new URL(item.url, 'https://skymoni.com')
  if (
    url.origin !== 'https://skymoni.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/app-releases\/[a-zA-Z0-9._-]+\.apk$/.test(url.pathname)
  ) {
    throw new Error('Invalid APK location')
  }
  return { version: item.version, url: url.pathname, available: true }
}

export function useAndroidRelease() {
  const [release, setRelease] = useState(unavailable)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    const timer = setTimeout(() => controller.abort(), 10000)
    void fetch(`/app-releases/release.json?check=${Date.now()}`, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Release unavailable')
        return parseAndroidRelease(await response.json())
      })
      .then((value) => {
        if (alive) setRelease(value)
      })
      .catch(() => {
        if (alive) {
          setError(true)
          setRelease(unavailable)
        }
      })
      .finally(() => {
        clearTimeout(timer)
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [attempt])
  return {
    ...release,
    loading,
    error,
    retry: () => {
      setLoading(true)
      setError(false)
      retry((value) => value + 1)
    },
  }
}
