import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signIn } from '@/lib/auth'
import { issueLoginProof } from '@/lib/login-proof'
import { getAggregateLoginURL } from '@/lib/aggregate-login-url'
import { fetchWithLimits, readLimitedJSON } from '@/lib/bounded-io'

// 聚合登录 API 基础地址

// 支持的登录类型
type AggregateLoginType = 'qq' | 'wx' | 'wxmp' | 'alipay'
const VALID_LOGIN_TYPES: AggregateLoginType[] = ['qq', 'wx', 'wxmp', 'alipay']

// 处理聚合登录回调
// 这个endpoint接收来自聚合登录服务的回调,直接处理用户认证
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const { searchParams } = url

    const type = searchParams.get('type') as AggregateLoginType
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!state || state !== request.cookies.get('fitgpt-login-state')?.value) {
      return NextResponse.json({ error: 'Invalid login state' }, { status: 400 })
    }
    const error = searchParams.get('error')

    if (error) {
      throw new Error(`Login error: ${error}`)
    }

    if (!type || !code) {
      throw new Error('Missing required parameters')
    }

    if (!VALID_LOGIN_TYPES.includes(type)) {
      throw new Error('Invalid login type')
    }

    // 获取聚合登录配置
    const appid = process.env.AGGREGATE_LOGIN_APPID
    const appkey = process.env.AGGREGATE_LOGIN_APPKEY

    if (!appid || !appkey) {
      throw new Error('Aggregate login not configured')
    }


    // 调用聚合登录API获取用户信息
    const params = new URLSearchParams({
      act: 'callback',
      appid,
      appkey,
      type,
      code
    })

    const apiResponse = await fetchWithLimits(`${getAggregateLoginURL()}?${params.toString()}`, {}, { timeoutMs: 15_000, maxBytes: 64 * 1024 })

    if (!apiResponse.ok) {
      throw new Error(`Failed to fetch user info: ${apiResponse.status}`)
    }

    const data = await readLimitedJSON(apiResponse, 64 * 1024)

    // 检查响应格式
    if (data.code !== 0) {
      throw new Error(`API error: ${data.msg || 'Unknown error'}`)
    }

    // 检查是否有必要的用户信息
    if (!data.social_uid) {
      throw new Error('No user data returned from API')
    }

    // 创建或更新用户
    const providerUserId = `${type}_${data.social_uid}`
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    // 检查用户是否已存在
    const { data: existingUser, error: findError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("provider_user_id", providerUserId)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error("Error finding user:", findError);
      throw new Error('Database error')
    }

    const now = new Date().toISOString();

    // 检查是否为管理员
    const adminUserIds = process.env.ADMIN_USER_IDS?.split(',') || [];
    const isAdmin = adminUserIds.includes(providerUserId);

    // 默认信任等级:普通用户为1,管理员为4
    const defaultTrustLevel = isAdmin ? 4 : 1;

    let userId: string;
    let userName: string;

    if (existingUser) {
      // 用户已存在,更新用户信息
      const loginCount = await getAndIncrementLoginCount(supabaseAdmin, existingUser.id);

      const updateData = {
        username: data.nickname || providerUserId,
        display_name: data.nickname || providerUserId,
        avatar_url: data.faceimg,
        provider: type,
        last_login_at: now,
        login_count: loginCount,
        updated_at: now
      };

      console.log("Updating user with data:", JSON.stringify(updateData, null, 2));

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update(updateData)
        .eq("id", existingUser.id);

      if (updateError) {
        console.error("Error updating user:", updateError);
        throw new Error('Failed to update user')
      }

      userId = existingUser.id;
      userName = updateData.display_name;
    } else {
      // 用户不存在,创建新用户
      const insertData = {
        provider_user_id: providerUserId,
        provider: type,
        username: data.nickname || providerUserId,
        display_name: data.nickname || providerUserId,
        avatar_url: data.faceimg,
        trust_level: defaultTrustLevel,
        is_active: true,
        is_silenced: false,
        last_login_at: now,
        login_count: 1,
        created_at: now,
        updated_at: now
      };

      console.log("Creating new user with data:", JSON.stringify(insertData, null, 2));

      const { data: newUser, error: createError } = await supabaseAdmin
        .from("users")
        .insert(insertData)
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating user:", createError);
        throw new Error('Failed to create user')
      }

      userId = newUser.id;
      userName = insertData.display_name;
    }

    // 使用 NextAuth signIn 来创建 session
    console.log('Signing in user with credentials:', { userId, providerUserId })

    try {
      await signIn('credentials', {
        userId: userId,
        providerUserId: providerUserId,
        loginProof: await issueLoginProof(userId, providerUserId),
        redirect: false,
      })

      console.log('NextAuth signIn successful')
    } catch (signInError) {
      console.error('NextAuth signIn error:', signInError)
      throw new Error('Failed to create session')
    }

    // 重定向到首页
    const redirectUrl = `${process.env.NEXTAUTH_URL}/zh`
    console.log('Login successful, redirecting to:', redirectUrl)

    const response = NextResponse.redirect(redirectUrl)
    response.cookies.delete('fitgpt-login-state')
    return response

  } catch (error) {
    console.error('Aggregate login callback error:', error)
    const redirectUrl = `${process.env.NEXTAUTH_URL}/zh/signin?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`
    return NextResponse.redirect(redirectUrl)
  }
}

// 辅助函数:获取并增加登录计数
async function getAndIncrementLoginCount(supabase: any, userId: string): Promise<number> {
  try {
    const { data: currentUser } = await supabase
      .from("users")
      .select("login_count")
      .eq("id", userId)
      .single();

    return (currentUser?.login_count || 0) + 1;
  } catch {
    return 1;
  }
}
