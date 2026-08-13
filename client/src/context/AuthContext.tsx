/**
 * ============================================================
 * 认证上下文 (AuthContext)
 * ============================================================
 * 全局用户认证状态管理
 *
 * 功能:
 * 1. 管理用户登录状态（user, token）
 * 2. 提供登录/注册/登出方法
 * 3. 应用启动时自动验证 token 有效性
 * 4. Token 存储在 localStorage（键名: 'mimo_token'）
 *
 * 使用方式:
 * - 在 App.tsx 中用 <AuthProvider> 包裹应用
 * - 在组件中调用 useAuth() 获取认证状态和方法
 * ============================================================
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api';
import { User, AuthResponse } from '../types';

/** 认证上下文类型定义 */
interface AuthContextType {
  user: User | null;                                      // 当前用户信息（null=未登录）
  token: string | null;                                   // JWT token
  loading: boolean;                                       // 是否正在加载（验证token中）
  login: (email: string, password: string) => Promise<void>;    // 登录方法
  register: (username: string, email: string, password: string, code: string) => Promise<void>; // 注册方法
  logout: () => void;                                     // 登出方法
  updateUser: (user: User) => void;                       // 更新用户信息（如修改资料后）
  showLoginPrompt: boolean;                               // 是否显示登录提示弹窗
  openLoginPrompt: () => void;                            // 打开登录提示弹窗
  closeLoginPrompt: () => void;                           // 关闭登录提示弹窗
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 认证上下文提供者组件
 *
 * 生命周期:
 * 1. 初始化: 从 localStorage 读取 token
 * 2. 如果有 token: 请求 /api/auth/me 验证有效性
 * 3. 验证成功: 设置 user 状态
 * 4. 验证失败: 清除 token（登录统一走 LoginPrompt 弹窗）
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('mimo_token'));
  const [loading, setLoading] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const openLoginPrompt = () => setShowLoginPrompt(true);
  const closeLoginPrompt = () => setShowLoginPrompt(false);

  /** 应用启动时验证 token */
  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => {
          // token 无效或已过期，清除本地存储
          localStorage.removeItem('mimo_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  /** 监听 token 过期事件（由 api.ts 401 拦截器触发） */
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  /** 用户登录 */
  const login = async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('mimo_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  /** 用户注册 */
  const register = async (username: string, email: string, password: string, code: string) => {
    const res = await api.post<AuthResponse>('/auth/register', { username, email, password, code });
    localStorage.setItem('mimo_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  /** 用户登出（清除本地状态） */
  const logout = () => {
    localStorage.removeItem('mimo_token');
    setToken(null);
    setUser(null);
  };

  /** 更新用户信息（用于修改资料后同步状态） */
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser, showLoginPrompt, openLoginPrompt, closeLoginPrompt }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 认证上下文 Hook
 *
 * @returns 认证状态和方法
 * @throws 如果在 AuthProvider 外使用则抛出错误
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}