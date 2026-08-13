/**
 * ============================================================
 * 类型化 API 层 - 认证（/api/auth）
 * ============================================================
 */

import api from '../api';
import type { AuthResponse, User } from '../types';

export function sendCode(email: string): Promise<{ message: string }> {
  return api.post('/auth/send-code', { email }).then(r => r.data);
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return api.post('/auth/login', { email, password }).then(r => r.data);
}

export function register(username: string, email: string, password: string, code: string): Promise<AuthResponse> {
  return api.post('/auth/register', { username, email, password, code }).then(r => r.data);
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post('/auth/forgot-password', { email }).then(r => r.data);
}

export function resetPassword(email: string, code: string, password: string): Promise<{ message: string }> {
  return api.post('/auth/reset-password', { email, code, password }).then(r => r.data);
}

export function me(): Promise<User> {
  return api.get('/auth/me').then(r => r.data);
}
