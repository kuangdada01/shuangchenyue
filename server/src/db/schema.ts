/**
 * ============================================================
 * 数据库表结构定义（DDL）
 * ============================================================
 * 所有 CREATE TABLE / CREATE INDEX 集中于此。
 * 时间字段统一 ISO-8601 UTC（带 Z 后缀与毫秒），
 * 与 verification_codes.expires（JS toISOString）格式一致，
 * 字符串比较与 SQLite datetime() 均可正确解析。
 */

import type Database from 'better-sqlite3';

export function createSchema(db: InstanceType<typeof Database>): void {
  db.exec(`
    /* ========== 用户表 ==========
     * 存储所有注册用户的基本信息
     * - username/email 唯一约束，防止重复注册
     * - role 区分普通用户和管理员
     * - avatar 存储头像文件路径
     */
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,           -- 用户名（唯一，3-30字符）
      email TEXT NOT NULL UNIQUE,              -- 邮箱（唯一，用于登录）
      password_hash TEXT NOT NULL,             -- bcrypt 加密后的密码
      avatar TEXT DEFAULT NULL,                -- 头像文件路径
      bio TEXT DEFAULT '',                     -- 个人简介
      role TEXT DEFAULT 'user',               -- 角色: 'user' | 'admin'
      email_verified INTEGER DEFAULT 0,        -- 邮箱验证状态
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) -- 注册时间
    );

    /* ========== 邮箱验证码表 ==========
     * 存储注册时发送的邮箱验证码
     * - 验证成功后删除记录
     * - expires 过期后清理
     */
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,                      -- 收件邮箱
      code TEXT NOT NULL,                       -- 6位验证码
      expires TEXT NOT NULL,                    -- 过期时间（ISO，JS 生成）
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    /* ========== 公告表 ==========
     * 存储管理员发布的公告
     * - target_user_id 为 NULL 表示全体公告
     * - target_user_id 有值表示定向推送给特定用户
     */
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,                     -- 公告标题
      content TEXT NOT NULL,                   -- 公告内容
      target_user_id INTEGER DEFAULT NULL,     -- 目标用户ID（NULL=全体用户）
      from_user_id INTEGER NOT NULL,           -- 发布者ID（管理员）
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 公告已读记录表 ==========
     * 记录用户已读的公告，实现已读/未读状态
     */
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL,        -- 公告ID
      user_id INTEGER NOT NULL,                -- 已读用户ID
      read_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),  -- 阅读时间
      UNIQUE(announcement_id, user_id),        -- 每个用户对每条公告只能标记一次
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 帖子表 ==========
     * 存储用户发布的图文/视频帖子
     * - image_url: JSON 数组格式，支持多图（最多9张）
     * - video_url: 视频文件路径（可选）
     * - video_cover: 视频封面图路径（可选）
     * - close_comments: 是否关闭评论（0=开放, 1=关闭）
     */
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 发布者ID
      image_url TEXT NOT NULL,                 -- 图片URL（JSON数组格式）
      title TEXT DEFAULT '',                   -- 标题（可选）
      description TEXT DEFAULT '',             -- 描述/正文
      close_comments INTEGER DEFAULT 0,        -- 是否关闭评论
      pinned INTEGER DEFAULT 0,                -- 是否置顶
      video_url TEXT DEFAULT NULL,             -- 视频URL
      video_cover TEXT DEFAULT NULL,           -- 视频封面URL
      share_count INTEGER DEFAULT 0,           -- 分享数（冗余计数）
      repost_count INTEGER DEFAULT 0,          -- 转发数（冗余计数）
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 帖子点赞表 ==========
     * 记录用户对帖子的点赞
     * - UNIQUE(user_id, post_id) 防止重复点赞
     */
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 点赞用户ID
      post_id INTEGER NOT NULL,                -- 被点赞帖子ID
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, post_id),                -- 每个用户对每篇帖子只能点赞一次
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    /* ========== 评论表 ==========
     * 存储帖子评论和嵌套回复
     * - parent_id: 自引用外键，实现嵌套回复（NULL=顶级评论）
     * - 级联删除: 删除父评论时自动删除所有子回复
     */
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 评论者ID
      post_id INTEGER NOT NULL,                -- 所属帖子ID
      parent_id INTEGER DEFAULT NULL,          -- 父评论ID（NULL=顶级评论）
      content TEXT NOT NULL,                   -- 评论内容
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
    );

    /* ========== 私信表 ==========
     * 存储用户之间的私信消息
     * - read: 已读状态（0=未读, 1=已读）
     * - image_url: 支持发送图片消息
     */
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,              -- 发送者ID
      receiver_id INTEGER NOT NULL,            -- 接收者ID
      content TEXT NOT NULL,                   -- 消息内容
      image_url TEXT DEFAULT NULL,             -- 消息图片URL
      read INTEGER DEFAULT 0,                  -- 已读状态: 0=未读, 1=已读
      quoted_message_id INTEGER DEFAULT NULL,  -- 被引用消息ID
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 通知表 ==========
     * 存储系统通知（评论通知、回复通知等）
     * - type: 'reply'=回复通知, 'comment'=评论通知
     * - read: 已读状态（0=未读, 1=已读）
     */
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 接收通知的用户ID
      type TEXT NOT NULL,                      -- 通知类型: 'reply' | 'comment'
      from_user_id INTEGER NOT NULL,           -- 触发通知的用户ID
      post_id INTEGER,                         -- 相关帖子ID
      comment_id INTEGER,                      -- 相关评论ID
      content TEXT DEFAULT '',                 -- 通知内容摘要
      read INTEGER DEFAULT 0,                  -- 已读状态: 0=未读, 1=已读
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 评论点赞表 ==========
     * 记录用户对评论的点赞
     * - UNIQUE(user_id, comment_id) 防止重复点赞
     */
    CREATE TABLE IF NOT EXISTS comment_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 点赞用户ID
      comment_id INTEGER NOT NULL,             -- 被点赞评论ID
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, comment_id),             -- 每个用户对每条评论只能点赞一次
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    );

    /* ========== 好友/关注表 ==========
     * 存储用户之间的关注关系（单向关注）
     * - UNIQUE(user_id, friend_id) 防止重复关注
     */
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 关注者ID
      friend_id INTEGER NOT NULL,              -- 被关注者ID
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, friend_id),              -- 每个用户对每个用户只能关注一次
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 私密图片表 ==========
     * 存储用户的私密图片（独立于帖子的私密空间）
     * - 每个用户最多10张
     */
    CREATE TABLE IF NOT EXISTS private_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,                -- 所属用户ID
      image_url TEXT NOT NULL,                 -- 图片文件路径
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ========== 分享记录表 ==========
     * 记录用户对帖子的分享，防止重复计数
     * - UNIQUE(user_id, post_id) 每个用户对每篇帖子只记一次
     */
    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    /* ========== 收藏记录表 ==========
     * 记录用户对帖子的收藏
     * - UNIQUE(user_id, post_id) 防止重复收藏
     */
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    /* ========== 转发记录表 ==========
     * 记录用户对帖子的转发（Repost）
     * - UNIQUE(user_id, post_id) 防止重复转发
     */
    CREATE TABLE IF NOT EXISTS reposts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, post_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    /* ========== 性能优化索引 ==========
     * 为常用查询字段创建索引，加速数据检索
     */
    CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);          -- 按用户查帖子
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC); -- 信息流按时间排序分页
    CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC); -- 用户帖子按时间排序
    CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);          -- 按帖子查点赞
    CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);          -- 按用户查点赞
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);    -- 按帖子查评论
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);   -- 按发送者查消息
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id); -- 按接收者查消息
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at); -- 消息历史按时间排序
    CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id); -- 按评论查点赞
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);       -- 按用户查通知
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read); -- 按用户+已读状态查通知
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);         -- 按用户查关注
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);     -- 按被关注者查粉丝
    CREATE INDEX IF NOT EXISTS idx_private_images_user ON private_images(user_id); -- 按用户查私密图片
    CREATE INDEX IF NOT EXISTS idx_shares_post_id ON shares(post_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON bookmarks(post_id);
    CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON reposts(user_id);
    CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON reposts(post_id);
  `);
}
