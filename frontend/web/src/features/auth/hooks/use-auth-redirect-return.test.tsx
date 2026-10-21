import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
import { useAuthRedirect } from './use-auth-redirect'

describe('return path across registration and sign-in', () => {
  beforeEach(() => { navigate.mockClear() })
  it('keeps the same-origin Git authorization request after registration', () => {
    const target = '/git-authorize?request=one-browser-flow&method=register'
    window.history.replaceState({}, '', `/sign-up?redirect=${encodeURIComponent(target)}`)
    const { result } = renderHook(() => useAuthRedirect())
    act(() => result.current.redirectToLogin())
    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: target }, replace: true })
  })
  it('rejects an external return destination', () => {
    window.history.replaceState({}, '', '/sign-up?redirect=https%3A%2F%2Fevil.example')
    const { result } = renderHook(() => useAuthRedirect())
    act(() => result.current.redirectToLogin())
    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { redirect: undefined }, replace: true })
  })
})
