/**
 * XY Line 차트 — A·B 다중Y축, Split(상하 분리), Slope·Center 오버레이, X뷰 패닝/줌
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SHAP_DATES, type XYPoint } from './data-draft';
import {
  EqColorContext,
  ShapDateCtx,
  DraftEqHoverContext,
  useChartControls,
  useContainerSize,
  useEqVisibility,
  useShapTimeline,
  useActiveDate,
  ChartTimeline,
  PeriodSelect,
  EqLegend,
  linearRegression,
  buildABCenterMarks,
  fmtLineVarMean,
  lineVarMeanSymbol,
  useMultiAxisWheelZoom,
  useLineTouchPan,
  useYAxisDrag,
  type MultiAxisWheelState,
  type AxisDragState,
  type ABCenterMark,
} from './shared';
import { DraftDragHandle } from './ui';

// ── XY Line 차트 (다중Y) ────────────────────────────────────────────────────
// XY Line 차트 레이아웃 패딩·축 너비 상수
const XY_LINE_PAD = { top: 6, right: 6, bottom: 32, left: 44 };
const XY_LINE_CENTER_PAD_TOP = 16;
const XY_LINE_CENTER_PAD_RIGHT = 52;
const XY_LINE_CENTER_LABEL_MIN_DY = 12;
const XY_LINE_AXIS_W = 48;

// 겹치는 Center 라벨을 위아래로 밀어 최소 간격(minDy) 확보 — 2패스(아래→위) 방식
function layoutDraftCenterLabels<T extends { cy: number }>(
  items: T[],
  yLo: number,
  yHi: number,
  minDy: number,
): (T & { y: number })[] {
  const sorted = [...items].sort((a, b) => a.cy - b.cy);
  const laid: (T & { y: number })[] = [];
  for (const item of sorted) {
    let y = item.cy;
    if (laid.length > 0 && y - laid[laid.length - 1].y < minDy) {
      y = laid[laid.length - 1].y + minDy;
    }
    laid.push({ ...item, y: Math.min(yHi, Math.max(yLo, y)) });
  }
  // 2패스(역순): 1패스에서 아래로 밀린 라벨이 yHi를 넘은 경우 위로 당겨 간격 복구
  for (let i = laid.length - 2; i >= 0; i--) {
    if (laid[i + 1].y - laid[i].y < minDy) {
      laid[i] = { ...laid[i], y: Math.max(yLo, laid[i + 1].y - minDy) };
    }
  }
  return laid;
}

// XY Line 차트 — A·B 다중Y축, Split(상하 분리), Slope·Center 오버레이, X뷰 패닝/줌
export function XYLineChart({ data, chartHeight }: { data: XYPoint[]; chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const { periodDays, setPeriodDays } = useContext(ShapDateCtx);
  const activeDate = useActiveDate();
  const lineTimeline = useShapTimeline(SHAP_DATES);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useContainerSize(wrapRef);
  const [scaled, setScaled] = useState(true);
  const [split, setSplit] = useState(false);
  const [showSlope, setShowSlope] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const [singleAxisRange, setSingleAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [multiAxisRanges, setMultiAxisRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);
  const { controlsVisible, toggleControls } = useChartControls();
  const { hoveredEq, setHoveredEq } = useContext(DraftEqHoverContext);
  const [tooltip, setTooltip] = useState<{ key: string; date: string; value: number; svgX: number; svgY: number } | null>(null);
  const [xViewRange, setXViewRange] = useState<{ start: number; end: number } | null>(() => {
    const allDates = [...new Set(data.map(d => d.date))].sort();
    if (7 >= allDates.length) return null;
    const start = (allDates.length - 7) / (allDates.length - 1);
    return { start, end: 1 };
  });
  const [isPanning, setIsPanning] = useState(false);
  const xPanRef = useRef<{ startX: number; visStart: number; visEnd: number; plotW: number } | null>(null);
  const axisDragRef = useRef<AxisDragState | null>(null);
  const wheelStateRef = useRef<MultiAxisWheelState>({
    visStart: 0, visEnd: 1, plotW: 400, plotH: 200, totalLeft: 44, datesLen: 0,
    scaled: false,
    activeSeriesInfo: [],
    axisTypes: [],
    activeGlobalMin: 0, activeGlobalMax: 1, globalMin: 0, globalMax: 1,
    plotTop: XY_LINE_PAD.top, svgW: 400, svgH: 280,
  });

  const eqs = useMemo(() => [...new Set(data.map(d => d.eq))].sort(), [data]);
  const { hiddenEqs, selectEq } = useEqVisibility(eqs);
  const dates = useMemo(() => [...new Set(data.map(d => d.date))].sort(), [data]);

  const dataMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const pt of data) {
      for (const v of ['A', 'B'] as const) {
        const key = `${pt.eq}:${v}`;
        if (!map.has(key)) map.set(key, new Map());
        map.get(key)!.set(pt.date, v === 'A' ? pt.x : pt.y);
      }
    }
    return map;
  }, [data]);

  useEffect(() => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
    if (periodDays <= 0 || periodDays >= dates.length) {
      setXViewRange(null);
    } else {
      const start = (dates.length - periodDays) / (dates.length - 1);
      setXViewRange({ start, end: 1 });
    }
  }, [periodDays]); // dates is stable (derived from constant data prop)

  /** A·B 모두 Off → 둘 다 표시, 하나만 On → 해당 변수만 */
  // 두 버튼 모두 꺼진 상태는 "전체 표시"로 해석 — 완전 숨김 방지
  const showAllVars = !showA && !showB;
  const aBtnActive = showAllVars || showA;
  const bBtnActive = showAllVars || showB;
  const varIncluded = (v: 'A' | 'B') => showAllVars || (v === 'A' ? showA : showB);

  const activeSeries = useMemo(
    () => eqs
      .flatMap(eq => [
        ...(varIncluded('A') ? [`${eq}:A`] : []),
        ...(varIncluded('B') ? [`${eq}:B`] : []),
      ])
      .filter(key => !hiddenEqs.has(key.split(':')[0])),
    [eqs, hiddenEqs, showAllVars, showA, showB]
  );
  const axisTypes = useMemo(
    () => [...new Set(activeSeries.map(k => k.split(':')[1]))],
    [activeSeries]
  );
  const useSplit = scaled && split && axisTypes.includes('A') && axisTypes.includes('B');
  const extraLeft = (scaled && !useSplit) ? Math.max(0, axisTypes.length - 1) * XY_LINE_AXIS_W : 0;
  const totalLeft = XY_LINE_PAD.left + extraLeft;
  const plotTop = showCenter || showSlope ? XY_LINE_CENTER_PAD_TOP : XY_LINE_PAD.top;
  const padRight = showCenter ? XY_LINE_CENTER_PAD_RIGHT : XY_LINE_PAD.right;
  const plotW = Math.max(10, size.w - totalLeft - padRight);
  const plotH = Math.max(10, size.h - plotTop - XY_LINE_PAD.bottom);
  const splitBandH = plotH / 2;
  const visStart = xViewRange?.start ?? 0;
  const visEnd = xViewRange?.end ?? 1;
  const visRange = Math.max(visEnd - visStart, 1e-6);

  const seriesInfo = useMemo(() => activeSeries.map(key => {
    const [eq] = key.split(':');
    const dm = dataMap.get(key);
    const values = dates.map(d => dm?.get(d) ?? NaN);
    const finite = values.filter(Number.isFinite);
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const range = Math.max(max - min, 1e-6);
    return { key, values, min, max, range, color: eqColors[eq] ?? '#94a3b8' };
  }), [activeSeries, dataMap, dates]);

  const globalMin = seriesInfo.length ? Math.min(...seriesInfo.map(s => s.min)) : 0;
  const globalMax = seriesInfo.length ? Math.max(...seriesInfo.map(s => s.max)) : 1;
  const activeGlobalMin = singleAxisRange?.min ?? globalMin;
  const activeGlobalMax = singleAxisRange?.max ?? globalMax;
  const activeGlobalRange = Math.max(activeGlobalMax - activeGlobalMin, 1e-6);

  const activeSeriesInfo = seriesInfo.map(s => {
    const [, axisType] = s.key.split(':');
    if (scaled) {
      const cr = multiAxisRanges[axisType];
      const typeSeries = seriesInfo.filter(si => si.key.endsWith(`:${axisType}`));
      const typeMin = cr?.min ?? (typeSeries.length ? Math.min(...typeSeries.map(si => si.min)) : 0);
      const typeMax = cr?.max ?? (typeSeries.length ? Math.max(...typeSeries.map(si => si.max)) : 1);
      return { ...s, axisMin: typeMin, axisMax: typeMax, axisRange: Math.max(typeMax - typeMin, 1e-6) };
    }
    return { ...s, axisMin: s.min, axisMax: s.max, axisRange: s.range };
  });

  const visIdx = useMemo(() => ({
    fvi: Math.max(0, Math.floor(visStart * (dates.length - 1))),
    lvi: Math.min(dates.length - 1, Math.ceil(visEnd * (dates.length - 1))),
  }), [visStart, visEnd, dates.length]);

  const centerMarks = useMemo(() => {
    if (!showCenter) return [];
    return buildABCenterMarks(data, dates, eqs, hiddenEqs, visIdx.fvi, visIdx.lvi, eqColors);
  }, [showCenter, data, dates, eqs, hiddenEqs, visIdx.fvi, visIdx.lvi, eqColors]);

  const centerScale = useCallback((m: ABCenterMark) => {
    const key = m.eq ? `${m.eq}:${m.var}` : null;
    const s = key
      ? activeSeriesInfo.find(si => si.key === key)
      : activeSeriesInfo.find(si => si.key.endsWith(`:${m.var}`));
    if (!s) return null;
    return {
      color: m.color,
      axisMin: scaled ? s.axisMin : activeGlobalMin,
      axisRange: scaled ? s.axisRange : activeGlobalRange,
    };
  }, [activeSeriesInfo, scaled, activeGlobalMin, activeGlobalRange]);

  const slopeLines = useMemo(() => {
    if (!showSlope) return [];
    const { fvi, lvi } = visIdx;
    const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
    const useAverage = hiddenEqs.size === 0;
    type SlopeLine = {
      label: string;
      color: string;
      eq: string | null;
      var: 'A' | 'B';
      reg: { m: number; b: number; r2: number };
      i0: number;
      i1: number;
      axisMin: number;
      axisRange: number;
    };
    const lines: SlopeLine[] = [];

    const scaleFor = (v: 'A' | 'B', eq: string | null) => {
      const key = eq ? `${eq}:${v}` : null;
      const s = key
        ? activeSeriesInfo.find(si => si.key === key)
        : activeSeriesInfo.find(si => si.key.endsWith(`:${v}`));
      if (!s) return null;
      return {
        color: eq ? s.color : (v === 'A' ? '#94a3b8' : '#7dd3fc'),
        axisMin: scaled ? s.axisMin : activeGlobalMin,
        axisRange: scaled ? s.axisRange : activeGlobalRange,
      };
    };

    const pushLine = (
      label: string,
      eq: string | null,
      v: 'A' | 'B',
      indices: number[],
      vals: number[],
    ) => {
      if (!varIncluded(v)) return;
      if (indices.length < 2) return;
      const reg = linearRegression(indices, vals);
      const sc = scaleFor(v, eq);
      if (!reg || !sc) return;
      lines.push({
        label: `${label} ${v}`,
        color: sc.color,
        eq,
        var: v,
        reg,
        i0: indices[0],
        i1: indices[indices.length - 1],
        axisMin: sc.axisMin,
        axisRange: sc.axisRange,
      });
    };

    if (useAverage) {
      for (const v of ['A', 'B'] as const) {
        const indices: number[] = [];
        const vals: number[] = [];
        for (let i = fvi; i <= lvi; i++) {
          const bucket: number[] = [];
          for (const eq of visibleEqs) {
            const val = dataMap.get(`${eq}:${v}`)?.get(dates[i]);
            if (Number.isFinite(val)) bucket.push(val!);
          }
          if (bucket.length) {
            indices.push(i);
            vals.push(bucket.reduce((a, b) => a + b, 0) / bucket.length);
          }
        }
        pushLine('평균', null, v, indices, vals);
      }
    } else {
      for (const eq of visibleEqs) {
        for (const v of ['A', 'B'] as const) {
          const indices: number[] = [];
          const vals: number[] = [];
          for (let i = fvi; i <= lvi; i++) {
            const val = dataMap.get(`${eq}:${v}`)?.get(dates[i]);
            if (Number.isFinite(val)) {
              indices.push(i);
              vals.push(val!);
            }
          }
          pushLine(eq, eq, v, indices, vals);
        }
      }
    }
    return lines;
  }, [
    showSlope, showAllVars, showA, showB, visIdx, eqs, hiddenEqs, dataMap, dates,
    activeSeriesInfo, scaled, activeGlobalMin, activeGlobalRange,
  ]);

  wheelStateRef.current = {
    visStart, visEnd, plotW, plotH, totalLeft, datesLen: dates.length,
    scaled, activeSeriesInfo, axisTypes, activeGlobalMin, activeGlobalMax, globalMin, globalMax,
    plotTop, svgW: size.w, svgH: size.h,
  };

  useMultiAxisWheelZoom(svgRef, wheelStateRef, setXViewRange, setSingleAxisRange, setMultiAxisRanges);

  useLineTouchPan(svgRef, wheelStateRef, plotW, plotH, setIsPanning, setXViewRange);

  useEffect(() => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
  }, [scaled, activeSeries.join('|')]);

  useEffect(() => {
    if (!scaled) setSplit(false);
  }, [scaled]);

  const xScale = (i: number) => {
    const frac = dates.length <= 1 ? 0 : i / (dates.length - 1);
    return totalLeft + ((frac - visStart) / visRange) * plotW;
  };
  /** Split: Y축 UI는 그대로, A·B 시계열만 상·하 50% 영역에 각자 스케일로 매핑 */
  // useSplit=false 시 단일 플롯 전체 높이 사용
  const yScaleVar = useCallback((v: 'A' | 'B', val: number, mn: number, rng: number) => {
    if (!useSplit) return plotTop + plotH - ((val - mn) / rng) * plotH;
    const bandTop = v === 'B' ? plotTop + splitBandH : plotTop;
    return bandTop + splitBandH - ((val - mn) / rng) * splitBandH;
  }, [useSplit, plotTop, plotH, splitBandH]);
  const yScale = (val: number, mn: number, rng: number, v?: 'A' | 'B') =>
    v && useSplit ? yScaleVar(v, val, mn, rng) : plotTop + plotH - ((val - mn) / rng) * plotH;
  const plotRight = totalLeft + plotW;
  const centerLabelX = plotRight + 6;

  const centerLabels = useMemo(() => {
    if (!showCenter) return [];
    const raw = centerMarks
      .filter(m => varIncluded(m.var))
      .map(m => {
        const sc = centerScale(m);
        if (!sc) return null;
        const cy = useSplit
          ? yScaleVar(m.var, m.mean, sc.axisMin, sc.axisRange)
          : plotTop + plotH - ((m.mean - sc.axisMin) / sc.axisRange) * plotH;
        return {
          id: `${m.eq ?? '_'}:${m.var}`,
          text: `${lineVarMeanSymbol(m.var)}=${fmtLineVarMean(m.mean)}`,
          cy,
          col: m.color,
          var: m.var,
          dim: hoveredEq !== null && m.eq !== null && hoveredEq !== m.eq,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (useSplit) {
      const aRaw = raw.filter(r => r.var === 'A');
      const bRaw = raw.filter(r => r.var === 'B');
      const aLo = plotTop + 5;
      const aHi = plotTop + splitBandH - 5;
      const bLo = plotTop + splitBandH + 5;
      const bHi = plotTop + plotH - 5;
      return [
        ...layoutDraftCenterLabels(aRaw, aLo, aHi, XY_LINE_CENTER_LABEL_MIN_DY),
        ...layoutDraftCenterLabels(bRaw, bLo, bHi, XY_LINE_CENTER_LABEL_MIN_DY),
      ];
    }
    const yLo = plotTop + 5;
    const yHi = plotTop + plotH - 5;
    return layoutDraftCenterLabels(raw, yLo, yHi, XY_LINE_CENTER_LABEL_MIN_DY);
  }, [
    showCenter, centerMarks, showAllVars, showA, showB, hoveredEq, centerScale,
    useSplit, plotTop, plotH, splitBandH, yScaleVar,
  ]);

  const startAxisDrag = useYAxisDrag(axisDragRef, plotH, setSingleAxisRange, setMultiAxisRanges);

  const resetAll = () => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
    if (periodDays <= 0 || periodDays >= dates.length) setXViewRange(null);
    else setXViewRange({ start: (dates.length - periodDays) / (dates.length - 1), end: 1 });
    setShowSlope(false);
    setShowCenter(false);
    setShowA(true);
    setShowB(true);
    setScaled(true);
    setSplit(false);
    setHoveredEq(null);
  };
  const isModified = useMemo(() =>
    singleAxisRange !== null || Object.keys(multiAxisRanges).length > 0 ||
    showSlope || showCenter || !showA || !showB || !scaled || split,
  [singleAxisRange, multiAxisRanges, showSlope, showCenter, showA, showB, scaled, split]);

  const startPan = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { visStart: vs, visEnd: ve, plotW: pw } = wheelStateRef.current;
    xPanRef.current = { startX: e.clientX, visStart: vs, visEnd: ve, plotW: pw };
    setIsPanning(true);
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (!xPanRef.current || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!xPanRef.current) return;
        const { startX, visStart: s, visEnd: ve2, plotW: pw2 } = xPanRef.current;
        const vr = ve2 - s;
        const dFrac = -(ev.clientX - startX) / pw2 * vr;
        let ns = s + dFrac, ne = ve2 + dFrac;
        if (ns < 0) { ne -= ns; ns = 0; }
        if (ne > 1) { ns -= (ne - 1); ne = 1; }
        ns = Math.max(0, ns); ne = Math.min(1, ne);
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      });
    };
    const onUp = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      xPanRef.current = null;
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startXAxisZoom = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const isPan = e.button === 2;
    const { visStart: vs, visEnd: ve, plotW: pw, totalLeft: tl, datesLen: dn } = wheelStateRef.current;
    const svgRect = svgRef.current!.getBoundingClientRect();
    const mouseRelX = Math.max(0, Math.min(pw, e.clientX - svgRect.left - tl));
    const fracAtClick = vs + (mouseRelX / pw) * (ve - vs);
    const startX = e.clientX;
    const curRange = ve - vs;
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isPan) {
          const shift = ((ev.clientX - startX) / pw) * curRange;
          let ns = vs - shift, ne = ve - shift;
          if (ns < 0) { ne -= ns; ns = 0; }
          if (ne > 1) { ns -= (ne - 1); ne = 1; }
          ns = Math.max(0, ns); ne = Math.min(1, ne);
          if (ne - ns >= 1 - 1e-9) setXViewRange(null);
          else setXViewRange({ start: ns, end: ne });
        } else {
          const factor = Math.exp((ev.clientX - startX) / 300);
          const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(dn - 1, 1));
          let ns = fracAtClick - (fracAtClick - vs) / curRange * newRange;
          let ne = ns + newRange;
          if (ns < 0) { ne -= ns; ns = 0; }
          if (ne > 1) { ns -= (ne - 1); ne = 1; }
          ns = Math.max(0, ns); ne = Math.min(1, ne);
          if (ne - ns >= 1 - 1e-9) setXViewRange(null);
          else setXViewRange({ start: ns, end: ne });
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleDotEnter = (e: React.MouseEvent, key: string, date: string, value: number) => {
    const [eq] = key.split(':');
    setHoveredEq(eq);
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      key, date, value,
      svgX: ((e.clientX - rect.left) / rect.width)  * size.w,
      svgY: ((e.clientY - rect.top)  / rect.height) * size.h,
    });
  };


  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>Line 차트(다중Y)</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`} onClick={resetAll} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} allLast />
          <button className={`draft-chip-btn${aBtnActive ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => {
              if (showA && !showB) { setShowA(true); setShowB(true); }
              else { setShowA(true); setShowB(false); }
            }}
            title="A 변수 (A만 표시 중 → 다시 클릭 시 전체 표시)">A</button>
          <button className={`draft-chip-btn${bBtnActive ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => {
              if (!showA && showB) { setShowA(true); setShowB(true); }
              else { setShowA(false); setShowB(true); }
            }}
            title="B 변수 (B만 표시 중 → 다시 클릭 시 전체 표시)">B</button>
          <button className={`draft-chip-btn${scaled ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setScaled(v => !v)} title="다중 Y축 전환">Multi Y</button>
          {scaled && axisTypes.includes('A') && axisTypes.includes('B') && (
            <button className={`draft-chip-btn${split ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
              onClick={() => setSplit(v => !v)} title="A·B 시계열 상·하 분리 (Y축 UI 유지)">Split</button>
          )}
          <button className={`draft-chip-btn${showSlope ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowSlope(v => !v)} title="A·B 시계열 회귀선 (m, R²)">Slope</button>
          <button className={`draft-chip-btn${showCenter ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowCenter(v => !v)} title="A·B 평균 수평선 (Ā·B̄, EQ별)">Center</button>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg draft-chart-touch" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <defs>
            <clipPath id="xy-line-plot-clip">
              <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} fill="transparent"
            onDoubleClick={resetAll} onMouseDown={startPan}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }} />
          {useSplit ? (
            [0, 0.5, 1].flatMap((r, i) => [
              <line key={`a${i}`} x1={totalLeft} y1={plotTop + splitBandH * (1 - r)}
                x2={totalLeft + plotW} y2={plotTop + splitBandH * (1 - r)}
                stroke="#1e293b" strokeWidth={1} />,
              <line key={`b${i}`} x1={totalLeft} y1={plotTop + splitBandH + splitBandH * (1 - r)}
                x2={totalLeft + plotW} y2={plotTop + splitBandH + splitBandH * (1 - r)}
                stroke="#1e293b" strokeWidth={1} />,
            ])
          ) : (
            [0, 0.25, 0.5, 0.75, 1].map((r, i) => (
              <line key={i} x1={totalLeft} y1={plotTop + plotH * (1 - r)}
                x2={totalLeft + plotW} y2={plotTop + plotH * (1 - r)}
                stroke="#1e293b" strokeWidth={1} />
            ))
          )}
          {useSplit && (
            <line x1={totalLeft} y1={plotTop + splitBandH} x2={totalLeft + plotW} y2={plotTop + splitBandH}
              stroke="#334155" strokeWidth={1.5} />
          )}
          {(() => {
            const fvi = Math.max(0, Math.floor(visStart * (dates.length - 1)) - 1);
            const lvi = Math.min(dates.length - 1, Math.ceil(visEnd * (dates.length - 1)) + 1);
            const vc = lvi - fvi + 1;
            const step = Math.max(1, Math.ceil(vc / 8));
            return dates.map((_, i) => {
              const x = xScale(i);
              if (x < totalLeft - 0.5 || x > totalLeft + plotW + 0.5) return null;
              return (vc <= 8 || (i - fvi) % step === 0) ? (
                <line key={i} x1={x} y1={plotTop} x2={x} y2={plotTop + plotH}
                  stroke="#1e293b" strokeWidth={1} />
              ) : null;
            });
          })()}
          {scaled ? (
            axisTypes.map((axisType, idx) => {
              const typeSeries = activeSeriesInfo.filter(s => s.key.endsWith(`:${axisType}`));
              const axMin = typeSeries.length ? typeSeries[0].axisMin : 0;
              const axMax = typeSeries.length ? typeSeries[0].axisMax : 1;
              const axRange = typeSeries.length ? typeSeries[0].axisRange : 1;
              const axColor = axisType === 'A' ? '#94a3b8' : '#7dd3fc';
              const bandTop = useSplit ? (axisType === 'B' ? plotTop + splitBandH : plotTop) : plotTop;
              const bandH   = useSplit ? splitBandH : plotH;
              const axX     = useSplit ? totalLeft : (idx === 0 ? totalLeft : totalLeft - idx * XY_LINE_AXIS_W);
              return (
                <g key={idx}
                  onMouseDown={e => startAxisDrag(e, 'multi', axMin, axMax, axisType)}
                  onContextMenu={ev => ev.preventDefault()}
                  onDoubleClick={() => {
                    setMultiAxisRanges(prev => { const n = { ...prev }; delete n[axisType]; return n; });
                    setHoveredEq(null);
                  }}
                  style={{ cursor: 'ns-resize' }}>
                  <rect x={axX - XY_LINE_AXIS_W + 2} y={bandTop} width={XY_LINE_AXIS_W} height={bandH} fill="transparent" />
                  <line x1={axX} y1={bandTop} x2={axX} y2={bandTop + bandH} stroke={axColor} strokeWidth={1.5} />
                  {Array.from({ length: 5 }, (_, i) => {
                    const ratio = i / 4;
                    const val = axMin + ratio * axRange;
                    const y = bandTop + bandH * (1 - ratio);
                    return (
                      <g key={i}>
                        <line x1={axX - 4} y1={y} x2={axX} y2={y} stroke={axColor} strokeWidth={1} />
                        <text x={axX - 6} y={y + 3} textAnchor="end" fontSize="9" fill={axColor}>
                          {val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.round(val)}
                        </text>
                      </g>
                    );
                  })}
                  <text x={axX - XY_LINE_AXIS_W / 2} y={bandTop + bandH / 2}
                    textAnchor="middle" fontSize="9" fill={axColor}
                    transform={`rotate(-90,${axX - XY_LINE_AXIS_W / 2},${bandTop + bandH / 2})`}>
                    {axisType}
                  </text>
                </g>
              );
            })
          ) : (
            <g onMouseDown={e => startAxisDrag(e, 'single', activeGlobalMin, activeGlobalMax)}
              onContextMenu={ev => ev.preventDefault()}
              onDoubleClick={resetAll} style={{ cursor: 'ns-resize' }}>
              <rect x={0} y={plotTop} width={totalLeft} height={plotH} fill="transparent" />
              <line x1={totalLeft} y1={plotTop} x2={totalLeft} y2={plotTop + plotH} stroke="#334155" strokeWidth={1.5} />
              {Array.from({ length: 6 }, (_, i) => {
                const ratio = i / 5;
                const val = activeGlobalMin + ratio * activeGlobalRange;
                const y = plotTop + plotH * (1 - ratio);
                return (
                  <g key={i}>
                    <line x1={totalLeft - 4} y1={y} x2={totalLeft} y2={y} stroke="#334155" strokeWidth={1} />
                    <text x={totalLeft - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#475569">
                      {val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.round(val)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          <line x1={totalLeft} y1={plotTop + plotH} x2={totalLeft + plotW} y2={plotTop + plotH} stroke="#334155" strokeWidth={1.5} />
          {(() => {
            const fvi = Math.max(0, Math.floor(visStart * (dates.length - 1)) - 1);
            const lvi = Math.min(dates.length - 1, Math.ceil(visEnd * (dates.length - 1)) + 1);
            const vc = lvi - fvi + 1;
            const step = Math.max(1, Math.ceil(vc / 8));
            return dates.map((date, i) => {
              const x = xScale(i);
              if (x < totalLeft - 0.5 || x > totalLeft + plotW + 0.5) return null;
              return (vc <= 8 || (i - fvi) % step === 0) ? (
                <g key={i}>
                  <line x1={x} y1={plotTop + plotH} x2={x} y2={plotTop + plotH + 4} stroke="#334155" strokeWidth={1} />
                  <text x={x} y={plotTop + plotH + 18} textAnchor="middle" fontSize="9" fill="#475569"
                    transform={`rotate(-30,${x},${plotTop + plotH + 18})`}>
                    {date.substring(5)}
                  </text>
                </g>
              ) : null;
            });
          })()}
          <rect x={totalLeft} y={plotTop + plotH} width={plotW} height={XY_LINE_PAD.bottom}
            fill="transparent" onMouseDown={startXAxisZoom}
            onContextMenu={ev => ev.preventDefault()}
            style={{ cursor: 'ew-resize' }} />
          <g clipPath="url(#xy-line-plot-clip)">
            {(() => {
              const ai = dates.indexOf(activeDate);
              if (ai < 0) return null;
              const x = xScale(ai);
              if (x < totalLeft - 1 || x > totalLeft + plotW + 1) return null;
              return (
                <line
                  x1={x} y1={plotTop} x2={x} y2={plotTop + plotH}
                  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.9}
                />
              );
            })()}
            {activeSeriesInfo.map((s, sIdx) => {
              const [eq, lineVar] = s.key.split(':') as [string, 'A' | 'B'];
              const isHoveredEq = hoveredEq === eq;
              const dimSeries = hoveredEq !== null && !isHoveredEq;
              const sMin = scaled ? s.axisMin : activeGlobalMin;
              const sRange = scaled ? s.axisRange : activeGlobalRange;
              const isDashed = lineVar === 'B';
              const segments: string[][] = [];
              let cur: string[] = [];
              for (const [i, v] of s.values.entries()) {
                if (Number.isFinite(v)) {
                  cur.push(`${xScale(i)},${yScale(v, sMin, sRange, lineVar)}`);
                } else {
                  if (cur.length > 1) segments.push(cur);
                  cur = [];
                }
              }
              if (cur.length > 1) segments.push(cur);
              return (
                <g key={sIdx}>
                  {segments.map((seg, si) => (
                    <polyline key={si} points={seg.join(' ')} fill="none" stroke={s.color}
                      strokeWidth={isHoveredEq ? 2 : 0.5}
                      strokeLinejoin="round"
                      strokeDasharray={isDashed ? '6 3' : undefined}
                      opacity={dimSeries ? 0.12 : 1}
                      pointerEvents="none" />
                  ))}
                  {s.values.map((v, i) => {
                    if (!Number.isFinite(v)) return null;
                    const cx = xScale(i);
                    if (cx < totalLeft - 6 || cx > totalLeft + plotW + 6) return null;
                    return (
                      <circle key={i} cx={cx} cy={yScale(v, sMin, sRange, lineVar)} r={isHoveredEq ? 4 : 3}
                        fill={s.color} stroke="#0D1117" strokeWidth={1}
                        opacity={dimSeries ? 0.15 : 1}
                        onMouseEnter={e => handleDotEnter(e, s.key, dates[i], v)}
                        onMouseLeave={() => setTooltip(null)}
                        style={{ cursor: 'pointer' }} />
                    );
                  })}
                </g>
              );
            })}
            {showCenter && (() => {
              const visibleMarks = centerMarks.filter(m => varIncluded(m.var));
              return (
                <>
                  {visibleMarks.map((m, ci) => {
                    const sc = centerScale(m);
                    if (!sc) return null;
                    const dim = hoveredEq !== null && m.eq !== null && hoveredEq !== m.eq;
                    const cy = yScale(m.mean, sc.axisMin, sc.axisRange, m.var);
                    return (
                      <g key={`center-${m.var}-${ci}`} pointerEvents="none" opacity={dim ? 0.15 : 0.85}>
                        <line x1={totalLeft} y1={cy} x2={plotRight} y2={cy}
                          stroke={m.color} strokeWidth={1}
                          strokeDasharray="5 4" />
                      </g>
                    );
                  })}
                </>
              );
            })()}
            {showSlope && slopeLines.map((sl, li) => {
              const dim = hoveredEq !== null && sl.eq !== null && hoveredEq !== sl.eq;
              const y0 = sl.reg.m * sl.i0 + sl.reg.b;
              const y1 = sl.reg.m * sl.i1 + sl.reg.b;
              return (
                <line
                  key={`slope-${li}`}
                  x1={xScale(sl.i0)}
                  y1={yScale(y0, sl.axisMin, sl.axisRange, sl.var)}
                  x2={xScale(sl.i1)}
                  y2={yScale(y1, sl.axisMin, sl.axisRange, sl.var)}
                  stroke={sl.color}
                  strokeWidth={1.5}
                  strokeDasharray={sl.var === 'B' ? '5 4' : undefined}
                  opacity={dim ? 0.12 : 0.9}
                  pointerEvents="none"
                />
              );
            })}
          </g>
          {showSlope && slopeLines.length > 0 && (() => {
            const aLines = slopeLines.filter(sl => sl.var === 'A');
            const bLines = slopeLines.filter(sl => sl.var === 'B');
            const aTop = plotTop - 4;
            const bTop = useSplit ? plotTop + splitBandH - 4 : plotTop - 4 + aLines.length * 12;
            const renderSlopeStats = (v: 'A' | 'B', lines: typeof slopeLines, row0: number) =>
              lines.map((sl, li) => {
                const dim = hoveredEq !== null && sl.eq !== null && hoveredEq !== sl.eq;
                const fmtM = Math.abs(sl.reg.m) < 0.01 || Math.abs(sl.reg.m) >= 1000
                  ? sl.reg.m.toExponential(2)
                  : sl.reg.m.toFixed(3);
                return (
                  <text
                    key={`slope-stat-${v}-${li}`}
                    x={plotRight - 6}
                    y={row0 + li * 12}
                    textAnchor="end"
                    className="draft-pal-gap-value"
                    fill={sl.color}
                    opacity={dim ? 0.2 : 0.95}
                  >
                    {sl.label} m={fmtM} R²={sl.reg.r2.toFixed(3)}
                  </text>
                );
              });
            return (
              <g className="draft-line-slope-stats" pointerEvents="none">
                {renderSlopeStats('A', aLines, aTop)}
                {renderSlopeStats('B', bLines, bTop)}
              </g>
            );
          })()}
          {showCenter && centerLabels.length > 0 && (
            <g className="draft-line-center-labels" pointerEvents="none">
              {centerLabels.map(({ id, text, y, cy, col, dim }) => (
                <g key={id} opacity={dim ? 0.2 : 1}>
                  <line x1={plotRight} y1={cy} x2={centerLabelX - 3} y2={y}
                    stroke={col} strokeWidth={0.8} opacity={0.35} />
                  <text x={centerLabelX} y={y} className="draft-pal-gap-value" fill={col}>{text}</text>
                </g>
              ))}
            </g>
          )}
          {(() => {
            if (!tooltip) return null;
            const [eq, v] = tooltip.key.split(':') as [string, string];
            const color = eqColors[eq] ?? '#94a3b8';
            const tipX = tooltip.svgX + 104 > size.w ? tooltip.svgX - 106 : tooltip.svgX + 8;
            const tipY = Math.max(plotTop, tooltip.svgY - 44);
            return (
              <>
                <rect x={tipX} y={tipY} width={98} height={48} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize="10" fill={color} fontWeight="700">
                  {eq} {v}변수
                </text>
                <text x={tipX + 8} y={tipY + 26} fontSize="9" fill="#94a3b8">{tooltip.date}</text>
                <text x={tipX + 8} y={tipY + 38} fontSize="9" fill="#94a3b8">
                  {tooltip.value.toFixed(2)}
                </text>
              </>
            );
          })()}
        </svg>
      </div>
      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
      {controlsVisible && lineTimeline.filtered.length > 1 && (
        <ChartTimeline
          isPlaying={lineTimeline.isPlaying}
          playSpeed={lineTimeline.playSpeed}
          sliderIdx={lineTimeline.localIdx}
          maxIdx={lineTimeline.maxIdx}
          startDate={lineTimeline.startDate}
          currentDate={lineTimeline.currentDate}
          onPlay={lineTimeline.onPlay}
          onSpeedChange={lineTimeline.setPlaySpeed}
          onSlider={lineTimeline.setLocalIdx}
        />
      )}
    </div>
  );
}
