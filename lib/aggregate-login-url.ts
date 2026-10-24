export function getAggregateLoginURL(): string {
  const url = new URL(process.env.AGGREGATE_LOGIN_API_URL || 'https://u.arsn.cn/connect.php')
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Aggregate login URL must use HTTPS or a loopback HTTP address')
  }
  return url.toString()
}
