import { NextRequest, NextResponse } from 'next/server'
import { getTempUserData, deleteTempUserData } from '@/lib/temp-user-store'

// NextAuth 的 token endpoint
// 这个endpoint被NextAuth调用来交换authorization code获取access token
export async function POST(request: NextRequest) {
  try {
    // NextAuth 会以 form-urlencoded 格式发送数据
    const contentType = request.headers.get('content-type') || ''
    let code: string | null = null

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      code = formData.get('code') as string
    } else {
      const body = await request.json()
      code = body.code
    }

    if (typeof code !== 'string' || !code || code.length > 2048) {
      return NextResponse.json(
        { error: 'Missing authorization code' },
        { status: 400 }
      )
    }

    // 从临时存储获取用户数据
    const userData = getTempUserData(code)

    if (!userData) {
      return NextResponse.json(
        { error: 'Invalid or expired authorization code' },
        { status: 400 }
      )
    }

    deleteTempUserData(code)

    // 返回符合 OAuth 2.0 标准的 token 响应
    const tokenResponse = {
      access_token: userData.access_token,
      token_type: 'Bearer',
      expires_in: 86400, // 24小时
      // 将用户数据编码为 access_token 的一部分,这样 userinfo endpoint 可以解码
      user_data: {
        social_uid: userData.social_uid,
        nickname: userData.nickname,
        faceimg: userData.faceimg,
        gender: userData.gender,
        location: userData.location,
        email: userData.email,
        mobile: userData.mobile,
        type: userData.type
      }
    }

    console.log('Returning token response')

    return NextResponse.json(tokenResponse, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Token endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to process token request' },
      { status: 500 }
    )
  }
}
