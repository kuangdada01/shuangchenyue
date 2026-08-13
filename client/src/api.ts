/**
 * ============================================================
 * MIMO API 客户端配置
 * ============================================================
 * 基于 Axios 的 HTTP 客户端实例
 *
 * 功能:
 * 1. 统一 baseURL 配置（/api，由 Vite 代理转发到后端）
 * 2. 请求拦截器: 自动附加 JWT Token 到请求头
 * 3. 响应拦截器: 401 错误自动清除 token 并跳转登录页
 * ============================================================
 */

import axios from 'axios';
import { getApiBaseUrl } from './config';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
});

/**
 * 请求拦截器
 * 从 localStorage 读取 token，自动添加到请求头 Authorization
 * Token 存储键名: 'mimo_token'
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mimo_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 响应拦截器
 * 处理 401 未授权错误:
 * - 清除本地 token
 * - 如果之前存在 token（说明 token 过期），派发 auth:expired 事件通知 AuthContext
 * - 如果之前无 token（未登录用户的预期 401），静默 reject
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = !!localStorage.getItem('mimo_token');
      localStorage.removeItem('mimo_token');
      if (hadToken) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;