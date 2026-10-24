const used = new Map<string, number>()
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))

async function signingKey() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret || new TextEncoder().encode(secret).length < 32) throw new Error('A strong authentication secret is required')
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** Only the server callback, after verifying the upstream login code, can issue this proof. */
export async function issueLoginProof(userId: string, providerUserId: string): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ userId, providerUserId, expires: Date.now() + 60_000, nonce: crypto.randomUUID() })))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(`fitgpt-login-v1:${payload}`))
  return `${payload}.${encode(new Uint8Array(signature))}`
}

export async function verifyLoginProof(proof: unknown, userId: string, providerUserId: string): Promise<boolean> {
  if (typeof proof !== 'string' || proof.length > 2048 || !/^[\w-]+\.[\w-]+$/.test(proof)) return false
  try {
    const [payload, signature] = proof.split('.')
    if (!await crypto.subtle.verify('HMAC', await signingKey(), decode(signature), new TextEncoder().encode(`fitgpt-login-v1:${payload}`))) return false
    const data = JSON.parse(new TextDecoder().decode(decode(payload)))
    const now = Date.now()
    if (data.userId !== userId || data.providerUserId !== providerUserId || !Number.isFinite(data.expires) || data.expires <= now || data.expires > now + 60_000 || typeof data.nonce !== 'string') return false
    for (const [nonce, expiry] of used) if (expiry <= now) used.delete(nonce)
    if (used.has(data.nonce) || used.size >= 5000) return false
    used.set(data.nonce, data.expires)
    return true
  } catch { return false }
}
