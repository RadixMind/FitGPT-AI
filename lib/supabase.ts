import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 缓存客户端实例
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

// 检查是否在构建时
function isBuildTime(): boolean {
  // 如果没有设置 Supabase URL，认为是构建时
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const isProd = process.env.NODE_ENV === 'production'
  const isVercelBuild = process.env.VERCEL && !process.env.VERCEL_ENV
  const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'

  const buildTime = !hasUrl || isVercelBuild || isNextBuild

  if (buildTime) {
    console.log('Build time detected:', {
      hasUrl,
      isProd,
      isVercelBuild,
      isNextBuild,
      NODE_ENV: process.env.NODE_ENV
    })
  }

  return buildTime
}

// 获取环境变量的函数
function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 构建时返回占位配置，允许构建完成
  if (isBuildTime()) {
    console.log('Using placeholder Supabase config for build')
    return {
      supabaseUrl: 'https://build-placeholder.supabase.co',
      supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
      supabaseServiceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-service'
    }
  }

  // 调试信息 (仅在开发环境或预览环境显示)
  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview') {
    console.log('Supabase Environment Check:', {
      url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING',
      anonKeyConfigured: !!supabaseAnonKey,
      serviceKeyConfigured: !!supabaseServiceKey
    })
  }

  // 验证必需的环境变量
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
  }

  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceKey }
}

// 延迟初始化的 Supabase 客户端
export function getSupabase() {
  if (!_supabase) {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig()
    _supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabase
}

// 延迟初始化的 Supabase Admin 客户端
export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig()
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
  }
  return _supabaseAdmin
}

// 向后兼容的导出
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabase()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  }
})

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseAdmin()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  }
})

// 数据库类型定义
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          provider_user_id: string | null
          provider: string | null
          username: string | null
          display_name: string | null
          avatar_url: string | null
          email: string | null
          trust_level: number
          is_active: boolean
          is_silenced: boolean
          last_login_at: string | null
          login_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_user_id?: string | null
          provider?: string | null
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          trust_level?: number
          is_active?: boolean
          is_silenced?: boolean
          last_login_at?: string | null
          login_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_user_id?: string | null
          provider?: string | null
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          email?: string | null
          trust_level?: number
          is_active?: boolean
          is_silenced?: boolean
          last_login_at?: string | null
          login_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          user_id: string
          weight: number | null
          height: number | null
          age: number | null
          gender: string | null
          activity_level: string | null
          goal: string | null
          target_weight: number | null
          target_calories: number | null
          notes: string | null
          professional_mode: boolean | null
          medical_history: string | null
          lifestyle: string | null
          health_awareness: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          weight?: number | null
          height?: number | null
          age?: number | null
          gender?: string | null
          activity_level?: string | null
          goal?: string | null
          target_weight?: number | null
          target_calories?: number | null
          notes?: string | null
          professional_mode?: boolean | null
          medical_history?: string | null
          lifestyle?: string | null
          health_awareness?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          weight?: number | null
          height?: number | null
          age?: number | null
          gender?: string | null
          activity_level?: string | null
          goal?: string | null
          target_weight?: number | null
          target_calories?: number | null
          notes?: string | null
          professional_mode?: boolean | null
          medical_history?: string | null
          lifestyle?: string | null
          health_awareness?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      shared_keys: {
        Row: {
          id: string
          user_id: string
          name: string
          base_url: string
          api_key_encrypted: string
          available_models: string[]
          daily_limit: number
          description: string | null
          tags: string[] | null
          is_active: boolean
          usage_count_today: number
          total_usage_count: number
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          base_url: string
          api_key_encrypted: string
          available_models: string[]
          daily_limit?: number
          description?: string | null
          tags?: string[] | null
          is_active?: boolean
          usage_count_today?: number
          total_usage_count?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          base_url?: string
          api_key_encrypted?: string
          available_models?: string[]
          daily_limit?: number
          description?: string | null
          tags?: string[] | null
          is_active?: boolean
          usage_count_today?: number
          total_usage_count?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      key_usage_logs: {
        Row: {
          id: string
          shared_key_id: string
          user_id: string
          api_endpoint: string
          model_used: string
          tokens_used: number | null
          cost_estimate: number | null
          success: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          shared_key_id: string
          user_id: string
          api_endpoint: string
          model_used: string
          tokens_used?: number | null
          cost_estimate?: number | null
          success: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          shared_key_id?: string
          user_id?: string
          api_endpoint?: string
          model_used?: string
          tokens_used?: number | null
          cost_estimate?: number | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
      }
      coach_snapshots: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string
          conversation_data: any
          model_config: any
          health_data_snapshot: any
          user_rating: number
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description: string
          conversation_data: any
          model_config: any
          health_data_snapshot: any
          user_rating: number
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string
          conversation_data?: any
          model_config?: any
          health_data_snapshot?: any
          user_rating?: number
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      ai_memories: {
        Row: {
          id: string
          user_id: string
          expert_id: string
          content: string
          version: number
          last_updated: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          expert_id: string
          content: string
          version?: number
          last_updated?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          expert_id?: string
          content?: string
          version?: number
          last_updated?: string
          created_at?: string
        }
      }
      snapshot_ratings: {
        Row: {
          id: string
          snapshot_id: string
          user_id: string
          rating: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          snapshot_id: string
          user_id: string
          rating: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          snapshot_id?: string
          user_id?: string
          rating?: number
          comment?: string | null
          created_at?: string
        }
      }
    }
  }
}
