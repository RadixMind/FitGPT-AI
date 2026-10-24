import NextAuth from "next-auth"
import type { NextAuthConfig, User, Account, Profile } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Credentials from "next-auth/providers/credentials"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { verifyLoginProof } from './login-proof'

// 检查是否在构建时
function isBuildTime(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL
}

// 延迟初始化 Supabase Admin 客户端
let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    // 构建时返回一个 mock 客户端
    if (isBuildTime()) {
      console.log('Build time: using mock Supabase admin client')
      return {
        from: () => ({
          select: () => ({ single: async () => ({ data: null, error: 'Build time mock' }) }),
          eq: () => ({ single: async () => ({ data: null, error: 'Build time mock' }) }),
        }),
      } as any
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }
  return _supabaseAdmin
}

// 使用 Proxy 实现延迟访问
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const admin = getSupabaseAdmin()
    return admin[prop as keyof typeof admin]
  }
})

// Credentials Provider for manual login from aggregate callback
const CredentialsProvider = Credentials({
  id: "credentials",
  name: "Credentials",
  credentials: {
    userId: { label: "User ID", type: "text" },
    providerUserId: { label: "Provider User ID", type: "text" },
    loginProof: { label: "Server login proof", type: "text" }
  },
  async authorize(credentials) {
    if (!credentials?.userId || !credentials?.providerUserId) {
      return null
    }
    if (typeof credentials.userId !== 'string' || typeof credentials.providerUserId !== 'string' ||
        !await verifyLoginProof(credentials.loginProof, credentials.userId, credentials.providerUserId)) return null

    // 使用 Admin 客户端从数据库获取用户信息,绕过 RLS 限制
    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', credentials.userId as string)
      .eq('provider_user_id', credentials.providerUserId)
      .single()

    if (error || !userData || userData.is_active === false) {
      console.error('Failed to get user data:', error)
      return null
    }

    return {
      id: userData.id,
      name: userData.display_name,
      email: null,
      image: userData.avatar_url,
      providerUserId: userData.provider_user_id,
      provider: userData.provider
    }
  },
})

export const authConfig = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  providers: [CredentialsProvider],
  pages: {
    signIn: "/zh/signin", // 自定义登录页面路径，使用中文路径
  },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials provider 已经在 authorize 中验证了用户
      if (account?.provider === "credentials") {
        return true
      }
      return true
    },

    async jwt({ token, user, account }: { token: JWT; user?: User; account?: Account | null }): Promise<JWT> {
      console.log('[JWT Callback] token:', JSON.stringify({ sub: token.sub, id: token.id, name: token.name }))
      console.log('[JWT Callback] user:', user ? JSON.stringify({ id: user.id, name: user.name }) : 'null')
      console.log('[JWT Callback] account:', account ? account.provider : 'null')

      // 如果是新登录(有 account 和 user)
      if (account && user) {
        token.accessToken = account.access_token
        token.id = user.id
      }

      // 如果 token 中没有 id 但有 sub,从数据库获取用户信息(处理手动创建的 JWT)
      if (!token.id && token.sub) {
        console.log('[JWT Callback] Fetching user from database with provider_user_id:', token.sub)
        try {
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('provider_user_id', token.sub)
            .single()

          if (userData) {
            console.log('[JWT Callback] Found user in database:', userData.id)
            token.id = userData.id
          } else {
            console.log('[JWT Callback] User not found in database')
          }
        } catch (error) {
          console.error('[JWT Callback] Error fetching user from sub:', error)
        }
      }

      console.log('[JWT Callback] Final token:', JSON.stringify({ sub: token.sub, id: token.id, name: token.name }))
      return token
    },

    async session({ session, token }: { session: any; token: JWT }): Promise<any> {
      console.log('[Session Callback] token:', JSON.stringify({ sub: token.sub, id: token.id, name: token.name }))

      session.accessToken = token.accessToken
      if (session.user) {
        session.user.id = token.id as string

        console.log('[Session Callback] Fetching user data for id:', token.id)

        // 使用 Admin 客户端获取用户的最新信息
        try {
          const { data: userData, error } = await supabaseAdmin
            .from('users')
            .select('trust_level, display_name, is_active, is_silenced, provider, provider_user_id')
            .eq('id', token.id as string)
            .single()

          if (!error && userData) {
            console.log('[Session Callback] User data fetched:', JSON.stringify(userData))
            session.user.trustLevel = userData.trust_level || 1
            session.user.displayName = userData.display_name
            session.user.isActive = userData.is_active
            session.user.isSilenced = userData.is_silenced
            session.user.provider = userData.provider
            session.user.providerUserId = userData.provider_user_id
          } else {
            console.error('[Session Callback] Error fetching user data:', error)
            // 设置默认值
            session.user.trustLevel = 1
          }
        } catch (error) {
          console.error('[Session Callback] Error fetching user data:', error)
          // 设置默认值
          session.user.trustLevel = 1
        }
      }

      console.log('[Session Callback] Final session:', JSON.stringify({
        user: session.user ? {
          id: session.user.id,
          name: session.user.name,
          trustLevel: session.user.trustLevel
        } : null
      }))

      return session
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
