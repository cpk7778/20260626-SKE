/** Context · Provider */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EQ_COLOR_PROFILES, SHAP_DATE_IDX_DEFAULT, SHAP_DATES } from '../data-draft';
import { CHART_FONT_OPTIONS } from './constants';

export { SHAP_DATE_IDX_DEFAULT };

// 모든 차트 컴포넌트에 폰트·장비색 팔레트를 주입하는 컨텍스트
export const ChartFontContext = React.createContext<string>(CHART_FONT_OPTIONS[0].family);
export const EqColorContext = React.createContext<Record<string, string>>(EQ_COLOR_PROFILES[0]);
type ControlAction = 'open' | 'close';

// 전체 토글 상태와 개별 카드 가시성 등록을 위한 인터페이스
export interface GlobalControlsState {
  syncKey: number;
  syncVisible: boolean;
  toggleGlobal: () => void;
  registerVisibility: (id: string, visible: boolean) => void;
  allOpen: boolean;
}

const defaultGlobalControls: GlobalControlsState = {
  syncKey: 0,
  syncVisible: true,
  toggleGlobal: () => {},
  registerVisibility: () => {},
  allOpen: true,
};

export const GlobalControlsContext = React.createContext<GlobalControlsState>(defaultGlobalControls);

/** Scatter(Trail) ↔ Line(다중Y) 장비 호버 연동 — 변수명 A/B (Scatter A·B축, Line A·B 시계열) */
export const DraftEqHoverContext = React.createContext<{
  hoveredEq: string | null;
  setHoveredEq: (eq: string | null) => void;
}>({
  hoveredEq: null,
  setHoveredEq: () => {},
});

// 장비 호버 상태를 차트 간에 공유; Escape 키로 호버 해제
export function DraftEqHoverProvider({ children }: { children: React.ReactNode }) {
  const [hoveredEq, setHoveredEq] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHoveredEq(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ hoveredEq, setHoveredEq }),
    [hoveredEq]
  );
  return (
    <DraftEqHoverContext.Provider value={value}>
      {children}
    </DraftEqHoverContext.Provider>
  );
}

// 모든 카드 Control 패널을 일괄 열기/닫기; syncKey 증가로 자식에게 변경 전파
export function GlobalControlsProvider({ children }: { children: React.ReactNode }) {
  const [syncKey, setSyncKey] = useState(0);
  const [syncVisible, setSyncVisible] = useState(true);
  const [allOpen, setAllOpen] = useState(true);
  const visMapRef = useRef<Record<string, boolean>>({});

  const updateAllOpen = useCallback(() => {
    const vals = Object.values(visMapRef.current);
    setAllOpen(vals.length > 0 && vals.every(Boolean));
  }, []);

  const registerVisibility = useCallback((id: string, visible: boolean) => {
    visMapRef.current[id] = visible;
    updateAllOpen();
  }, [updateAllOpen]);

  const applyToAll = useCallback((action: ControlAction) => {
    setSyncVisible(action === 'open');
    setSyncKey(k => k + 1);
  }, []);

  const toggleGlobal = useCallback(() => {
    applyToAll(syncVisible ? 'close' : 'open');
  }, [applyToAll, syncVisible]);

  const value = useMemo(() => ({
    syncKey,
    syncVisible,
    toggleGlobal,
    registerVisibility,
    allOpen,
  }), [syncKey, syncVisible, toggleGlobal, registerVisibility, allOpen]);

  return (
    <GlobalControlsContext.Provider value={value}>
      {children}
    </GlobalControlsContext.Provider>
  );
}

// SHAP 타임라인 전역 날짜 인덱스·기간 필터 — Gauge/SHAP/PredActual이 공유
export const ShapDateCtx = React.createContext<{
  idx: number;
  setIdx: React.Dispatch<React.SetStateAction<number>>;
  periodDays: number;
  setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
}>({
  idx: SHAP_DATE_IDX_DEFAULT,
  setIdx: () => {},
  periodDays: 7,
  setPeriodDays: () => {},
});

/** ShapDateCtx 기준 활성 일자 (YYYY-MM-DD) */
export function useActiveDate(): string {
  const { idx } = useContext(ShapDateCtx);
  return SHAP_DATES[idx] ?? SHAP_DATES[SHAP_DATE_IDX_DEFAULT] ?? '';
}
