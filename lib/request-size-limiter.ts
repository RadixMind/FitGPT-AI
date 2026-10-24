import { NextRequest, NextResponse } from 'next/server'
import { discardLimitedBody, InputLimitError, readLimitedText, validateInputComplexity } from './bounded-io'

function getSizeLimit(path: string): number {
  if (path.includes('/settings')) return 100 * 1024
  if (path.includes('/shared-keys')) return 50 * 1024
  if (path.includes('/chat') || path.includes('/openai')) return 10 * 1024 * 1024
  if (path.includes('/upload')) return 50 * 1024 * 1024
  if (path.includes('/admin')) return 200 * 1024
  if (path.includes('/sync')) return 500 * 1024
  if (path.includes('/ai/')) return 5 * 1024 * 1024
  return 1024 * 1024
}

export async function checkRequestSize(req: NextRequest): Promise<NextResponse | null> {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return null
  const limit = getSizeLimit(req.nextUrl.pathname)
  try {
    const advertised = req.headers.get('content-length')
    if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > limit)) throw new InputLimitError()
    const clone = req.clone()
    const contentType = req.headers.get('content-type')?.toLowerCase() || ''
    if (contentType.startsWith('multipart/')) {
      await discardLimitedBody(new Response(clone.body), limit)
    } else {
      const text = await readLimitedText(new Response(clone.body), limit)
      if (text && (contentType.includes('application/json') || /^[\s]*[\[{]/.test(text))) validateInputComplexity(JSON.parse(text))
    }
    return null
  } catch (error) {
    void req.body?.cancel().catch(() => {})
    const tooLarge = error instanceof InputLimitError
    return NextResponse.json({ error: tooLarge ? 'Request exceeds safety limits' : 'Invalid request body', code: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST' }, { status: tooLarge ? 413 : 400 })
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${Number((bytes / 1024 ** unit).toFixed(2))} ${['Bytes', 'KB', 'MB', 'GB'][unit]}`
}

export function getSizeLimits() {
  return Object.fromEntries(['default', 'settings', 'shared-keys', 'chat', 'upload', 'admin', 'sync', 'ai'].map(name => [name, getSizeLimit(`/api/${name}/`)]))
}
