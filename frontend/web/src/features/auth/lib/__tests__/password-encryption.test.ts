import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPasswordEncryptionCache,
  encryptPassword,
} from '../password-encryption'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
beforeEach(() => {
  clearPasswordEncryptionCache()
  mocks.get.mockImplementation(async (path: string) => ({
    data: {
      success: true,
      data: {
        kid: path.includes('upstream-wallet') ? 'vault-kid' : 'login-kid',
        public_key: keys.publicKey,
      },
    },
  }))
})
describe('separate wallet password transport', () => {
  it('preserves the default login endpoint and sends only encrypted password fields', async () => {
    const value = await encryptPassword('test-secret')
    expect(mocks.get).toHaveBeenCalledWith('/api/user/login/encryption-key')
    expect(value.encryption_key_id).toBe('login-kid')
    expect(JSON.stringify(value)).not.toContain('test-secret')
    const decrypted = privateDecrypt(
      {
        key: keys.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(value.password_encrypted, 'base64')
    )
    expect(decrypted.toString()).toBe('test-secret')
  })
  it('uses and caches the independent vault endpoint without reusing another endpoint cache', async () => {
    await encryptPassword('test-secret')
    const one = await encryptPassword(
      'test-secret',
      '/api/upstream-wallet/encryption-key'
    )
    const two = await encryptPassword(
      'test-secret',
      '/api/upstream-wallet/encryption-key'
    )
    expect(one.encryption_key_id).toBe('vault-kid')
    expect(two.encryption_key_id).toBe('vault-kid')
    expect(one.password_encrypted).not.toBe(two.password_encrypted)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    await encryptPassword('test-secret')
    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(mocks.get).toHaveBeenLastCalledWith('/api/user/login/encryption-key')
  })
  it('can use the vault transport while the login encryption endpoint is disabled', async () => {
    mocks.get.mockResolvedValueOnce({
      data: { success: true, data: { enabled: false } },
    })
    await expect(encryptPassword('test-secret')).rejects.toThrow()
    const value = await encryptPassword(
      'test-secret',
      '/api/upstream-wallet/encryption-key'
    )
    expect(value.encryption_key_id).toBe('vault-kid')
  })
})
