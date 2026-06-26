/** 휠·터치·드래그 인터랙션 hook */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  wheelHitSvgPlot,
  hitSvgPlotFromClient,
  touchPairDist,
  touchPairMid,
  applyXViewZoom,
} from './interactionHelpers';

export * from './interactionHelpers';
export * from './scatterSelection';

/** PredActualLine / SteamPrediction 두 차트가 공유하는 wheelStateRef 패턴 */
export interface LineWheelState {
  plotLeft: number; plotTop: number; plotW: number; plotH: number;
  svgW: number; svgH: number;
  visStart: number; visEnd: number; datesLen: number;
  activeYMin: number; activeYMax: number; activeYRange: number;
  globalMin: number; globalMax: number;
}
// wheel 이벤트 핸들러가 최신 레이아웃 수치를 클로저 없이 읽도록 ref에 매 렌더 동기화
export function useLineChartWheelRef(state: LineWheelState) {
  const ref = useRef<LineWheelState>(state);
  ref.current = state;
  return ref;
}

/** XYLineChart / HexTrendCard — 멀티 Y축 라인 차트의 wheelStateRef 공통 형태 */
export interface MultiAxisWheelState {
  visStart: number; visEnd: number; plotW: number; plotH: number;
  totalLeft: number; datesLen: number; scaled: boolean;
  activeSeriesInfo: { key: string; axisMin: number; axisMax: number; axisRange: number }[];
  axisTypes: string[];
  activeGlobalMin: number; activeGlobalMax: number;
  globalMin: number; globalMax: number;
  plotTop: number; svgW: number; svgH: number;
}

/** Y축 드래그 핸들러가 진행 중인 드래그 상태를 저장하는 ref 형태 */
export interface AxisDragState {
  mode: 'single' | 'multi'; key?: string;
  startY: number; startMin: number; startMax: number; minRange: number;
}

/**
 * XYLineChart / HexTrendCard 공통 — 휠 줌 이벤트 핸들러
 * 일반 scroll: X축 뷰 이동/줌, Shift+scroll: Y축 줌
 */
export function useMultiAxisWheelZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  wheelStateRef: React.MutableRefObject<MultiAxisWheelState>,
  setXViewRange: (r: { start: number; end: number } | null) => void,
  setSingleAxisRange: (r: { min: number; max: number }) => void,
  setMultiAxisRanges: React.Dispatch<React.SetStateAction<Record<string, { min: number; max: number }>>>,
): void {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.totalLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY / 420);
      if (e.shiftKey) {
        if (st.scaled) {
          setMultiAxisRanges(() => {
            const next: Record<string, { min: number; max: number }> = {};
            st.axisTypes.forEach(axisType => {
              const typeSeries = st.activeSeriesInfo.filter(sr => sr.key.endsWith(`:${axisType}`));
              if (!typeSeries.length) return;
              const { axisMin, axisMax, axisRange } = typeSeries[0];
              const center = (axisMin + axisMax) / 2;
              const nr = Math.max((axisMax - axisMin) * factor, Math.max(axisRange * 0.02, 1e-6));
              next[axisType] = { min: center - nr / 2, max: center + nr / 2 };
            });
            return next;
          });
        } else {
          const center = (st.activeGlobalMin + st.activeGlobalMax) / 2;
          const nr = Math.max(
            (st.activeGlobalMax - st.activeGlobalMin) * factor,
            Math.max((st.globalMax - st.globalMin) * 0.02, 1e-6),
          );
          setSingleAxisRange({ min: center - nr / 2, max: center + nr / 2 });
        }
      } else {
        const rect = svg.getBoundingClientRect();
        const mouseRelX = Math.max(0, Math.min(st.plotW, e.clientX - rect.left - st.totalLeft));
        const fracAtMouse = st.visStart + (mouseRelX / st.plotW) * (st.visEnd - st.visStart);
        const curRange = st.visEnd - st.visStart;
        const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(st.datesLen - 1, 1));
        let ns = fracAtMouse - ((fracAtMouse - st.visStart) / curRange) * newRange;
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
  // setters는 React 보장 안정 참조; wheelStateRef.current를 이벤트마다 직접 읽어 stale closure 없이 최신 레이아웃 수치 접근
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * XYLineChart / HexTrendCard 공통 — 터치 pan/pinch 핸들러
 * 단일 터치: X축 pan, 두 손가락: X축 pinch 줌
 */
export function useLineTouchPan(
  svgRef: React.RefObject<SVGSVGElement | null>,
  wheelStateRef: React.MutableRefObject<MultiAxisWheelState>,
  plotW: number,
  plotH: number,
  setIsPanning: (v: boolean) => void,
  setXViewRange: (r: { start: number; end: number } | null) => void,
): void {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let panStart: { x: number; visStart: number; visEnd: number; plotW: number } | null = null;
    let pinchStart: { dist: number; visStart: number; visEnd: number; fracAt: number; datesLen: number } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const st = wheelStateRef.current;
        const t0 = e.touches[0], t1 = e.touches[1];
        const mid = touchPairMid(t0, t1);
        const { hit, mx } = hitSvgPlotFromClient(mid.x, mid.y, svg, st.totalLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH);
        if (!hit) return;
        e.preventDefault();
        panStart = null;
        const fracAt = st.visStart + ((mx - st.totalLeft) / st.plotW) * (st.visEnd - st.visStart);
        pinchStart = { dist: touchPairDist(t0, t1), visStart: st.visStart, visEnd: st.visEnd, fracAt, datesLen: st.datesLen };
        setIsPanning(false);
      } else if (e.touches.length === 1 && !pinchStart) {
        const st = wheelStateRef.current;
        const t = e.touches[0];
        const { hit } = hitSvgPlotFromClient(t.clientX, t.clientY, svg, st.totalLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH);
        if (!hit) return;
        panStart = { x: t.clientX, visStart: st.visStart, visEnd: st.visEnd, plotW: st.plotW };
        setIsPanning(true);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && pinchStart) {
        e.preventDefault();
        const dist = touchPairDist(e.touches[0], e.touches[1]);
        if (dist < 1e-3) return;
        const factor = pinchStart.dist / dist;
        setXViewRange(applyXViewZoom(pinchStart.fracAt, pinchStart.visStart, pinchStart.visEnd, factor, pinchStart.datesLen));
      } else if (e.touches.length === 1 && panStart && !pinchStart) {
        e.preventDefault();
        const vr = panStart.visEnd - panStart.visStart;
        const dFrac = -((e.touches[0].clientX - panStart.x) / panStart.plotW) * vr;
        let ns = panStart.visStart + dFrac;
        let ne = panStart.visEnd + dFrac;
        if (ns < 0) { ne -= ns; ns = 0; }
        if (ne > 1) { ns -= (ne - 1); ne = 1; }
        ns = Math.max(0, ns); ne = Math.min(1, ne);
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStart = null;
      if (e.touches.length < 1) { panStart = null; setIsPanning(false); }
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
  // wheelStateRef는 이벤트마다 직접 읽으므로 deps 불필요; SVG 크기(plotW·plotH) 변경 시만 핸들러 재등록
  }, [plotW, plotH]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * XYLineChart / HexTrendCard 공통 — Y축 드래그 핸들러 반환
 * 좌클릭: 줌, Shift+좌클릭 또는 우클릭: pan
 */
export function useYAxisDrag(
  axisDragRef: React.MutableRefObject<AxisDragState | null>,
  plotH: number,
  setSingleAxisRange: (r: { min: number; max: number }) => void,
  setMultiAxisRanges: React.Dispatch<React.SetStateAction<Record<string, { min: number; max: number }>>>,
): (e: React.MouseEvent, mode: 'single' | 'multi', min: number, max: number, key?: string) => void {
  return useCallback((e, mode, min, max, key) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const isPan = e.shiftKey || e.button === 2;
    const minRange = Math.max((max - min) * 0.02, 1e-6);
    axisDragRef.current = { mode, key, startY: e.clientY, startMin: min, startMax: max, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!axisDragRef.current) return;
        const { startY, startMin, startMax, minRange: mr } = axisDragRef.current;
        let nextMin: number, nextMax: number;
        if (isPan) {
          const shift = ((ev.clientY - startY) / plotH) * (startMax - startMin);
          nextMin = startMin + shift;
          nextMax = startMax + shift;
        } else {
          const factor = Math.exp((ev.clientY - startY) / 160);
          const center = (startMin + startMax) / 2;
          const nextRange = Math.max((startMax - startMin) * factor, mr);
          nextMin = center - nextRange / 2; nextMax = center + nextRange / 2;
        }
        if (mode === 'single') setSingleAxisRange({ min: nextMin, max: nextMax });
        else if (key) setMultiAxisRanges(prev => ({ ...prev, [key]: { min: nextMin, max: nextMax } }));
      });
    };
    const onUp = () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      axisDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  // setters는 React 보장 안정 참조; plotH만 클로저 계산에 실제 영향
  }, [plotH]); // eslint-disable-line react-hooks/exhaustive-deps
}
