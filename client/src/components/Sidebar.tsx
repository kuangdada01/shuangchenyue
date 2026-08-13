/**
 * ============================================================
 * 侧边栏组件 (Sidebar)
 * ============================================================
 * 左侧导航栏，支持收起/展开
 *
 * 功能:
 * - 公开导航: 首页、搜索（无需登录）
 * - 需登录导航: 消息、分享、公告、主页、管理（管理员）
 * - 未读消息徽章（仅登录用户，3秒轮询刷新）
 * - 未读公告徽章
 * - 用户头像和退出登录（登录后）/ 登录按钮（未登录）
 * - 移动端自动变为底部导航栏（CSS媒体查询）
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, MessageCircle, PlusSquare, User, LogOut, Megaphone, Shield, LogIn, Sun, Moon, Monitor, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useEvent } from '../context/CreateContext';
import { events } from '../state/events';
import { useSse } from '../hooks/useSse';
import { saveHomeScrollPosition } from '../lib/scroll';
import api from '../api';
import Avatar from './Avatar';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const location = useLocation();
  const { user, logout, openLoginPrompt } = useAuth();
  const { openCreate } = useEvent();
  const { mode, setMode } = useTheme();

  // 乐观更新追踪：记录服务器尚未确认的已读条数
  const pendingReads = useRef(0);
  const lastServerTotal = useRef(0);

  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      const [notifRes, convRes, annRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/messages/conversations'),
        api.get('/announcements').catch(() => ({ data: { unread_count: 0 } })),
      ]);
      const notifCount = notifRes.data.unread_count || 0;
      const msgCount = (convRes.data.conversations || []).reduce(
        (sum: number, c: any) => sum + (c.unread_count || 0), 0
      );
      const serverTotal = notifCount + msgCount;

      // 服务器确认了部分已读（总量下降）→ 减少 pending
      if (serverTotal < lastServerTotal.current) {
        pendingReads.current = Math.max(0, pendingReads.current - (lastServerTotal.current - serverTotal));
      }
      lastServerTotal.current = serverTotal;

      // 用服务器值减去未确认的已读数，防止乐观更新的角标被旧数据覆盖
      setUnreadCount(Math.max(0, serverTotal - pendingReads.current));
      setAnnouncementCount(annRes.data.unread_count || 0);
    } catch {}
  }, [user]);

  // 定时轮询 (30秒) - 仅登录用户（SSE 失败时的兜底）
  useEffect(() => {
    if (!user) return;
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [loadUnread, user]);

  // SSE 实时推送：新消息/通知/公告到达时立即刷新角标
  useSse(user?.id, (type) => {
    if (type === 'message' || type === 'notification' || type === 'announcement') {
      loadUnread();
    }
  });

  // 已读事件（mitt 总线）：立即乐观更新角标 + 后台确认
  // 历史语义：notif 每条已读 -1，msg 按实际条数扣减，公告直接刷新
  useEffect(() => {
    const handler = (payload: { source: 'notif' | 'msg' | 'ann'; count?: number }) => {
      if (!user) return;
      if (payload.source === 'msg') {
        const delta = payload.count ?? 1;
        if (delta > 0) {
          pendingReads.current += delta;
          setUnreadCount(prevCount => Math.max(0, prevCount - delta));
        }
      } else if (payload.source === 'notif') {
        pendingReads.current += 1;
        setUnreadCount(prevCount => Math.max(0, prevCount - 1));
      }
      loadUnread();
    };
    events.on('badge:changed', handler);
    return () => { events.off('badge:changed', handler); };
  }, [user, loadUnread]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const themeIcon = mode === 'light' ? <Sun size={24} /> : mode === 'dark' ? <Moon size={24} /> : <Monitor size={24} />;
  const themeLabel = mode === 'light' ? '亮色模式' : mode === 'dark' ? '暗色模式' : '跟随系统';
  const cycleTheme = () => {
    const next = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
    setMode(next);
  };

  return (
    <nav
      className={`${styles.sidebar} ${expanded ? styles.expanded : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className={styles.nav} style={{ marginTop: 12 }}>
        <Link to="/" className={`${styles.item} ${isActive('/') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
          <span className={styles.itemIcon}><Home size={24} /></span>
          <span className={styles.itemLabel}>首页</span>
        </Link>
        <Link to="/explore" className={`${styles.item} ${styles.itemSearch} ${isActive('/explore') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
          <span className={styles.itemIcon}><Search size={24} /></span>
          <span className={styles.itemLabel}>搜索</span>
        </Link>
        {user && (
          <Link to="/messages" className={`${styles.item} ${isActive('/messages') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
            <span className={styles.itemIcon}>
              <MessageCircle size={24} />
              {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </span>
            <span className={styles.itemLabel}>消息</span>
          </Link>
        )}
        {user && (
          <button className={styles.item} onClick={openCreate}>
            <span className={styles.itemIcon}><PlusSquare size={24} /></span>
            <span className={styles.itemLabel}>分享</span>
          </button>
        )}
        {user && (
          <Link to="/announcements" className={`${styles.item} ${isActive('/announcements') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
            <span className={styles.itemIcon}>
              <Megaphone size={24} />
              {announcementCount > 0 && <span className={styles.badge}>{announcementCount}</span>}
            </span>
            <span className={styles.itemLabel}>公告</span>
          </Link>
        )}
        {user && (
          <Link to="/profile" className={`${styles.item} ${isActive('/profile') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
            <span className={styles.itemIcon}><User size={24} /></span>
            <span className={styles.itemLabel}>主页</span>
          </Link>
        )}
        <Link to="/books" className={`${styles.item} ${isActive('/books') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
          <span className={styles.itemIcon}><BookOpen size={24} /></span>
          <span className={styles.itemLabel}>图书</span>
        </Link>
        {user?.role === 'admin' && (
          <Link to="/admin" className={`${styles.item} ${isActive('/admin') ? styles.active : ''}`} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
            <span className={styles.itemIcon}><Shield size={24} /></span>
            <span className={styles.itemLabel}>管理</span>
          </Link>
        )}
      </div>

      <div className={styles.bottom}>
        <button className={styles.item} onClick={cycleTheme} title={themeLabel}>
          <span className={styles.itemIcon}>{themeIcon}</span>
          <span className={styles.itemLabel}>{themeLabel}</span>
        </button>
        {user ? (
          <>
            <Link to="/profile" className={styles.user} onClick={() => { if (location.pathname === '/') saveHomeScrollPosition(); }}>
              <Avatar src={user.avatar} username={user.username} size={40} className={styles.avatar} />
              <span className={styles.username}>{user.username}</span>
            </Link>
            <button className={styles.item} onClick={logout} style={{ marginTop: 4 }}>
              <span className={styles.itemIcon}>
                <LogOut size={24} />
              </span>
              <span className={styles.itemLabel}>退出登录</span>
            </button>
          </>
        ) : (
          <button
            className={styles.item}
            style={{ marginTop: 4 }}
            onClick={openLoginPrompt}
          >
            <span className={styles.itemIcon}><LogIn size={24} /></span>
            <span className={styles.itemLabel}>登录</span>
          </button>
        )}
      </div>
    </nav>
  );
}