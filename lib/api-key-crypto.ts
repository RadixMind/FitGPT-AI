import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'

const AAD = Buffer.from('FitGPT:shared-api-key:v2')
const MAX_CIPHERTEXT_LENGTH = 16 * 1024

function currentSecret(): string {
  const secret = process.env.KEY_ENCRYPTION_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('KEY_ENCRYPTION_SECRET must contain at least 32 bytes')
  }
  return secret
}

function readSecrets(): string[] {
  const secret = currentSecret()
  const previous = process.env.KEY_ENCRYPTION_PREVIOUS_SECRETS
  if (!previous) return [secret]
  const values: unknown = JSON.parse(previous)
  if (!Array.isArray(values) || values.length > 3 || values.some(v => typeof v !== 'string' || !v)) {
    throw new Error('KEY_ENCRYPTION_PREVIOUS_SECRETS must be a JSON array of at most 3 secrets')
  }
  return [secret, ...values]
}

export function encryptApiKey(value: string): string {
  const secret = currentSecret()
  if (!value || Buffer.byteLength(value) > 8192) throw new Error('Invalid API key length')
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const key = scryptSync(secret, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(AAD)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v2:${Buffer.concat([salt, nonce, cipher.getAuthTag(), encrypted]).toString('base64url')}`
}

// CryptoJS's historical OpenSSL formatter uses Salted__ + 8-byte salt and EVP_BytesToKey.
// This decoder is read-only. New writes always use authenticated AES-GCM.
function decryptLegacy(value: string, secret: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('Invalid legacy ciphertext')
  const data = Buffer.from(value, 'base64')
  if (data.length < 32 || data.subarray(0, 8).toString('ascii') !== 'Salted__' || (data.length - 16) % 16 !== 0) {
    throw new Error('Invalid legacy ciphertext')
  }
  const salt = data.subarray(8, 16)
  let derived: Buffer = Buffer.alloc(0)
  let block: Buffer = Buffer.alloc(0)
  while (derived.length < 48) {
    block = createHash('md5').update(block).update(secret, 'utf8').update(salt).digest()
    derived = Buffer.concat([derived, block])
  }
  const decipher = createDecipheriv('aes-256-cbc', derived.subarray(0, 32), derived.subarray(32, 48))
  return Buffer.concat([decipher.update(data.subarray(16)), decipher.final()])
}

export function decryptApiKey(value: string): string {
  if (!value || value.length > MAX_CIPHERTEXT_LENGTH) throw new Error('Invalid encrypted API key')
  const secrets = readSecrets()
  for (const secret of secrets) {
    try {
      let plaintext: Buffer
      if (value.startsWith('v2:')) {
        const encoded = value.slice(3)
        if (!/^[\w-]+$/.test(encoded)) throw new Error('Invalid ciphertext')
        const data = Buffer.from(encoded, 'base64url')
        if (data.length < 45 || data.toString('base64url') !== encoded) throw new Error('Invalid ciphertext')
        const decipher = createDecipheriv('aes-256-gcm', scryptSync(secret, data.subarray(0, 16), 32), data.subarray(16, 28))
        decipher.setAAD(AAD)
        decipher.setAuthTag(data.subarray(28, 44))
        plaintext = Buffer.concat([decipher.update(data.subarray(44)), decipher.final()])
      } else {
        plaintext = decryptLegacy(value, secret)
      }
      const result = new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
      if (!result || plaintext.length > 8192) throw new Error('Invalid plaintext')
      return result
    } catch {
      // Never include plaintext, ciphertext or secrets in errors.
    }
  }
  throw new Error('Unable to decrypt API key with configured secrets')
}
