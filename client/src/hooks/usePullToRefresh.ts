/**
 * ============================================================
 * 下拉刷新 Hook（usePullToRefresh）
 * ============================================================
 * 从 HomePage 抽出：移动端下拉刷新（用 ref 直接操作 DOM，零延迟跟手）。
 * 行为与历史实现逐行一致：阈值 80px、最大 150px、阻尼 0.85、
 * 水平滑动放行、成功/失败 toast、转圈平滑退出。
 */

import { useEffect, useRef, RefObject } from 'react';
import { showToast } from '../components/Toast';

/** 进度圆环周长（r=12 → ~75.4），供 JSX 初始 strokeDasharray 使用 */
export const PULL_CIRCUMFERENCE = 2 * Math.PI * 12;

interface PullToRefreshOptions {
  /** 触发下拉手势的容器元素 */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 下拉指示器容器 */
  indicatorRef: RefObject<HTMLDivElement | null>;
  /** SVG 进度圆环 */
  progressRef: RefObject<SVGCircleElement | null>;
  /** 刷新中状态 */
  refreshing: boolean;
  /** 刷新状态 setter */
  setRefreshing: (v: boolean) => void;
  /** 刷新回调：返回是否成功 */
  onRefresh: () => Promise<boolean>;
}

export function usePullToRefresh(options: PullToRefreshOptions): void {
  const { containerRef, indicatorRef, progressRef, refreshing, setRefreshing, onRefresh } = options;

  const THRESHOLD = 80;
  const MAX_PULL = 150;
  const CIRCUMFERENCE = PULL_CIRCUMFERENCE;

  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const pullDistRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Keep refs in sync
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updatePullUI = (distance: number) => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      indicator.style.transition = 'none';
      indicator.style.opacity = '1';
      indicator.style.height = `${distance}px`;
      // Update progress circle stroke
      const circle = progressRef.current;
      if (circle) {
        const progress = Math.min(distance / THRESHOLD, 1);
        circle.setAttribute('stroke-dasharray', `${progress * CIRCUMFERENCE} ${CIRCUMFERENCE}`);
      }
    };

    const collapsePullUI = () => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      indicator.style.transition = 'height 0.2s ease, opacity 0.15s ease';
      indicator.style.height = '0px';
      // Reset progress circle
      const circle = progressRef.current;
      if (circle) {
        circle.setAttribute('stroke-dasharray', `0 ${CIRCUMFERENCE}`);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      // 移动端滚动容器为 .main-content
      const mainContent = document.querySelector('.main-content') as HTMLElement | null;
      const scrollTop = mainContent ? mainContent.scrollTop : 0;
      // 只有当滚动容器在顶部时才触发下拉刷新
      if (scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        touchStartX.current = e.touches[0].clientX;
      } else {
        touchStartY.current = 0;
        touchStartX.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === 0 || refreshingRef.current) return;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      const deltaX = e.touches[0].clientX - touchStartX.current;
      // 仅在下拉且垂直移动主导时拦截，水平滑动（轮播图）放行
      if (deltaY > 0 && deltaY > Math.abs(deltaX)) {
        // 只有在事件可取消时才调用 preventDefault
        if (e.cancelable) {
          e.preventDefault();
        }
        // 阻尼 0.85 — 几乎跟手，仅轻微缓冲避免过冲
        const damped = Math.min(deltaY * 0.85, MAX_PULL);
        pullDistRef.current = damped;
        updatePullUI(damped);
      }
    };

    const onTouchEnd = async () => {
      if (touchStartY.current === 0) return;
      const shouldRefresh = pullDistRef.current >= THRESHOLD;
      touchStartY.current = 0;
      pullDistRef.current = 0;

      if (!shouldRefresh) {
        collapsePullUI();
        return;
      }

      // 松开后固定指示器高度，切换到转圈状态
      const indicator = indicatorRef.current;
      if (indicator) {
        indicator.style.transition = 'height 0.2s ease';
        indicator.style.height = '56px';
      }
      setRefreshing(true);

      let success = false;
      try {
        success = await onRefreshRef.current();
      } catch {
        success = false;
      } finally {
        if (success) {
          showToast('已刷新');
        } else {
          showToast('刷新失败，请检查网络');
        }
        // 转圈平滑退出：先滑动收起，再关闭状态
        const ind = indicatorRef.current;
        if (ind) {
          ind.style.transition = 'height 0.25s ease, opacity 0.2s ease';
          ind.style.height = '0px';
          ind.style.opacity = '0';
        }
        setTimeout(() => {
          setRefreshing(false);
          // 重置 progress circle
          const circle = progressRef.current;
          if (circle) {
            circle.setAttribute('stroke-dasharray', `0 ${CIRCUMFERENCE}`);
          }
          const ind2 = indicatorRef.current;
          if (ind2) {
            ind2.style.transition = '';
            ind2.style.opacity = '';
          }
        }, 300);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
    // 历史实现仅在挂载时绑定一次（refs 直读最新值），保持一致
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);
}
