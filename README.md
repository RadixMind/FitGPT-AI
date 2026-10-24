# FitGPT-AI驱动的健康管理工具

![](./public/FitGPT-color.png)
-----

## 引言

传统的健身和营养追踪通常涉及繁琐的手动数据录入，这使得保持数据一致性并获取有意义的洞察变得充满挑战。FitGPT 通过提供一种革命性的、AI驱动的个人健康管理方法，解决了这一痛点。受对高效健康工具日益增长的需求启发，FitGPT 旨在为您的健身之旅提供无缝的记录、分析和智能建议体验。

“Fit” 代表健身与健康, “GPT”强调其AI驱动的智能。 两者结合，FitGPT 寓意着我们的核心使命：**快速记录、系统分析、智能建议。**

## ✨ 核心功能

FitGPT 旨在通过一套直观而强大的工具赋能用户：

1.  **全面快捷的健康日志**

      * **多维度快速记录**：告别手动输入的烦恼。您不仅可以通过自然语言或照片快速记录饮食和运动，还可以轻松标记每日的**心情、压力、睡眠质量**和**睡眠时长**，并为每项记录添加文字描述，构建完整的健康生活图谱。
      * **AI自动解析**：我们的先进AI将自动识别和整理相关信息，包括食物种类、热量、运动类型和时长，让记录过程轻松高效。

2.  **多维度的系统分析**

      * **智能数据整合**：应用会自动计算卡路里摄入/消耗，并结合您的个人数据（如体重、年龄）与新增的**情绪、睡眠**等多维度状态，计算净卡路里，提供清晰、数据驱动的健康概览。
      * **趋势洞察**：通过整合分析您的长期数据，帮助您发现生活习惯、情绪状态与身体健康之间的潜在关联，做出更明智的健康决策。

3.  **超个性化AI私教**

      * **深度健康档案**：通过可选的**专业模式**，您可以建立一份详尽的**健康档案**（涵盖疾病、过敏、用药、家族史等）。这份档案是AI提供精准、安全建议的基石。
      * **动态记忆与专家会诊**：AI助手拥有**独立的动态记忆**，能在与您的交流中学习和更新关键信息。您可以启用**多位AI专家**（如营养师、健身教练、心理顾问），他们共享您的健康数据和记忆，提供**多视角的“专家会诊”**，帮助您更深入地了解自己，获得真正量身定制的指导。

## 🚀 在线演示

[**亲身体验 FitGPT**](https://fitgpt.wideseek.de)

## 🛠️ 技术栈

FitGPT 使用了现代化的技术栈来构建高效、可扩展的应用：

  * **前端框架**: Next.js (React)
  * **UI 组件库**: shadcn/ui (基于 Radix UI 和 Tailwind CSS)
  * **样式**: Tailwind CSS
  * **AI 集成**: Vercel AI SDK
  * **数据可视化**: Recharts
  * **本地数据存储**: IndexedDB
  * **国际化 (i18n)**: next-intl
  * **表单管理**: React Hook Form
  * **Markdown 渲染**: React Markdown

## 部署指南

运行环境：Node.js 22.23.4+（22.x）或 24.22.1+（24.x），pnpm 10.26.0。Docker 使用 Node.js 22.23.4。

### 1\. 环境配置

在部署之前，您需要准备好环境变量。首先，复制环境文件模板：

```bash
cp .env.example .env
```

然后，编辑相应的 `.env` 文件，填入以下配置：

**环境变量:**

```env
# 管理员用户ID
ADMIN_USER_IDS=xx

# 聚合登录设置
AGGREGATE_LOGIN_APPID=xx
AGGREGATE_LOGIN_APPKEY=xx
WX_TOKEN=xx
MSG_TOKEN=xx

# NextAUTH设置
NEXTAUTH_SECRET=xx
NEXTAUTH_URL=https://example.com
AUTH_TRUST_HOST=true

# 数据库
DB_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=xx
NEXT_PUBLIC_SUPABASE_URL=https://xx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xx
DATABASE_URL=your_database_connection_string (单独使用PostgreSQL的情况下)

# API 密钥
DEFAULT_OPENAI_BASE_URL=https://api.openai.com
DEFAULT_OPENAI_API_KEY=sk-xx
KEY_ENCRYPTION_SECRET=请设置至少32字节的随机秘密
```

安全配置说明：

- `KEY_ENCRYPTION_SECRET` 和 `NEXTAUTH_SECRET` 至少使用 32 字节的随机秘密。共享密钥采用 AES-GCM 加密；旧 CryptoJS 密文仍可读取。轮换加密秘密时，可通过 `KEY_ENCRYPTION_PREVIOUS_SECRETS` 提供 JSON 字符串数组（最多 3 个旧秘密），完成旧数据迁移后撤销旧秘密。
- 定时刷新模型需要配置至少 32 字节的 `CRON_SECRET`，调用时携带 `Authorization: Bearer <CRON_SECRET>`。手动全局刷新要求管理员权限。
- 模型地址默认要求 HTTPS，并拒绝内网、保留地址和重定向。自建内网模型需在服务端配置 `AI_ALLOWED_HOSTS`，值为逗号分隔的确切主机名或 IP，不含协议、端口或通配符。
- PostgreSQL 生产连接验证 TLS 证书；使用私有 CA 时设置 `DATABASE_SSL_CA`。生产环境关闭 `/api/debug/*`。


### 2\. 使用 Docker Compose 部署 (推荐)

**前置要求:**

  * Docker Engine 20.10+
  * Docker Compose 2.0+
  * 至少 2GB 可用内存
  * 至少 5GB 可用磁盘空间

**构建并启动:**

```bash
# 从项目根目录运行
docker-compose up --build -d
```

**访问应用:**

* **应用地址:** [http://localhost:3000](http://localhost:3000)

* **健康检查:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

#### 🛠️ 常用命令

  * **查看服务状态:** `docker-compose ps`
  * **查看日志:** `docker-compose logs -f`
  * **停止服务:** `docker-compose down`
  * **进入容器:** `docker-compose exec fitgpt-ai sh`
  * **清理资源:** `docker system prune -a`

### 3\. 使用 Vercel 部署

1.  **项目设置:** 在 Vercel 项目的设置页面，进入 "Environment Variables" 标签。
2.  **添加环境变量:** 确保将上文 "环境配置" 部分提到的所有变量都添加到 Vercel 的环境变量中。
3.  **重新部署:** 添加或修改环境变量后，需要触发一次新的部署（通过推送代码或在 Vercel Dashboard 手动重新部署）才能生效。
4.  **部署命令：** `pnpm run build`
5.  **部署目录：** `./next`
6.  **常见问题:**
      * 如果在部署时遇到 `supabaseUrl is required` 之类的错误，请仔细检查 Vercel 中的环境变量名称是否正确，包括 `NEXT_PUBLIC_` 前缀。
      * 确保环境变量应用到了正确的环境 (Production, Preview, Development)。
      * `NEXT_PUBLIC_` 前缀的变量会暴露给客户端，请勿在其中包含敏感信息。

## 🔍 故障排除

如果遇到部署问题，请检查：

1.  环境变量是否已正确设置且对相应的环境生效。
2.  数据库连接是否正常。
3.  Docker 服务是否正在运行。
4.  应用端口（默认为 3000）是否被占用。
5.  如果在windows系统下部署，需要注释 `next.config.mjs` 中的 `output: "export"`。

## 📜 免责声明

**重要提示：** 本应用程序由AI技术驱动，仅作为个人健康管理的参考工具。请注意，AI分析，特别是营养数据方面，可能存在不准确或偏差。您的健康至关重要。在做出任何重要的饮食调整、运动决策或健康相关干预之前，我们强烈建议咨询合格的医疗专业人员、注册营养师或认证健身教练。FitGPT 不能替代专业的医疗或健康建议。
