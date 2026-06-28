/**
 * XY 산점도 차트 — Trail 효과·lasso 선택·3D 전환·터치 핀치줌 지원
 */
import React, { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BUILT_IN_DATA, SHAP_DATES, type XYPoint } from './data-draft';
import {
  XY_PAD,
  scaleLinear,
  scaleLinearY,
  sliceByPeriodDays,
  useChartControls,
  useContainerSize,
  useEqVisibility,
  useShapTimeline,
  ChartTimeline,
  PeriodSelect,
  EqLegend,
  ChartCard,
  genTicks,
  wheelHitSvgPlot,
  hitSvgPlotFromClient,
  touchPairDist,
  touchPairMid,
  beginScatterSelection,
  type ScatterSelOverlay,
  EqColorContext,
  ChartFontContext,
  DraftEqHoverContext,
  ShapDateCtx,
} from './shared';

// ── 3D 캔버스 차트 ──────────────────────────────────────────────────────────
// Canvas 기반 3D 산점도 — 날짜를 Z축으로 투영, 드래그 회전·휠 줌 지원
function XYScatter3D({ pts, dates, hiddenEqs }: {
  pts: XYPoint[];
  dates: string[];
  hiddenEqs: Set<string>;
}) {
  const eqColors = useContext(EqColorContext);
  const chartFont = useContext(ChartFontContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef({ rotX: -0.4, rotY: 0.5 });
  const zoomRef = useRef(1.0);

  const dateIndex = useMemo(
    () => Object.fromEntries(dates.map((d, i) => [d, i])),
    [dates]
  );

  // z2(depth) 오름차순 정렬 후 그려야 앞쪽 점이 위에 렌더됨
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = canvas;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const baseScale = Math.min(W, H) * 0.35;
    const scale = baseScale * zoomRef.current;
    const { rotX, rotY } = rotRef.current;
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const project = (px: number, py: number, pz: number) => {
      const x1 =  px * cosY + pz * sinY;
      const z1 = -px * sinY + pz * cosY;
      const y2 = py * cosX - z1 * sinX;
      const z2 = py * sinX + z1 * cosX;
      return { sx: cx + x1 * scale, sy: cy - y2 * scale, z2 };
    };
    const n = dates.length;
    const axes: [number, number, number, number, number, number, string, string][] = [
      [-1, 0, 0,  1, 0, 0, '#7cc4ff', 'A축'],
      [ 0,-1, 0,  0, 1, 0, '#e74c3c', 'B축'],
      [ 0, 0,-1,  0, 0, 1, '#2ecc71', '날짜'],
    ];
    axes.forEach(([fx, fy, fz, tx, ty, tz, color, label]) => {
      const p1 = project(fx, fy, fz);
      const p2 = project(tx, ty, tz);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `11px ${chartFont}`;
      ctx.textAlign = 'left';
      ctx.fillText(label, p2.sx + 4, p2.sy + 4);
    });
    if (n >= 2) {
      const zLabels = [dates[0], dates[Math.floor((n - 1) / 2)], dates[n - 1]];
      zLabels.forEach((d, i) => {
        const nz = n < 2 ? 0 : (i / 2) * 2 - 1;
        const { sx, sy } = project(0, 0, nz);
        ctx.font = `9px ${chartFont}`;
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.fillText(d.slice(5), sx, sy + 12);
      });
    }
    const normX = (x: number) => (x / 12) * 2 - 1;
    const normY = (y: number) => (y / 55) * 2 - 1;
    const normZ = (di: number) => n < 2 ? 0 : (di / (n - 1)) * 2 - 1;
    const visible = pts.filter(p => !hiddenEqs.has(p.eq));
    const projected = visible.map(p => ({
      ...project(normX(p.x), normY(p.y), normZ(dateIndex[p.date] ?? 0)),
      eq: p.eq,
    }));
    projected.sort((a, b) => a.z2 - b.z2);
    projected.forEach(({ sx, sy, z2, eq }) => {
      const depth = Math.max(0.3, Math.min(2.0, 1 + z2 * 0.5));
      const r = (3 * depth * zoomRef.current * 0.5 + 3);
      const color = eqColors[eq] ?? '#94a3b8';
      const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.35, r * 0.05, sx, sy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.75)');
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });
  }, [pts, dates, hiddenEqs, dateIndex, eqColors, chartFont]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) { canvas.width = width; canvas.height = height; draw(); }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const { rotX: rx0, rotY: ry0 } = rotRef.current;
    const onMove = (ev: MouseEvent) => {
      rotRef.current = { rotX: rx0 + (ev.clientY - startY) * 0.007, rotY: ry0 + (ev.clientX - startX) * 0.007 };
      draw();
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9)));
    draw();
  };

  return (
    <div ref={containerRef} className="draft-scatter-3d-wrap" onMouseDown={onMouseDown} onWheel={onWheel}>
      <canvas ref={canvasRef} className="draft-scatter-3d-canvas" />
      <div className="draft-scatter-3d-hint">드래그: 회전 · 휠: 줌</div>
    </div>
  );
}

// ── XY 산점도 차트 ──────────────────────────────────────────────────────────
// Scatter Trail 기본 크기·투명도 상수
const SCATTER_TRAIL_SIZE_MIN = 0;
const SCATTER_TRAIL_SIZE_MAX = 6;
const SCATTER_TRAIL_OPACITY_MIN = 0.2;
const SCATTER_TRAIL_OPACITY_MAX = 1;
const SCATTER_TRAIL_LINE_OPACITY = 0.2;

// ── XYScatterChart 상태 관리 ─────────────────────────────────────────────────
type ScatterState = {
  show3D: boolean;
  dotSizeMin: number; dotSizeMax: number;
  opacityMin: number; opacityMax: number;
  lineOpacityVal: number;
  xAxisRange: { min: number; max: number } | null;
  yAxisRange: { min: number; max: number } | null;
  isPanning: boolean;
  tooltip: { pt: XYPoint; svgX: number; svgY: number } | null;
};

const SCATTER_INITIAL: ScatterState = {
  show3D: false,
  dotSizeMin: SCATTER_TRAIL_SIZE_MIN, dotSizeMax: SCATTER_TRAIL_SIZE_MAX,
  opacityMin: SCATTER_TRAIL_OPACITY_MIN, opacityMax: SCATTER_TRAIL_OPACITY_MAX,
  lineOpacityVal: SCATTER_TRAIL_LINE_OPACITY,
  xAxisRange: null, yAxisRange: null,
  isPanning: false,
  tooltip: null,
};

type ScatterAction =
  | { type: 'TOGGLE_3D' }
  | { type: 'SET_DOT_SIZE_MIN'; v: number }
  | { type: 'SET_DOT_SIZE_MAX'; v: number }
  | { type: 'SET_OPACITY_MIN'; v: number }
  | { type: 'SET_OPACITY_MAX'; v: number }
  | { type: 'SET_LINE_OPACITY'; v: number }
  | { type: 'SET_X_RANGE'; range: { min: number; max: number } | null }
  | { type: 'SET_Y_RANGE'; range: { min: number; max: number } | null }
  | { type: 'SET_XY_RANGE'; x: { min: number; max: number } | null; y: { min: number; max: number } | null }
  | { type: 'SET_IS_PANNING'; v: boolean }
  | { type: 'SET_TOOLTIP'; tooltip: ScatterState['tooltip'] }
  | { type: 'RESET_ZOOM' }
  | { type: 'RESET_ALL' };

function scatterReducer(s: ScatterState, a: ScatterAction): ScatterState {
  switch (a.type) {
    case 'TOGGLE_3D':        return { ...s, show3D: !s.show3D };
    case 'SET_DOT_SIZE_MIN': return { ...s, dotSizeMin: Math.min(a.v, s.dotSizeMax) };
    case 'SET_DOT_SIZE_MAX': return { ...s, dotSizeMax: Math.max(a.v, s.dotSizeMin) };
    case 'SET_OPACITY_MIN':  return { ...s, opacityMin: Math.min(a.v, s.opacityMax) };
    case 'SET_OPACITY_MAX':  return { ...s, opacityMax: Math.max(a.v, s.opacityMin) };
    case 'SET_LINE_OPACITY': return { ...s, lineOpacityVal: a.v };
    case 'SET_X_RANGE':      return { ...s, xAxisRange: a.range };
    case 'SET_Y_RANGE':      return { ...s, yAxisRange: a.range };
    case 'SET_XY_RANGE':     return { ...s, xAxisRange: a.x, yAxisRange: a.y }; // X·Y 동시 갱신 → 단일 리렌더 (휠·터치 줌)
    case 'SET_IS_PANNING':   return { ...s, isPanning: a.v };
    case 'SET_TOOLTIP':      return { ...s, tooltip: a.tooltip };
    case 'RESET_ZOOM':       return { ...s, xAxisRange: null, yAxisRange: null };
    case 'RESET_ALL':        return { ...SCATTER_INITIAL };
    default:                 return s;
  }
}

// XY 산점도 차트 — Trail 효과·lasso 선택·3D 전환·터치 핀치줌 지원
export function XYScatterChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const data = BUILT_IN_DATA;
  const { periodDays, setPeriodDays } = useContext(ShapDateCtx);
  const timeline = useShapTimeline(SHAP_DATES);
  const {
    currentDate: selectedDate,
    localIdx,
    setLocalIdx,
    setLocalIdxFn,
    maxIdx: timelineMaxIdx,
    isPlaying,
    playSpeed,
    onPlay,
    setPlaySpeed,
    startDate: timelineStart,
    filtered: timelineDates,
  } = timeline;
  const [st, dispatch] = useReducer(scatterReducer, SCATTER_INITIAL);
  const {
    show3D, dotSizeMin, dotSizeMax, opacityMin, opacityMax, lineOpacityVal,
    xAxisRange, yAxisRange, isPanning, tooltip,
  } = st;
  const [selOverlay, setSelOverlay] = useState<ScatterSelOverlay | null>(null);
  const { controlsVisible, toggleControls } = useChartControls();
  const { hoveredEq, setHoveredEq } = useContext(DraftEqHoverContext);
  const svgRef = useRef<SVGSVGElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const svgSize = useContainerSize(svgWrapRef);
  const xAxisDragRef = useRef<{ startX: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const yAxisDragRef = useRef<{ startY: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const panDragRef   = useRef<{ startX: number; startY: number; xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);

  const setPlotPanCursor = useCallback((active: boolean) => {
    document.body.style.cursor = active ? 'grabbing' : '';
  }, []);

  useEffect(() => () => setPlotPanCursor(false), [setPlotPanCursor]);

  const filteredData = useMemo(() => {
    const allDates = [...new Set(data.map(d => d.date))].sort();
    return sliceByPeriodDays(data, allDates, periodDays);
  }, [data, periodDays]);

  const dates = useMemo(() => [...new Set(filteredData.map(d => d.date))].sort(), [filteredData]);
  /** 선택일 = max, 그 이전 Trail·과거 점 = min (날짜별 점진 감소 없음) */
  // 선택된 날짜 점만 크고 불투명하게, 나머지는 Trail로 흐리게 표시
  const dateOpacity = useMemo(() => Object.fromEntries(
    dates.map(d => [d, d === selectedDate ? opacityMax : opacityMin]),
  ), [dates, selectedDate, opacityMin, opacityMax]);
  const dateRadius = useMemo(() => Object.fromEntries(
    dates.map(d => [d, d === selectedDate ? dotSizeMax : dotSizeMin]),
  ), [dates, selectedDate, dotSizeMin, dotSizeMax]);
  const eqs = useMemo(() => [...new Set(filteredData.map(d => d.eq))].sort(), [filteredData]);
  const { hiddenEqs, selectEq, applyScatterSelection, resetHiddenEqs } = useEqVisibility(eqs);
  const pts = useMemo(() => {
    const base = selectedDate ? filteredData.filter(d => d.date === selectedDate) : filteredData;
    return base.filter(d => !hiddenEqs.has(d.eq));
  }, [filteredData, selectedDate, hiddenEqs]);

  const svgW = svgSize.w;
  const svgH = svgSize.h;
  const plotW = svgW - XY_PAD.left - XY_PAD.right;
  const plotH = svgH - XY_PAD.top  - XY_PAD.bottom;

  const activeXMin = xAxisRange?.min ?? 0;
  const activeXMax = xAxisRange?.max ?? 12;
  const activeYMin = yAxisRange?.min ?? 0;
  const activeYMax = yAxisRange?.max ?? 55;
  const activeXRange = Math.max(activeXMax - activeXMin, 1e-6);
  const activeYRange = Math.max(activeYMax - activeYMin, 1e-6);

  const toSX = (x: number) => scaleLinear(x, activeXMin, activeXMax, XY_PAD.left, plotW);
  const toSY = (y: number) => scaleLinearY(y, activeYMin, activeYMax, XY_PAD.top, plotH);
  const xTicks = genTicks(activeXMin, activeXMax);
  const yTicks = genTicks(activeYMin, activeYMax);
  const isZoomed = xAxisRange !== null || yAxisRange !== null;
  const isModified = useMemo(() =>
    isZoomed
    || dotSizeMin !== SCATTER_TRAIL_SIZE_MIN || dotSizeMax !== SCATTER_TRAIL_SIZE_MAX
    || opacityMin !== SCATTER_TRAIL_OPACITY_MIN || opacityMax !== SCATTER_TRAIL_OPACITY_MAX
    || lineOpacityVal !== SCATTER_TRAIL_LINE_OPACITY
    || hiddenEqs.size > 0,
  [isZoomed, dotSizeMin, dotSizeMax, opacityMin, opacityMax, lineOpacityVal, hiddenEqs]);

  // 좌클릭=범위 줌(지수 스케일로 느린 시작), 우클릭=패닝 — X·Y 축 공용 드래그 핸들러 팩토리
  const makeAxisDragHandler = useCallback((
    axis: 'x' | 'y',
    getRange: () => { min: number; max: number },
    dragRef: React.RefObject<{ startX?: number; startY?: number; startMin: number; startMax: number; minRange: number } | null>,
    setRange: (r: { min: number; max: number }) => void,
    plotSize: number,
  ) => (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    const isPan = e.button === 2;
    const { min: startMin, max: startMax } = getRange();
    const minRange = Math.max((startMax - startMin) * 0.02, 1e-6);
    const startCoord = axis === 'x' ? e.clientX : e.clientY;
    dragRef.current = axis === 'x'
      ? { startX: startCoord, startMin, startMax, minRange }
      : { startY: startCoord, startMin, startMax, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!dragRef.current) return;
        const { startMin: dMin, startMax: dMax, minRange: dMinR } = dragRef.current;
        const coord = axis === 'x' ? ev.clientX : ev.clientY;
        const delta = coord - startCoord;
        if (isPan) {
          const shift = (delta / plotSize) * (dMax - dMin);
          // Line 차트(다중Y)와 동일: X는 −shift, Y는 +shift
          if (axis === 'y') setRange({ min: dMin + shift, max: dMax + shift });
          else setRange({ min: dMin - shift, max: dMax - shift });
        } else {
          const factor = Math.exp(delta / 160);
          const center = (dMin + dMax) / 2;
          const next = Math.max((dMax - dMin) * factor, dMinR);
          setRange({ min: center - next / 2, max: center + next / 2 });
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const startXAxisDrag = useMemo(() => makeAxisDragHandler(
    'x',
    () => xAxisRange ?? { min: 0, max: 12 },
    xAxisDragRef as React.RefObject<{ startX?: number; startY?: number; startMin: number; startMax: number; minRange: number } | null>,
    range => dispatch({ type: 'SET_X_RANGE', range }),
    plotW,
  ), [makeAxisDragHandler, xAxisRange, plotW]);

  const startYAxisDrag = useMemo(() => makeAxisDragHandler(
    'y',
    () => yAxisRange ?? { min: 0, max: 55 },
    yAxisDragRef as React.RefObject<{ startX?: number; startY?: number; startMin: number; startMax: number; minRange: number } | null>,
    range => dispatch({ type: 'SET_Y_RANGE', range }),
    plotH,
  ), [makeAxisDragHandler, yAxisRange, plotH]);

  const wheelStateRef = useRef({
    activeXMin, activeXMax, activeXRange, activeYMin, activeYMax, activeYRange,
    plotLeft: XY_PAD.left, plotTop: XY_PAD.top, plotW, plotH, svgW, svgH,
  });
  wheelStateRef.current = {
    activeXMin, activeXMax, activeXRange, activeYMin, activeYMax, activeYRange,
    plotLeft: XY_PAD.left, plotTop: XY_PAD.top, plotW, plotH, svgW, svgH,
  };
  // 휠: 마우스 위치 기준 X·Y 동시 줌 (scatter는 shift 구분 없음)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width)  * st.svgW;
      const my = ((e.clientY - rect.top)  / rect.height) * st.svgH;
      const { activeXMin: xMn, activeXMax: xMx, activeXRange: xRng,
              activeYMin: yMn, activeYMax: yMx, activeYRange: yRng } = st;
      const dataX = xMn + ((mx - XY_PAD.left) / plotW) * xRng;
      const dataY = yMn + ((XY_PAD.top + plotH - my) / plotH) * yRng;
      dispatch({ type: 'SET_XY_RANGE',
        x: { min: dataX - (dataX - xMn) * factor, max: dataX + (xMx - dataX) * factor },
        y: { min: dataY - (dataY - yMn) * factor, max: dataY + (yMx - dataY) * factor },
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [plotW, plotH]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || show3D) return;

    let panStart: { x: number; y: number; xMin: number; xMax: number; yMin: number; yMax: number } | null = null;
    let pinchStart: {
      dist: number; xMin: number; xMax: number; yMin: number; yMax: number; cx: number; cy: number;
    } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const st = wheelStateRef.current;
        const t0 = e.touches[0], t1 = e.touches[1];
        const mid = touchPairMid(t0, t1);
        const { hit } = hitSvgPlotFromClient(mid.x, mid.y, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH);
        if (!hit) return;
        e.preventDefault();
        panStart = null;
        const { mx, my } = hitSvgPlotFromClient(mid.x, mid.y, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH);
        const cx = st.activeXMin + ((mx - XY_PAD.left) / st.plotW) * st.activeXRange;
        const cy = st.activeYMin + ((XY_PAD.top + st.plotH - my) / st.plotH) * st.activeYRange;
        pinchStart = {
          dist: touchPairDist(t0, t1),
          xMin: st.activeXMin, xMax: st.activeXMax, yMin: st.activeYMin, yMax: st.activeYMax,
          cx, cy,
        };
        dispatch({ type: 'SET_IS_PANNING', v: false });
      } else if (e.touches.length === 1 && !pinchStart) {
        const st = wheelStateRef.current;
        const t = e.touches[0];
        const { hit } = hitSvgPlotFromClient(t.clientX, t.clientY, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH);
        if (!hit) return;
        panStart = { x: t.clientX, y: t.clientY, xMin: st.activeXMin, xMax: st.activeXMax, yMin: st.activeYMin, yMax: st.activeYMax };
        dispatch({ type: 'SET_IS_PANNING', v: true });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && pinchStart) {
        e.preventDefault();
        const dist = touchPairDist(e.touches[0], e.touches[1]);
        if (dist < 1e-3) return;
        const scale = pinchStart.dist / dist;
        const { cx, cy, xMin, xMax, yMin, yMax } = pinchStart;
        dispatch({ type: 'SET_XY_RANGE',
          x: { min: cx - (cx - xMin) * scale, max: cx + (xMax - cx) * scale },
          y: { min: cy - (cy - yMin) * scale, max: cy + (yMax - cy) * scale },
        });
      } else if (e.touches.length === 1 && panStart && !pinchStart) {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const st = wheelStateRef.current;
        const dx = -((e.touches[0].clientX - panStart.x) / rect.width) * st.svgW / st.plotW * (panStart.xMax - panStart.xMin);
        const dy = ((e.touches[0].clientY - panStart.y) / rect.height) * st.svgH / st.plotH * (panStart.yMax - panStart.yMin);
        dispatch({ type: 'SET_XY_RANGE',
          x: { min: panStart.xMin + dx, max: panStart.xMax + dx },
          y: { min: panStart.yMin + dy, max: panStart.yMax + dy },
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStart = null;
      if (e.touches.length < 1) { panStart = null; dispatch({ type: 'SET_IS_PANNING', v: false }); }
    };

    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    svg.addEventListener('touchend', onTouchEnd);
    svg.addEventListener('touchcancel', onTouchEnd);
    return () => {
      svg.removeEventListener('touchstart', onTouchStart);
      svg.removeEventListener('touchmove', onTouchMove);
      svg.removeEventListener('touchend', onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [show3D, plotW, plotH]);

  const resetZoom = () => {
    dispatch({ type: 'RESET_ZOOM' });
    setHoveredEq(null);
  };
  const resetAll = () => {
    dispatch({ type: 'RESET_ALL' });
    resetHiddenEqs();
    setSelOverlay(null);
    setHoveredEq(null);
  };

  const isHoveringChart = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isHoveringChart.current) return;
      const isPrev = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
      const isNext = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      if (!isPrev && !isNext) return;
      e.preventDefault();
      setLocalIdxFn((prev: number) =>
        isPrev ? Math.max(0, prev - 1) : Math.min(timelineMaxIdx, prev + 1)
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLocalIdxFn, timelineMaxIdx]);

  const startPlotPan = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current!.getBoundingClientRect();
    const rectW = rect.width;
    const rectH = rect.height;
    panDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      xMin: activeXMin, xMax: activeXMax, yMin: activeYMin, yMax: activeYMax,
    };
    setPlotPanCursor(true);
    dispatch({ type: 'SET_IS_PANNING', v: true });
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (!panDragRef.current || rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!panDragRef.current) return;
        const { startX, startY, xMin, xMax, yMin, yMax } = panDragRef.current;
        const dx = -((ev.clientX - startX) / rectW) * svgW / plotW * (xMax - xMin);
        const dy = ((ev.clientY - startY) / rectH) * svgH / plotH * (yMax - yMin);
        dispatch({ type: 'SET_XY_RANGE',
          x: { min: xMin + dx, max: xMax + dx },
          y: { min: yMin + dy, max: yMax + dy },
        });
      });
    };
    const onUp = () => {
      panDragRef.current = null;
      dispatch({ type: 'SET_IS_PANNING', v: false });
      setPlotPanCursor(false);
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [activeXMin, activeXMax, activeYMin, activeYMax, svgW, svgH, plotW, plotH, setPlotPanCursor]);

  const handlePlotMouseDown = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (e.button === 1 || e.button === 2) {
      startPlotPan(e);
      return;
    }
    if (e.button !== 0) return;
    const base = selectedDate
      ? filteredData.filter(d => d.date === selectedDate)
      : filteredData;
    beginScatterSelection({
      e,
      svgEl: svg,
      svgW,
      svgH,
      plotLeft: XY_PAD.left,
      plotTop: XY_PAD.top,
      plotW,
      plotH,
      hits: base.map(pt => ({ id: pt.eq, sx: toSX(pt.x), sy: toSY(pt.y) })),
      onOverlay: setSelOverlay,
      onComplete: (ids, additive) => applyScatterSelection(ids, additive),
    });
  }, [
    selectedDate, filteredData, svgW, svgH, plotW, plotH,
    activeXMin, activeXMax, activeYMin, activeYMax,
    applyScatterSelection, startPlotPan,
  ]);

  const handleEnter = (e: React.MouseEvent<SVGElement>, pt: XYPoint) => {
    if (xAxisDragRef.current || yAxisDragRef.current || selOverlay) return;
    const rect = svgRef.current!.getBoundingClientRect();
    setHoveredEq(pt.eq);
    dispatch({ type: 'SET_TOOLTIP', tooltip: {
      pt,
      svgX: ((e.clientX - rect.left) / rect.width)  * svgW,
      svgY: ((e.clientY - rect.top)  / rect.height) * svgH,
    } });
  };

  const tipX = tooltip ? (tooltip.svgX + 100 > svgW ? tooltip.svgX - 102 : tooltip.svgX + 8) : 0;
  const tipY = tooltip ? Math.max(XY_PAD.top, tooltip.svgY - 52) : 0;

  const allPts = useMemo(
    () => filteredData.filter(d => !hiddenEqs.has(d.eq)),
    [filteredData, hiddenEqs]
  );

  useEffect(() => {
    timeline.setIsPlaying(false);
    dispatch({ type: 'RESET_ZOOM' });
  }, [periodDays, timeline.setIsPlaying]);

  // ── SVG 렌더 헬퍼 ────────────────────────────────────────────────────────────
  const svgGridAxes = (
    <>
      <rect x={XY_PAD.left} y={XY_PAD.top} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
      {yTicks.map(v => (
        <line key={v} x1={XY_PAD.left} y1={toSY(v)} x2={XY_PAD.left + plotW} y2={toSY(v)}
          stroke="#1e293b" strokeWidth="1" />
      ))}
      {xTicks.map(v => (
        <line key={v} x1={toSX(v)} y1={XY_PAD.top} x2={toSX(v)} y2={XY_PAD.top + plotH}
          stroke="#1e293b" strokeWidth="1" />
      ))}
      <line x1={XY_PAD.left} y1={XY_PAD.top} x2={XY_PAD.left} y2={XY_PAD.top + plotH} stroke="#334155" strokeWidth="1.5" />
      <line x1={XY_PAD.left} y1={XY_PAD.top + plotH} x2={XY_PAD.left + plotW} y2={XY_PAD.top + plotH} stroke="#334155" strokeWidth="1.5" />
      {xTicks.map(v => (
        <text key={v} x={toSX(v)} y={XY_PAD.top + plotH + 13} textAnchor="middle" fontSize="9" fill="#475569">{v}</text>
      ))}
      {yTicks.map(v => (
        <text key={v} x={XY_PAD.left - 5} y={toSY(v) + 3.5} textAnchor="end" fontSize="9" fill="#475569">{v}</text>
      ))}
      <text x={XY_PAD.left + plotW / 2} y={svgH - 4} textAnchor="middle" fontSize="10" fill="#64748b" style={{ pointerEvents: 'none' }}>A축</text>
      <text x={11} y={XY_PAD.top + plotH / 2} textAnchor="middle" fontSize="10" fill="#64748b" style={{ pointerEvents: 'none' }}
        transform={`rotate(-90,11,${XY_PAD.top + plotH / 2})`}>B축</text>
      <rect x={XY_PAD.left} y={XY_PAD.top + plotH} width={plotW} height={svgH - XY_PAD.top - plotH}
        fill="transparent" style={{ cursor: 'ew-resize' }} onMouseDown={startXAxisDrag}
        onContextMenu={e => e.preventDefault()}
        onDoubleClick={() => { dispatch({ type: 'SET_X_RANGE', range: null }); setHoveredEq(null); }} />
      <rect x={0} y={XY_PAD.top} width={XY_PAD.left} height={plotH}
        fill="transparent" style={{ cursor: 'ns-resize' }} onMouseDown={startYAxisDrag}
        onContextMenu={e => e.preventDefault()}
        onDoubleClick={() => { dispatch({ type: 'SET_Y_RANGE', range: null }); setHoveredEq(null); }} />
    </>
  );

  const svgDataLayer = (
    <>
      {(() => {
        const focusedEq = hiddenEqs.size === eqs.length - 1
          ? eqs.find(e => !hiddenEqs.has(e)) ?? null
          : null;
        return eqs.filter(eq => !hiddenEqs.has(eq)).map(eq => {
          const lineBase = selectedDate
            ? allPts.filter(p => p.eq === eq && p.date <= selectedDate)
            : pts.filter(p => p.eq === eq);
          const sorted = lineBase.sort((a, b) => a.date.localeCompare(b.date));
          if (sorted.length < 2) return null;
          const points = sorted.map(p => `${toSX(p.x)},${toSY(p.y)}`).join(' ');
          const isHoveredEq = hoveredEq === eq;
          const lineOpacity = lineOpacityVal === 0 ? 0
            : hoveredEq
              ? (isHoveredEq ? Math.max(lineOpacityVal, 0.5) : 0)
              : selectedDate
                ? Math.max(lineOpacityVal, 0.5)
                : (focusedEq !== null ? (focusedEq === eq ? lineOpacityVal : 0) : lineOpacityVal);
          return (
            <g key={eq}>
              <polyline points={points}
                fill="none" stroke={eqColors[eq] ?? '#94a3b8'}
                strokeWidth={isHoveredEq ? 2 : 1}
                strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round"
                opacity={lineOpacity}
              >
                <animate attributeName="stroke-dashoffset" from="10" to="0"
                  dur={isHoveredEq ? '0.35s' : '1.1s'} repeatCount="indefinite" />
              </polyline>
              {selectedDate && sorted.slice(0, -1).map((p, ti) => {
                const r = dateRadius[p.date] ?? dotSizeMin;
                const op = dateOpacity[p.date] ?? opacityMin;
                if (r <= 0 && op <= 0) return null;
                const dim = hoveredEq !== null && hoveredEq !== eq;
                return (
                  <circle key={`trail-${ti}`} cx={toSX(p.x)} cy={toSY(p.y)} r={Math.max(r, 0)}
                    fill={eqColors[eq] ?? '#94a3b8'} opacity={dim ? op * 0.15 : op}
                    stroke="#0f172a" strokeWidth="0.5" pointerEvents="none" />
                );
              })}
            </g>
          );
        });
      })()}
      {selectedDate && hoveredEq && (() => {
        const eq = hoveredEq;
        const trail = allPts
          .filter(p => p.eq === eq && p.date <= selectedDate)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (trail.length < 2) return null;
        const color = eqColors[eq] ?? '#94a3b8';
        const trailPoints = trail.map(p => `${toSX(p.x)},${toSY(p.y)}`).join(' ');
        return (
          <g key="trail">
            <polyline points={trailPoints}
              fill="none" stroke={color} strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" opacity="0.55"
            >
              <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.5s" repeatCount="indefinite" />
            </polyline>
            {trail.slice(0, -1).map((p, i) => {
              const r = dateRadius[p.date] ?? dotSizeMin;
              const op = dateOpacity[p.date] ?? opacityMin;
              if (r <= 0 && op <= 0) return null;
              return (
                <circle key={i} cx={toSX(p.x)} cy={toSY(p.y)} r={Math.max(r, 0)}
                  fill={color} opacity={op} stroke="#0f172a" strokeWidth="0.5" />
              );
            })}
          </g>
        );
      })()}
      {pts.map((pt, i) => {
        const cx = toSX(pt.x), cy = toSY(pt.y);
        const r = dateRadius[pt.date] ?? dotSizeMax;
        const baseOp = dateOpacity[pt.date] ?? opacityMax;
        const op = hoveredEq ? (hoveredEq === pt.eq ? baseOp : 0.1) : baseOp;
        return (
          <g key={selectedDate ? pt.eq : i}
            style={selectedDate ? {
              transform: `translate(${cx}px,${cy}px)`,
              ...(isPlaying ? { transition: 'transform 0.4s ease-out' } : {}),
            } : undefined}
            onMouseEnter={e => handleEnter(e, pt)}
            onMouseLeave={() => dispatch({ type: 'SET_TOOLTIP', tooltip: null })}
            onMouseDown={ev => ev.stopPropagation()}
            onClick={ev => {
              ev.stopPropagation();
              selectEq(pt.eq, ev.ctrlKey || ev.metaKey);
            }}>
            <circle cx={selectedDate ? 0 : cx} cy={selectedDate ? 0 : cy} r={r}
              fill={eqColors[pt.eq] ?? '#94a3b8'} opacity={op}
              stroke="#0f172a" strokeWidth={1}
              className="draft-scatter-dot"
              style={{ cursor: 'pointer' }} />
          </g>
        );
      })}
    </>
  );

  const svgPlotHit = (
    <rect
      x={XY_PAD.left}
      y={XY_PAD.top}
      width={plotW}
      height={plotH}
      fill="transparent"
      className="draft-scatter-plot-hit"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onMouseDown={handlePlotMouseDown}
      onDoubleClick={resetZoom}
      onClick={e => { if (!e.ctrlKey && !e.shiftKey && !e.metaKey) resetHiddenEqs(); }}
    />
  );

  const svgOverlays = (
    <>
      {tooltip && (
        <>
          <rect x={tipX} y={tipY} width={94} height={52} rx={4}
            fill="#0f172a" stroke="#334155" strokeWidth="1" />
          <text x={tipX + 8} y={tipY + 15} fontSize="10" fill={eqColors[tooltip.pt.eq] ?? '#94a3b8'} fontWeight="700">
            {tooltip.pt.eq}
          </text>
          <text x={tipX + 8} y={tipY + 27} fontSize="9" fill="#94a3b8">{tooltip.pt.date}</text>
          <text x={tipX + 8} y={tipY + 39} fontSize="9" fill="#94a3b8">A: {tooltip.pt.x}</text>
          <text x={tipX + 50} y={tipY + 39} fontSize="9" fill="#94a3b8">B: {tooltip.pt.y}</text>
        </>
      )}
      {selOverlay?.type === 'rect' && (
        <rect x={selOverlay.x} y={selOverlay.y} width={selOverlay.w} height={selOverlay.h}
          fill="rgba(100,150,255,0.08)" stroke="#6496ff" strokeWidth={1.5}
          strokeDasharray="4,4" pointerEvents="none" />
      )}
      {selOverlay?.type === 'lasso' && (
        <polyline points={selOverlay.pts}
          fill="rgba(249,115,22,0.06)" stroke="#f97316" strokeWidth={1.5}
          pointerEvents="none" />
      )}
    </>
  );

  return (
    <ChartCard
      title="Scatter 차트(Trail)"
      chartHeight={chartHeight}
      controlsVisible={controlsVisible}
      toggleControls={toggleControls}
      onReset={resetAll}
      resetDimmed={!isModified}
      showPopout
      extraActions={
        <button type="button" className={`draft-chip-btn${show3D ? ' draft-chip-btn--active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_3D' })} title="3D 보기 전환">3D</button>
      }
    >
      {controlsVisible && <div className="draft-chart-controls">
        <PeriodSelect value={periodDays} onChange={setPeriodDays} allLast />
        <div className="draft-slider-row">
          <span className="draft-slider-label">크기</span>
          <div className="draft-slider-group">
            <input type="range" min={0} max={10} step={0.5} value={dotSizeMin}
              onChange={e => dispatch({ type: 'SET_DOT_SIZE_MIN', v: Number(e.target.value) })}
              onDoubleClick={() => { dispatch({ type: 'SET_DOT_SIZE_MIN', v: SCATTER_TRAIL_SIZE_MIN }); dispatch({ type: 'SET_DOT_SIZE_MAX', v: SCATTER_TRAIL_SIZE_MAX }); }}
              title={`최소 크기: ${dotSizeMin} (더블클릭: 초기화)`} className="draft-slider-range" />
            <input type="range" min={0} max={10} step={0.5} value={dotSizeMax}
              onChange={e => dispatch({ type: 'SET_DOT_SIZE_MAX', v: Number(e.target.value) })}
              onDoubleClick={() => { dispatch({ type: 'SET_DOT_SIZE_MIN', v: SCATTER_TRAIL_SIZE_MIN }); dispatch({ type: 'SET_DOT_SIZE_MAX', v: SCATTER_TRAIL_SIZE_MAX }); }}
              title={`최대 크기: ${dotSizeMax} (더블클릭: 초기화)`} className="draft-slider-range" />
          </div>
          <span className="draft-slider-value">{dotSizeMin}–{dotSizeMax}</span>
        </div>
        <div className="draft-slider-row">
          <span className="draft-slider-label">투명도</span>
          <div className="draft-slider-group">
            <input type="range" min={0} max={1} step={0.05} value={opacityMin}
              onChange={e => dispatch({ type: 'SET_OPACITY_MIN', v: Number(e.target.value) })}
              onDoubleClick={() => { dispatch({ type: 'SET_OPACITY_MIN', v: SCATTER_TRAIL_OPACITY_MIN }); dispatch({ type: 'SET_OPACITY_MAX', v: SCATTER_TRAIL_OPACITY_MAX }); }}
              title={`최소 투명도: ${opacityMin} (더블클릭: 초기화)`} className="draft-slider-range" />
            <input type="range" min={0} max={1} step={0.05} value={opacityMax}
              onChange={e => dispatch({ type: 'SET_OPACITY_MAX', v: Number(e.target.value) })}
              onDoubleClick={() => { dispatch({ type: 'SET_OPACITY_MIN', v: SCATTER_TRAIL_OPACITY_MIN }); dispatch({ type: 'SET_OPACITY_MAX', v: SCATTER_TRAIL_OPACITY_MAX }); }}
              title={`최대 투명도: ${opacityMax} (더블클릭: 초기화)`} className="draft-slider-range" />
          </div>
          <span className="draft-slider-value">{opacityMin}–{opacityMax}</span>
        </div>
        <div className="draft-slider-row">
          <span className="draft-slider-label">선</span>
          <input type="range" min={0} max={1} step={0.05} value={lineOpacityVal}
            onChange={e => dispatch({ type: 'SET_LINE_OPACITY', v: Number(e.target.value) })}
            onDoubleClick={() => dispatch({ type: 'SET_LINE_OPACITY', v: SCATTER_TRAIL_LINE_OPACITY })}
            title={`선 투명도: ${lineOpacityVal} (더블클릭: 초기화)`} className="draft-slider-range draft-slider-range--single" />
          <span className="draft-slider-value">{lineOpacityVal}</span>
        </div>
      </div>}

      {show3D ? (
        <XYScatter3D pts={allPts} dates={dates} hiddenEqs={hiddenEqs} />
      ) : (
      <div ref={svgWrapRef} className="draft-chart-wrap"
        onMouseEnter={() => { isHoveringChart.current = true; }}
        onMouseLeave={() => { isHoveringChart.current = false; }}>
      <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH}
        className={`draft-chart-svg draft-chart-touch${isPanning ? ' draft-chart-svg--panning' : ''}`}
        style={{
          userSelect: 'none',
          display: 'block',
          cursor: selOverlay ? 'crosshair' : undefined,
        }}
        onMouseLeave={() => dispatch({ type: 'SET_TOOLTIP', tooltip: null })}>
        {svgGridAxes}
        {svgPlotHit}
        {svgDataLayer}
        {isPanning && (
          <rect
            x={XY_PAD.left}
            y={XY_PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            pointerEvents="all"
            className="draft-scatter-plot-hit"
            style={{ cursor: 'grabbing' }}
          />
        )}
        {svgOverlays}
      </svg>
      </div>
      )}

      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
      {controlsVisible && timelineDates.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying}
          playSpeed={playSpeed}
          sliderIdx={localIdx}
          maxIdx={timelineMaxIdx}
          startDate={timelineStart}
          currentDate={selectedDate}
          onPlay={onPlay}
          onSpeedChange={setPlaySpeed}
          onSlider={setLocalIdx}
        />
      )}
    </ChartCard>
  );
}
