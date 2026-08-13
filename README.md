# 霜晨月

一个全栈社交媒体平台，支持 Web 端和 Android 客户端。

## 技术栈

### 前端（client）

- **React 19** + **TypeScript** — UI 框架
- **Vite 8** — 构建工具
- **React Router v7** — 路由管理
- **Axios** — HTTP 请求
- **Lucide React** — 图标库
- **Capacitor 8** — Android 原生打包

### 后端（server）

- **Express** — Web 框架
- **TypeScript** — 类型安全
- **better-sqlite3** — SQLite 数据库
- **JWT (jsonwebtoken)** — 用户认证
- **bcryptjs** — 密码加密
- **Multer** — 文件上传（图片/视频）
- **Nodemailer** — 邮件验证码发送

## 功能特性

- **用户系统** — 注册（邮箱验证码）、登录、个人主页
- **帖子** — 发布图文/视频帖子、点赞、评论（支持嵌套回复）、分享
- **私信** — 用户间一对一聊天，支持图片消息
- **关注** — 关注/取关用户、查看粉丝列表
- **通知** — 评论/回复实时通知
- **公告** — 管理员发布公告（支持定向推送）
- **管理后台** — 用户管理、帖子管理、公告管理
- **音乐播放器** — 首页背景音乐播放
- **暗色/亮色主题** — 主题切换
- **Android 客户端** — 通过 Capacitor 打包原生 APK

## 本地运行

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

### 1. 克隆项目

```bash
git clone https://github.com/kuangdada01/shuangchenyue.git
cd shuangchenyue
```

### 2. 安装依赖

```bash
npm run install:all
```

### 3. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 填入你的配置：

```env
# 运行环境（生产环境必须设为 production）
NODE_ENV=development

# 服务器端口
PORT=3000

# JWT 密钥（请修改为自己的强密钥，生产环境缺失时服务拒绝启动）
JWT_SECRET=your-secret-key-here

# CORS 白名单（逗号分隔的跨域来源，同源请求无需配置）
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com

# 管理员邮箱（注册后自动成为管理员）
ADMIN_EMAIL=your-email@example.com

# 邮件 SMTP 配置（用于发送验证码，QQ邮箱示例）
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your-email@qq.com
SMTP_PASS=your-smtp-auth-code
```

> 如果不需要邮箱验证码功能，SMTP 相关配置可以留空。

### 4. 启动项目

```bash
npm run dev
```

启动后访问：
- **前端页面**: http://localhost:5173
- **后端 API**: http://localhost:3000

前端开发服务器会自动将 `/api` 请求代理到后端。

### 5. 构建生产版本

```bash
# 构建前端
cd client && npm run build

# 构建后端
cd server && npm run build

# 启动生产服务
cd server && npm start
```

## 项目结构

```
shuangchenyue/
├── client/                  # 前端项目
│   ├── src/
│   │   ├── components/      # 组件
│   │   ├── pages/           # 页面
│   │   ├── context/         # React Context 状态管理
│   │   ├── styles/          # CSS 样式
│   │   ├── api.ts           # API 请求封装
│   │   └── config.ts        # 配置
│   ├── android/             # Android Capacitor 项目
│   └── package.json
├── server/                  # 后端项目
│   ├── src/
│   │   ├── routes/          # API 路由
│   │   ├── middleware/      # 中间件（认证等）
│   │   ├── db.ts            # 数据库初始化
│   │   └── index.ts         # 入口文件
│   ├── uploads/             # 用户上传文件存储
│   └── package.json
├── .env.example             # 环境变量示例
├── .env                     # 环境变量（不提交到 Git）
└── package.json             # 根目录（统一启动脚本）
```

## API 接口

| 路径 | 说明 |
|------|------|
| `/api/auth` | 注册、登录、获取当前用户 |
| `/api/posts` | 帖子 CRUD、点赞、评论 |
| `/api/users` | 用户资料、头像、私密图片 |
| `/api/messages` | 私信会话列表、消息收发 |
| `/api/friends` | 关注、搜索、推荐用户 |
| `/api/notifications` | 评论/回复通知 |
| `/api/admin` | 管理后台接口 |
| `/api/announcements` | 公告查看、标记已读 |

## License

MIT
