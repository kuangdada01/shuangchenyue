# 霜晨月（Mimo）

一个全栈社交媒体平台，支持 Web 端与 Android 客户端。

功能覆盖：图文/视频帖子、嵌套评论、点赞收藏转发、私信聊天（图片/引用/已读）、关注关系、实时通知（SSE）、公告、管理后台、电子书阅读、音乐播放器、亮暗主题。

---

## 技术栈

### 前端（client）

- **React 19 + TypeScript 6（strict）** — UI 框架
- **Vite 8** — 构建工具（rolldown）
- **TanStack Query v5** — 服务端状态缓存（乐观更新、查询失效）
- **mitt** — 轻量事件总线（替代 Context 计数器模式）
- **React Router v7** — 路由管理（懒加载非首屏页面）
- **Axios** — HTTP 请求（拦截器统一错误处理）
- **CSS Modules + 设计令牌** — 组件级样式隔离，亮/暗双主题
- **Lucide React** — 图标库
- **Capacitor 8** — Android 原生打包

### 后端（server）

- **Express 4** — Web 框架
- **better-sqlite3** — SQLite（WAL 模式 + 外键级联 + 索引 + 版本化迁移）
- **zod** — 环境变量校验、请求参数校验
- **分层架构** — `routes`（端点声明）→ `repositories`（SQL 收敛、强类型行）→ `middleware` / `lib`
- **JWT + bcryptjs** — 认证（authMiddleware / optionalAuth / adminMiddleware）
- **multer + sharp** — 文件上传、图片压缩、路径穿越防护、孤儿文件清理
- **SSE** — 实时推送（新私信/通知/公告），心跳保活
- **pino** — 结构化日志
- **nodemailer** — 邮箱验证码
- **Vitest** — 单元测试（`server/test`，21 用例）

### 共享（shared）

- **`@shuangchenyue/shared`** — zod schema + 推断类型，前后端唯一事实来源，接口变更免人工同步

### 工程化

- 三包结构（shared / server / client），根目录统一脚本
- **ESLint + Prettier + EditorConfig** — 代码规范
- **GitHub Actions CI** — push 自动执行 `install → build → lint → vitest → Playwright e2e`
- **Dockerfile** — 一键容器化
- **Playwright** — E2E 冒烟测试（`e2e/smoke.spec.ts`，只读公开流程）

---

## 目录结构

```
shuangchenyue/
├── shared/                      # 前后端共享包（唯一事实来源）
│   └── src/
│       ├── schemas/             # zod schema（auth/post/user/message/admin/common）
│       └── types.ts             # z.infer 导出类型
├── client/                      # 前端
│   ├── src/
│   │   ├── api/                 # 类型化 API 模块（auth.ts/posts.ts/friends.ts）
│   │   ├── components/          # 可复用组件
│   │   │   ├── ui/              # 基础件（Avatar/Toast/ConfirmDialog/EmptyState）
│   │   │   ├── post/            # PostCard/PostDetail/PostMedia/PostDescriptionPanel
│   │   │   ├── chat/            # ChatWindow/MessageBubble/ConversationSidebar...
│   │   │   └── profile/         # ProfileHeader/ProfilePostGrid/PrivateFolder
│   │   ├── context/             # 仅存 Auth/Theme/Music/Event 四个 Context
│   │   ├── hooks/               # usePostsFeed/useLikePost/useFollowUser/useSse...
│   │   ├── lib/                 # 纯函数（scroll/comments）
│   │   ├── pages/               # 页面级组件（Home/Explore/Profile/Admin/Books...）
│   │   ├── state/               # queryClient、mitt 事件总线、交互缓存
│   │   └── styles/              # global.css + tokens（其余已模块化）
│   ├── android/                 # Capacitor Android 工程
│   └── package.json
├── server/                      # 后端
│   ├── src/
│   │   ├── index.ts             # 仅 bootstrap
│   │   ├── app.ts               # 组装 express 应用（helmet/pino/静态资源/SPA 回退）
│   │   ├── config.ts            # zod 校验环境变量 + PATHS 路径常量
│   │   ├── db/                  # connection/schema/migrations（16 个版本化迁移）
│   │   ├── middleware/          # auth / error / cors / validate
│   │   ├── repositories/        # 全部 SQL 收敛（强类型行，无 as any）
│   │   ├── routes/              # auth/posts/messages/friends/admin/books/music/events...
│   │   └── lib/                 # upload 工厂 / video / mailer
│   ├── test/                    # Vitest 单元测试（:memory: SQLite）
│   ├── uploads/                 # 用户上传文件（images/avatars/temp）
│   └── package.json
├── e2e/                         # Playwright 冒烟测试
├── .github/workflows/ci.yml     # CI
├── Dockerfile
├── deploy.ps1                   # 部署脚本
└── package.json                 # 根目录统一脚本
```

---

## 本地运行

### 环境要求

- **Node.js** >= 20（CI 使用 Node 22）
- **npm** >= 9

### 1. 克隆并安装依赖

```bash
git clone https://github.com/kuangdada01/shuangchenyue.git
cd shuangchenyue
npm run install:all
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 运行环境: production | development
NODE_ENV=development

# 服务器端口
PORT=3000

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-secret-key-here

# 管理员邮箱（注册该邮箱后自动成为管理员）
ADMIN_EMAIL=your-email@example.com

# CORS 白名单（逗号分隔，生产环境包含你的前端域名）
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com

# 邮件 SMTP（邮箱验证码，QQ 邮箱示例；不需要可留空）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-smtp-auth-code
```

### 3. 启动开发环境

```bash
npm run dev
```

- **前端页面**: http://localhost:5173（Vite 自动代理 `/api` 到后端）
- **后端 API**: http://localhost:3000
- 健康检查: http://localhost:3000/api/health

> 数据库为 SQLite 文件 `server/mimo.db`，首次启动自动建表并执行迁移。

### 4. 测试

```bash
npm run lint        # ESLint（三个包）
npm test            # 服务端 Vitest 单元测试
npm run e2e         # Playwright 冒烟测试（自动构建并在 3200 端口启动）
```

### 5. 构建生产版本

```bash
npm run build       # shared → server → client 依次构建
cd server && npm start
```

---

## 部署

### Docker

```bash
docker build -t shuangchenyue .
docker run -p 3000:3000 -v $(pwd)/server/uploads:/app/server/uploads shuangchenyue
```

### 传统部署

参考 `deploy.ps1`：构建 → 上传产物 → nginx 反向代理（前端静态文件 + `/api` 转发）。

---

## API 概览

| 路径 | 说明 |
|------|------|
| `/api/auth` | 注册（邮箱验证码）、登录、忘记密码、当前用户 |
| `/api/posts` | 帖子 CRUD、点赞/评论/收藏/转发/分享、视频与临时视频上传 |
| `/api/users` | 用户资料、头像、私密图片 |
| `/api/messages` | 私信会话列表、消息收发、清除/撤回 |
| `/api/friends` | 关注/取关、粉丝列表、搜索、推荐、状态 |
| `/api/notifications` | 评论/回复通知、已读 |
| `/api/admin` | 管理后台（用户/帖子/公告管理） |
| `/api/announcements` | 公告列表、定向推送、已读 |
| `/api/books` | 电子书列表/详情/章节 |
| `/api/music` | 音乐列表 |
| `/api/events` | SSE 实时事件流（私信/通知/公告） |
| `/api/health` | 健康检查 |

---

## License

MIT
