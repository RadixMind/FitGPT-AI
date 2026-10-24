import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n';
import { createClient } from '@supabase/supabase-js';
import { getClientIP } from './lib/ip-utils';
import { checkUserBan } from './lib/user-ban-middleware';
import { checkRequestSize } from './lib/request-size-limiter';

// 延迟获取 Supabase 客户端（避免构建时初始化）
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// 简化的安全事件记录函数（避免循环依赖）
async function logSecurityEvent(event: {
  ipAddress: string;
  userAgent?: string;
  eventType: string;
  severity: string;
  description: string;
  metadata?: Record<string, any>;
  userId?: string; // 可选的用户ID
}) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return; // 构建时或环境变量未设置时跳过

    await supabase.from('security_events').insert({
      ip_address: event.ipAddress,
      user_id: event.userId || null, // 如果没有用户ID则为null
      user_agent: event.userAgent,
      event_type: event.eventType,
      severity: event.severity,
      description: event.description,
      metadata: event.metadata || {}
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

// 尝试从请求中获取用户ID（如果可能）
async function tryGetUserIdFromRequest(req: NextRequest): Promise<string | undefined> {
  try {
    // 尝试从Authorization头获取token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    const supabase = getSupabaseClient();
    if (!supabase) return undefined; // 构建时或环境变量未设置时跳过

    const { data: { user }, error } = await supabase.auth.getUser(token);
    return user?.id;
  } catch (error) {
    // 忽略错误，返回undefined
    return undefined;
  }
}

// 速率限制配置
const RATE_LIMIT_CONFIG = {
  // 同步API限制：每分钟最多20次请求（在专用限制器中还有更细粒度的控制）
  sync: { requests: 20, window: 60 * 1000 },
  // AI API限制：每分钟最多10次请求
  ai: { requests: 10, window: 60 * 1000 },
  // 上传路由限制：每分钟最多3次请求
  upload: { requests: 3, window: 60 * 1000 },
  // 管理API限制：每分钟最多20次请求
  admin: { requests: 20, window: 60 * 1000 },
  // 一般API限制：每分钟最多30次请求
  api: { requests: 30, window: 60 * 1000 },
  // 全局限制：每分钟最多50次请求
  global: { requests: 50, window: 60 * 1000 }
};

// 内存中的速率限制存储（生产环境建议使用Redis）
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// 用户级别的速率限制存储
const userRateLimitStore = new Map<string, { count: number; resetTime: number }>();

// 清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
  for (const [key, value] of userRateLimitStore.entries()) {
    if (now > value.resetTime) {
      userRateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次

function getRateLimitKey(ip: string, path: string): string {
  return `${ip}:${path}`;
}

async function checkIPBan(ip: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return false; // 构建时或环境变量未设置时跳过

    const { data, error } = await supabase
      .rpc('is_ip_banned', { check_ip: ip });

    if (error) {
      console.error('Error checking IP ban:', error);
      return false;
    }

    return data && data.length > 0 && data[0].is_banned;
  } catch (error) {
    console.error('Error in IP ban check:', error);
    return false;
  }
}

function getApiCategory(path: string): keyof typeof RATE_LIMIT_CONFIG {
  if (path.startsWith('/api/sync/')) return 'sync';
  if (path.startsWith('/api/ai/') || path.startsWith('/api/openai/')) return 'ai';
  if (path.startsWith('/api/admin/')) return 'admin';
  if (path.includes('upload') || path.includes('image')) return 'upload';
  if (path.startsWith('/api/')) return 'api';
  return 'global';
}

// getClientIP 函数已移动到 lib/ip-utils.ts

async function checkRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = getClientIP(req);
  const path = req.nextUrl.pathname;

  // 🚫 首先检查IP是否被封禁
  const isBanned = await checkIPBan(ip);
  if (isBanned) {
    return NextResponse.json(
      {
        error: 'IP address is banned',
        code: 'IP_BANNED',
        message: 'Your IP address has been banned due to suspicious activity. Please contact support if you believe this is an error.'
      },
      {
        status: 403,
        headers: {
          'X-Ban-Status': 'banned',
          'X-Ban-Reason': 'security_violation'
        }
      }
    );
  }

  // 🔒 进行速率限制检查
  const category = getApiCategory(path);
  const config = RATE_LIMIT_CONFIG[category];

  // 创建更精确的限制键：IP + 具体路径
  const limitKey = `${ip}:${path}`;
  const now = Date.now();

  // 检查IP级别限制
  const ipRecord = rateLimitStore.get(limitKey);

  if (!ipRecord || now > ipRecord.resetTime) {
    // 创建新记录或重置过期记录
    rateLimitStore.set(limitKey, {
      count: 1,
      resetTime: now + config.window
    });
  } else {
    if (ipRecord.count >= config.requests) {
      // 尝试获取用户ID
      const userId = await tryGetUserIdFromRequest(req);

      // 记录速率限制违规
      await logSecurityEvent({
        ipAddress: ip,
        userId,
        userAgent: req.headers.get('user-agent') || 'unknown',
        eventType: 'rate_limit_exceeded',
        severity: 'medium',
        description: `Rate limit exceeded for ${category} API: ${path}`,
        metadata: {
          path,
          category,
          limit: config.requests,
          window: config.window,
          attempts: ipRecord.count + 1,
          hasUserId: !!userId
        }
      });

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((ipRecord.resetTime - now) / 1000),
          category,
          limit: config.requests
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(ipRecord.resetTime / 1000).toString(),
            'X-RateLimit-Category': category,
            'Retry-After': Math.ceil((ipRecord.resetTime - now) / 1000).toString()
          }
        }
      );
    }

    // 增加计数
    ipRecord.count++;
    rateLimitStore.set(limitKey, ipRecord);
  }

  return null;
}

const intlMiddleware = createMiddleware({
  // 支持的语言列表
  locales,
  // 默认语言
  defaultLocale,
  // 始终显示语言前缀，确保语言状态稳定
  localePrefix: 'always',
  // 语言检测策略
  localeDetection: true
});

export default async function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && req.nextUrl.pathname.startsWith('/api/debug')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const path = req.nextUrl.pathname;

  // 🔒 第一层：请求大小检查（防止超大请求攻击）
  const sizeCheckResponse = await checkRequestSize(req);
  if (sizeCheckResponse) {
    return sizeCheckResponse;
  }

  // 🔒 第二层：IP级别的速率限制（保护认证端点）
  const securityResponse = await checkRateLimit(req);
  if (securityResponse) {
    return securityResponse;
  }

  // 👤 第三层：用户封禁检查（仅对已认证的API路径）
  // 注意：这里只检查已经有用户会话的请求
  if (path.startsWith('/api/') && !isPublicApiPath(path)) {
    const userBanResponse = await checkUserBan(req);
    if (userBanResponse) {
      return userBanResponse;
    }
  }

  // 🚫 API路由不需要国际化处理，直接通过
  if (path.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 🌐 只对非API路由进行国际化处理
  return intlMiddleware(req);
}

// 判断是否为公共API路径（不需要认证的路径）
function isPublicApiPath(path: string): boolean {
  const publicPaths = [
    '/api/auth',           // 认证相关
    '/api/debug',          // 调试端点
    '/api/health',         // 健康检查
    '/api/public'          // 公共API
  ];

  return publicPaths.some(publicPath => path.startsWith(publicPath));
}

export const config = {
  // 匹配所有路径，除了以下路径：
  // - _next 静态文件
  // - _vercel 部署文件
  // - 静态资源文件
  matcher: ['/((?!_next|_vercel|.*\\..*).*)', '/api/(.*)']
};
