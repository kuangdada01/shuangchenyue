# 霜晨月项目现代化优化方案

> 目标：现代化、易维护、组件可复用。**功能与用户可见行为保持不变**。
> 原则：纯内部重构优先，接口契约（HTTP 端点、响应 JSON 形状、UI/UX）冻结；每阶段独立可验证、可回滚。
> 安全网：已存在回档点 tag `backup-2026-08-13`；每阶段开始前打新 tag，阶段验收通过再进下一阶段。

---

## 1. 现状评估

### 1.1 技术栈

| 层 | 技术 |
|---|---|
| 客户端 | React 19 · Vite 8 · TypeScript 6(strict) · react-router-dom v7 · axios · lucide-react · Capacitor 8(Android) · 纯手写 CSS |
| 服务端 | Express 4 · better-sqlite3(裸 SQL) · zod · multer · sharp · nodemailer · JWT · SSE · morgan/helmet |
| 工程化 | npm scripts + concurrently；无 workspace、无共享类型、**无 ESLint/Prettier/测试/CI/Docker** |

### 1.2 已经做得好的地方（保留）

- TS strict 双端开启；服务端 zod 校验 + helmet + 限流 + CORS 白名单 + 路径穿越防护 + 孤儿文件清理
- 数据库 WAL + 外键级联 + 索引 + 版本化迁移表
- 认证三件套（authMiddleware / optionalAuth / adminMiddleware）、SSE 心跳与断线重连
- 图片压缩、视频转码降级（ffmpeg 缺失不阻塞）、临时视频 24h 清理
- 客户端：设计令牌 CSS 变量 + 暗色模式、懒加载非首屏页面、乐观更新、下拉刷新、滚动位置恢复
- 代码注释规范、中文注释一致

### 1.3 核心痛点

**服务端**
1. `routes/posts.ts` 是 1148 行"上帝文件"，混着帖子 CRUD、点赞、评论、收藏、转发、分享、搜索、视频上传 8 类功能。
2. 同一段"帖子+计数+EXISTS 状态"SQL 在 8 个端点里以"登录/未登录"两套分支重复书写（约 200 行重复）。
3. 每个 handler 都手写 `try/catch → console.error → res.status(500)`（出现约 30 次）；错误文案中英混杂。
4. 数据库查询结果大量 `as any`、`(p: any)`，类型安全形同虚设。
5. `db.ts` 498 行单文件：建表 DDL、12 个手写迁移、shares/bookmarks/reposts 三张表游离在迁移体系之外，模式不统一；迁移用 try/catch 探测列存在。
6. multer 配置（storage/文件名/大小/过滤）在 posts.ts、users.ts、messages.ts 各复制一份；`path.join(__dirname,'..','..','uploads',...)` 散落 20+ 处（src/dist 路径差异是已知坑）。
7. `index.ts` 里还内嵌着 CORS 手写中间件、音乐列表接口、SSE 入口、SPA 回退——入口文件 314 行承担了 6 种职责。
8. `created_at` 存 `datetime('now')`（UTC 无时区后缀），客户端被迫到处 `new Date(str + 'Z')` 打补丁。
9. share_count / repost_count 冗余计数，与 like/comment 的 COUNT 子查询两种模式并存，不一致。
10. 0 个自动化测试，重构无保护网。

**客户端**
1. **Provider 地狱**：8 层 Context 嵌套（Theme/Auth/Event/Follow/Like/Repost/Bookmark/Music）。其中 Follow/Like/Repost/Bookmark 本质是"Map 缓存 + setState"——在手工重造服务器状态缓存。
2. **计数器事件总线**：`postCreated/notifRead/msgRead/announcementRead/followChanged` 用数字自增当事件，消费方（Sidebar、HomePage）用 useEffect diff 前后值，脆弱且难懂。
3. **巨型组件**：HomePage 606 行（取数+滚动恢复 90 帧 RAF 循环+下拉刷新+overlay 管理+备案页脚）、PostDetail 1009 行、CreatePost 804 行、EditPost 541 行、Profile 678 行、Messages 677 行。
4. **交互逻辑复制粘贴**：点赞/取消（乐观更新）在 PostCard 和 PostDetail 各写一遍；关注逻辑在 PostCard、PostDetail、Profile、HomePage 推荐卡片各写一遍。
5. **全局 CSS**：profile.css 1677 行、post.css 1072 行、messages.css 945 行，全部类名全局作用域，无模块化，跨组件样式互相污染风险高。
6. **反 React 的直接 DOM 操作**：点赞心形 SVG 用 querySelector 改属性、下拉刷新直接改 style、PostDetail 里模块级变量 `dispatchingBackButton`/`activeNestedPostDetailRef` 协调嵌套弹窗、`document.querySelector('.main-content')` 散落多处。
7. **字符串 URL 拼接散落**：`api.get('/posts?page=...')` 形式的调用遍布全站，端点无集中定义、无类型约束。
8. **手写取数样板**：loading/error/缓存全靠每组件 `useState + try/catch` 重复实现；`.catch(() => {})` 静默吞错。
9. 类型泄漏：`liked?: number`（0/1）等 SQLite 痕迹直通 UI 层。
10. `components/Sidebar.tsx` 从 `pages/HomePage.tsx` 导入 `saveHomeScrollPosition`——组件层反向依赖页面层。
11. 无 aria-label/焦点管理基础无障碍；SVG 按钮无文案。

**工程化**
12. 无 ESLint/Prettier/EditorConfig、无 CI、无 Dockerfile、deploy.ps1 手工发布。
13. 前后端类型各自手写维护（client/types.ts 与 server 无关联），接口改动靠人工同步。

---

## 2. 目标架构蓝图

```
repo/
├─ shared/                     # npm workspace：唯一事实来源
│  └─ src/
│     ├─ schemas/              # zod schema（请求/响应）
│     └─ types.ts              # z.infer 导出类型，前后端共用
├─ client/src/
│  ├─ api/                     # 类型化 API 模块（api/auth.ts, api/posts.ts...）
│  ├─ components/ui/           # 无业务依赖的基础件：Avatar/Button/Modal/Toast/ConfirmDialog/Spinner/Empty
│  ├─ components/posts/        # PostCard/PostDetail/CommentItem/EmojiPicker...
│  ├─ components/chat/         # Messages/MessageBubble/ConversationItem...
│  ├─ components/books/        # 书籍三页拆出的复用块
│  ├─ features/                # 按业务域组织的页面级代码（home/, explore/, profile/, admin/）
│  ├─ hooks/                   # useLikePost/useFollowUser/useScrollRestore/usePullToRefresh/useAndroidBack...
│  ├─ state/                   # queryClient、事件总线、仅存的 Auth/Theme/Music 三个 Context
│  ├─ lib/                     # format.ts、media-url.ts、scroll.ts（纯函数，可单测）
│  └─ styles/                  # tokens.css + 组件级 CSS Modules
└─ server/src/
   ├─ index.ts                 # 只做 bootstrap
   ├─ app.ts                   # 组装 express 应用（可注入依赖，便于测试）
   ├─ config.ts                # zod 校验环境变量 + 统一路径常量（PATHS.uploads...）
   ├─ db/
   │  ├─ index.ts              # 连接 + pragma
   │  ├─ schema.ts             # DDL
   │  └─ migrations/           # 编号迁移文件，统一 runner
   ├─ middleware/              # auth / error / validate / rate-limit
   ├─ routes/                  # 只声明端点+组装中间件，无业务逻辑
   ├─ services/                # posts.service.ts / users.service.ts...（业务编排）
   ├─ repositories/            # post.repo.ts / user.repo.ts...（全部 SQL 收敛于此，强类型行）
   └─ lib/                     # upload.ts / image.ts / video.ts / mailer.ts / sse.ts
```

---

## 3. 分阶段实施路线

每阶段结束时：功能回归清单全过 + `git tag phase-N`。任何阶段失败直接回退上一 tag。

### P0 质量护栏（1–2 天，零行为变化）

1. 根目录建 npm workspaces（`shared/`、`client/`、`server/`）；`.editorconfig`；ESLint(flat config, typescript-eslint) + Prettier 统一格式化（先只 lint 不强制格式化全量代码，避免巨型 diff）。
2. `shared/` 建 zod schema 与导出类型（先只搬 auth 一个模块验证链路）。
3. server `config.ts`：zod 校验 env（JWT_SECRET、SMTP_*、ADMIN_EMAIL、PORT），启动即失败；`PATHS` 常量替换 `__dirname,'..','..'` 拼接。
4. 抽 `middleware/error.ts`（AppError + 统一错误响应 + 中文文案）+ `asyncHandler` 包装器；逐个替换 handler 的 try/catch（机械替换，行为不变）。
5. CI 最小骨架：GitHub Actions 跑 `tsc + lint + vitest`；Dockerfile（server 构建 + client 构建产物）。

**验收**：`npm run dev` 全流程可用；健康检查、注册登录、发帖、点赞、私信与改造前一致；CI 绿灯。

### P1 服务端分层重构（3–5 天，接口契约冻结）

1. **repository 层**：所有 SQL 收敛到 `repositories/`，定义 Row 类型（如 `PostRow`、`PostWithUser`），彻底移除 `as any`。
   - 例：`postRepo.list({ page, limit, userId? })`、`postRepo.getById(id, userId?)`；把"登录/未登录"两套 SQL 合并为一份（EXISTS 的 user_id 参数传 `userId ?? -1` 恒假即可，行为等价、代码减半）。
   - 评论查询同样收敛（GET /:id 与 GET /:id/comments 复用同一函数）。
2. **拆分 posts.ts**：`routes/posts/` 目录（posts.ts、comments.ts、likes.ts、media.ts），共享同一 Router 挂载 `/api/posts`；服务层 `services/posts.service.ts` 承接通知创建、文件清理等编排。
3. **统一上传**：`lib/upload.ts` 提供 `createUploader({ dir, prefix, limits, filter })` 工厂；posts/users/messages 三处 multer 配置收敛；图片/视频/临时视频三类上传器复用。
4. **迁移规范化**：把游离的 shares/bookmarks/reposts 建表收进迁移列表；迁移探测从 try/catch 改为 `PRAGMA table_info`；新迁移文件化。
5. **时间字段**：新增数据统一存 ISO8601 UTC（`strftime('%Y-%m-%dT%H:%M:%fZ','now')`）；旧数据读取时兼容两格式（`parseDbTime` 一处实现），客户端 `+'Z'` 补丁随之全部删除。
6. `index.ts` 瘦身：CORS 换 `cors` 包（保持现有白名单语义）、音乐列表移到 `routes/music.ts`、SSE 入口移到 `routes/events.ts`、SPA 回退移入 `app.ts`；`index.ts` 只剩 bootstrap。
7. query 参数用 zod 校验（page/limit/q），替代 `parseInt(...)||1` 手写。
8. 服务端 Vitest 单测：以 `:memory:` SQLite 跑 repository 层（帖子 CRUD、点赞去重、评论级联、迁移幂等）。

**验收**：用接口契约测试（对改造前记录的真实响应快照做 diff）确认所有端点响应 JSON 形状不变。

### P2 客户端状态层现代化（3–4 天，用户可见行为不变）

1. **引入 TanStack Query**（`@tanstack/react-query`）：`queryClient` 挂在 `state/`。
   - 帖子列表：query key `['posts', page]`；模块级 `cachedPosts` 的"切页不重载"语义由 query cache + `staleTime` 等价实现。
   - 点赞/收藏/转发/关注改为 `useMutation` + `onMutate` 乐观更新 + `onError` 回滚——把 PostCard/PostDetail 里两套手写乐观逻辑合并成 `hooks/useLikePost.ts`、`hooks/useRepost.ts`、`hooks/useBookmark.ts`、`hooks/useFollowUser.ts` 四个 hook，四处调用点全部复用。
2. **事件总线**：`CreateContext` 的 5 个计数器全部换成 `mitt`（约 100 字节）typed emitter：
   `events.post.created / events.badge.changed / events.follow.changed`，订阅方不再 useEffect diff 数字。Follow/Like/Repost/Bookmark 四个 Context 删除，Provider 从 8 层降到 4 层（Theme/Auth/Music + QueryClientProvider）。
3. **typed API 层**：`api/` 目录按域拆模块（复用 shared 类型），全部端点集中定义；`api.ts` 只保留 axios 实例与拦截器。
4. SSE hook 收进 `state/`，配合事件总线广播。
5. 静默 `.catch(() => {})` 收敛为统一错误处理（interceptor 内 toast，去重防刷屏）。

**验收**：重点回归点赞取消、关注取关、收藏、转发、未读角标、SSE 实时刷新、登录过期登出——行为与改造前逐项一致。

### P3 组件化与复用（3–5 天，UI 逐像素不变）

1. 拆巨型组件（只抽逻辑，不改 JSX 结构）：
   - `HomePage` → `usePostsFeed`（取数+缓存）、`usePullToRefresh`、`useScrollRestore`（含 RAF 恢复逻辑整体搬入）、`RecommendCard` 子组件、`IcpFooter` 子组件。
   - `PostDetail` → `usePostDetail(postId)`（数据+评论树折叠/高亮）、`ImageCarousel`、`CommentSection`、`MediaLightbox`（缩放查看）子组件；嵌套弹窗协调改为 Context/状态栈，删除模块级 `dispatchingBackButton` 全局变量。
   - `CreatePost`/`EditPost` → 共享 `PostForm` 基座（字段、上传进度、校验逻辑复用，两处仅差异配置化）。
   - `Messages` → `ConversationList`、`ChatWindow`、`MessageComposer`（输入+图片+引用）。
   - `Profile` → `ProfileHeader`、`PostGrid`、`PrivateGallery`。
2. 基础 UI 件沉淀到 `components/ui/`：`Avatar`（现有）、`Button`、`Modal`（统一遮罩/动画/焦点陷阱）、`Toast`、`ConfirmDialog`、`Spinner`、`EmptyState`；全站替换硬编码内联样式（如"加载中..."块）。
3. 修复分层反向依赖：`saveHomeScrollPosition` 移到 `lib/scroll.ts`，Sidebar 不再 import 页面。
4. 无障碍底线：图标按钮补 `aria-label`、Modal 焦点陷阱 + Esc 关闭（补足现有按钮行为，不改变交互结果）。
5. `components/` 与 `pages/` 职责归位：Messages/Profile 等页面级代码移入 `features/` 或页面文件内联，`components/` 只留可复用件。

**验收**：桌面端 + Android 真机走查：信息流、发帖（9图/视频/临时视频）、详情评论回复折叠高亮、私信会话、个人主页、管理后台——视觉与交互无差异。

### P4 样式工程化（2–3 天，视觉不变）

1. `styles/tokens.css` 保留设计令牌（现状已很好），追加间距/字号/动效令牌。
2. 大 CSS 按组件拆分并迁移 CSS Modules（Vite 原生支持，零依赖）：`post.css` → `PostCard.module.css`、`PostDetail.module.css`...；全局类仅保留布局与工具类。
3. 迁移以"文件级"为单位逐步进行（改一个组件验证一个），避免一次性 diff。
4. 清理 `!important`（global.css 移动端区块有 10+ 处），用级联层 `@layer` 或更具体选择器替代。

**验收**：`pnpm build` 产物截图对比（首页/详情/私信/后台 4 屏），无视觉回归。

### P5 体验与工程收尾（可选，1–3 天）

1. Express 4 → 5（通配路由语法迁移、async 错误自动冒泡，可删除 asyncHandler）。
2. morgan → pino + pino-http（结构化日志，保留 dev 可读输出）。
3. 视频转码、图片压缩挪到队列/子进程池（目前同步占用请求线程）；单实例部署可暂缓。
4. 书籍扫描加内存缓存（目录 mtime 失效），大书籍列表请求不再反复 readdir。
5. 前端包体积：`vite build` 手动分包（react/axios/lucide 单独 chunk），lucide 图标按需引入。
6. E2E（Playwright）冒烟：注册→发帖→点赞→评论→私信主链路。

---

## 4. 关键改造设计（示意代码）

### 4.1 asyncHandler + AppError（服务端）

```ts
// middleware/error.ts
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const asyncHandler = (fn: (req, res, next) => Promise<unknown>) =>
  (req, res, next) => fn(req, res, next).catch(next);

// 使用（等价于原 try/catch，含 400 校验分支）
router.post('/:id/comments', authMiddleware, validateBody(commentSchema), asyncHandler(async (req, res) => {
  const post = await commentService.create({...});
  res.status(201).json(post);
}));
```

### 4.2 repository 收敛 SQL（消灭登录/未登录双份查询）

```ts
// repositories/post.repo.ts
const SELECT_POST = `
  SELECT p.*, u.username, u.avatar,
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id)        AS like_count,
    (SELECT COUNT(*) FROM comments WHERE post_id = p.id)     AS comment_count,
    EXISTS(SELECT 1 FROM likes    WHERE post_id = p.id AND user_id = ?) AS liked,
    EXISTS(SELECT 1 FROM shares   WHERE post_id = p.id AND user_id = ?) AS shared,
    EXISTS(SELECT 1 FROM reposts  WHERE post_id = p.id AND user_id = ?) AS reposted
  FROM posts p JOIN users u ON u.id = p.user_id`;

export function listPosts(page: number, limit: number, userId?: number): PostWithUser[] {
  const uid = userId ?? -1;                    // 未登录：EXISTS 恒假，行为与原两套 SQL 完全一致
  return db.prepare(`${SELECT_POST} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
    .all(uid, uid, uid, limit, (page - 1) * limit) as PostWithUser[];
}
```

### 4.3 客户端复用的交互 hook（PostCard/PostDetail/后台共用一份逻辑）

```ts
// hooks/useLikePost.ts
export function useLikePost(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (liked: boolean) =>
      liked ? api.delete(`/posts/${postId}/like`) : api.post(`/posts/${postId}/like`),
    onMutate: async (liked) => { /* 乐观更新，快照回滚 */ },
    onError: (_e, _v, ctx) => qc.setQueryData(['posts'], ctx?.prev),
  });
}
```

### 4.4 事件总线替代计数器

```ts
// state/events.ts
import mitt from 'mitt';
export type AppEvents = {
  'post:created': void;
  'badge:changed': void;
  'follow:changed': number;          // userId
};
export const events = mitt<AppEvents>();
// Sidebar: events.on('badge:changed', loadUnread)   —— 删除 prevNotifRef/pendingReads 差值推算
```

---

## 5. 风险控制与验收

- **回档点**：当前 tag `backup-2026-08-13`；每阶段开工前 `git tag phase-N-start`，验收后 `git tag phase-N-done`。
- **契约冻结**：P1 前用脚本抓取全部 GET 端点响应存 JSON 快照（含未登录/登录两种状态），每阶段结束 diff；响应形状有差异即视为失败。
- **回归清单**（每阶段全过）：注册/登录/找回密码、发图文帖（1/9 图）、视频帖（临时上传→发布→放弃清理）、编辑/删除帖、点赞/取消、评论/回复/删除/折叠、收藏、转发、分享计数、关注/粉丝、私信（文字/图片/引用/已读）、通知/公告/SSE、管理员后台、书籍列表/详情/阅读、主题切换、音乐播放、Android 返回键行为、下拉刷新、滚动位置恢复。
- **性能不回退**：改造后对比 `vite build` 包体积、首页首屏时间（Lighthouse 快照）、`GET /api/posts` 响应时间（改造前后各测 10 次取中位数）。
- **安全不回退**：路径穿越测试（非法 file/url 参数）、CORS 白名单外 Origin 403、限流触发、token 过期清理。

---

## 6. 问题对照清单（文件 → 问题 → 建议）

| 文件 | 问题 | 建议 |
|---|---|---|
| server/src/routes/posts.ts (1148行) | 上帝文件、SQL 重复 ×8、try/catch ×30 | P1 拆分 + repository |
| server/src/db.ts (498行) | DDL/迁移/游离建表混居、try/catch 探测列 | P1 迁移文件化、PRAGMA table_info |
| server/src/index.ts (314行) | 6 种职责内嵌 | P1 拆 app.ts / routes/music.ts / routes/events.ts |
| server/src/routes/{users,messages,posts}.ts | multer 配置 ×3 复制 | P1 lib/upload.ts 工厂 |
| server/src/utils.ts | 路径拼接散落、cwd/__dirname 坑 | P0 PATHS 常量 |
| 全 routes | `as any` 类型断言 | P1 Row 类型 + repository |
| client/src/App.tsx | 8 层 Provider | P2 降到 4 层 |
| client/src/context/CreateContext.tsx | 计数器事件 ×5 | P2 mitt 总线 |
| client/src/context/{Follow,Like,Repost,Bookmark}Context.tsx | 手写服务器状态缓存 | P2 TanStack Query |
| client/src/pages/HomePage.tsx (606行) | 取数/滚动/下拉/overlay 混杂 | P3 拆 hooks + 子组件 |
| client/src/components/PostDetail.tsx (1009行) | 巨型 + 模块级全局变量协调弹窗 | P3 usePostDetail + 组件拆分 |
| client/src/components/{CreatePost,EditPost}.tsx | 804+541 行重复表单 | P3 共享 PostForm |
| client/src/components/{PostCard,PostDetail}.tsx | 点赞/关注逻辑 ×2 复制 | P2 复用 hooks |
| client/src/styles/*.css | 1677/1072/945 行全局 CSS | P4 CSS Modules 拆分 |
| client/src/utils.ts | `+ 'Z'` 时区补丁 ×4 | P1 服务端 ISO 存储 + parseDbTime |
| client/src/api.ts + 全站 | URL 字符串散落、无类型 | P2 typed api 层 |
| client/src/types.ts | 与 server 类型割裂、0/1 泄漏 | P0 shared 包 |
| components/Sidebar.tsx → pages/HomePage | 组件反向依赖页面 | P3 lib/scroll.ts |
| 工程根 | 无 lint/CI/Docker/测试 | P0 护栏 |
| server 全库 | created_at 无时区后缀 | P1 统一 ISO UTC（读兼容） |

---

## 7. 建议实施顺序与预估

| 阶段 | 内容 | 预估 | 风险 |
|---|---|---|---|
| P0 | 质量护栏（workspace/shared/lint/CI/Docker/env 校验） | 1–2 天 | 低，纯新增 |
| P1 | 服务端分层（repository/服务层/拆路由/上传统一/迁移规范） | 3–5 天 | 中，契约冻结+快照 diff 兜底 |
| P2 | 客户端状态层（React Query/事件总线/typed api） | 3–4 天 | 中，重点回归乐观更新 |
| P3 | 组件化（拆巨型组件/hooks/UI 件） | 3–5 天 | 中，逐像素走查 |
| P4 | 样式模块化 | 2–3 天 | 低，截图对比 |
| P5 | 收尾（Express5/pino/分包/E2E） | 可选 | 低 |

总计约 12–19 人日，可按阶段随时暂停、每阶段独立交付价值。
