/** 산점 플롯 공통 선택 — Click/Ctrl+Click/Drag/Ctrl+Drag/Shift+Drag/Shift+Ctrl+Drag */
import { ptInPoly } from './math';

export type ScatterSelOverlay =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'lasso'; pts: string };

export type ScatterSelectionHit = {
  id: string;
  sx: number;
  sy: number;
};

function clientToSvg(
  e: MouseEvent | React.MouseEvent,
  svg: SVGSVGElement,
  svgW: number,
  svgH: number,
) {
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / Math.max(r.width, 1)) * svgW,
    y: ((e.clientY - r.top) / Math.max(r.height, 1)) * svgH,
  };
}

function clampPlot(
  x: number, y: number,
  plotLeft: number, plotTop: number, plotW: number, plotH: number,
) {
  return {
    x: Math.min(Math.max(x, plotLeft), plotLeft + plotW),
    y: Math.min(Math.max(y, plotTop), plotTop + plotH),
  };
}

export interface BeginScatterSelectionOpts {
  e: React.MouseEvent;
  svgEl: SVGSVGElement;
  svgW: number;
  svgH: number;
  plotLeft: number;
  plotTop: number;
  plotW: number;
  plotH: number;
  hits: ScatterSelectionHit[];
  onOverlay: (overlay: ScatterSelOverlay | null) => void;
  onComplete: (selectedIds: string[], additive: boolean) => void;
  minDragPx?: number;
}

/** 좌클릭 드래그 — Shift=Lasso, 그 외=박스; Ctrl/Cmd=추가 선택 */
export function beginScatterSelection(opts: BeginScatterSelectionOpts): boolean {
  const {
    e, svgEl, svgW, svgH, plotLeft, plotTop, plotW, plotH,
    hits, onOverlay, onComplete, minDragPx = 6,
  } = opts;
  if (e.button !== 0) return false;

  const isShift = e.shiftKey;
  const isCtrl = e.ctrlKey || e.metaKey;
  const { x: mx0, y: my0 } = clientToSvg(e, svgEl, svgW, svgH);
  if (mx0 < plotLeft || mx0 > plotLeft + plotW || my0 < plotTop || my0 > plotTop + plotH) return false;

  e.preventDefault();
  e.stopPropagation();

  const idsIn = (test: (sx: number, sy: number) => boolean) => {
    const ids = new Set<string>();
    hits.forEach(h => { if (test(h.sx, h.sy)) ids.add(h.id); });
    return [...ids];
  };

  if (isShift) {
    let lasso: { x: number; y: number }[] = [clampPlot(mx0, my0, plotLeft, plotTop, plotW, plotH)];
    onOverlay({ type: 'lasso', pts: lasso.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') });
    let rafId: number | null = null;

    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const { x, y } = clientToSvg(ev, svgEl, svgW, svgH);
        lasso = [...lasso, clampPlot(x, y, plotLeft, plotTop, plotW, plotH)];
        onOverlay({ type: 'lasso', pts: lasso.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') });
      });
    };

    const onUp = () => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      const ids = lasso.length >= 3
        ? idsIn((sx, sy) => ptInPoly({ x: sx, y: sy }, lasso))
        : [];
      if (ids.length > 0) onComplete(ids, isCtrl);
      onOverlay(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return true;
  }

  let sx = mx0;
  let sy = my0;
  let cx = mx0;
  let cy = my0;
  onOverlay({ type: 'rect', x: sx, y: sy, w: 0, h: 0 });
  let rafId: number | null = null;

  const onMove = (ev: MouseEvent) => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      const { x, y } = clientToSvg(ev, svgEl, svgW, svgH);
      const c = clampPlot(x, y, plotLeft, plotTop, plotW, plotH);
      cx = c.x;
      cy = c.y;
      onOverlay({
        type: 'rect',
        x: Math.min(sx, cx),
        y: Math.min(sy, cy),
        w: Math.abs(cx - sx),
        h: Math.abs(cy - sy),
      });
    });
  };

  const onUp = () => {
    if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
    if (Math.abs(cx - sx) >= minDragPx || Math.abs(cy - sy) >= minDragPx) {
      const minX = Math.min(sx, cx);
      const maxX = Math.max(sx, cx);
      const minY = Math.min(sy, cy);
      const maxY = Math.max(sy, cy);
      const ids = idsIn((x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY);
      if (ids.length > 0) onComplete(ids, isCtrl);
    }
    onOverlay(null);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  return true;
}
