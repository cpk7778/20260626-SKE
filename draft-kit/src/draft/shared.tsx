/** draft 공통 — core re-export · ChartProviders · Gauge/Bullet 공용 훅·UI · SHAP 유틸 */
import React from 'react';
import type { XYPoint } from './data-draft';
import { EQ_COLOR_PROFILES } from './data-draft';
import { CHART_FONT_OPTIONS } from './core/constants';
import {
  ChartFontContext,
  EqColorContext,
  GlobalControlsProvider,
  DraftEqHoverProvider,
  ShapDateCtx,
} from './core/context';
import { ChartTimeline, PeriodSelect } from './core/componentsTimeline';
import { useEqVisibility, useShapTimeline } from './core/hooks';
import { SHAP_DATES } from './data-draft';

// ── core re-export ────────────────────────────────────────────────────────────
export * from './core/dataReexports';
export * from './core/constants';
export * from './core/context';
export * from './core/math';
export * from './core/interaction';
export * from './core/hooks';
export * from './core/chartBuilders';
export * from './core/components';

// ── ChartProviders ────────────────────────────────────────────────────────────
export interface ChartProvidersProps {
  children: React.ReactNode;
  /** fontIdx 대신 직접 font family 문자열 지정 (Dashboard 등) */
  chartFont?: string;
  fontIdx?: number;
  profileIdx?: number;
  shapDateIdx: number;
  setShapDateIdx: React.Dispatch<React.SetStateAction<number>>;
  periodDays: number;
  setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
}

export function ChartProviders({
  children,
  chartFont,
  fontIdx = 0,
  profileIdx = 0,
  shapDateIdx,
  setShapDateIdx,
  periodDays,
  setPeriodDays,
}: ChartProvidersProps) {
  const resolvedFont = chartFont ?? CHART_FONT_OPTIONS[fontIdx].family;

  return (
    <ChartFontContext.Provider value={resolvedFont}>
      <EqColorContext.Provider value={EQ_COLOR_PROFILES[profileIdx]}>
        <GlobalControlsProvider>
          <ShapDateCtx.Provider value={{
            idx: shapDateIdx,
            setIdx: setShapDateIdx,
            periodDays,
            setPeriodDays,
          }}>
            <DraftEqHoverProvider>
              {children}
            </DraftEqHoverProvider>
          </ShapDateCtx.Provider>
        </GlobalControlsProvider>
      </EqColorContext.Provider>
    </ChartFontContext.Provider>
  );
}

// ── Gauge / Bullet 공용 훅·UI ─────────────────────────────────────────────────
export function useGaugeBulletChart(data: XYPoint[]) {
  const eqs = React.useMemo(() => [...new Set(data.map(d => d.eq))].sort(), [data]);
  const { hiddenEqs, selectEq, resetHiddenEqs } = useEqVisibility(eqs);
  const dataMin = React.useMemo(() => Math.floor(Math.min(...data.map(d => d.y))), [data]);
  const dataMax = React.useMemo(() => Math.ceil(Math.max(...data.map(d => d.y))), [data]);
  const [rangeMin, setRangeMin] = React.useState(() => dataMin);
  const [rangeMax, setRangeMax] = React.useState(() => dataMax);
  const [warnVal, setWarnVal] = React.useState(() => Math.round(dataMin + (dataMax - dataMin) * 0.4));
  const [alertVal, setAlertVal] = React.useState(() => Math.round(dataMin + (dataMax - dataMin) * 0.7));

  const timeline = useShapTimeline(SHAP_DATES);
  const { setIdx, setIsPlaying, setPeriodDays } = timeline;
  const currentDate = timeline.currentDate;

  // 현재 날짜 기준 설비별 y값 맵 — Gauge·Bullet 렌더링 시 O(1) 조회
  const eqYValues = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const pt of data) if (pt.date === currentDate) map.set(pt.eq, pt.y);
    return map;
  }, [data, currentDate]);

  const resetAll = React.useCallback(() => {
    setRangeMin(dataMin);
    setRangeMax(dataMax);
    setWarnVal(Math.round(dataMin + (dataMax - dataMin) * 0.4));
    setAlertVal(Math.round(dataMin + (dataMax - dataMin) * 0.7));
    resetHiddenEqs();
    setIdx(SHAP_DATES.length - 1);
    setIsPlaying(false);
    setPeriodDays(7);
  }, [dataMin, dataMax, resetHiddenEqs, setIdx, setIsPlaying, setPeriodDays]);

  // warnClamped·alertClamped: 슬라이더가 역전되거나 범위를 벗어나지 않도록 항상 min+1 < warn < alert < max 보장
  const warnClamped = Math.max(rangeMin + 1, Math.min(warnVal, alertVal - 1, rangeMax - 1));
  const alertClamped = Math.max(warnClamped + 1, Math.min(alertVal, rangeMax));
  const totalRange = Math.max(rangeMax - rangeMin, 1e-6);
  const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));

  const defaultWarn = React.useMemo(() => Math.round(dataMin + (dataMax - dataMin) * 0.4), [dataMin, dataMax]);
  const defaultAlert = React.useMemo(() => Math.round(dataMin + (dataMax - dataMin) * 0.7), [dataMin, dataMax]);
  const isModified = React.useMemo(() =>
    rangeMin !== dataMin || rangeMax !== dataMax ||
    warnVal !== defaultWarn || alertVal !== defaultAlert ||
    timeline.isPlaying || timeline.periodDays !== 7 ||
    hiddenEqs.size > 0,
  [rangeMin, rangeMax, dataMin, dataMax, warnVal, alertVal, defaultWarn, defaultAlert, timeline.isPlaying, timeline.periodDays, hiddenEqs]);

  return {
    eqs, hiddenEqs, selectEq, eqYValues, visibleEqs,
    rangeMin, setRangeMin, rangeMax, setRangeMax,
    warnVal, setWarnVal, alertVal, setAlertVal,
    warnClamped, alertClamped, totalRange,
    dataMin, dataMax, resetAll, isModified, timeline,
  };
}

export interface GaugeBulletControlsProps {
  periodDays: number;
  setPeriodDays: (v: number) => void;
  rangeMin: number;
  setRangeMin: (v: number) => void;
  rangeMax: number;
  setRangeMax: (v: number) => void;
  dataMin: number;
  dataMax: number;
  warnVal: number;
  setWarnVal: (v: number) => void;
  alertVal: number;
  setAlertVal: (v: number) => void;
  gaugeSplitCount?: number;
  onGaugeSplitCountChange?: (n: number) => void;
}

export type GaugeBulletTimelineState = ReturnType<typeof useShapTimeline<string>>;

export function GaugeBulletControls({
  periodDays, setPeriodDays,
  rangeMin, setRangeMin, rangeMax, setRangeMax, dataMin, dataMax,
  warnVal, setWarnVal, alertVal, setAlertVal,
  gaugeSplitCount, onGaugeSplitCountChange,
}: GaugeBulletControlsProps) {
  return (
    <div className="draft-chart-controls">
      <PeriodSelect value={periodDays} onChange={setPeriodDays} />
      <div className="draft-slider-row">
        <span className="draft-slider-label">Range</span>
        <div className="draft-slider-group">
          <input type="range" className="draft-slider-range"
            min={dataMin} max={rangeMax - 1} value={rangeMin}
            onChange={e => setRangeMin(+e.target.value)} />
          <input type="range" className="draft-slider-range"
            min={rangeMin + 1} max={dataMax} value={rangeMax}
            onChange={e => setRangeMax(+e.target.value)} />
        </div>
        <span className="draft-slider-value">{rangeMin}–{rangeMax}</span>
      </div>
      <div className="gauge-zone-controls">
        <div className="draft-slider-row">
          <span className="draft-slider-label">구역</span>
          <div className="draft-slider-group">
            <input type="range" className="draft-slider-range"
              min={rangeMin} max={alertVal - 1} value={warnVal}
              onChange={e => setWarnVal(+e.target.value)} />
            <input type="range" className="draft-slider-range"
              min={warnVal + 1} max={rangeMax} value={alertVal}
              onChange={e => setAlertVal(+e.target.value)} />
          </div>
          <span className="draft-slider-value gauge-zone-values">
            <span className="gauge-zone-warn">{warnVal}</span>
            <span className="gauge-zone-sep">/</span>
            <span className="gauge-zone-alert">{alertVal}</span>
          </span>
        </div>
        {onGaugeSplitCountChange != null && (
          <button
            type="button"
            className={`draft-chip-btn${(gaugeSplitCount ?? 1) > 1 ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => onGaugeSplitCountChange((gaugeSplitCount ?? 1) > 1 ? 1 : 6)}
            title={(gaugeSplitCount ?? 1) > 1 ? '단일 게이지로 전환' : '설비별 6분할'}
          >
            Multi
          </button>
        )}
      </div>
    </div>
  );
}

// 필터된 날짜가 1개 이하면 타임라인을 표시하지 않음 (조작 의미 없음)
export function GaugeBulletTimeline({ timeline }: { timeline: GaugeBulletTimelineState }) {
  const {
    filtered, isPlaying, playSpeed, localIdx, maxIdx, startDate, currentDate,
    onPlay, setPlaySpeed, setLocalIdx, setIsPlaying,
  } = timeline;
  if (filtered.length <= 1) return null;
  return (
    <ChartTimeline
      isPlaying={isPlaying}
      playSpeed={playSpeed}
      sliderIdx={localIdx}
      maxIdx={maxIdx}
      startDate={startDate}
      currentDate={currentDate}
      onPlay={onPlay}
      onSpeedChange={setPlaySpeed}
      onSlider={v => { setIsPlaying(false); setLocalIdx(v); }}
    />
  );
}

// ── SHAP 유틸 ─────────────────────────────────────────────────────────────────
export function shapArrowPts(x1: number, x2: number, cy: number, bh: number): string {
  const ah = Math.min(bh * 0.85, 7, Math.abs(x2 - x1) * 0.35);
  return x2 >= x1
    ? `${x1},${cy - bh} ${x2 - ah},${cy - bh} ${x2},${cy} ${x2 - ah},${cy + bh} ${x1},${cy + bh}`
    : `${x2},${cy} ${x2 + ah},${cy - bh} ${x1},${cy - bh} ${x1},${cy + bh} ${x2 + ah},${cy + bh}`;
}
