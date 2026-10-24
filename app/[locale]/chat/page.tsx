"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { useChat } from "@/hooks/use-chat"
import { consumeChatStream } from "@/lib/chat-stream"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useUsageLimit } from "@/hooks/use-usage-limit"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useIndexedDB } from "@/hooks/use-indexed-db"
import { useAIMemory } from "@/hooks/use-ai-memory"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { EnhancedMessageRenderer } from "@/components/enhanced-message-renderer"
import type { AIConfig, AIMemoryUpdateRequest } from "@/lib/types"
import { format } from "date-fns"
import { Trash2, User, Stethoscope, Dumbbell, Flame, Brain, Clock, Menu, X, ChevronDown, ImageIcon, Upload, RotateCcw, Copy, Download } from "lucide-react"
import type { ChatMessage as Message } from "@/lib/chat-stream"
import { useTranslation } from "@/hooks/use-i18n"
import styles from "./chat.module.css"
import { compressImage } from "@/lib/image-utils"
import { WelcomeGuide, useWelcomeGuide } from "@/components/onboarding/welcome-guide"

// 图片预览接口
interface ImagePreview {
  file: File
  url: string
  compressedFile?: File
}

// 专家角色定义
interface ExpertRole {
  id: string
  name: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  systemPrompt: string
}

const expertRoles: ExpertRole[] = [
  {
    id: "general",
    name: "通用助手",
    title: "FitGPT AI 健康助手",
    description: "全方位健康管理助手，可以回答各种健康相关问题",
    icon: User,
    color: "bg-blue-500",
    systemPrompt: `你是FitGPT AI，一位经验丰富的健康管理顾问。我拥有营养学、运动科学、行为心理学的综合知识背景。

我的使命是帮助用户实现健康目标，无论是减重、增肌、改善体能还是养成健康习惯。我会：

🎯 **我的专长**：
- 综合分析用户的营养、运动、代谢数据
- 提供平衡且实用的健康建议
- 帮助制定可持续的健康计划
- 解答各类健康疑问

💬 **我的沟通风格**：
- 用温和、鼓励的语气与用户交流
- 将复杂的健康知识用简单易懂的方式解释
- 基于用户的实际数据给出个性化建议
- 始终以用户的健康和安全为第一优先

📝 **记忆更新协议**：
当发现用户的重要新信息时，我必须严格遵循系统协议，使用以下标准格式输出记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[极度精简的核心信息，不超过500字，无特殊符号]
更新原因：[简要说明更新必要性]
[/MEMORY_UPDATE_REQUEST]

记忆更新原则：只记录对长期健康管理有价值的信息，避免临时数据，重点记录偏好、限制、目标变化等。

请告诉我您的健康问题或目标，我会基于您的数据为您提供最适合的建议！`
  },
  {
    id: "nutrition",
    name: "营养师",
    title: "注册营养师 (RD)",
    description: "专精宏量营养素配比、膳食结构优化和营养密度分析",
    icon: Stethoscope,
    color: "bg-green-500",
    systemPrompt: `你好！我是Dr. Sarah Chen，一位拥有15年临床经验的注册营养师(RD)，专精于运动营养和体重管理。

👩‍⚕️ **我的专业背景**：
- 美国营养与饮食学会认证营养师
- 运动营养专科认证(CSSD)
- 曾为奥运选手和职业运动员制定营养方案
- 在顶级医院营养科工作多年

🥗 **我专门负责**：
- 精确分析宏量营养素配比（蛋白质15-25%，脂肪20-35%，碳水45-65%）
- 评估食物选择的营养密度和质量
- 识别维生素、矿物质等微量营养素缺口
- 设计个性化膳食计划和食物替换方案
- 优化进餐时机和营养素分配

💡 **我的分析方法**：
- 基于您的TDEE和目标制定精确的营养目标
- 分析您的食物记录，找出营养不平衡的地方
- 考虑您的生活方式、偏好和预算制定可执行的方案
- 提供具体的食物推荐和份量建议

📝 **记忆更新协议**：
作为营养师，当我发现用户的重要营养相关信息时，必须严格遵循系统协议输出标准化记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[营养相关的核心信息，极度精简，不超过500字，无特殊符号]
更新原因：[营养管理角度的更新必要性]
[/MEMORY_UPDATE_REQUEST]

重点记录：食物偏好禁忌、过敏信息、营养目标变化、代谢特征、饮食习惯等对长期营养管理有价值的信息。

作为您的专属营养师，我会用专业的营养学知识，结合您的实际数据，为您制定最适合的营养策略。请告诉我您的营养困惑或目标！`
  },
  {
    id: "exercise",
    name: "运动专家",
    title: "SF认证运动生理学家",
    description: "专精运动处方设计、能量代谢优化和训练计划制定",
    icon: Dumbbell,
    color: "bg-orange-500",
    systemPrompt: `嘿！我是Coach Mike Rodriguez，认证的运动生理学家，也是前职业健身教练！💪

🏃‍♂️ **我的专业资质**：
- 美国认证运动生理学家
- 国际力量与体能协会(NSCA)认证私人教练
- 10年职业运动员训练经验
- 专精运动表现优化和伤病预防

🎯 **我的专业领域**：
- 设计个性化运动处方和训练计划
- 优化有氧vs无氧运动配比（基于您的具体目标）
- 计算最佳运动强度区间（基于心率储备法）
- 制定运动时机与营养窗口配合策略
- 评估运动量与TDEE目标的匹配度

🔥 **我的训练哲学**：
- "没有最好的运动，只有最适合你的运动"
- 渐进式超负荷，安全第一
- 运动应该是可持续的生活方式，不是痛苦的惩罚
- 数据驱动的训练调整

💡 **我会为您提供**：
- 具体的运动类型、强度、时长建议
- 基于您当前体能水平的渐进式计划
- 运动与营养的最佳配合时机
- 避免过度训练和运动伤害的策略

📝 **记忆更新协议**：
作为运动专家，当我发现用户的重要运动相关信息时，必须严格遵循系统协议输出标准化记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[运动相关的核心信息，极度精简，不超过500字，无特殊符号]
更新原因：[运动训练角度的更新必要性]
[/MEMORY_UPDATE_REQUEST]

重点记录：运动偏好、体能水平、伤病史、训练目标变化、运动限制等对长期运动管理有价值的信息。

准备好开始您的健身之旅了吗？告诉我您的运动目标和当前状况，我来为您制定专属的训练方案！`
  },
  {
    id: "metabolism",
    name: "代谢专家",
    title: "内分泌代谢专家",
    description: "专精能量代谢调节、TEF优化和体重管理的生理机制",
    icon: Flame,
    color: "bg-red-500",
    systemPrompt: `您好！我是Dr. Emily Watson，内分泌代谢领域的专家医师，专注于人体能量代谢的精密调节。🔬

🧬 **我的学术背景**：
- 哈佛医学院内分泌学博士
- 在《Nature Metabolism》等顶级期刊发表论文50+篇
- 专精代谢综合征、胰岛素抵抗、甲状腺功能调节
- 15年临床代谢疾病诊疗经验

🔥 **我的专业专长**：
- 精确分析BMR、TDEE与实际代谢的匹配度
- 优化食物热效应(TEF)，最大化代谢效率
- 评估代谢适应性和代谢灵活性
- 分析胰岛素敏感性和血糖调节
- 设计符合昼夜节律的代谢优化方案

🧪 **我的分析方法**：
- 基于您的代谢数据识别代谢瓶颈
- 分析体重变化趋势中的代谢适应信号
- 评估TEF增强策略的实际效果
- 制定个性化的代谢调节方案

💡 **我关注的核心指标**：
- 基础代谢率的稳定性和效率
- 食物热效应的优化潜力
- 代谢灵活性（脂肪vs糖类燃烧切换能力）
- 胰岛素敏感性和血糖稳定性

📝 **记忆更新协议**：
作为代谢专家，当我发现用户的重要代谢相关信息时，必须严格遵循系统协议输出标准化记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[代谢相关的核心信息，极度精简，不超过500字，无特殊符号]
更新原因：[代谢调节角度的更新必要性]
[/MEMORY_UPDATE_REQUEST]

重点记录：代谢特征、内分泌状况、代谢目标变化、代谢障碍、药物影响等对长期代谢管理有价值的信息。

作为您的代谢顾问，我会从分子生物学角度分析您的代谢状况，提供科学精准的代谢优化策略。让我们一起解锁您身体的代谢潜能！`
  },
  {
    id: "behavior",
    name: "行为专家",
    title: "行为心理学专家",
    description: "专精健康行为改变、习惯养成和动机维持的科学方法",
    icon: Brain,
    color: "bg-purple-500",
    systemPrompt: `Hi there! 我是Dr. Alex Thompson，行为心理学专家，专门帮助人们建立可持续的健康习惯！🧠✨

🎓 **我的专业背景**：
- 斯坦福大学行为心理学博士
- 《习惯的力量》畅销书作者
- Google、Apple等公司行为设计顾问
- 专精习惯科学和行为改变技术

🎯 **我专门解决的问题**：
- 为什么明知道要运动/健康饮食，却总是做不到？
- 如何让好习惯变得自动化、不费意志力？
- 怎样设计环境让健康选择变得更容易？
- 如何克服拖延、完美主义等心理障碍？

🔍 **我的分析方法**：
- 识别您的行为模式和触发点
- 分析行为一致性和变化趋势
- 找出阻碍改变的心理和环境因素
- 设计个性化的行为改变策略

💡 **我的核心理念**：
- "改变环境比改变意志力更有效"
- "小习惯 × 一致性 = 大改变"
- "关注系统，而不是目标"
- "让好行为变得显而易见、有吸引力、简单易行、令人满足"

🛠️ **我会为您提供**：
- 基于行为科学的习惯设计方案
- 环境优化和提示系统设计
- 克服心理阻力的具体策略
- 渐进式行为改变计划

📝 **记忆更新协议**：
作为行为专家，当我发现用户的重要行为相关信息时，必须严格遵循系统协议输出标准化记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[行为相关的核心信息，极度精简，不超过500字，无特殊符号]
更新原因：[行为改变角度的更新必要性]
[/MEMORY_UPDATE_REQUEST]

重点记录：行为模式、心理障碍、习惯偏好、动机因素、环境限制等对长期行为改变有价值的信息。

准备好建立真正持久的健康习惯了吗？告诉我您在行为改变上遇到的挑战，我来帮您设计科学的解决方案！`
  },
  {
    id: "timing",
    name: "时机专家",
    title: "时间营养学专家",
    description: "专精生物节律、营养时机和睡眠-代谢协调优化",
    icon: Clock,
    color: "bg-indigo-500",
    systemPrompt: `Good day! 我是Dr. Maria Gonzalez，时间营养学(Chrono-nutrition)领域的先驱专家！⏰🌅

🕐 **我的专业领域**：
- 哈佛医学院时间生物学研究所博士后
- 《时间营养学》教科书主编
- 专精昼夜节律与代谢调节的关系
- 奥运代表队时间营养顾问

⏰ **我专门研究的时机科学**：
- 进餐时机与昼夜节律的精确同步
- 运动时机与代谢窗口的最佳匹配
- 营养素时序分配的生理学原理
- 睡眠-代谢-营养的三角协调关系

🌅 **我的核心理念**：
- "什么时候吃，和吃什么一样重要"
- "身体有自己的时钟，我们要学会配合它"
- "最佳时机 = 最大效果 × 最小副作用"
- "个性化的生物节律才是最好的时间表"

🔬 **我会分析的时间因素**：
- 您的进餐时间与生物钟的同步度
- 运动时机对脂肪燃烧和肌肉合成的影响
- 不同营养素的最佳摄入时间窗口
- 睡眠质量对代谢节律的影响

💡 **我提供的时机优化策略**：
- 个性化的进餐时间安排
- 运动与营养的时序配合方案
- 改善睡眠质量的时间管理
- 跨时区或轮班工作的节律调节

📝 **记忆更新协议**：
作为时机专家，当我发现用户的重要时间相关信息时，必须严格遵循系统协议输出标准化记忆更新请求：

（每次对话最多输出一次）
[MEMORY_UPDATE_REQUEST]
新记忆内容：[时间节律相关的核心信息，极度精简，不超过500字，无特殊符号]
更新原因：[时间营养学角度的更新必要性]
[/MEMORY_UPDATE_REQUEST]

重点记录：作息习惯、生物节律特征、时间偏好、工作时间安排、睡眠模式等对长期时机优化有价值的信息。

🎯 **我的目标**：
帮您找到属于自己的最佳生物节律，让时间成为您健康路上的最佳伙伴！

准备好优化您的生物时钟了吗？告诉我您的作息习惯和时间安排，我来为您设计最符合生理节律的时机策略！`
  }
]

export default function ChatPage() {
  const { toast } = useToast()
  const { refreshUsageInfo } = useUsageLimit()
  const t = useTranslation('chat')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isLoadingMessagesRef = useRef(false) // 用于防止循环更新

  // 引导功能
  const { showGuide, closeGuide } = useWelcomeGuide()
  const [includeHealthData, setIncludeHealthData] = useState(true)
  const [selectedExpert, setSelectedExpert] = useState<string>("general")
  const [isClient, setIsClient] = useState(false)
  const [recentHealthData, setRecentHealthData] = useState<any[]>([])

  // 移动端状态管理
  const [isMobile, setIsMobile] = useState(false)
  const [showExpertPanel, setShowExpertPanel] = useState(false)
  const [showExpertDropdown, setShowExpertDropdown] = useState(false)

  const [userProfile] = useLocalStorage("userProfile", {})
  const [aiConfig] = useLocalStorage<AIConfig>("aiConfig", {
    agentModel: {
      name: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      source: "shared", // 默认使用共享模型
    },
    chatModel: {
      name: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      source: "shared", // 默认使用共享模型
    },
    visionModel: {
      name: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "",
      source: "shared", // 默认使用共享模型
    },
    sharedKey: {
      selectedKeyIds: [],
    },
  })
  const { getData } = useIndexedDB("healthLogs")
  const [todayLog, setTodayLog] = useState(null)

  // AI记忆管理
  const { memories, getMemory, updateMemory } = useAIMemory()
  const [pendingMemoryUpdate, setPendingMemoryUpdate] = useState<AIMemoryUpdateRequest | null>(null)

  // 为每个专家使用独立的聊天记录
  const [allExpertMessages, setAllExpertMessages] = useLocalStorage<Record<string, Message[]>>("expertChatMessages", {})

  // 图片上传相关状态
  const [uploadedImages, setUploadedImages] = useState<ImagePreview[]>([])
  const [isCompressing, setIsCompressing] = useState(false)
  const [isCustomLoading, setIsCustomLoading] = useState(false) // 自定义加载状态
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 检查AI配置是否完整
  const checkAIConfig = () => {
    const modelConfig = aiConfig.chatModel

    // 如果使用共享模型，只需要检查source字段
    if (modelConfig.source === 'shared') {
      return true // 共享模型不需要用户配置API Key
    }

    // 如果使用私有配置，需要检查完整的配置
    if (!modelConfig?.name || !modelConfig?.baseUrl || !modelConfig?.apiKey) {
      return false
    }
    return true
  }

  // 处理AI记忆更新请求
  const handleMemoryUpdateRequest = async (newContent: string, reason?: string) => {
    try {
      await updateMemory({
        expertId: selectedExpert,
        newContent,
        reason
      })

      toast({
        title: "记忆已更新",
        description: `${currentExpert.name}的记忆已成功更新`,
      })

      setPendingMemoryUpdate(null)
    } catch (error) {
      console.error("更新记忆失败:", error)
      toast({
        title: "记忆更新失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      })
    }
  }

  // 处理图片上传
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (uploadedImages.length + files.length > 5) {
      toast({
        title: t('errors.imageCountExceeded') || "图片数量超限",
        description: t('errors.maxImagesAllowed') || "最多只能上传5张图片",
        variant: "destructive",
      })
      return
    }

    setIsCompressing(true)

    try {
      const newImages: ImagePreview[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        if (!file.type.startsWith("image/")) {
          toast({
            title: t('errors.invalidFileType') || "文件类型错误",
            description: t('errors.notImageFile', { fileName: file.name }) || `${file.name} 不是图片文件`,
            variant: "destructive",
          })
          continue
        }

        const previewUrl = URL.createObjectURL(file)
        const compressedFile = await compressImage(file, 500 * 1024) // 500KB

        newImages.push({
          file,
          url: previewUrl,
          compressedFile,
        })
      }

      setUploadedImages((prev) => [...prev, ...newImages])
    } catch (error) {
      console.error("Error processing images:", error)
      toast({
        title: t('errors.imageProcessingFailed') || "图片处理失败",
        description: t('errors.cannotProcessImages') || "无法处理上传的图片",
        variant: "destructive",
      })
    } finally {
      setIsCompressing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  // 删除已上传的图片
  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => {
      const newImages = [...prev]
      URL.revokeObjectURL(newImages[index].url)
      newImages.splice(index, 1)
      return newImages
    })
  }

  // 清除所有图片
  const clearAllImages = useCallback(() => {
    uploadedImages.forEach(img => URL.revokeObjectURL(img.url))
    setUploadedImages([])
  }, [uploadedImages])

  // 复制消息内容
  const handleCopyMessage = async (content: string, hasImages?: boolean) => {
    try {
      await navigator.clipboard.writeText(content)
      toast({
        title: "复制成功",
        description: hasImages ? "文本内容已复制到剪贴板" : "内容已复制到剪贴板",
      })
    } catch (error) {
      console.error('Failed to copy:', error)
      toast({
        title: "复制失败",
        description: "无法复制到剪贴板",
        variant: "destructive",
      })
    }
  }

  // 导出整个对话为图片 - 参考单个消息导出的方式
  const handleExportConversationAsImage = async () => {
    if (messages.length === 0) {
      toast({
        title: "无法导出",
        description: "当前没有对话内容",
        variant: "destructive",
      })
      return
    }

    try {
      // 创建一个临时的div来渲染整个对话
      const tempDiv = document.createElement('div')
      tempDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 900px;
        padding: 32px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        z-index: -1000;
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `

      // 添加对话标题
      const header = document.createElement('div')
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid #e5e7eb;
      `

      const expertInfo = getExpertDisplayInfo(currentExpert)

      // 获取专家图标的emoji
      const getExpertIcon = (expertId: string) => {
        switch (expertId) {
          case 'general':
            return '👤'
          case 'nutrition':
            return '🥗'
          case 'exercise':
            return '💪'
          case 'metabolism':
            return '⚡'
          case 'behavior':
            return '🧠'
          case 'timing':
            return '⏰'
          default:
            return '👤'
        }
      }

      const titleSection = document.createElement('div')
      titleSection.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; background: ${currentExpert.color}; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 20px;">${getExpertIcon(currentExpert.id)}</span>
          </div>
          <div>
            <h1 style="font-size: 24px; font-weight: 700; margin: 0; color: #1f2937;">FitGPT AI</h1>
            <p style="font-size: 14px; color: #6b7280; margin: 0;">${expertInfo.title} - 对话记录</p>
          </div>
        </div>
      `

      const dateSection = document.createElement('div')
      dateSection.style.cssText = `
        text-align: right;
        color: #6b7280;
        font-size: 14px;
      `
      dateSection.innerHTML = `
        <div>${new Date().toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long'
        })}</div>
        <div style="margin-top: 4px;">${messages.length} 条消息</div>
      `

      header.appendChild(titleSection)
      header.appendChild(dateSection)
      tempDiv.appendChild(header)

      // 添加对话内容容器
      const conversationDiv = document.createElement('div')
      conversationDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 20px;
      `

      // 处理每条消息
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        const messageDiv = document.createElement('div')
        messageDiv.style.cssText = `
          display: flex;
          ${message.role === "user" ? "justify-content: flex-end;" : "justify-content: flex-start;"}
          width: 100%;
        `

        const messageContent = document.createElement('div')
        messageContent.style.cssText = `
          max-width: 75%;
          padding: 16px 20px;
          border-radius: 16px;
          position: relative;
          ${message.role === "user"
            ? "background: linear-gradient(135deg, #10b981, #059669); color: white;"
            : "background: #f8fafc; border: 1px solid #e2e8f0; color: #1f2937;"
          }
        `

        if (message.role === "user") {
          // 用户消息 - 简单文本处理
          let userContent = message.content
          // @ts-ignore
          if (message.images && Array.isArray(message.images) && message.images.length > 0) {
            userContent += `\n\n[包含 ${message.images.length} 张图片]`
          }
          messageContent.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 8px; font-size: 14px; opacity: 0.9;">用户</div>
            <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.5;">${userContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          `
        } else {
          // AI消息 - 使用与单个消息导出相同的方式
          const aiContentDiv = document.createElement('div')
          aiContentDiv.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 8px; font-size: 14px; color: #059669;">${expertInfo.name}</div>
            <div style="font-size: 15px; line-height: 1.6;" class="ai-content-${i}"></div>
          `
          messageContent.appendChild(aiContentDiv)
        }

        messageDiv.appendChild(messageContent)
        conversationDiv.appendChild(messageDiv)
      }

      tempDiv.appendChild(conversationDiv)

      // 添加底部信息 - 参考单个消息导出的样式
      const footer = document.createElement('div')
      footer.style.cssText = `
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `

      // 左侧logo - 参考单个消息导出的设计
      const logoSection = document.createElement('div')
      logoSection.style.cssText = `
        display: flex;
        align-items: center;
      `
      logoSection.innerHTML = `
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <img src="/FitGPT-pure.svg" alt="FitGPT AI Logo" width="20" height="20" style="filter: brightness(0) invert(1);" />
        </div>
        <div style="display: flex; flex-direction: column;">
          <div style="font-weight: bold; font-size: 16px; background: linear-gradient(to right, #059669 0%, #047857 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">FitGPT AI</div>
          <div style="font-size: 12px; color: #6b7280;">智能健康管理助手</div>
        </div>
      `

      // 右侧时间戳
      const timestamp = document.createElement('div')
      timestamp.style.cssText = `
        font-size: 12px;
        color: #9ca3af;
      `
      timestamp.textContent = new Date().toLocaleString('zh-CN')

      footer.appendChild(logoSection)
      footer.appendChild(timestamp)
      tempDiv.appendChild(footer)

      document.body.appendChild(tempDiv)

      // 现在处理AI消息的内容渲染
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        if (message.role === "assistant") {
          // 为每个AI消息创建临时容器来渲染Markdown
          const tempContainer = document.createElement('div')
          tempContainer.style.cssText = `
            position: absolute;
            top: -9999px;
            left: -9999px;
            width: 600px;
            background: white;
            padding: 0;
          `
          document.body.appendChild(tempContainer)

          // 使用React渲染EnhancedMessageRenderer
          const { createRoot } = await import('react-dom/client')
          const root = createRoot(tempContainer)

          await new Promise<void>((resolve) => {
            root.render(
              React.createElement(EnhancedMessageRenderer, {
                content: message.content,
                className: "text-inherit export-mode",
                isMobile: false,
                isStreaming: false,
                isExportMode: true,
                onMemoryUpdateRequest: () => {},
              })
            )
            setTimeout(() => {
              // 将渲染后的内容复制到对话中
              const targetDiv = tempDiv.querySelector(`.ai-content-${i}`)
              if (targetDiv) {
                targetDiv.innerHTML = tempContainer.innerHTML
              }

              // 清理临时容器
              root.unmount()
              document.body.removeChild(tempContainer)
              resolve()
            }, 1000) // 给足够时间渲染
          })
        }
      }

      // 添加样式 - 参考单个消息导出的完整样式
      const style = document.createElement('style')
      style.textContent = `
        /* 基础样式重置 */
        * { box-sizing: border-box; }

        /* Prose样式 - 模拟Tailwind prose类 */
        .prose, .export-mode {
          color: #374151;
          max-width: none;
          line-height: 1.75;
          word-wrap: break-word;
          overflow-wrap: anywhere;
          word-break: break-word;
          hyphens: auto;
          width: 100%;
          overflow: hidden;
        }

        /* 标题样式 */
        .export-mode h1, .prose h1 {
          font-weight: 700;
          font-size: 1.25rem;
          margin: 1rem 0 0.5rem 0;
          color: #1f2937;
          line-height: 1.4;
          word-break: break-word;
        }
        .export-mode h2, .prose h2 {
          font-weight: 600;
          font-size: 1.125rem;
          margin: 0.75rem 0 0.5rem 0;
          color: #1f2937;
          line-height: 1.4;
          word-break: break-word;
        }
        .export-mode h3, .prose h3 {
          font-weight: 600;
          font-size: 1rem;
          margin: 0.5rem 0 0.25rem 0;
          color: #1f2937;
          line-height: 1.4;
          word-break: break-word;
        }

        /* 段落样式 */
        .export-mode p, .prose p {
          margin: 0.5rem 0;
          line-height: 1.75;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        /* 列表样式 */
        .export-mode ul, .export-mode ol, .prose ul, .prose ol {
          margin: 0.5rem 0;
          padding-left: 1.25rem;
        }
        .export-mode li, .prose li {
          margin: 0.25rem 0;
          word-break: break-word;
        }

        /* 代码样式 */
        .export-mode code, .prose code {
          background: #f3f4f6;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 0.75rem;
          color: #1f2937;
          word-break: break-word;
        }
        .export-mode pre, .prose pre {
          background: #f8f9fa;
          padding: 0.75rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          margin: 0.75rem 0;
          border: 1px solid #e5e7eb;
          max-width: 100%;
        }

        /* 引用样式 */
        .export-mode blockquote, .prose blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 0.75rem;
          margin: 0.75rem 0;
          color: #6b7280;
          font-style: italic;
        }

        /* 强调样式 */
        .export-mode strong, .prose strong { font-weight: 600; }
        .export-mode em, .prose em { font-style: italic; }

        /* 链接样式 */
        .export-mode a, .prose a {
          color: #2563eb;
          text-decoration: underline;
          word-break: break-word;
        }
      `
      tempDiv.appendChild(style)

      // 临时显示元素以便截图
      tempDiv.style.visibility = 'visible'
      tempDiv.style.opacity = '1'
      tempDiv.style.zIndex = '9999'

      // 强制重新计算布局和样式
      tempDiv.offsetHeight // 触发重排

      // 等待更长时间确保所有内容都渲染完成
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 使用html-to-image生成图片
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(tempDiv, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        width: 900,
        height: tempDiv.scrollHeight,
        style: {
          transform: 'none',
          animation: 'none',
          transition: 'none',
          visibility: 'visible',
          opacity: '1',
        },
        filter: (node) => {
          return node.tagName !== 'SCRIPT';
        }
      })

      // 清理临时元素
      document.body.removeChild(tempDiv)

      // 下载图片
      const link = document.createElement('a')
      link.download = `fitgpt-ai-conversation-${Date.now()}.png`
      link.href = dataUrl
      link.click()

      toast({
        title: "导出成功",
        description: `完整对话已导出为图片（${messages.length} 条消息）`,
      })

    } catch (error) {
      console.error('导出对话失败:', error)
      toast({
        title: "导出失败",
        description: "无法导出对话图片，请稍后重试",
        variant: "destructive",
      })
    }
  }

  // 导出AI回复为图片 - 使用html-to-image
  const handleExportAsImage = async (messageId: string, content: string) => {
    try {
      // 创建一个临时的div来渲染内容
      const tempDiv = document.createElement('div')
      tempDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 800px;
        padding: 24px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #1f2937;
        z-index: -1000;
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `

      // 添加标题
      const header = document.createElement('div')
      header.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5e7eb;
      `

      const expertInfo = getExpertDisplayInfo(currentExpert)

      // 获取专家图标的emoji
      const getExpertIcon = (expertId: string) => {
        switch (expertId) {
          case 'general':
            return '👤'
          case 'nutrition':
            return '🥗'
          case 'exercise':
            return '💪'
          case 'metabolism':
            return '⚡'
          case 'behavior':
            return '🧠'
          case 'timing':
            return '⏰'
          default:
            return '👤'
        }
      }

      header.innerHTML = `
        <div style="width: 32px; height: 32px; background: ${currentExpert.color}; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
          <span style="color: white; font-size: 16px;">${getExpertIcon(currentExpert.id)}</span>
        </div>
        <div>
          <div style="font-weight: 600; font-size: 16px;">${expertInfo.name}</div>
          <div style="font-size: 12px; color: #6b7280;">${expertInfo.title}</div>
        </div>
      `

      // 创建内容容器，使用EnhancedMessageRenderer的样式
      const contentDiv = document.createElement('div')
      contentDiv.style.cssText = `
        font-size: 14px;
        line-height: 1.6;
      `

      // 创建一个临时的React组件来渲染Markdown内容
      const tempContainer = document.createElement('div')
      tempContainer.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 752px;
        background: white;
        padding: 0;
      `
      document.body.appendChild(tempContainer)

      // 使用React渲染EnhancedMessageRenderer
      const { createRoot } = await import('react-dom/client')
      const root = createRoot(tempContainer)

      // 等待渲染完成
      await new Promise<void>((resolve) => {
        root.render(
          React.createElement(EnhancedMessageRenderer, {
            content: content,
            className: "text-inherit export-mode",
            isMobile: false,
            isStreaming: false,
            isExportMode: true, // 导出模式：思考过程默认展开，记忆更新请求默认不展开
            onMemoryUpdateRequest: () => {},
          })
        )

        // 等待渲染和MathJax处理完成
        setTimeout(() => {
          // 复制渲染后的HTML到contentDiv
          contentDiv.innerHTML = tempContainer.innerHTML

          // 应用导出专用样式 - 包含完整的Tailwind CSS样式
          const style = document.createElement('style')
          style.textContent = `
            /* 基础样式重置 */
            * { box-sizing: border-box; }

            /* Prose样式 - 模拟Tailwind prose类 */
            .prose {
              color: #374151;
              max-width: none;
              line-height: 1.75;
              word-wrap: break-word;
              overflow-wrap: anywhere;
              word-break: break-word;
              hyphens: auto;
              width: 100%;
              overflow: hidden;
            }
            .prose-sm { font-size: 0.875rem; line-height: 1.7142857; }

            /* 标题样式 */
            .export-mode h1, .prose h1 {
              font-weight: 700;
              font-size: 1.25rem;
              margin: 1rem 0 0.5rem 0;
              color: #1f2937;
              line-height: 1.4;
              word-break: break-word;
            }
            .export-mode h2, .prose h2 {
              font-weight: 600;
              font-size: 1.125rem;
              margin: 0.75rem 0 0.5rem 0;
              color: #1f2937;
              line-height: 1.4;
              word-break: break-word;
            }
            .export-mode h3, .prose h3 {
              font-weight: 600;
              font-size: 1rem;
              margin: 0.5rem 0 0.25rem 0;
              color: #1f2937;
              line-height: 1.4;
              word-break: break-word;
            }
            .export-mode h4, .prose h4 {
              font-weight: 600;
              font-size: 0.875rem;
              margin: 0.5rem 0 0.25rem 0;
              color: #1f2937;
              word-break: break-word;
            }

            /* 段落样式 */
            .export-mode p, .prose p {
              margin: 0.5rem 0;
              line-height: 1.75;
              word-break: break-word;
              overflow-wrap: anywhere;
            }
            .export-mode p:last-child, .prose p:last-child { margin-bottom: 0; }

            /* 列表样式 */
            .export-mode ul, .export-mode ol, .prose ul, .prose ol {
              margin: 0.5rem 0;
              padding-left: 1.25rem;
            }
            .export-mode li, .prose li {
              margin: 0.25rem 0;
              word-break: break-word;
            }

            /* 代码样式 */
            .export-mode code, .prose code {
              background: #f3f4f6;
              padding: 0.125rem 0.25rem;
              border-radius: 0.25rem;
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: 0.75rem;
              color: #1f2937;
              word-break: break-word;
            }
            .export-mode pre, .prose pre {
              background: #f8f9fa;
              padding: 0.75rem;
              border-radius: 0.375rem;
              overflow-x: auto;
              margin: 0.75rem 0;
              border: 1px solid #e5e7eb;
              max-width: 100%;
            }
            .export-mode pre code, .prose pre code {
              background: none;
              padding: 0;
              font-size: 0.75rem;
              white-space: pre-wrap;
              word-break: break-word;
              display: block;
              width: 100%;
            }

            /* 引用样式 */
            .export-mode blockquote, .prose blockquote {
              border-left: 4px solid #e5e7eb;
              padding-left: 0.75rem;
              margin: 0.75rem 0;
              color: #6b7280;
              font-style: italic;
            }

            /* 表格样式 */
            .export-mode table, .prose table {
              border-collapse: collapse;
              width: 100%;
              margin: 0.75rem 0;
              overflow-x: auto;
              display: block;
              white-space: nowrap;
            }
            .export-mode th, .export-mode td, .prose th, .prose td {
              border: 1px solid #e5e7eb;
              padding: 0.5rem 0.75rem;
              text-align: left;
              font-size: 0.75rem;
            }
            .export-mode th, .prose th {
              background: #f9fafb;
              font-weight: 600;
            }

            /* 数学公式样式 */
            .export-mode .math, .prose .math {
              font-family: 'Times New Roman', serif;
            }

            /* 强调样式 */
            .export-mode strong, .prose strong { font-weight: 600; }
            .export-mode em, .prose em { font-style: italic; }

            /* 链接样式 */
            .export-mode a, .prose a {
              color: #2563eb;
              text-decoration: underline;
              word-break: break-word;
            }

            /* 分隔线样式 */
            .export-mode hr, .prose hr {
              border: none;
              border-top: 1px solid #e5e7eb;
              margin: 1rem 0;
            }

            /* 通用文本换行 */
            .break-words { word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; }
            .overflow-wrap-anywhere { overflow-wrap: anywhere; }
            .word-break-break-all { word-break: break-all; }
            .hyphens-auto { hyphens: auto; }
            .w-full { width: 100%; }
            .overflow-hidden { overflow: hidden; }
            .max-w-none { max-width: none; }
          `
          contentDiv.appendChild(style)

          // 清理临时容器
          root.unmount()
          document.body.removeChild(tempContainer)
          resolve()
        }, 1000) // 给MathJax足够时间渲染
      })

      // 添加底部logo和水印
      const footer = document.createElement('div')
      footer.style.cssText = `
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `

      // 左侧logo - 参考导航栏的设计
      const logoSection = document.createElement('div')
      logoSection.style.cssText = `
        display: flex;
        align-items: center;
      `
      logoSection.innerHTML = `
        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <img src="/FitGPT-pure.svg" alt="FitGPT AI Logo" width="20" height="20" style="filter: brightness(0) invert(1);" />
        </div>
        <div style="display: flex; flex-direction: column;">
          <div style="font-weight: bold; font-size: 16px; background: linear-gradient(to right, #059669 0%, #047857 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">FitGPT AI</div>
          <div style="font-size: 12px; color: #6b7280;">智能健康管理助手</div>
        </div>
      `

      // 右侧时间戳
      const timestamp = document.createElement('div')
      timestamp.style.cssText = `
        font-size: 12px;
        color: #9ca3af;
      `
      timestamp.textContent = new Date().toLocaleString('zh-CN')

      footer.appendChild(logoSection)
      footer.appendChild(timestamp)

      tempDiv.appendChild(header)
      tempDiv.appendChild(contentDiv)
      tempDiv.appendChild(footer)
      document.body.appendChild(tempDiv)

      // 临时显示元素以便截图
      tempDiv.style.visibility = 'visible'
      tempDiv.style.opacity = '1'
      tempDiv.style.zIndex = '9999'

      // 强制重新计算布局和样式
      tempDiv.offsetHeight // 触发重排

      // 等待更长时间确保所有内容都渲染完成，包括MathJax和样式应用
      await new Promise(resolve => setTimeout(resolve, 1500))

      // 使用html-to-image生成图片
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(tempDiv, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
        width: 800,
        height: tempDiv.scrollHeight,
        style: {
          transform: 'none',
          animation: 'none',
          transition: 'none',
          visibility: 'visible',
          opacity: '1',
        },
        filter: (node) => {
          // 只过滤掉SCRIPT标签，保留STYLE标签以确保样式正确渲染
          return node.tagName !== 'SCRIPT';
        }
      })

      // 清理临时元素
      document.body.removeChild(tempDiv)

      // 下载图片
      const link = document.createElement('a')
      link.download = `fitgpt-ai-response-${Date.now()}.png`
      link.href = dataUrl
      link.click()

      toast({
        title: "导出成功",
        description: "AI回复已导出为图片（支持Markdown格式）",
      })
    } catch (error) {
      console.error('Failed to export as image:', error)
      toast({
        title: "导出失败",
        description: "无法导出为图片，请稍后重试",
        variant: "destructive",
      })
    }
  }

  // 删除指定消息
  const handleDeleteMessage = (messageId: string) => {
    const updatedMessages = messages.filter(msg => msg.id !== messageId)
    setMessages(updatedMessages)

    // 同时更新本地存储的专家消息
    const newAllMessages = { ...allExpertMessages }
    newAllMessages[selectedExpert] = updatedMessages as Message[]
    setAllExpertMessages(newAllMessages)
  }

  // 重试用户消息
  const handleRetryMessage = async (messageIndex: number) => {
    if (isLoading || isCustomLoading) return

    // 找到要重试的用户消息
    const messageToRetry = messages[messageIndex]
    if (messageToRetry.role !== 'user') return

    // 设置加载状态
    setIsCustomLoading(true)

    // 删除从当前用户消息开始的所有后续消息（包括AI回复）
    const messagesBeforeRetry = messages.slice(0, messageIndex)
    const userMessage = messages[messageIndex]

    // 重新设置消息列表，只保留重试消息之前的内容和当前用户消息
    const newMessages = [...messagesBeforeRetry, userMessage]
    setMessages(newMessages)

    // 重新发送请求
    try {
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "x-ai-config": JSON.stringify(aiConfig),
          "x-expert-role": selectedExpert,
        },
        body: JSON.stringify({
          messages: newMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            // @ts-ignore
            images: msg.images
          })),
          userProfile: includeHealthData ? userProfile : undefined,
          healthData: includeHealthData ? todayLog : undefined,
          recentHealthData: includeHealthData ? recentHealthData : undefined,
          systemPrompt: currentExpert.systemPrompt,
          // 移除 icon 属性，因为 React 组件不能被 JSON 序列化
          expertRole: {
            id: currentExpert.id,
            name: currentExpert.name,
            title: currentExpert.title,
            description: currentExpert.description,
            color: currentExpert.color,
            systemPrompt: currentExpert.systemPrompt,
          },
          aiMemory: memories,
          aiConfig
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // 创建新的AI消息
      const newAssistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: ''
      }

      setMessages([...newMessages, newAssistantMessage])

      // 处理流式响应
      await consumeChatStream(response, chunk => {
        setMessages(current => current.map((message, index) => index === current.length - 1 && message.role === 'assistant'
          ? { ...message, content: message.content + chunk } : message))
      })

    } catch (error) {
      console.error('Error retrying message:', error)
      toast({
        title: "重试失败",
        description: error instanceof Error ? error.message : "重试消息时出现错误",
        variant: "destructive",
      })
    } finally {
      // 重置加载状态
      setIsCustomLoading(false)
    }
  }

  // 设置客户端状态和移动端检测
  useEffect(() => {
    setIsClient(true)

    // 检测移动设备
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    // 点击外部关闭下拉菜单
    const handleClickOutside = (event: MouseEvent) => {
      if (showExpertDropdown && !(event.target as Element).closest('.expert-dropdown')) {
        // 延迟关闭，避免与流式回复冲突
        setTimeout(() => {
          setShowExpertDropdown(false)
        }, 0)
      }
    }

    document.addEventListener('mousedown', handleClickOutside, { passive: true })

    return () => {
      window.removeEventListener('resize', checkMobile)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExpertDropdown])



  // 获取今日日志
  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    getData(today).then((data) => {
      console.log("Today's health data loaded:", {
        hasData: !!data,
        date: data?.date,
        foodEntries: data?.foodEntries?.length || 0,
        exerciseEntries: data?.exerciseEntries?.length || 0,
        summary: data?.summary,
      })
      setTodayLog(data)
    })
  }, [getData])

  // 获取近3天的详细数据
  useEffect(() => {
    const loadRecentData = async () => {
      const logs = []
      const today = new Date()
      for (let i = 0; i < 3; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateKey = format(date, "yyyy-MM-dd")
        try {
          const log = await getData(dateKey)
          if (log && (log.foodEntries?.length > 0 || log.exerciseEntries?.length > 0)) {
            logs.push(log)
          }
        } catch (error) {
          console.log(`No data for ${dateKey}`)
        }
      }
      console.log("Recent health data loaded:", logs.length, "days")
      setRecentHealthData(logs)
    }

    loadRecentData()
  }, [getData])

  // 获取当前选择的专家
  const currentExpert = expertRoles.find(expert => expert.id === selectedExpert) || expertRoles[0]

  // 获取翻译后的专家信息
  const tChatExperts = useTranslation('chat.experts')
  const getExpertDisplayInfo = (expert: ExpertRole) => ({
    ...expert,
    name: tChatExperts(`${expert.id}.name`) || expert.name,
    title: tChatExperts(`${expert.id}.title`) || expert.title,
    description: tChatExperts(`${expert.id}.description`) || expert.description
  })

  const { messages, input = '', handleInputChange, handleSubmit, isLoading, error, setMessages, setInput } = useChat({
    api: "/api/openai/chat",
    initialMessages: [],
    initialInput: '',
    headers: {
      "x-ai-config": JSON.stringify(aiConfig),
      "x-expert-role": selectedExpert,
    },
    onResponse: (response) => {
      console.log("Chat response received:", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      })

      if (!response.ok) {
        console.error("Chat response not ok:", response.status, response.statusText)
        toast({
          title: "聊天失败",
          description: `服务器响应错误: ${response.status} ${response.statusText}`,
          variant: "destructive",
        })
      }
    },
    onError: (error) => {
      console.error("Chat error:", error)

      // 根据错误类型提供不同的标题和描述
      let title = "聊天失败"
      let description = error.message || "聊天服务出现错误，请稍后重试"

      if (error.message.includes('请登录后再使用')) {
        title = "需要登录"
        description = "请登录后再使用AI聊天功能"
      } else if (error.message.includes('使用次数已达上限')) {
        title = "使用次数已达上限"
      } else if (error.message.includes('服务暂时不可用')) {
        title = "服务暂时不可用"
      } else if (!checkAIConfig()) {
        title = "AI 配置不完整"
        description = "请先在设置页面配置聊天模型"
      }

      toast({
        title,
        description,
        variant: "destructive",
      })
    },
    onFinish: (message) => {
      console.log("Chat finished:", {
        messageLength: message.content.length,
        role: message.role,
      })

      // 🔄 聊天完成后刷新使用量信息，确保所有组件同步
      if (message.role === 'assistant') {
        console.log('[Chat] Refreshing usage info after successful chat')
        refreshUsageInfo()
      }
    },
    body: {
      userProfile: includeHealthData ? userProfile : undefined,
      healthData: includeHealthData ? todayLog : undefined,
      recentHealthData: includeHealthData ? recentHealthData : undefined,
      systemPrompt: currentExpert.systemPrompt,
      // 移除 icon 属性，因为 React 组件不能被 JSON 序列化
      expertRole: {
        id: currentExpert.id,
        name: currentExpert.name,
        title: currentExpert.title,
        description: currentExpert.description,
        color: currentExpert.color,
        systemPrompt: currentExpert.systemPrompt,
      },
      aiMemory: memories, // 包含所有专家的记忆（只读其他专家，可写当前专家）
    },
  })

  // 当切换专家时，加载对应的消息记录
  useEffect(() => {
    isLoadingMessagesRef.current = true
    const expertMessages = allExpertMessages[selectedExpert] || []
    setMessages(expertMessages)
    // 使用 setTimeout 确保 setMessages 完成后再重置标志
    setTimeout(() => {
      isLoadingMessagesRef.current = false
    }, 0)
  }, [selectedExpert, allExpertMessages, setMessages])

  // 保存当前专家的消息到 localStorage (但避免在加载消息时触发)
  useEffect(() => {
    if (messages.length > 0 && !isLoadingMessagesRef.current) {
      const newMessages = { ...allExpertMessages }
      newMessages[selectedExpert] = messages as Message[]
      setAllExpertMessages(newMessages)
    }
  }, [messages, selectedExpert, setAllExpertMessages])

  // 处理专家选择
  const handleExpertSelect = (expertId: string) => {
    setSelectedExpert(expertId)
    setShowExpertDropdown(false)
    if (isMobile) {
      setShowExpertPanel(false)
    }
  }

  // 清除当前专家的聊天记录
  const clearChatHistory = () => {
    isLoadingMessagesRef.current = true
    setMessages([])
    const newMessages = { ...allExpertMessages }
    newMessages[selectedExpert] = []
    setAllExpertMessages(newMessages)
    setTimeout(() => {
      isLoadingMessagesRef.current = false
    }, 0)
    toast({
      title: t('historyCleared'),
      description: t('expertHistoryCleared', { expert: getExpertDisplayInfo(currentExpert).name }),
    })
  }

  // 滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // 组合加载状态
  const isAnyLoading = isLoading || isCustomLoading

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // 检查是否有内容（文本或图片）
    if ((!(input?.trim()) && uploadedImages.length === 0) || isAnyLoading) return

    console.log("Submitting chat message:", {
      inputLength: input?.length || 0,
      imageCount: uploadedImages.length,
      hasAIConfig: isClient ? checkAIConfig() : false,
      includeHealthData,
      hasUserProfile: !!userProfile,
      hasTodayLog: !!todayLog,
    })

    if (isClient && !checkAIConfig()) {
      toast({
        title: "AI 配置不完整",
        description: "请先在设置页面配置聊天模型",
        variant: "destructive",
      })
      return
    }

    // 如果有图片，使用自定义提交逻辑
    if (uploadedImages.length > 0) {
      await handleSubmitWithImages(e)
    } else {
      // 没有图片，使用原有的提交逻辑
      handleSubmit?.(e)
    }
  }

  // 处理包含图片的提交
  const handleSubmitWithImages = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // 设置加载状态
    setIsCustomLoading(true)

    try {
      // 准备图片数据
      const imageDataURIs: string[] = []
      for (const img of uploadedImages) {
        const fileToUse = img.compressedFile || img.file
        const arrayBuffer = await fileToUse.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const dataURI = `data:${fileToUse.type};base64,${base64}`
        imageDataURIs.push(dataURI)
      }

      // 创建用户消息
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: input || '请分析这些图片',
        // @ts-ignore - 扩展Message类型以支持图片
        images: imageDataURIs
      }

      // 添加用户消息到聊天记录
      const newMessages = [...messages, userMessage]
      setMessages(newMessages)

      // 清空输入和图片
      setInput('')
      clearAllImages()

      // 调用聊天API
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          "x-ai-config": JSON.stringify(aiConfig),
          "x-expert-role": selectedExpert,
        },
        body: JSON.stringify({
          messages: newMessages.map(msg => ({
            role: msg.role,
            content: msg.content,
            // @ts-ignore
            images: msg.images
          })),
          userProfile: includeHealthData ? userProfile : undefined,
          healthData: includeHealthData ? todayLog : undefined,
          recentHealthData: includeHealthData ? recentHealthData : undefined,
          systemPrompt: currentExpert.systemPrompt,
          // 移除 icon 属性，因为 React 组件不能被 JSON 序列化
          expertRole: {
            id: currentExpert.id,
            name: currentExpert.name,
            title: currentExpert.title,
            description: currentExpert.description,
            color: currentExpert.color,
            systemPrompt: currentExpert.systemPrompt,
          },
          aiMemory: memories,
          aiConfig
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // 处理流式响应
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: ''
      }

      setMessages([...newMessages, assistantMessage])

      await consumeChatStream(response, chunk => {
        setMessages(current => current.map((message, index) => index === current.length - 1 && message.role === 'assistant'
          ? { ...message, content: message.content + chunk } : message))
      })

    } catch (error) {
      console.error('Error submitting with images:', error)
      toast({
        title: "发送失败",
        description: error instanceof Error ? error.message : "发送消息时出现错误",
        variant: "destructive",
      })
    } finally {
      // 重置加载状态
      setIsCustomLoading(false)
    }
  }

  // 显示错误信息
  useEffect(() => {
    if (error) {
      console.error("useChat error:", error)
    }
  }, [error])

  return (
    <div className="container mx-auto py-2 md:py-6 max-w-7xl min-w-0 px-3 md:px-6">
      <div className={`${isMobile ? 'flex flex-col h-[calc(100vh-1rem)]' : 'flex gap-6 h-[80vh]'}`}>
        {/* 移动端专家选择下拉菜单 */}
        {isMobile && (
          <div className="mb-3">
            <div className="relative expert-dropdown">
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowExpertDropdown(!showExpertDropdown)
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="w-full flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
              >
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-lg ${currentExpert.color} text-white`}>
                    <currentExpert.icon className="h-4 w-4" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <p className="font-medium text-sm truncate">{getExpertDisplayInfo(currentExpert).name}</p>
                      <span className="inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">
                        AI
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{getExpertDisplayInfo(currentExpert).title}</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${showExpertDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showExpertDropdown && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[100] max-h-72 overflow-y-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    zIndex: 100
                  }}
                >
                  {expertRoles.map((expert) => {
                    const IconComponent = expert.icon
                    const isSelected = selectedExpert === expert.id
                    const expertInfo = getExpertDisplayInfo(expert)
                    return (
                      <button
                        key={expert.id}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleExpertSelect(expert.id)
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`w-full text-left p-2.5 border-b border-slate-100 dark:border-slate-700 last:border-b-0 transition-colors ${
                          isSelected
                            ? 'bg-primary/5 text-primary'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-start space-x-2.5">
                          <div className={`p-1.5 rounded-lg ${expert.color} text-white flex-shrink-0`}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate">{expertInfo.name}</h3>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                              {expertInfo.title}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 桌面端左侧专家选择栏 */}
        {!isMobile && (
          <Card className="w-80 flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">{t('title')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                {expertRoles.map((expert) => {
                  const IconComponent = expert.icon
                  const isSelected = selectedExpert === expert.id
                  const expertInfo = getExpertDisplayInfo(expert)
                  return (
                    <button
                      key={expert.id}
                      onClick={() => handleExpertSelect(expert.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`p-2 rounded-lg ${expert.color} text-white flex-shrink-0`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm">{expertInfo.name}</h3>
                          <p className="text-xs text-muted-foreground font-medium mt-1">
                            {expertInfo.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                            {expertInfo.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 聊天区域 */}
        <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <CardHeader className={`${isMobile ? 'p-2 pb-1.5' : 'p-3'} border-b border-border`}>
            <div className={`${isMobile ? 'flex flex-col space-y-1.5' : 'flex justify-between items-center'}`}>
              {/* 桌面端专家信息 */}
              {!isMobile && (
                <div className="flex items-center space-x-2">
                  <div className={`p-1.5 rounded-md ${currentExpert.color} text-white`}>
                    <currentExpert.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-base">{getExpertDisplayInfo(currentExpert).name}</CardTitle>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        FitGPT AI
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{getExpertDisplayInfo(currentExpert).title}</p>
                  </div>
                </div>
              )}

              {/* 控制按钮区域 */}
              <div className={`${isMobile ? 'flex items-center justify-between' : 'flex items-center space-x-3'}`}>
                <div className="flex items-center space-x-1.5">
                  <Switch id="include-data" checked={includeHealthData} onCheckedChange={setIncludeHealthData} />
                  <Label htmlFor="include-data" className={`${isMobile ? 'text-xs' : 'text-xs'}`}>{t('includeHealthData')}</Label>
                </div>
                {isClient && messages.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportConversationAsImage}
                      className={`text-green-600 hover:text-green-700 hover:bg-green-50 ${isMobile ? 'h-6 px-1.5 text-xs' : 'h-7 px-2 text-xs'}`}
                    >
                      <Download className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3 mr-1'}`} />
                      {!isMobile && t('exportConversation')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearChatHistory}
                      className={`text-red-600 hover:text-red-700 hover:bg-red-50 ${isMobile ? 'h-6 px-1.5 text-xs' : 'h-7 px-2 text-xs'}`}
                    >
                      <Trash2 className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3 mr-1'}`} />
                      {!isMobile && t('clearHistory')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {isClient && !checkAIConfig() && (
              <div className={`text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded ${isMobile ? 'p-1.5 mt-1.5' : 'p-2 mt-2'}`}>
                {t('configureAI')}
              </div>
            )}
            {isClient && error && (
              <div className={`text-sm text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 ${isMobile ? 'p-2 mt-1.5' : 'p-3 mt-2'}`}>
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className={isMobile ? 'text-xs' : ''}>{error.message}</span>
                </div>
                {error.message.includes('请登录后再使用') && (
                  <div className={isMobile ? 'mt-1.5' : 'mt-2'}>
                    <button
                      onClick={() => window.location.href = '/login'}
                      className={`bg-red-600 hover:bg-red-700 text-white rounded transition-colors ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'}`}
                    >
                      前往登录
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isMobile ? 'p-1.5' : 'p-4'}`}>
          <ScrollArea className={`flex-1 w-full ${isMobile ? 'pr-1' : 'pr-4'}`}>
            <div className={`pb-4 w-full max-w-full overflow-hidden ${isMobile ? 'space-y-2 px-1' : 'space-y-4'}`}>
              {!isClient ? (
                // 服务端渲染时显示简单的加载状态
                <div className={`text-center ${isMobile ? 'py-4' : 'py-8'}`}>
                  <p className={`font-medium ${isMobile ? 'text-base' : 'text-lg'}`}>{t('loading')}</p>
                </div>
              ) : messages.length === 0 ? (
                <div className={`${isMobile ? 'py-3 px-1' : 'py-8 px-4'} max-w-2xl mx-auto`}>
                  {/* 专家头像和标题 */}
                  <div className={`text-center ${isMobile ? 'mb-4' : 'mb-6'}`}>
                    <div className={`inline-flex items-center justify-center rounded-full ${currentExpert.color} text-white ${isMobile ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'}`}>
                      <currentExpert.icon className={`${isMobile ? 'h-6 w-6' : 'h-8 w-8'}`} />
                    </div>
                    <h1 className={`font-bold text-slate-900 dark:text-slate-100 ${isMobile ? 'text-base mb-1.5' : 'text-xl mb-2'}`}>
                      {tChatExperts(`${selectedExpert}.welcomeMessage.title`) || t('welcomeMessage')}
                    </h1>
                    <p className={`text-muted-foreground leading-relaxed ${isMobile ? 'text-xs' : 'text-base'}`}>
                      {tChatExperts(`${selectedExpert}.welcomeMessage.subtitle`) || t('welcomeDescription')}
                    </p>
                  </div>

                  {/* 专家特色功能 */}
                  {tChatExperts(`${selectedExpert}.welcomeMessage.features.0`) && (
                    <div className={isMobile ? 'mb-4' : 'mb-6'}>
                      <div className={`grid ${isMobile ? 'grid-cols-1 gap-1.5' : 'grid-cols-2 gap-3'}`}>
                        {[0, 1, 2, 3].map((index) => {
                          const feature = tChatExperts(`${selectedExpert}.welcomeMessage.features.${index}`)
                          if (!feature) return null
                          return (
                            <div
                              key={index}
                              className={`flex items-center text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg ${isMobile ? 'text-xs p-2' : 'text-base p-3'}`}
                            >
                              <span className={`flex-shrink-0 ${isMobile ? 'mr-2' : 'mr-3'}`}>{feature.split(' ')[0]}</span>
                              <span className="flex-1">{feature.split(' ').slice(1).join(' ')}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 开始对话提示 */}
                  <div className="text-center">
                    <p className={`text-muted-foreground ${isMobile ? 'text-xs mb-2' : 'text-sm mb-3'}`}>
                      {t('startConversation', { expert: tChatExperts(`${selectedExpert}.name`) || getExpertDisplayInfo(currentExpert).name })}
                    </p>
                    {!checkAIConfig() && (
                      <p className={`text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg ${isMobile ? 'text-xs p-2' : 'text-sm p-3'}`}>
                        {t('configureAIPrompt')}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className={isMobile ? 'space-y-2' : 'space-y-4'}>
                  {messages.map((message, index) => (
                    <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} w-full max-w-full`}>
                      <div className={`${isMobile ? 'max-w-[85%]' : 'max-w-[95%]'} w-auto min-w-0`}>
                        {/* 操作按钮区域 - 放在对话上方 */}
                        <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-1`}>
                          <div className="flex space-x-1 opacity-60 hover:opacity-100 transition-opacity duration-200">
                            {message.role === "user" ? (
                              // 用户消息：重试、复制和删除按钮
                              <>
                                <button
                                  onClick={() => handleRetryMessage(index)}
                                  disabled={isAnyLoading}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="重试"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    // @ts-ignore
                                    const hasImages = message.images && message.images.length > 0
                                    handleCopyMessage(message.content, hasImages)
                                  }}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="复制"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(message.id)}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="删除"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            ) : (
                              // AI消息：复制、导出和删除按钮
                              <>
                                <button
                                  onClick={() => handleCopyMessage(message.content)}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="复制"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleExportAsImage(message.id, message.content)}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="导出图片"
                                >
                                  <Download className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(message.id)}
                                  className="w-5 h-5 bg-slate-200/60 hover:bg-slate-300/80 dark:bg-slate-700/60 dark:hover:bg-slate-600/80 text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded flex items-center justify-center backdrop-blur-sm transition-colors duration-150"
                                  title="删除"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* 消息内容区域 */}
                        <div
                          className={`rounded-xl shadow-sm overflow-hidden ${styles.messageContainer} ${isMobile ? 'px-2.5 py-1.5' : 'px-4 py-3'} ${
                            message.role === "user"
                              ? "bg-gradient-to-r from-green-500 to-green-600 text-white"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {message.role === "user" ? (
                            // 用户消息，支持文本和图片
                            <div className={`${styles.userMessage} ${isMobile ? 'text-sm' : ''}`}>
                              {message.content && <div className="mb-2">{message.content}</div>}
                              {/* @ts-ignore - 扩展Message类型以支持图片 */}
                              {message.images && Array.isArray(message.images) && message.images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {message.images.map((imageUrl: string, index: number) => (
                                    <img
                                      key={index}
                                      src={imageUrl}
                                      alt={`用户上传的图片 ${index + 1}`}
                                      className="max-w-48 max-h-48 rounded-lg object-cover border border-white/20"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            // AI消息使用增强渲染器，支持思考过程显示
                            <div className={`${styles.aiMessage} ${isMobile ? 'text-sm' : ''}`}>
                              <EnhancedMessageRenderer
                                content={message.content}
                                className="text-inherit"
                                isMobile={isMobile}
                                isStreaming={isAnyLoading && messages[messages.length - 1]?.id === message.id}
                                onMemoryUpdateRequest={(request) => {
                                  handleMemoryUpdateRequest(request.newContent, request.reason)
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isAnyLoading && (
                <div className="flex justify-start">
                  <div className={`bg-muted rounded-lg ${isMobile ? 'px-2.5 py-1.5' : 'px-4 py-2'}`}>
                    <div className="flex items-center space-x-2">
                      <div className={`bg-gray-500 rounded-full animate-pulse ${isMobile ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}></div>
                      <div
                        className={`bg-gray-500 rounded-full animate-pulse ${isMobile ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className={`bg-gray-500 rounded-full animate-pulse ${isMobile ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
                        style={{ animationDelay: "0.4s" }}
                      ></div>
                      <span className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>{t('aiThinking')}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* 图片预览区域 */}
          {uploadedImages.length > 0 && (
            <div className={`${isMobile ? 'p-2' : 'p-4'} border-t border-border`}>
              <p className="text-muted-foreground mb-2 flex items-center font-medium text-sm">
                <ImageIcon className="mr-2 h-4 w-4" /> 已上传图片 ({uploadedImages.length}/5)
              </p>
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((img, index) => (
                  <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-white dark:border-slate-700 shadow-md hover:shadow-lg transition-all group">
                    <img
                      src={img.url}
                      alt={`预览 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`${isMobile ? 'p-2' : 'p-4'} border-t border-border`}>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="flex space-x-2">
                <Input
                  value={input || ''}
                  onChange={handleInputChange || (() => {})}
                  placeholder={isClient && checkAIConfig() ? t('inputPlaceholder') : t('configureAI')}
                  disabled={isLoading || (isClient && !checkAIConfig())}
                  className={`flex-1 ${isMobile ? 'text-base h-9' : ''}`}
                />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isAnyLoading || isCompressing || uploadedImages.length >= 5}
                  ref={fileInputRef}
                />
                <Button
                  type="button"
                  variant="outline"
                  size={isMobile ? "sm" : "default"}
                  disabled={isAnyLoading || isCompressing || uploadedImages.length >= 5}
                  onClick={() => fileInputRef.current?.click()}
                  className={isMobile ? 'px-3 h-9' : 'px-4'}
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  disabled={isAnyLoading || (!(input?.trim()) && uploadedImages.length === 0) || (isClient && !checkAIConfig())}
                  size={isMobile ? "sm" : "default"}
                  className={isMobile ? 'px-3 h-9 text-sm' : ''}
                >
                  {isAnyLoading ? t('sending') : t('send')}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* 欢迎引导 */}
      <WelcomeGuide isOpen={showGuide} onClose={closeGuide} />
    </div>
  )
}
