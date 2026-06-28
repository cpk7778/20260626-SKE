/** 차트 공통 React hooks */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalControlsContext, ShapDateCtx } from './context';

// GlobalControlsContext를 구독해 카드별 Control 패널 가시성을 전역 토글과 동기화
export function useChartControls(initial = true) {
  const { syncKey, syncVisible, registerVisibility, toggleGlobal } = useContext(GlobalControlsContext);
  const id = React.useId();
  const [showControls, setShowControls] = useState(initial);

  useEffect(() => {
    setShowControls(syncVisible);
    registerVisibility(id, syncVisible);
  }, [syncKey, syncVisible, id, registerVisibility]);

  return { controlsVisible: showControls, toggleControls: toggleGlobal, showControls, setShowControls };
}

// ResizeObserver로 컨테이너 실제 크기를 추적 — SVG viewBox 계산에 사용
// 첫 콜백 전까지 el에 data-size-pending 속성을 부여 → CSS로 visibility:hidden 처리
export function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 400, h: 280 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.sizePending = '';
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10 && height > 10) {
        setSize({ w: Math.round(width), h: Math.round(height) });
        delete el.dataset.sizePending;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

// 타임라인 재생/일시정지 인터벌 관리 — maxIdx 도달 시 자동 정지
export function useChartPlayback(
  setIdx: (fn: (prev: number) => number) => void,
  maxIdx: number
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(800);
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setIdx(prev => {
        if (prev >= maxIdx) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, playSpeed);
    return () => clearInterval(id);
  }, [isPlaying, playSpeed, setIdx, maxIdx]);
  return { isPlaying, setIsPlaying, playSpeed, setPlaySpeed };
}

// 클릭 단독=단일 선택, Ctrl/Cmd+클릭=다중 토글; 박스/Lasso는 applyScatterSelection
export function useEqVisibility(eqs: string[]) {
  const [hiddenEqs, setHiddenEqs] = useState<Set<string>>(new Set());
  const selectEq = (eq: string, multi: boolean) =>
    setHiddenEqs(prev => {
      if (multi) {
        const next = new Set(prev);
        next.has(eq) ? next.delete(eq) : next.add(eq);
        return next;
      }
      const onlyThis = prev.size === eqs.length - 1 && !prev.has(eq);
      return onlyThis ? new Set<string>() : new Set(eqs.filter(e => e !== eq));
    });
  const selectMultipleEqs = (visibleEqs: string[]) =>
    setHiddenEqs(visibleEqs.length === 0
      ? new Set()
      : new Set(eqs.filter(e => !visibleEqs.includes(e))));
  const applyScatterSelection = (ids: string[], additive: boolean) =>
    setHiddenEqs(prev => {
      if (ids.length === 0) return prev;
      if (additive) {
        const visible = eqs.filter(e => !prev.has(e));
        const merged = [...new Set([...visible, ...ids])];
        return new Set(eqs.filter(e => !merged.includes(e)));
      }
      return new Set(eqs.filter(e => !ids.includes(e)));
    });
  const resetHiddenEqs = () => setHiddenEqs(new Set());
  return { hiddenEqs, selectEq, selectMultipleEqs, applyScatterSelection, resetHiddenEqs };
}

// periodDays 변경 시 재생을 멈추고 현재 인덱스를 새 필터 범위 끝으로 보정
export function useChartPeriod<T>(
  fullList: T[],
  currentIdx: number,
  setCurrentIdx: (i: number) => void,
  stopPlaying: (v: boolean) => void,
  periodDays: number
) {
  const filtered = useMemo(() => {
    if (periodDays <= 0 || periodDays >= fullList.length) return fullList;
    return fullList.slice(fullList.length - periodDays);
  }, [fullList, periodDays]);

  const localIdx = useMemo(() => {
    const i = filtered.indexOf(fullList[currentIdx]);
    return i >= 0 ? i : filtered.length - 1;
  }, [currentIdx, filtered, fullList]);

  const setLocalIdx = useCallback((i: number) => {
    setCurrentIdx(fullList.indexOf(filtered[Math.max(0, Math.min(filtered.length - 1, i))]));
  }, [fullList, filtered, setCurrentIdx]);

  const setLocalIdxFn = useCallback((fn: (prev: number) => number) => {
    const prevLocal = filtered.indexOf(fullList[currentIdx]);
    const prevResolved = prevLocal >= 0 ? prevLocal : filtered.length - 1;
    setLocalIdx(fn(prevResolved));
  }, [currentIdx, filtered, fullList, setLocalIdx]);

  useEffect(() => {
    stopPlaying(false);
    if (!filtered.includes(fullList[currentIdx]))
      setCurrentIdx(fullList.indexOf(filtered[filtered.length - 1]));
  // currentIdx 누락 의도적: 기간 필터 변경 시만 인덱스 재설정, 사용자 탐색 중에는 재설정 방지
  }, [periodDays]); // eslint-disable-line react-hooks/exhaustive-deps

  return { filtered, localIdx, setLocalIdx, setLocalIdxFn };
}

/** ShapDateCtx + 기간 필터 + 재생 — Gauge/SHAP/PredActual 공통 */
export function useShapTimeline<T>(fullList: T[]) {
  const { idx, setIdx, periodDays, setPeriodDays } = useContext(ShapDateCtx);
  const stopPlayingRef = useRef<() => void>(() => {});
  const { filtered, localIdx, setLocalIdx, setLocalIdxFn } = useChartPeriod(
    fullList, idx, setIdx, (v) => { if (!v) stopPlayingRef.current(); }, periodDays
  );
  const maxIdx = Math.max(0, filtered.length - 1);
  const { isPlaying, setIsPlaying, playSpeed, setPlaySpeed } = useChartPlayback(setLocalIdxFn, maxIdx);
  stopPlayingRef.current = () => setIsPlaying(false);

  useEffect(() => {
    if (isPlaying && localIdx >= maxIdx) setIsPlaying(false);
  }, [localIdx, isPlaying, maxIdx, setIsPlaying]);

  const onPlay = useCallback(() => {
    if (isPlaying) { setIsPlaying(false); return; }
    // 끝에서 재생 누르면 처음부터 다시
    if (localIdx >= maxIdx) setLocalIdx(0);
    setIsPlaying(true);
  }, [isPlaying, localIdx, maxIdx, setIsPlaying, setLocalIdx]);

  const timelineDate = (item: T): string => {
    if (typeof item === 'string') return item;
    return (item as { date: string }).date ?? '';
  };

  return {
    periodDays, setPeriodDays, filtered, localIdx, setLocalIdx, setLocalIdxFn, setIdx,
    isPlaying, setIsPlaying, playSpeed, setPlaySpeed, onPlay, maxIdx,
    startDate: timelineDate(filtered[0]),
    currentDate: timelineDate(filtered[localIdx] ?? filtered[0]),
  };
}
