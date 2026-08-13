/**
 * ============================================================
 * 版本化数据库迁移
 * ============================================================
 * 使用 schema_migrations 表记录已执行的迁移版本。
 * 每个迁移的 up() 内部保持幂等（已存在则跳过），保证新老数据库都安全。
 * 新增迁移时追加并递增 id，禁止修改已发布的迁移。
 */

import type Database from 'better-sqlite3';

type Migration = { id: number; name: string; up: (db: InstanceType<typeof Database>) => void };

/** 判断表是否存在 */
function tableExists(db: InstanceType<typeof Database>, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

/** 判断列是否存在（替代历史 try/catch SELECT 探测方式） */
function hasColumn(db: InstanceType<typeof Database>, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

/** ALTER TABLE 添加列（仅当不存在时） */
function addColumnIfMissing(db: InstanceType<typeof Database>, table: string, column: string, ddl: string): void {
  if (!tableExists(db, table) || hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

/** 迁移列表（按 id 顺序执行，新增迁移时追加并递增 id） */
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'comments.parent_id',
    up: (db) => {
      addColumnIfMissing(db, 'comments', 'parent_id', 'parent_id INTEGER DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE');
    },
  },
  {
    id: 2,
    name: 'posts.image_url_json',
    up: (db) => {
      if (!tableExists(db, 'posts')) return;
      const sample = db.prepare('SELECT image_url FROM posts LIMIT 1').get() as { image_url: string } | undefined;
      if (sample && !sample.image_url.startsWith('[')) {
        const posts = db.prepare('SELECT id, image_url FROM posts').all() as { id: number; image_url: string }[];
        const update = db.prepare('UPDATE posts SET image_url = ? WHERE id = ?');
        for (const p of posts) {
          update.run(JSON.stringify([p.image_url]), p.id);
        }
      }
    },
  },
  {
    id: 3,
    name: 'messages.image_url',
    up: (db) => {
      addColumnIfMissing(db, 'messages', 'image_url', 'image_url TEXT');
    },
  },
  {
    id: 4,
    name: 'users.role',
    up: (db) => {
      addColumnIfMissing(db, 'users', 'role', "role TEXT DEFAULT 'user'");
    },
  },
  {
    id: 5,
    name: 'users.email_verified',
    up: (db) => {
      addColumnIfMissing(db, 'users', 'email_verified', 'email_verified INTEGER DEFAULT 0');
    },
  },
  {
    id: 6,
    name: 'posts.close_comments',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'close_comments', 'close_comments INTEGER DEFAULT 0');
    },
  },
  {
    id: 7,
    name: 'posts.pinned',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'pinned', 'pinned INTEGER DEFAULT 0');
    },
  },
  {
    id: 8,
    name: 'posts.video_url',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'video_url', 'video_url TEXT DEFAULT NULL');
    },
  },
  {
    id: 9,
    name: 'posts.video_cover',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'video_cover', 'video_cover TEXT DEFAULT NULL');
    },
  },
  {
    id: 10,
    name: 'posts.share_count',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'share_count', 'share_count INTEGER DEFAULT 0');
    },
  },
  {
    id: 11,
    name: 'posts.repost_count',
    up: (db) => {
      addColumnIfMissing(db, 'posts', 'repost_count', 'repost_count INTEGER DEFAULT 0');
    },
  },
  {
    id: 12,
    name: 'messages.quoted_message_id',
    up: (db) => {
      addColumnIfMissing(db, 'messages', 'quoted_message_id', 'quoted_message_id INTEGER DEFAULT NULL');
    },
  },
  {
    id: 13,
    name: 'timestamps_iso_utc',
    up: (db) => {
      // 历史数据格式 'YYYY-MM-DD HH:MM:SS' → ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SS.000Z'
      // GLOB 精确匹配旧格式，避免重复转换或误伤已有 ISO 值
      const LEGACY = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';
      const tables: { table: string; column: string }[] = [
        { table: 'users', column: 'created_at' },
        { table: 'verification_codes', column: 'created_at' },
        { table: 'announcements', column: 'created_at' },
        { table: 'announcement_reads', column: 'read_at' },
        { table: 'posts', column: 'created_at' },
        { table: 'likes', column: 'created_at' },
        { table: 'comments', column: 'created_at' },
        { table: 'messages', column: 'created_at' },
        { table: 'notifications', column: 'created_at' },
        { table: 'comment_likes', column: 'created_at' },
        { table: 'friends', column: 'created_at' },
        { table: 'private_images', column: 'created_at' },
        { table: 'shares', column: 'created_at' },
        { table: 'bookmarks', column: 'created_at' },
        { table: 'reposts', column: 'created_at' },
        { table: 'schema_migrations', column: 'applied_at' },
      ];
      for (const { table, column } of tables) {
        if (!tableExists(db, table) || !hasColumn(db, table, column)) continue;
        db.prepare(
          `UPDATE ${table} SET ${column} = replace(${column}, ' ', 'T') || '.000Z' WHERE ${column} GLOB ?`
        ).run(LEGACY);
      }
    },
  },
  {
    id: 14,
    name: 'shares_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          UNIQUE(user_id, post_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_shares_post_id ON shares(post_id);
      `);
    },
  },
  {
    id: 15,
    name: 'bookmarks_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          UNIQUE(user_id, post_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON bookmarks(post_id);
      `);
    },
  },
  {
    id: 16,
    name: 'reposts_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reposts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          UNIQUE(user_id, post_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON reposts(user_id);
        CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON reposts(post_id);
      `);
    },
  },
];

/** 迁移记录表 */
export function ensureMigrationTable(db: InstanceType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
}

/** 执行未应用的迁移（每个迁移在事务中执行并记录） */
export function applyMigrations(db: InstanceType<typeof Database>): void {
  ensureMigrationTable(db);
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map(r => r.id)
  );
  const record = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      m.up(db);
      record.run(m.id, m.name);
    })();
    console.log(`[db] 迁移已应用: ${m.id} ${m.name}`);
  }
}
