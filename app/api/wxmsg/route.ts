import { NextRequest, NextResponse } from 'next/server';
import { fetchWithLimits, readLimitedText } from '@/lib/bounded-io';

// 配置项 - 通过环境变量设置
const WX_TOKEN = process.env.WX_TOKEN || '';  // 微信开发者平台配置的TOKEN
const MSG_TOKEN = process.env.MSG_TOKEN || ''; // 森遇聚合登录的通信TOKEN

// 森遇后台设置的验证关键词和验证码格式
const VERIFY_KEYWORD = process.env.VERIFY_KEYWORD || '登录验证码';  // 验证关键词

// 微信签名验证
function checkSignature(signature: string, timestamp: string, nonce: string): boolean {
  if (!WX_TOKEN) {
    console.error('[WX Verify] WX_TOKEN is not set!');
    return false;
  }

  const arr = [WX_TOKEN, timestamp, nonce].sort();
  const tmpStr = arr.join('');

  // Node.js 环境 SHA1
  const crypto = require('crypto');
  const hash = crypto.createHash('sha1').update(tmpStr).digest('hex');

  console.log('[WX Verify] Signature comparison:', {
    expected: hash,
    received: signature,
    match: hash === signature
  });

  return hash === signature;
}

// 扩展的消息类型
interface WeChatMessage {
  content: string;
  msgType: string;
  fromUserName: string;
  toUserName: string;
  event?: string;        // 事件类型 (subscribe, unsubscribe, SCAN, CLICK 等)
  eventKey?: string;     // 事件KEY值
}

// 简单XML解析 - 提取消息内容
function parseWeChatMessage(xml: string): WeChatMessage | null {
  try {
    const contentMatch = xml.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/s);
    const msgTypeMatch = xml.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/s);
    const fromUserMatch = xml.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/s);
    const toUserMatch = xml.match(/<ToUserName><!\[CDATA\[(.*?)\]\]><\/ToUserName>/s);
    const eventMatch = xml.match(/<Event><!\[CDATA\[(.*?)\]\]><\/Event>/s);
    const eventKeyMatch = xml.match(/<EventKey><!\[CDATA\[(.*?)\]\]><\/EventKey>/s);

    return {
      content: contentMatch ? contentMatch[1].trim() : '',
      msgType: msgTypeMatch ? msgTypeMatch[1] : '',
      fromUserName: fromUserMatch ? fromUserMatch[1] : '',
      toUserName: toUserMatch ? toUserMatch[1] : '',
      event: eventMatch ? eventMatch[1] : undefined,
      eventKey: eventKeyMatch ? eventKeyMatch[1] : undefined
    };
  } catch (error) {
    console.error('[WX Parse] Failed to parse XML:', error);
    return null;
  }
}

// 判断是否是登录验证相关消息
function isLoginVerificationMessage(content: string): boolean {
  // 1. 检查是否是6位数字验证码
  if (/^\d{6}$/.test(content)) {
    console.log('[WX Message] Detected 6-digit verification code');
    return true;
  }
  
  // 2. 检查是否包含验证关键词
  if (content.includes(VERIFY_KEYWORD)) {
    console.log('[WX Message] Detected verification keyword:', VERIFY_KEYWORD);
    return true;
  }
  
  return false;
}

// 转发消息到森遇平台
async function forwardToSenyu(rawXml: string, searchParams: URLSearchParams): Promise<string> {
  const forwardUrl = new URL(`https://u.arsn.cn/wxpush.php`);
  forwardUrl.searchParams.set('app', MSG_TOKEN);
  
  // 转发所有微信推送的GET参数
  searchParams.forEach((value, key) => {
    if (key !== 'app') forwardUrl.searchParams.set(key, value);
  });

  // 构建POST表单数据
  const postParams = new URLSearchParams();
  postParams.set('mptoken', WX_TOKEN);
  postParams.set('xml', rawXml);

  console.log('[WX Message] Forwarding to configured provider');
  console.log('[WX Message] POST params: mptoken=***, xml length:', rawXml.length);

  const response = await fetchWithLimits(forwardUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: postParams.toString(),
  }, { timeoutMs: 15_000, maxBytes: 64 * 1024 });

  const result = await readLimitedText(response, 64 * 1024);
  console.log('[WX Message] Forward response status:', response.status);

  return result;
}

// 生成AI回复转移响应
function createAITransferResponse(toUserName: string, fromUserName: string): string {
  return `<xml>
  <ToUserName><![CDATA[${toUserName}]]></ToUserName>
  <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[transfer_biz_ai_ivr]]></MsgType>
</xml>`;
}

// 生成文本消息响应
function createTextResponse(toUserName: string, fromUserName: string, content: string): string {
  return `<xml>
  <ToUserName><![CDATA[${toUserName}]]></ToUserName>
  <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
}

// GET 请求 - 微信服务器验证
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get('signature') || '';
  const timestamp = searchParams.get('timestamp') || '';
  const nonce = searchParams.get('nonce') || '';
  const echostr = searchParams.get('echostr') || '';

  // 调试日志
  console.log('[WX Verify] Received request:', {
    signature: signature ? `${signature.substring(0, 10)}...` : 'empty',
    timestamp,
    nonce,
    echostr: echostr ? 'present' : 'empty',
    WX_TOKEN: WX_TOKEN ? `set (${WX_TOKEN.length} chars)` : 'NOT SET'
  });

  // 微信验证请求
  if (echostr) {
    const isValid = checkSignature(signature, timestamp, nonce);
    console.log('[WX Verify] Signature check result:', isValid);

    if (isValid) {
      console.log('[WX Verify] Success, returning echostr');
      return new NextResponse(echostr, { status: 200 });
    }
    console.log('[WX Verify] Failed - invalid signature');
    return new NextResponse('Invalid signature', { status: 403 });
  }

  return new NextResponse('OK', { status: 200 });
}

// POST 请求 - 接收微信消息并处理
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  console.log('[WX Message] Received POST request');
  console.log('[WX Message] MSG_TOKEN:', MSG_TOKEN ? `set (${MSG_TOKEN.length} chars)` : 'NOT SET');
  console.log('[WX Message] WX_TOKEN:', WX_TOKEN ? `set (${WX_TOKEN.length} chars)` : 'NOT SET');

  if (!MSG_TOKEN) {
    console.error('[WX Message] MSG_TOKEN not configured');
    return new NextResponse('MSG_TOKEN not configured', { status: 500 });
  }

  try {
    // 获取原始 XML 数据
    const rawXml = await request.text();
    console.log('[WX Message] Raw XML:', rawXml.substring(0, 500));

    // 解析消息
    const message = parseWeChatMessage(rawXml);
    
    if (!message) {
      console.log('[WX Message] Failed to parse message, returning success');
      return new NextResponse('success', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    console.log('[WX Message] Parsed message:', {
      msgType: message.msgType,
      event: message.event,
      content: message.content.substring(0, 50),
      fromUserName: message.fromUserName
    });

    // 处理事件消息
    if (message.msgType === 'event') {
      console.log('[WX Message] Event message received:', message.event);
      
      switch (message.event) {
        case 'subscribe':
          // 关注事件 - 转发给森遇处理欢迎消息
          console.log('[WX Message] Subscribe event, forwarding to Senyu');
          const subscribeResult = await forwardToSenyu(rawXml, searchParams);
          return new NextResponse(subscribeResult, {
            status: 200,
            headers: { 'Content-Type': 'text/xml; charset=utf-8' }
          });
          
        case 'unsubscribe':
          // 取消关注事件 - 不需要回复
          console.log('[WX Message] Unsubscribe event, no response needed');
          return new NextResponse('success', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          });
          
        case 'SCAN':
          // 扫描带参数二维码事件 - 转给AI处理
          console.log('[WX Message] SCAN event with key:', message.eventKey);
          const scanResponse = createAITransferResponse(message.fromUserName, message.toUserName);
          return new NextResponse(scanResponse, {
            status: 200,
            headers: { 'Content-Type': 'text/xml; charset=utf-8' }
          });
          
        case 'CLICK':
          // 自定义菜单点击事件 - 转给AI处理
          console.log('[WX Message] CLICK event with key:', message.eventKey);
          const clickResponse = createAITransferResponse(message.fromUserName, message.toUserName);
          return new NextResponse(clickResponse, {
            status: 200,
            headers: { 'Content-Type': 'text/xml; charset=utf-8' }
          });
          
        default:
          // 其他事件 - 转给AI处理
          console.log('[WX Message] Other event, transferring to AI');
          const defaultEventResponse = createAITransferResponse(message.fromUserName, message.toUserName);
          return new NextResponse(defaultEventResponse, {
            status: 200,
            headers: { 'Content-Type': 'text/xml; charset=utf-8' }
          });
      }
    }

    // 处理文本消息
    if (message.msgType === 'text') {
      // 判断是否是登录验证相关消息
      if (isLoginVerificationMessage(message.content)) {
        console.log('[WX Message] Login verification message detected, forwarding to Senyu');
        const result = await forwardToSenyu(rawXml, searchParams);
        return new NextResponse(result, {
          status: 200,
          headers: { 'Content-Type': 'text/xml; charset=utf-8' }
        });
      }

      // 非登录验证消息 - 转给AI处理
      console.log('[WX Message] Regular text message, transferring to AI');
      const aiResponse = createAITransferResponse(message.fromUserName, message.toUserName);
      return new NextResponse(aiResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' }
      });
    }

    // 其他类型消息（图片、语音、视频等）- 转给AI处理
    console.log('[WX Message] Non-text message type:', message.msgType, ', transferring to AI');
    const otherResponse = createAITransferResponse(message.fromUserName, message.toUserName);
    return new NextResponse(otherResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' }
    });

  } catch (error) {
    console.error('[WX Message] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
