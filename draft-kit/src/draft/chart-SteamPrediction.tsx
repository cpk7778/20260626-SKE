import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STEAM_PRED_DATA, type SteamPredPoint } from './data-draft';
import {
  EqColorContext,
  ShapDateCtx,
  useChartControls,
  useContainerSize,
  useEqVisibility,
  useLineChartWheelRef,
  ChartTimeline,
  PeriodSelect,
  scaleLinearY,
  genTicks,
  wheelHitSvgPlot,
  linearRegression,
} from './shared';
import { DraftDragHandle } from './ui';

// ── Steam Prediction 라인 차트 ─────────────────────────────────────────────
/** Actual·Pred 시계열 색 / MAE·RMSE 밴드는 EQ 색(채움) + 얇은 외곽선 */
const STEAM_ACTUAL_LINE_COLOR = '#34d399';
const STEAM_PRED_LINE_COLOR = '#38bdf8';
const STEAM_BAND_STROKE = { width: 0.5, rmseOpacity: 0.18, maeOpacity: 0.32, bothRmseOpacity: 0.16 };

// Steam Prediction 차트 — MAE/RMSE 밴드, Slope·Center 오버레이, Actual/Pred 토글
export function SteamPredictionChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const { hiddenEqs } = useEqVisibility(['전체']);
  const { periodDays, setPeriodDays, idx: localIdx, setIdx: setLocalIdx } = useContext(ShapDateCtx);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(800);
  const [yRange, setYRange] = useState<{ min: number; max: number } | null>(null);
  const [xViewRange, setXViewRange] = useState<{ start: number; end: number } | null>(() => {
    const N = STEAM_PRED_DATA.length;
    return N > 14 ? { start: (N - 14) / (N - 1), end: 1 } : null;
  });
  const [hoverLocalIdx, setHoverLocalIdx] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [showMAE, setShowMAE] = useState(true);
  const [showRMSE, setShowRMSE] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const [showPred, setShowPred] = useState(true);
  const [showSlope, setShowSlope] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const yAxisDragRef = useRef<{ startY: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const xPanRef = useRef<{ startX: number; visStart: number; visEnd: number; plotW: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const eqs = ['전체'];

  const isZoomed = yRange !== null;
  const isModified = useMemo(() =>
    isZoomed || isPlaying || showSlope || showCenter || showMAE || showRMSE || !showActual || !showPred || periodDays !== 14,
  [isZoomed, isPlaying, showSlope, showCenter, showMAE, showRMSE, showActual, showPred, periodDays]);
  const resetControls = () => {
    const N = STEAM_PRED_DATA.length;
    setPeriodDays(14); setIsPlaying(false); setYRange(null);
    setXViewRange(N > 14 ? { start: (N - 14) / (N - 1), end: 1 } : null);
    setShowSlope(false); setShowCenter(false); setShowMAE(false); setShowRMSE(false);
    setShowActual(true); setShowPred(true);
  };

  const allDates = useMemo(() => STEAM_PRED_DATA.map(d => d.date), []);

  // byEq: EqLegend·설비 호버 공용 구조에 맞게 eq별로 배열화 (현재 STEAM_PRED_DATA는 단일 계열)
  const byEq = useMemo(() => {
    const dateIdx = new Map<string, SteamPredPoint>();
    for (const pt of STEAM_PRED_DATA) dateIdx.set(pt.date, pt);
    const map = new Map<string, { actual: number[]; pred: number[]; maeLower: number[]; maeUpper: number[]; rmseLower: number[]; rmseUpper: number[] }>();
    eqs.forEach(eq => {
      if (hiddenEqs.has(eq)) return;
      const actual: number[] = [], pred: number[] = [];
      const maeLower: number[] = [], maeUpper: number[] = [];
      const rmseLower: number[] = [], rmseUpper: number[] = [];
      for (const date of allDates) {
        const pt = dateIdx.get(date);
        if (pt) {
          actual.push(pt.actual); pred.push(pt.pred);
          maeLower.push(pt.maeLower); maeUpper.push(pt.maeUpper);
          rmseLower.push(pt.rmseLower); rmseUpper.push(pt.rmseUpper);
        }
      }
      map.set(eq, { actual, pred, maeLower, maeUpper, rmseLower, rmseUpper });
    });
    return map;
  }, [hiddenEqs, allDates]);

  const n = allDates.length;
  const visStart = xViewRange?.start ?? 0;
  const visEnd = xViewRange?.end ?? 1;
  const visStartIdx = n <= 1 ? 0 : Math.round(visStart * (n - 1));
  const visEndIdx = n <= 1 ? 0 : Math.round(visEnd * (n - 1));

  const slopeRegs = useMemo(() => {
    if (!showSlope) return null;
    const fvi = visStartIdx;
    const lvi = visEndIdx;
    const map = new Map<string, {
      actual: ReturnType<typeof linearRegression>;
      pred: ReturnType<typeof linearRegression>;
      i0: number;
      i1: number;
    }>();
    byEq.forEach(({ actual, pred }, eq) => {
      const indices: number[] = [];
      const actVals: number[] = [];
      const predVals: number[] = [];
      for (let i = fvi; i <= lvi; i++) {
        if (i >= actual.length) continue;
        indices.push(i);
        actVals.push(actual[i]);
        predVals.push(pred[i]);
      }
      map.set(eq, {
        actual: actVals.length >= 2 ? linearRegression(indices, actVals) : null,
        pred: predVals.length >= 2 ? linearRegression(indices, predVals) : null,
        i0: indices[0] ?? fvi,
        i1: indices[indices.length - 1] ?? lvi,
      });
    });
    return map;
  }, [showSlope, byEq, visStartIdx, visEndIdx]);

  const centerMeans = useMemo(() => {
    if (!showCenter) return null;
    const fvi = visStartIdx;
    const lvi = visEndIdx;
    const mean = (arr: number[]) => {
      const slice = arr.slice(fvi, lvi + 1);
      return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    };
    const map = new Map<string, { actual: number; pred: number }>();
    byEq.forEach(({ actual, pred }, eq) => map.set(eq, { actual: mean(actual), pred: mean(pred) }));
    return map;
  }, [showCenter, byEq, visStartIdx, visEndIdx]);

  const allVals = useMemo(() => [...byEq.values()].flatMap(({ actual, pred }) => [...actual, ...pred]), [byEq]);
  const yRawMin = allVals.length ? Math.min(...allVals) : 0;
  const yRawMax = allVals.length ? Math.max(...allVals) : 100;
  const yDataPad = (yRawMax - yRawMin) * 0.08;
  const yDataMin = yRawMin - yDataPad;
  const yDataMax = yRawMax + yDataPad;

  const padTop   = showSlope  ? 42 : 18;
  const padRight = showCenter ? 52 : 16;
  const PAD = { top: padTop, right: padRight, bottom: 36, left: 40 };
  const plotW = Math.max(10, size.w - PAD.left - PAD.right);
  const plotH = Math.max(10, size.h - PAD.top - PAD.bottom);
  const visRange = Math.max(visEnd - visStart, 1e-6);
  const activeYMin = yRange?.min ?? yDataMin;
  const activeYMax = yRange?.max ?? yDataMax;
  const activeYRange = Math.max(activeYMax - activeYMin, 1e-6);

  const wheelStateRef = useLineChartWheelRef({
    plotLeft: PAD.left, plotTop: PAD.top, plotW, plotH, svgW: size.w, svgH: size.h,
    visStart, visEnd, datesLen: n,
    activeYMin, activeYMax, activeYRange, globalMin: yDataMin, globalMax: yDataMax,
  });

  useEffect(() => {
    setYRange(null);
    setLocalIdx(n - 1);
    if (periodDays <= 0 || periodDays >= n || n <= 1) setXViewRange(null);
    else setXViewRange({ start: (n - periodDays) / (n - 1), end: 1 });
  }, [periodDays, n, setLocalIdx]); // eslint-disable-line react-hooks/exhaustive-deps — setXViewRange/setYRange은 안정적 setter

  useEffect(() => {
    if (!isPlaying) return;
    if (localIdx >= visEndIdx) { setIsPlaying(false); return; }
    const timer = setTimeout(() => setLocalIdx(i => Math.min(i + 1, visEndIdx)), playSpeed);
    return () => clearTimeout(timer);
  }, [isPlaying, localIdx, playSpeed, visEndIdx]);

  useEffect(() => {
    if (!showActual && !showPred) { setShowActual(true); setShowPred(true); }
  }, [showActual, showPred]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY / 420);
      if (e.shiftKey) {
        const { activeYMin: yMn, activeYMax: yMx, globalMin: gMin, globalMax: gMax } = st;
        const center = (yMn + yMx) / 2;
        const nr = Math.max((yMx - yMn) * factor, Math.max((gMax - gMin) * 0.02, 1e-6));
        setYRange({ min: center - nr / 2, max: center + nr / 2 });
      } else {
        const { visStart: vs, visEnd: ve, plotW: pw, plotLeft: pl, datesLen: dn } = st;
        const rect = svg.getBoundingClientRect();
        const mouseRelX = Math.max(0, Math.min(pw, e.clientX - rect.left - pl));
        const fracAtMouse = vs + (mouseRelX / pw) * (ve - vs);
        const curRange = ve - vs;
        const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(dn - 1, 1));
        let ns = fracAtMouse - (fracAtMouse - vs) / curRange * newRange;
        let ne = ns + newRange;
        if (ns < 0) { ne -= ns; ns = 0; }
        if (ne > 1) { ns -= (ne - 1); ne = 1; }
        ns = Math.max(0, ns); ne = Math.min(1, ne);
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      }
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — wheelStateRef로 최신값 접근

  const xSc = (i: number) => {
    const frac = n <= 1 ? 0 : i / (n - 1);
    return PAD.left + ((frac - visStart) / visRange) * plotW;
  };
  const ySc = (v: number) => scaleLinearY(v, activeYMin, activeYMax, PAD.top, plotH);

  const yScA = (_eq: string, v: number) => ySc(v);
  const yScP = (_eq: string, v: number) => ySc(v);

  const xTickIdxs = useMemo(() => {
    const fvi = Math.max(0, Math.floor(visStart * (n - 1)) - 1);
    const lvi = Math.min(n - 1, Math.ceil(visEnd * (n - 1)) + 1);
    const vc = lvi - fvi + 1;
    const step = Math.max(1, Math.ceil(vc / 6));
    const idxs: number[] = [];
    for (let i = fvi; i <= lvi; i += step) idxs.push(i);
    if (idxs.length > 0 && idxs[idxs.length - 1] !== lvi) idxs.push(lvi);
    return idxs;
  }, [n, visStart, visEnd]);
  const yTicks = genTicks(activeYMin, activeYMax, 5);

  const svgMX = (e: React.MouseEvent) => { const r = svgRef.current!.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * size.w; };
  const mxToLocalIdx = (mx: number) => {
    const frac = (mx - PAD.left) / plotW * visRange + visStart;
    return Math.max(0, Math.min(n - 1, Math.round(frac * Math.max(n - 1, 1))));
  };

  const selectedDate = allDates[localIdx] ?? '';
  const selectedLocalIdx = localIdx;

  const startYAxisDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const startMin = yRange?.min ?? yDataMin;
    const startMax = yRange?.max ?? yDataMax;
    const minRange = Math.max((startMax - startMin) * 0.02, 1e-6);
    const isPan = e.shiftKey || e.button === 2;
    yAxisDragRef.current = { startY: e.clientY, startMin, startMax, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!yAxisDragRef.current) return;
        const { startY, startMin: dMin, startMax: dMax, minRange: mr } = yAxisDragRef.current;
        let nextMin: number, nextMax: number;
        if (isPan) {
          const shift = ((ev.clientY - startY) / plotH) * (dMax - dMin);
          nextMin = dMin + shift;
          nextMax = dMax + shift;
        } else {
          const factor = Math.exp((ev.clientY - startY) / 160);
          const center = (dMin + dMax) / 2;
          const nr = Math.max((dMax - dMin) * factor, mr);
          nextMin = center - nr / 2;
          nextMax = center + nr / 2;
        }
        setYRange({ min: nextMin, max: nextMax });
      });
    };
    const onUp = () => { if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; } yAxisDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const ds = dragStartRef.current;
    if (ds && (Math.abs(e.clientX - ds.x) > 5 || Math.abs(e.clientY - ds.y) > 5)) return;
    const gi = mxToLocalIdx(svgMX(e));
    if (gi >= 0) setLocalIdx(gi);
  };

  // X축 영역 드래그: 패닝 + mouseup 시 이동 거리 5px 미만이면 클릭으로 처리해 타임라인 점프
  const startPan = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    const { visStart: vs, visEnd: ve, plotW: pw } = wheelStateRef.current;
    xPanRef.current = { startX: e.clientX, visStart: vs, visEnd: ve, plotW: pw };
    setIsPanning(true);
    let rafId: number | null = null;
    let didPan = false;
    const onMove = (ev: MouseEvent) => {
      if (!xPanRef.current || rafId !== null) return;
      if (dragStartRef.current && Math.abs(ev.clientX - dragStartRef.current.x) > 5) didPan = true;
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
    const onUp = (ev: MouseEvent) => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!didPan && e.button === 0 && dragStartRef.current && svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        const mx = ((ev.clientX - r.left) / r.width) * size.w;
        const gi = mxToLocalIdx(mx);
        if (gi >= 0) setLocalIdx(gi);
      }
      xPanRef.current = null;
      dragStartRef.current = null;
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>Steam Prediction</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`}
            onClick={resetControls} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} />
          <button className={`draft-chip-btn${showSlope ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowSlope(v => !v)}>Slope</button>
          <button className={`draft-chip-btn${showCenter ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowCenter(v => !v)}>Center</button>
          <button className={`draft-chip-btn${showMAE ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowMAE(v => !v)}>MAE</button>
          <button className={`draft-chip-btn${showRMSE ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowRMSE(v => !v)}>RMSE</button>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg draft-chart-touch" width={size.w} height={size.h}
          style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
          onMouseMove={e => { if (!isPanning) setHoverLocalIdx(mxToLocalIdx(svgMX(e))); }}
          onMouseLeave={() => setHoverLocalIdx(null)}
          onClick={handleClick}
          onDoubleClick={() => { setYRange(null); setXViewRange(null); }}>
          <defs>
            <clipPath id="steam-pred-clip">
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#0b1929" opacity={0.5}
            onMouseDown={startPan}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }} />
          <g onMouseDown={startYAxisDrag} onContextMenu={ev => ev.preventDefault()}
            onDoubleClick={e => { e.stopPropagation(); setYRange(null); }}
            style={{ cursor: 'ns-resize' }}>
            <rect x={0} y={PAD.top} width={PAD.left} height={plotH} fill="transparent" />
            {yTicks.map(v => {
              const y = ySc(v);
              return (
                <g key={v}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize="9" fill="#64748b">{Math.round(v)}</text>
                </g>
              );
            })}
          </g>
          <text className="draft-pal-y-axis-title"
            transform={`translate(10,${PAD.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle">Steam (t/h)</text>
          <g style={{ cursor: 'default' }}>
            <rect x={PAD.left} y={PAD.top + plotH} width={plotW} height={PAD.bottom} fill="transparent" />
            {xTickIdxs.map(idx => {
              const x = xSc(idx);
              if (x < PAD.left - 0.5 || x > PAD.left + plotW + 0.5) return null;
              return (
                <g key={idx}>
                  <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + plotH} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={x} y={PAD.top + plotH + 12} textAnchor="middle"
                    fontSize="9" fill="#64748b">{allDates[idx]?.slice(5)}</text>
                </g>
              );
            })}
          </g>
          <g clipPath="url(#steam-pred-clip)">
            {/* RMSE·MAE 동시 표시 시 fillRule=evenodd로 MAE 내부를 구멍 뚫어 시각 분리 */}
            {(showMAE || showRMSE) && [...byEq.entries()].map(([eq, { maeLower, maeUpper, rmseLower, rmseUpper }]) => {
              const bandCol = eqColors[eq] ?? '#60a5fa';
              if (!maeLower.length) return null;
              const toBandPath = (lo: number[], hi: number[]) => {
                const fwd = hi.map((v, i) => `${xSc(i).toFixed(1)},${yScA(eq, v).toFixed(1)}`);
                const rev = [...lo].reverse().map((v, i, arr) => `${xSc(arr.length - 1 - i).toFixed(1)},${yScA(eq, v).toFixed(1)}`);
                return `M ${fwd[0]} L ${fwd.slice(1).join(' L ')} L ${rev.join(' L ')} Z`;
              };
              const both = showMAE && showRMSE;
              const { width: sw, rmseOpacity, maeOpacity, bothRmseOpacity } = STEAM_BAND_STROKE;
              return (
                <g key={`band-${eq}`} style={{ pointerEvents: 'none' }}>
                  {showRMSE && both && (
                    <path d={`${toBandPath(rmseLower, rmseUpper)} ${toBandPath(maeLower, maeUpper)}`}
                      fill={bandCol} fillOpacity={0.15} fillRule="evenodd"
                      stroke={bandCol} strokeWidth={sw} strokeOpacity={bothRmseOpacity} />
                  )}
                  {showRMSE && !both && (
                    <path d={toBandPath(rmseLower, rmseUpper)}
                      fill={bandCol} fillOpacity={0.13}
                      stroke={bandCol} strokeWidth={sw} strokeOpacity={rmseOpacity} />
                  )}
                  {showMAE && (
                    <path d={toBandPath(maeLower, maeUpper)}
                      fill={bandCol} fillOpacity={0.28}
                      stroke={bandCol} strokeWidth={sw} strokeOpacity={maeOpacity} />
                  )}
                </g>
              );
            })}
            {[...byEq.entries()].map(([eq, { actual, pred }]) => {
              const predCol = STEAM_PRED_LINE_COLOR;
              const actualCol = STEAM_ACTUAL_LINE_COLOR;
              const ptA = actual.map((v, i) => `${xSc(i).toFixed(1)},${yScA(eq, v).toFixed(1)}`).join(' ');
              const ptP = pred.map((v, i) => `${xSc(i).toFixed(1)},${yScP(eq, v).toFixed(1)}`).join(' ');
              return (
                <g key={eq}>
                  {showActual && <polyline points={ptA} fill="none" stroke={actualCol} strokeWidth={1.5} opacity={0.9} />}
                  {showPred && <polyline points={ptP} fill="none" stroke={predCol} strokeWidth={1.5} opacity={0.85} />}
                  {showActual && actual.map((v, i) => {
                    const cx = xSc(i);
                    const cy = yScA(eq, v);
                    if (cx < PAD.left - 6 || cx > PAD.left + plotW + 6) return null;
                    const sel = i === selectedLocalIdx;
                    return (
                      <circle key={`act-${i}`} cx={cx} cy={cy} r={sel ? 5 : 3}
                        fill={actualCol} stroke={sel ? '#fff' : '#0b1929'} strokeWidth={sel ? 1.2 : 1}
                        opacity={sel ? 1 : 0.9} style={{ pointerEvents: 'none' }} />
                    );
                  })}
                </g>
              );
            })}
            {showCenter && centerMeans && [...byEq.keys()].map(eq => {
              const cm = centerMeans.get(eq);
              if (!cm) return null;
              return (
                <g key={`center-${eq}`} style={{ pointerEvents: 'none' }}>
                  {showActual && <line x1={PAD.left} y1={yScA(eq, cm.actual)} x2={PAD.left + plotW} y2={yScA(eq, cm.actual)}
                    stroke={STEAM_ACTUAL_LINE_COLOR} strokeWidth={1} opacity={0.65} strokeDasharray="4 2" />}
                  {showPred && <line x1={PAD.left} y1={yScP(eq, cm.pred)} x2={PAD.left + plotW} y2={yScP(eq, cm.pred)}
                    stroke={STEAM_PRED_LINE_COLOR} strokeWidth={1} opacity={0.5} strokeDasharray="4 2" />}
                </g>
              );
            })}
            {showSlope && slopeRegs && [...byEq.keys()].map(eq => {
              const predCol = STEAM_PRED_LINE_COLOR;
              const sr = slopeRegs.get(eq);
              if (!sr || (!sr.actual && !sr.pred)) return null;
              const { i0, i1 } = sr;
              return (
                <g key={`slope-${eq}`} style={{ pointerEvents: 'none' }}>
                  {showActual && sr.actual && (
                    <line x1={xSc(i0)} y1={yScA(eq, sr.actual.m * i0 + sr.actual.b)}
                      x2={xSc(i1)} y2={yScA(eq, sr.actual.m * i1 + sr.actual.b)}
                      stroke={STEAM_ACTUAL_LINE_COLOR} strokeWidth={1.5} opacity={0.75} strokeDasharray="8 3" />
                  )}
                  {showPred && sr.pred && (
                    <line x1={xSc(i0)} y1={yScP(eq, sr.pred.m * i0 + sr.pred.b)}
                      x2={xSc(i1)} y2={yScP(eq, sr.pred.m * i1 + sr.pred.b)}
                      stroke={predCol} strokeWidth={1.5} opacity={0.4} strokeDasharray="8 3" />
                  )}
                </g>
              );
            })}
            {selectedLocalIdx >= 0 && (
              <line x1={xSc(selectedLocalIdx)} y1={PAD.top} x2={xSc(selectedLocalIdx)} y2={PAD.top + plotH}
                stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} />
            )}
            {hoverLocalIdx !== null && hoverLocalIdx !== selectedLocalIdx && (
              <line x1={xSc(hoverLocalIdx)} y1={PAD.top} x2={xSc(hoverLocalIdx)} y2={PAD.top + plotH}
                stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
            )}
          </g>
          {selectedLocalIdx >= 0 && (() => {
            const x = Math.max(PAD.left + 14, Math.min(PAD.left + plotW - 14, xSc(selectedLocalIdx)));
            return <text x={x} y={PAD.top - 4} textAnchor="middle" fontSize="9" fill="#f59e0b">{selectedDate?.slice(5)}</text>;
          })()}
          {showSlope && slopeRegs && (() => {
            const sr = slopeRegs.get('전체');
            if (!sr) return null;
            const fmtM = (m: number) =>
              Math.abs(m) < 0.01 || Math.abs(m) >= 1000 ? m.toExponential(2) : (m >= 0 ? '+' : '') + m.toFixed(3);
            const rows: Array<{ label: string; reg: NonNullable<typeof sr.actual>; opacity: number; fill: string }> = [];
            if (sr.actual) rows.push({ label: 'Actual', reg: sr.actual, opacity: 0.95, fill: STEAM_ACTUAL_LINE_COLOR });
            if (sr.pred)   rows.push({ label: 'Pred',   reg: sr.pred,   opacity: 0.85, fill: STEAM_PRED_LINE_COLOR });
            return (
              <g style={{ pointerEvents: 'none' }}>
                {rows.map((r, li) => (
                  <text key={r.label}
                    x={PAD.left + plotW - 6} y={18 + li * 12}
                    textAnchor="end" className="draft-pal-gap-value" fill={r.fill} opacity={r.opacity}>
                    {r.label} m={fmtM(r.reg.m)} R²={r.reg.r2.toFixed(3)}
                  </text>
                ))}
              </g>
            );
          })()}
          {showCenter && centerMeans && (() => {
            const cm = centerMeans.get('전체');
            if (!cm) return null;
            const labelX = PAD.left + plotW + 6;
            const items = [
              { key: 'actual', text: `μA=${Math.round(cm.actual)}`, cy: ySc(cm.actual), opacity: 0.95, fill: STEAM_ACTUAL_LINE_COLOR },
              { key: 'pred',   text: `μP=${Math.round(cm.pred)}`,   cy: ySc(cm.pred),   opacity: 0.85, fill: STEAM_PRED_LINE_COLOR },
            ];
            const MIN_DY = 12;
            const laid = [...items].sort((a, b) => a.cy - b.cy);
            for (let i = 1; i < laid.length; i++) {
              if (laid[i].cy - laid[i - 1].cy < MIN_DY)
                laid[i] = { ...laid[i], cy: laid[i - 1].cy + MIN_DY };
            }
            return (
              <g style={{ pointerEvents: 'none' }}>
                {laid.map(({ key, text, cy, opacity, fill }) => (
                  <g key={key}>
                    <line x1={PAD.left + plotW} y1={cy} x2={labelX - 3} y2={cy}
                      stroke={fill} strokeWidth={0.8} opacity={0.35} />
                    <text x={labelX} y={cy} className="draft-pal-gap-value" fill={fill}
                      opacity={opacity} dominantBaseline="middle">{text}</text>
                  </g>
                ))}
              </g>
            );
          })()}
          <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#334155" strokeWidth={1} />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#334155" strokeWidth={1} />
        </svg>
      </div>
      <div className="draft-legend">
        {(() => {
          const bandCol = eqColors['전체'] ?? '#60a5fa';
          const actualCol = STEAM_ACTUAL_LINE_COLOR;
          const predCol = STEAM_PRED_LINE_COLOR;
          const { width: bandSw, maeOpacity, rmseOpacity } = STEAM_BAND_STROKE;
          return (
            <>
              <button type="button"
                className={`draft-legend-item${!showActual ? ' draft-legend-item--hidden' : ''}`}
                onClick={() => {
                  if (showActual && !showPred) { setShowActual(true); setShowPred(true); }
                  else { setShowActual(v => !v); }
                }}>
                <svg width="16" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="16" y2="4" stroke={!showActual ? '#334155' : actualCol} strokeWidth="1.5" />
                  <circle cx="8" cy="4" r="2" fill={!showActual ? '#334155' : actualCol} />
                </svg>
                Actual
              </button>
              <button type="button"
                className={`draft-legend-item${!showPred ? ' draft-legend-item--hidden' : ''}`}
                onClick={() => {
                  if (!showActual && showPred) { setShowActual(true); setShowPred(true); }
                  else { setShowPred(v => !v); }
                }}>
                <svg width="16" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="16" y2="4" stroke={!showPred ? '#334155' : predCol} strokeWidth="1.5" />
                </svg>
                Pred
              </button>
              <button type="button"
                className={`draft-legend-item${!showMAE ? ' draft-legend-item--hidden' : ''}`}
                onClick={() => setShowMAE(v => !v)}>
                <svg width="16" height="8" aria-hidden>
                  <rect x="0" y="1" width="16" height="6"
                    fill={!showMAE ? '#334155' : bandCol} fillOpacity={!showMAE ? 0.3 : 0.28}
                    stroke={!showMAE ? '#334155' : bandCol} strokeWidth={bandSw} strokeOpacity={!showMAE ? 0.3 : maeOpacity} />
                </svg>
                MAE
              </button>
              <button type="button"
                className={`draft-legend-item${!showRMSE ? ' draft-legend-item--hidden' : ''}`}
                onClick={() => setShowRMSE(v => !v)}>
                <svg width="16" height="8" aria-hidden>
                  <rect x="0" y="1" width="16" height="6"
                    fill={!showRMSE ? '#334155' : bandCol} fillOpacity={!showRMSE ? 0.15 : 0.13}
                    stroke={!showRMSE ? '#334155' : bandCol} strokeWidth={bandSw} strokeOpacity={!showRMSE ? 0.15 : rmseOpacity} />
                </svg>
                RMSE
              </button>
            </>
          );
        })()}
      </div>
      {controlsVisible && n > 1 && (
        <ChartTimeline
          isPlaying={isPlaying} playSpeed={playSpeed}
          sliderIdx={Math.max(0, localIdx - visStartIdx)}
          maxIdx={Math.max(1, visEndIdx - visStartIdx)}
          startDate={allDates[visStartIdx] ?? ''}
          currentDate={selectedDate}
          onPlay={() => {
            if (isPlaying) { setIsPlaying(false); return; }
            if (localIdx >= visEndIdx) setLocalIdx(visStartIdx);
            setIsPlaying(true);
          }}
          onSpeedChange={setPlaySpeed}
          onSlider={v => { setIsPlaying(false); setLocalIdx(visStartIdx + v); }}
        />
      )}
    </div>
  );
}

