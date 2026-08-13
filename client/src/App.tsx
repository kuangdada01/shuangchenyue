/**
 * ============================================================
 * MIMO 应用根组件
 * ============================================================
 * 负责:
 * 1. 配置路由（React Router v7）
 * 2. 组合全局上下文提供者（认证、事件、关注、点赞）
 * 3. 公开路由（无需登录即可浏览）+ 受保护路由（需登录）
 * 4. 渲染全局模态框（创建帖子、编辑帖子、登录提示）
 * ============================================================
 */

import { BrowserRouter, HashRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './state/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { EventProvider, useEvent } from './context/CreateContext';
import { MusicProvider } from './context/MusicContext';
import MusicPlayer from './components/MusicPlayer';
import Sidebar from './components/Sidebar';
import Toast, { showToast } from './components/ui/Toast';
import CreatePost from './components/CreatePost';
import EditPost from './components/EditPost';
import LoginPrompt from './components/LoginPrompt';
import HomePage from './pages/HomePage';

// 懒加载非首屏页面
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AnnouncementPage = lazy(() => import('./pages/AnnouncementPage'));
const BooksPage = lazy(() => import('./pages/BooksPage'));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage'));
const BookReaderPage = lazy(() => import('./pages/BookReaderPage'));

// ============================================================
// 主布局组件
// ============================================================

/**
 * MainLayout - 始终渲染侧边栏 + 主内容区
 * 不做认证检查，公开和受保护路由都可使用
 */
function PageLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8e8e8e', fontSize: 14 }}>
      加载中...
    </div>
  );
}

function MainLayout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      {isHome && <MusicPlayer />}
    </div>
  );
}

// ============================================================
// 受保护路由守卫组件
// ============================================================

/**
 * ProtectedRoute - 纯认证守卫
 * 仅检查用户是否已登录，未登录则重定向到首页（登录统一走 LoginPrompt 弹窗）
 * 通过 <Outlet /> 透传子路由
 */
function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8e8e8e' }}>
        加载中...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// ============================================================
// 路由配置组件
// ============================================================

/**
 * AppRoutes - 应用路由配置
 *
 * 路由结构:
 * - MainLayout 内的路由（始终显示侧边栏）:
 *   - 公开路由（无需登录）:
 *     - /              首页（帖子信息流）
 *     - /post/:id      帖子分享链接
 *     - /explore       搜索/探索页
 *   - 受保护路由（需登录，由 ProtectedRoute 守卫）:
 *     - /messages      私信页
 *     - /messages/:userId  与特定用户聊天
 *     - /profile       个人主页
 *     - /profile/:id   他人主页
 *     - /admin         管理后台（需admin权限）
 *     - /announcements 公告页
 * - *                404兜底（重定向首页）
 *
 * 全局模态框:
 * - LoginPrompt: 未登录用户互动时提示登录
 * - CreatePost: 创建帖子模态框
 * - EditPost: 编辑帖子模态框
 */
function AppRoutes() {
  const { loading, showLoginPrompt, closeLoginPrompt } = useAuth();
  const { showCreate, closeCreate, editPost, closeEdit } = useEvent();
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // 安卓硬件返回键处理
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const MAIN_TABS = ['/', '/explore', '/messages', '/announcements', '/profile', '/admin'];

    // 获取当前真实路径（不用 React state，避免闭包旧值）
    const getPath = () => window.location.hash.replace(/^#/, '') || '/';

    // 查找最深层的 [data-back] 按钮（避免点击外层 PostDetail 的关闭按钮）
    const findDeepestBackBtn = (): HTMLElement | null => {
      const all = document.querySelectorAll('[data-back]');
      return all.length > 0 ? (all[all.length - 1] as HTMLElement) : null;
    };

    const handler = () => {
      // 1. 关闭模态框
      if (showLoginPrompt) { closeLoginPrompt(); return; }
      if (editPost) { closeEdit(); return; }
      if (showCreate) { closeCreate(); return; }

      // 2. 触发最深层的返回图标功能（适用于所有页面）
      const backBtn = findDeepestBackBtn();
      if (backBtn) {
        backBtn.click();
        return;
      }

      // 3. 无返回图标 + 主 Tab：双击退出
      const currentPath = getPath();
      if (MAIN_TABS.includes(currentPath)) {
        window.history.pushState(null, '', window.location.href);

        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = null;
          CapApp.exitApp();
        } else {
          showToast('再按一次退出应用');
          exitTimerRef.current = setTimeout(() => { exitTimerRef.current = null; }, 2000);
        }
      }
    };

    const listener = CapApp.addListener('backButton', handler);
    return () => { listener.then(l => l.remove()); };
  }, [showLoginPrompt, closeLoginPrompt, showCreate, closeCreate, editPost, closeEdit]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8e8e8e' }}>
        加载中...
      </div>
    );
  }

  return (
    <>
      {/* 路由表 */}
      <Routes>
        {/* MainLayout: 侧边栏始终可见 */}
        <Route element={<MainLayout />}>
          {/* 公开路由（无需登录即可浏览） */}
          <Route path="/" element={<HomePage />} />
          <Route path="/post/:id" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/books/:id/read" element={<BookReaderPage />} />

          {/* 受保护路由（需登录） */}
          <Route element={<ProtectedRoute />}>
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:userId" element={<MessagesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/announcements" element={<AnnouncementPage />} />
          </Route>
        </Route>

        {/* 404 兜底: 重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* 全局模态框 */}
      {showLoginPrompt && <LoginPrompt onClose={closeLoginPrompt} />}
      {showCreate && <CreatePost />}
      {editPost && <EditPost />}
    </>
  );
}

// ============================================================
// 根组件
// ============================================================

/**
 * App - 应用根组件
 *
 * Context 层级（从外到内）:
 * 1. Router - 路由（Web: BrowserRouter, Android: HashRouter）
 * 2. QueryClientProvider - 服务器状态缓存（React Query）
 * 3. ThemeProvider - 主题
 * 4. AuthProvider - 用户认证
 * 5. EventProvider - 全局模态框状态（业务事件走 mitt 总线）
 * 6. MusicProvider - 音乐播放器
 *
 * 原 Follow/Like/Repost/Bookmark 四个 Context 已合并为
 * queryClient 缓存 hooks（state/cache.ts），不再需要 Provider。
 */
/** 安卓 Capacitor 环境使用 HashRouter（更可靠），Web 环境使用 BrowserRouter */
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <EventProvider>
              <MusicProvider>
                <AppRoutes />
                <Toast />
              </MusicProvider>
            </EventProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Router>
  );
}