export function sqlIdentifier(value: string): string {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(value)) throw new Error('Invalid SQL identifier')
  return value.split('.').map(part => `"${part}"`).join('.')
}

export function sqlProjection(value = '*'): string {
  return value.split(',').map(part => part.trim() === '*' ? '*' : sqlIdentifier(part.trim())).join(', ')
}

export function pageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new Error('Invalid pagination value')
  return value
}
