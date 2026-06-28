/**
 * HEX 탭 — 원유 상압증류 공정도 + 열교환기(Q·U) 스파크라인
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DraftDragHandle } from './ui';
export type { HexSlotId, HexLayoutState } from './types-hex';
export { DEFAULT_HEX_SLOT_ORDER, HEX_WIDTH_PRESETS, HEX_SPACING_PRESETS, HEX_ROW_HEIGHT_PRESETS, HEX_HEIGHT_PRESETS, createDefaultHexLayoutState } from './types-hex';
import { HEX_WIDTH_PRESETS, HEX_SPACING_PRESETS, HEX_ROW_HEIGHT_PRESETS, HEX_HEIGHT_PRESETS, createDefaultHexLayoutState, DEFAULT_HEX_SLOT_ORDER, defaultSpacingPresetIdx, defaultRowHeightPresetIdx, defaultWidthPresetIdx, defaultHeightPresetIdx, defaultScatterWidthPresetIdx, defaultEmptyWidthPresetIdx, defaultTrendHeightPresetIdx, defaultGridHeightPresetIdx, type HexSlotId, type HexLayoutState } from './types-hex';
import {
  HEX_DATA,
  HEX_ISO_DATES,
  HEX_STREAM_GROUPS,
  hexStreamCardStyle,
  groupHexDataByStream,
  getAllHexUnitSeries,
  type HexUnitSeries,
  type HexTheme,
  type HexStreamGroup,
  type HexStreamItem,
} from './data-hex';
import {
  EqLegend,
  PeriodSelect,
  ChartTimeline,
  buildABCenterMarks,
  fmtLineVarMean,
  lineVarMeanSymbol,
  linearRegression as lineRegression,
  useContainerSize,
  useMultiAxisWheelZoom,
  useLineTouchPan,
  useYAxisDrag,
  wheelHitSvgPlot,
  ptInPoly,
  type XYPoint,
  type MultiAxisWheelState,
  type AxisDragState,
} from './shared';

const ALL_HEX_EQ_NAMES = Array.from(new Set(HEX_DATA.map(u => u.htxcrId)));
const HEX_EQ_ORDER = new Map(ALL_HEX_EQ_NAMES.map((name, index) => [name, index]));

/** 열교환망(HEX_DATA) 순서 기준 — Scatter/Trend 범례 공통 정렬 */
function sortHexEqNames(names: Iterable<string>): string[] {
  return Array.from(new Set(names)).sort((a, b) => {
    const indexA = HEX_EQ_ORDER.get(a);
    const indexB = HEX_EQ_ORDER.get(b);
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
    if (indexA !== undefined) return -1;
    if (indexB !== undefined) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

const EQ_GROUP_COLORS: Record<string, string> = Object.fromEntries(
  HEX_STREAM_GROUPS.flatMap(group =>
    group.items.flatMap(item =>
      groupHexDataByStream(item.key).map(s => [s.htxcrId, group.htxcrIdColor])
    )
  )
);

// ── Sparkline ───────────────────────────────────────────────────────────────
function HexSparkline({ vals, color, width = 64, height = 18, secondaryVals, secondaryColor }: {
  vals: number[];
  color: string;
  width?: number;
  height?: number;
  secondaryVals?: number[];
  secondaryColor?: string;
}) {
  const allVals = secondaryVals ? [...vals, ...secondaryVals] : vals;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const toPoints = (series: number[]) => series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const points = toPoints(vals);
  const secondaryPoints = secondaryVals ? toPoints(secondaryVals) : '';
  const n = vals.length;
  const lx = width;
  const ly = height - ((vals[n - 1] - min) / range) * (height - 2) - 1;
  const secondaryLy = secondaryVals
    ? height - ((secondaryVals[secondaryVals.length - 1] - min) / range) * (height - 2) - 1
    : null;

  return (
    <svg
      className="draft-hex-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {secondaryVals && secondaryColor && (
        <polyline
          points={secondaryPoints}
          fill="none"
          stroke={secondaryColor}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {secondaryLy !== null && secondaryColor && (
        <circle cx={lx.toFixed(1)} cy={secondaryLy.toFixed(1)} r="1.4" fill={secondaryColor} opacity="0.8" />
      )}
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="1.7" fill={color} />
    </svg>
  );
}

// ── HEX row ─────────────────────────────────────────────────────────────────
function HexRow({ hex, theme, onSelect, dimmed, highlighted, onHover }: {
  hex: HexUnitSeries; theme: HexTheme;
  onSelect?: (multi: boolean) => void;
  dimmed?: boolean;
  highlighted?: boolean;
  onHover?: (eq: string | null) => void;
}) {
  const qLast = hex.q[hex.q.length - 1].toFixed(1);
  const uaLast = hex.ua[hex.ua.length - 1];
  const ucLast = hex.uc[hex.uc.length - 1];
  const uPerformance = ucLast > 0 ? ((uaLast / ucLast) * 100).toFixed(1) : '0.0';

  return (
    <div
      className={`draft-hex-row draft-hex-row--theme-${theme}${dimmed ? ' draft-hex-row--dimmed' : ''}${highlighted ? ' draft-hex-row--highlighted' : ''}${onSelect ? ' draft-hex-row--clickable' : ''}`}
      onClick={onSelect ? e => { e.stopPropagation(); onSelect(e.ctrlKey || e.metaKey); } : undefined}
      onMouseEnter={onHover ? () => onHover(hex.htxcrId) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      <div className="draft-hex-row__name" title={hex.htxcrId}>{hex.htxcrId}</div>
      <div className="draft-hex-row__metric draft-hex-row__metric--q">
        <span className="draft-hex-row__metric-label draft-hex-row__metric-label--q">Q</span>
        <HexSparkline vals={hex.q} color="#FFB86B" width={36} height={24} />
        <span className="draft-hex-row__metric-val draft-hex-row__metric-val--q">{qLast}</span>
      </div>
      <div className="draft-hex-row__metric draft-hex-row__metric--u">
        <span className="draft-hex-row__metric-label draft-hex-row__metric-label--u">U</span>
        <HexSparkline
          vals={hex.ua}
          color="#8BE9FD"
          secondaryVals={hex.uc}
          secondaryColor="#7A8694"
          width={36}
          height={24}
        />
        <span className="draft-hex-row__metric-val draft-hex-row__metric-val--u">{uPerformance}%</span>
      </div>
    </div>
  );
}

// ── Stream card ───────────────────────────────────────────────────────────────
function HexStreamCard({
  streamKey, name, groupId, nameColor, hexTheme, onRowSelect, hiddenEqs, hoveredEq, onHoverEq,
}: {
  streamKey: HexStreamItem['key'];
  name: string;
  groupId: HexStreamGroup['id'];
  nameColor: string;
  hexTheme: HexTheme;
  onRowSelect?: (name: string, multi: boolean) => void;
  hiddenEqs?: Set<string>;
  hoveredEq?: string | null;
  onHoverEq?: (eq: string | null) => void;
}) {
  const { cardBg, cardBorder } = hexStreamCardStyle(groupId);
  const hexes = groupHexDataByStream(streamKey);

  return (
    <div className="draft-hex-stream-row">
      <div className="draft-hex-stream-card" style={{ background: cardBg, borderColor: cardBorder }}>
        <div className="draft-hex-stream-card__main">
          <div className="draft-hex-stream-card__name" style={{ color: nameColor }}>{name}</div>
          {hexes.length > 0 && (
            <div className="draft-hex-stream-card__hex-list">
              {hexes.map(hex => (
                <HexRow
                  key={hex.htxcrId} hex={hex} theme={hexTheme}
                  onSelect={onRowSelect ? (multi) => onRowSelect(hex.htxcrId, multi) : undefined}
                  dimmed={hiddenEqs?.has(hex.htxcrId)}
                  highlighted={hoveredEq === hex.htxcrId}
                  onHover={onHoverEq}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stream group ──────────────────────────────────────────────────────────────
function HexStreamGroupPanel({
  group, onRowSelect, onGroupSelect, hiddenEqs, hoveredEq, onHoverEq,
}: {
  group: HexStreamGroup;
  onRowSelect?: (name: string, multi: boolean) => void;
  onGroupSelect?: (names: string[], multi: boolean) => void;
  hiddenEqs?: Set<string>;
  hoveredEq?: string | null;
  onHoverEq?: (eq: string | null) => void;
}) {
  const allGroupEqNames = group.items.flatMap(item => groupHexDataByStream(item.key).map(h => h.htxcrId));
  return (
    <div
      className={`draft-hex-stream-group draft-hex-stream-group--${group.id}`}
      style={{
        background: group.bgColor,
        borderColor: group.borderColor,
        ['--hex-accent' as string]: group.color,
      }}
    >
        <div
          className="draft-hex-stream-group__label"
          style={{ color: group.color, cursor: onGroupSelect ? 'pointer' : undefined }}
          onClick={onGroupSelect ? e => { e.stopPropagation(); onGroupSelect(allGroupEqNames, e.ctrlKey || e.metaKey); } : undefined}
        >
          {group.label}
        </div>
        <div className="draft-hex-stream-group__items">
          {group.items.map(item => {
            const groupEqNames = groupHexDataByStream(item.key).map(h => h.htxcrId);
            return (
              <div
                key={item.key}
                className="draft-hex-stream-group__row"
                onClick={onGroupSelect ? e => onGroupSelect(groupEqNames, e.ctrlKey || e.metaKey) : undefined}
                style={onGroupSelect ? { cursor: 'pointer' } : undefined}
              >
                <HexStreamCard
                  streamKey={item.key}
                  name={item.htxcrId}
                  groupId={group.id}
                  nameColor={group.htxcrIdColor}
                  hexTheme={group.hexTheme}
                  onRowSelect={onRowSelect}
                  hiddenEqs={hiddenEqs}
                  hoveredEq={hoveredEq}
                  onHoverEq={onHoverEq}
                />
              </div>
            );
          })}
        </div>
    </div>
  );
}

// ── Panel (exported) ──────────────────────────────────────────────────────────
const HEX_CARD_TITLE = '열교환망';
const HEX_SCATTER_CARD_TITLE = 'HEX 운전 현황';
const HEX_TREND_TITLE = 'HEX Trend';
const HEX_TREND_PAD = { top: 6, right: 6, bottom: 32, left: 52 };
const HEX_TREND_CENTER_PAD_TOP = 16;
const HEX_TREND_CENTER_PAD_RIGHT = 52;
const HEX_TREND_CENTER_LABEL_MIN_DY = 12;
const HEX_TREND_AXIS_W = 48;
/** 회전 Y축 명 — 눈금(x≈axX-6)과 적당한 간격; SVG 좌측 클리핑만 최소 inset으로 방지 */
const HEX_TREND_Y_NAME_OFFSET = 32;
const HEX_TREND_Y_NAME_INSET = 12;

function hexTrendYAxisNameX(axX: number): number {
  return Math.max(HEX_TREND_Y_NAME_INSET, axX - HEX_TREND_Y_NAME_OFFSET);
}

/** HEX 운전 현황 산점도 — 플롯 여백 (하단: x눈금·x제목은 축선 기준 오프셋) */
const HEX_SCATTER_PAD = { top: 20, right: 16, bottom: 46, left: 48 };
/** x축선 아래 눈금·제목 (SVG 하단 H-n 고정 사용 금지) */
const HEX_SCATTER_AXIS_X_TICK_DY = 11;
const HEX_SCATTER_AXIS_X_NAME_DY = 28;
const HEX_SCATTER_AXIS_X_TICK_LEN = 4;
const HEX_SCATTER_AXIS_Y_TICK_DX = 6;
const HEX_SCATTER_AXIS_Y_TICK_LEN = 4;
/** 회전 Y축 명 — SVG 좌측·눈금과 간격 (HEX Trend와 동일 패턴) */
const HEX_SCATTER_Y_NAME_OFFSET = 28;
const HEX_SCATTER_Y_NAME_INSET = 14;

function hexScatterYAxisNameX(padLeft: number): number {
  return Math.max(HEX_SCATTER_Y_NAME_INSET, padLeft - HEX_SCATTER_Y_NAME_OFFSET);
}

/** Y축 데이터 min/max에 상·하 여백 (사용자가 축을 드래그해 고정한 경우는 제외) */
const HEX_TREND_Y_PAD_RATIO = 0.1;

function hexTrendPaddedAxis(min: number, max: number): { min: number; max: number; range: number } {
  const span = Math.max(max - min, 1e-6);
  const pad = span * HEX_TREND_Y_PAD_RATIO;
  const paddedMin = min - pad;
  const paddedMax = max + pad;
  return { min: paddedMin, max: paddedMax, range: Math.max(paddedMax - paddedMin, 1e-6) };
}

/** Trend + Data Set 세로 스택 flex gap — stackHeightBudget과 CSS가 동일 값을 써야 함 */
const HEX_EMPTY_STACK_GAP_PX = 10;

function layoutHexTrendCenterLabels<T extends { cy: number }>(
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
  for (let i = laid.length - 2; i >= 0; i -= 1) {
    if (laid[i + 1].y - laid[i].y < minDy) {
      laid[i] = { ...laid[i], y: Math.max(yLo, laid[i + 1].y - minDy) };
    }
  }
  return laid;
}


export type DraftHexPanelProps = {
  layoutState?: HexLayoutState;
  onLayoutStateChange?: (next: HexLayoutState) => void;
};

function sortedStrings(values: string[]): string[] {
  return [...values].sort();
}

function sameStringArrays(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameHexLayoutState(a: HexLayoutState, b: HexLayoutState): boolean {
  return (
    sameStringArrays(a.slotOrder, b.slotOrder)
    && sameStringArrays(sortedStrings(a.hiddenEqs), sortedStrings(b.hiddenEqs))
    && a.scatterXField === b.scatterXField
    && a.scatterYField === b.scatterYField
    && a.spacingIdx === b.spacingIdx
    && a.rowHeightIdx === b.rowHeightIdx
    && a.widthIdx === b.widthIdx
    && a.heightIdx === b.heightIdx
    && a.scatterWidthIdx === b.scatterWidthIdx
    && a.scatterHeightIdx === b.scatterHeightIdx
    && a.empty1WidthIdx === b.empty1WidthIdx
    && a.empty1HeightIdx === b.empty1HeightIdx
    && a.empty2WidthIdx === b.empty2WidthIdx
    && a.empty2HeightIdx === b.empty2HeightIdx
    && a.linkedPeriodDays === b.linkedPeriodDays
    && a.linkedControlsVisible === b.linkedControlsVisible
    && a.linkedShowLegend === b.linkedShowLegend
  );
}

type ScatterAxisField = 'q' | 'u' | 'ua' | 'uc';
const SCATTER_AXIS_OPTIONS: { value: ScatterAxisField; label: string }[] = [
  { value: 'q',  label: 'Q'  },
  { value: 'u',  label: 'U%' },
  { value: 'ua', label: 'UA' },
  { value: 'uc', label: 'UC' },
];

type HexScatterPoint = {
  idx: number;
  date: string;
  eq: string;
  q: number;
  u: number;
  ua: number;
  uc: number;
};


function heightPresetPercentByIdx(idx: number): number | null {
  const value = HEX_HEIGHT_PRESETS[idx]?.value;
  if (!value || value === 'auto' || !value.endsWith('%')) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function findHeightPresetIdxByPercent(percent: number): number {
  const key = `${percent}%`;
  const i = HEX_HEIGHT_PRESETS.findIndex(p => p.value === key);
  return i >= 0 ? i : 0;
}

function widthPresetToNumber(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function heightPresetToPixels(value: string, viewportHeight: number) {
  if (value === 'auto') return 0;
  if (value.endsWith('%')) {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(1, Math.round((viewportHeight * n) / 100));
  }
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function heightPresetToCss(value: string, viewportHeight: number) {
  if (value === 'auto') return 'auto';
  return `${heightPresetToPixels(value, viewportHeight)}px`;
}

function toHexScatterPoints(): HexScatterPoint[] {
  const units = getAllHexUnitSeries();
  const points: HexScatterPoint[] = [];
  units.forEach(unit => {
    unit.dates.forEach((bsDt, idx) => {
      const q = unit.q[idx] ?? 0;
      const ua = unit.ua[idx] ?? 0;
      const uc = unit.uc[idx] ?? 0;
      const uPerf = uc > 0 ? (ua / uc) * 100 : 0;
      points.push({
        idx,
        date: HEX_ISO_DATES[idx] ?? `${bsDt.slice(0, 4)}-${bsDt.slice(4, 6)}-${bsDt.slice(6, 8)}`,
        eq: unit.htxcrId,
        q: Number(q.toFixed(2)),
        u: Number(uPerf.toFixed(2)),
        ua: Number(ua.toFixed(2)),
        uc: Number(uc.toFixed(2)),
      });
    });
  });
  return points;
}

function toHexLinePoints(): XYPoint[] {
  // HEX Trend는 HEX 운전 현황(Scatter)과 동일한 원천 포인트를 사용한다.
  return toHexScatterPoints().map(point => ({
    date: point.date,
    eq: point.eq,
    x: point.q,
    y: point.u,
  }));
}

function linearRegression(points: { x: number; y: number }[]) {
  if (points.length < 2) return { m: 1, b: 0 };
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
    sxy += point.x * point.y;
    sxx += point.x * point.x;
  }
  const denom = n * sxx - sx * sx || 1;
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  return { m, b };
}

type SelOverlay =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'lasso'; pts: string };

type ScatterAxisDragRef = {
  startX?: number;
  startY?: number;
  startMin: number;
  startMax: number;
  minRange: number;
} | null;

/** HEX 운전 현황 — X/Y축 드래그 줌·팬 (좌클릭=줌, 우클릭=팬) */
function makeScatterAxisDragHandler(
  axis: 'x' | 'y',
  getRange: () => { min: number; max: number },
  dragRef: React.MutableRefObject<ScatterAxisDragRef>,
  setRange: (r: { min: number; max: number }) => void,
  plotSize: number,
) {
  return (e: React.MouseEvent) => {
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
  };
}

function HexPredActualScatterCard({
  widthIdx, setWidthIdx, heightIdx, setHeightIdx, hiddenEqs, hoveredEq, setHoveredEq, selectEq, selectMultipleEqs, resetSignal, onPlaybackSync, incomingSync, cardRef, viewportHeight, periodDays, setPeriodDays, controlsVisible, setControlsVisible, showLegend, setShowLegend, dragCardId, xField, setXField, yField, setYField,
}: {
  widthIdx: number;
  setWidthIdx: React.Dispatch<React.SetStateAction<number>>;
  heightIdx: number;
  setHeightIdx: React.Dispatch<React.SetStateAction<number>>;
  hiddenEqs: Set<string>;
  hoveredEq: string | null;
  setHoveredEq: React.Dispatch<React.SetStateAction<string | null>>;
  selectEq: (name: string, multi: boolean) => void;
  selectMultipleEqs: (eqs: string[]) => void;
  resetSignal: number;
  onPlaybackSync?: (payload: { isPlaying: boolean; date: string; idx: number }) => void;
  incomingSync?: { seq: number; isPlaying: boolean; date: string; idx: number } | null;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  viewportHeight: number;
  periodDays: number;
  setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
  controlsVisible: boolean;
  setControlsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  showLegend: boolean;
  setShowLegend: React.Dispatch<React.SetStateAction<boolean>>;
  dragCardId?: string;
  xField: ScatterAxisField;
  setXField: React.Dispatch<React.SetStateAction<ScatterAxisField>>;
  yField: ScatterAxisField;
  setYField: React.Dispatch<React.SetStateAction<ScatterAxisField>>;
}) {
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 360, h: 220 });
  useEffect(() => {
    const el = svgWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 10 && height > 10) setSvgSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allPoints = useMemo(() => toHexScatterPoints(), []);
  const [showSlope, setShowSlope] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<'느림' | '보통' | '빠름'>('보통');

  const maxIdx = useMemo(
    () => Math.max(...allPoints.map(point => point.idx), 0),
    [allPoints]
  );
  const sliderMin = periodDays > 0 ? Math.max(0, maxIdx - periodDays + 1) : 0;
  const [selectedIdx, setSelectedIdx] = useState(maxIdx);
  const speedMs = playSpeed === '느림' ? 1400 : playSpeed === '빠름' ? 450 : 850;

  const eqNames = useMemo(
    () => sortHexEqNames(allPoints.map(point => point.eq)),
    [allPoints]
  );
  const [xAxisRange, setXAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [yAxisRange, setYAxisRange] = useState<{ min: number; max: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const xAxisDragRef = useRef<ScatterAxisDragRef>(null);
  const yAxisDragRef = useRef<ScatterAxisDragRef>(null);
  const scatterDataBoundsRef = useRef({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  const xAxisRangeRef = useRef(xAxisRange);
  const yAxisRangeRef = useRef(yAxisRange);
  xAxisRangeRef.current = xAxisRange;
  yAxisRangeRef.current = yAxisRange;
  const wheelStateRef = useRef({ plotW: 0, plotH: 0, svgW: 0, svgH: 0, activeXMin: 0, activeXMax: 1, activeYMin: 0, activeYMax: 1, padLeft: 30, padTop: 6 });
  const activeDragRef = useRef<{
    mode: 'rect' | 'lasso' | 'pan' | null;
    sx: number; sy: number; cx: number; cy: number;
    lassoPts: { x: number; y: number }[];
    panStart: { clientX: number; clientY: number; xMin: number; xMax: number; yMin: number; yMax: number } | null;
    additive: boolean;
  }>({ mode: null, sx: 0, sy: 0, cx: 0, cy: 0, lassoPts: [], panStart: null, additive: false });
  const [isPanning, setIsPanning] = useState(false);
  const plotDataRef = useRef<HexScatterPoint[]>([]);
  const [selOverlay, setSelOverlay] = useState<SelOverlay | null>(null);
  const [tooltip, setTooltip] = useState<{ point: HexScatterPoint; svgX: number; svgY: number } | null>(null);
  const xFieldRef = useRef<ScatterAxisField>(xField);
  const yFieldRef = useRef<ScatterAxisField>(yField);
  xFieldRef.current = xField;
  yFieldRef.current = yField;
  const hiddenEqsRef = useRef(hiddenEqs);
  hiddenEqsRef.current = hiddenEqs;
  const incomingSyncRef = useRef(incomingSync ?? null);
  incomingSyncRef.current = incomingSync ?? null;
  const scatterOnSyncRef = useRef(onPlaybackSync);
  scatterOnSyncRef.current = onPlaybackSync;
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;

  const setScatterPanCursor = useCallback((active: boolean) => {
    document.body.style.cursor = active ? 'grabbing' : '';
  }, []);

  useEffect(() => () => setScatterPanCursor(false), [setScatterPanCursor]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.padLeft, st.padTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const mx = ((e.clientX - rect.left) / rect.width) * st.svgW;
      const my = ((e.clientY - rect.top) / rect.height) * st.svgH;
      const dataX = st.activeXMin + ((mx - st.padLeft) / Math.max(st.plotW, 1)) * (st.activeXMax - st.activeXMin);
      const dataY = st.activeYMin + ((st.padTop + st.plotH - my) / Math.max(st.plotH, 1)) * (st.activeYMax - st.activeYMin);
      setXAxisRange({ min: dataX - (dataX - st.activeXMin) * factor, max: dataX + (st.activeXMax - dataX) * factor });
      setYAxisRange({ min: dataY - (dataY - st.activeYMin) * factor, max: dataY + (st.activeYMax - dataY) * factor });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const getSvgCoords = (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const st = wheelStateRef.current;
      return { x: ((clientX - r.left) / Math.max(r.width, 1)) * st.svgW, y: ((clientY - r.top) / Math.max(r.height, 1)) * st.svgH };
    };
    const clamp = (x: number, y: number) => {
      const st = wheelStateRef.current;
      return { x: Math.min(Math.max(x, st.padLeft), st.padLeft + st.plotW), y: Math.min(Math.max(y, st.padTop), st.padTop + st.plotH) };
    };
    const onMouseMove = (e: MouseEvent) => {
      const drag = activeDragRef.current;
      if (!drag.mode) return;
      const { x: svgX, y: svgY } = getSvgCoords(e.clientX, e.clientY);
      if (drag.mode === 'pan' && drag.panStart) {
        const svg = svgRef.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const st = wheelStateRef.current;
        const { clientX: sx, clientY: sy, xMin, xMax, yMin, yMax } = drag.panStart;
        const dx = -((e.clientX - sx) / Math.max(r.width, 1)) * st.svgW / Math.max(st.plotW, 1) * (xMax - xMin);
        const dy = ((e.clientY - sy) / Math.max(r.height, 1)) * st.svgH / Math.max(st.plotH, 1) * (yMax - yMin);
        setXAxisRange({ min: xMin + dx, max: xMax + dx });
        setYAxisRange({ min: yMin + dy, max: yMax + dy });
        return;
      }
      const { x: cx, y: cy } = clamp(svgX, svgY);
      if (drag.mode === 'rect') {
        drag.cx = cx; drag.cy = cy;
        setSelOverlay({ type: 'rect', x: Math.min(drag.sx, cx), y: Math.min(drag.sy, cy), w: Math.abs(cx - drag.sx), h: Math.abs(cy - drag.sy) });
      } else if (drag.mode === 'lasso') {
        drag.lassoPts.push({ x: cx, y: cy });
        setSelOverlay({ type: 'lasso', pts: drag.lassoPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') });
      }
    };
    const onMouseUp = () => {
      const drag = activeDragRef.current;
      if (!drag.mode) return;
      const mode = drag.mode;
      drag.mode = null;
      drag.panStart = null;
      setSelOverlay(null);
      if (mode === 'pan') {
        setIsPanning(false);
        setScatterPanCursor(false);
        return;
      }
      const st = wheelStateRef.current;
      const toDataX = (px: number) => st.activeXMin + ((px - st.padLeft) / Math.max(st.plotW, 1)) * (st.activeXMax - st.activeXMin);
      const toDataY = (py: number) => st.activeYMin + ((st.padTop + st.plotH - py) / Math.max(st.plotH, 1)) * (st.activeYMax - st.activeYMin);
      const pts = plotDataRef.current;
      let selected: string[] = [];
      if (mode === 'rect') {
        const dx = Math.abs(drag.cx - drag.sx), dy = Math.abs(drag.cy - drag.sy);
        if (dx < 6 && dy < 6) return;
        const xLo = toDataX(Math.min(drag.sx, drag.cx)), xHi = toDataX(Math.max(drag.sx, drag.cx));
        const yLo = toDataY(Math.max(drag.sy, drag.cy)), yHi = toDataY(Math.min(drag.sy, drag.cy));
        selected = Array.from(new Set(pts.filter(p => p[xFieldRef.current] >= xLo && p[xFieldRef.current] <= xHi && p[yFieldRef.current] >= yLo && p[yFieldRef.current] <= yHi).map(p => p.eq)));
      } else if (mode === 'lasso') {
        if (drag.lassoPts.length < 3) { drag.lassoPts = []; return; }
        const poly = drag.lassoPts.map(p => ({ x: toDataX(p.x), y: toDataY(p.y) }));
        selected = Array.from(new Set(pts.filter(p => ptInPoly({ x: p[xFieldRef.current], y: p[yFieldRef.current] }, poly)).map(p => p.eq)));
        drag.lassoPts = [];
      }
      if (drag.additive && selected.length > 0 && hiddenEqsRef.current.size > 0) {
        const currentVisible = ALL_HEX_EQ_NAMES.filter(name => !hiddenEqsRef.current.has(name));
        selected = Array.from(new Set([...currentVisible, ...selected]));
      }
      // Freeze current axis ranges so the view stays fixed after selection.
      setXAxisRange({ min: st.activeXMin, max: st.activeXMax });
      setYAxisRange({ min: st.activeYMin, max: st.activeYMax });
      selectMultipleEqs(selected);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [setScatterPanCursor]);
  const eqColors = useMemo(
    () => Object.fromEntries(eqNames.map(name => [name, EQ_GROUP_COLORS[name] ?? '#7dd3fc'])),
    [eqNames]
  );

  const handleScatterDotEnter = (e: React.MouseEvent, point: HexScatterPoint) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    setHoveredEq(point.eq);
    setTooltip({
      point,
      svgX: ((e.clientX - rect.left) / rect.width) * svgSize.w,
      svgY: ((e.clientY - rect.top) / rect.height) * svgSize.h,
    });
  };

  const clearScatterDotHover = () => {
    setTooltip(null);
    setHoveredEq(null);
  };

  const dateLabels = HEX_ISO_DATES;


  useEffect(() => {
    if (!incomingSync) return;
    const idx = incomingSync.idx;
    if (idx >= 0 && idx <= maxIdx) setSelectedIdx(idx);
  }, [incomingSync, maxIdx]);

  useEffect(() => {
    if (selectedIdx > maxIdx) setSelectedIdx(maxIdx);
    else if (selectedIdx < sliderMin) setSelectedIdx(maxIdx);
  }, [selectedIdx, maxIdx, sliderMin]);

  useEffect(() => {
    setControlsVisible(true);
    setPeriodDays(14);
    setShowSlope(false);
    setShowCenter(false);
    setIsPlaying(false);
    setPlaySpeed('보통');
    setSelectedIdx(maxIdx);
    setXAxisRange(null);
    setYAxisRange(null);
    setXField('q');
    setYField('u');
    selectMultipleEqs([]);
  }, [maxIdx, resetSignal, selectMultipleEqs]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      const cur = selectedIdxRef.current;
      if (cur >= maxIdx) {
        setIsPlaying(false);
        scatterOnSyncRef.current?.({ isPlaying: false, date: dateLabels[cur] ?? '', idx: cur });
        return;
      }
      const next = cur + 1;
      setSelectedIdx(next);
      scatterOnSyncRef.current?.({ isPlaying: true, date: dateLabels[next] ?? '', idx: next });
    }, speedMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxIdx, speedMs, dateLabels]);

  const allWindowPoints = useMemo(() => {
    const startIdx = Math.max(0, selectedIdx - periodDays + 1);
    return allPoints.filter(point => point.idx >= startIdx && point.idx <= selectedIdx);
  }, [allPoints, selectedIdx, periodDays]);
  const visiblePoints = useMemo(
    () => (hiddenEqs.size === 0 ? allWindowPoints : allWindowPoints.filter(p => !hiddenEqs.has(p.eq))),
    [allWindowPoints, hiddenEqs]
  );
  const dimmedPoints = useMemo(
    () => (hiddenEqs.size === 0 ? [] : allWindowPoints.filter(p => hiddenEqs.has(p.eq))),
    [allWindowPoints, hiddenEqs]
  );
  plotDataRef.current = allWindowPoints;

  const PAD = HEX_SCATTER_PAD;
  const W = svgSize.w;
  const H = svgSize.h;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const plotBottom = PAD.top + plotH;
  const xTickY = plotBottom + HEX_SCATTER_AXIS_X_TICK_DY;
  const xNameY = plotBottom + HEX_SCATTER_AXIS_X_NAME_DY;
  const yTickX = PAD.left - HEX_SCATTER_AXIS_Y_TICK_DX;

  const qVals = allWindowPoints.map(p => p[xField]);
  const uVals = allWindowPoints.map(p => p[yField]);
  const qMin = Math.min(...qVals);
  const qMax = Math.max(...qVals);
  const uMin = Math.min(...uVals);
  const uMax = Math.max(...uVals);
  const qPad = (qMax - qMin || 1) * 0.12;
  const uPad = (uMax - uMin || 1) * 0.12;
  const xMin = qMin - qPad;
  const xMax = qMax + qPad;
  const yMin = uMin - uPad;
  const yMax = uMax + uPad;
  const activeXMin = xAxisRange?.min ?? xMin;
  const activeXMax = xAxisRange?.max ?? xMax;
  const activeYMin = yAxisRange?.min ?? yMin;
  const activeYMax = yAxisRange?.max ?? yMax;
  scatterDataBoundsRef.current = { xMin, xMax, yMin, yMax };
  wheelStateRef.current = { plotW, plotH, svgW: W, svgH: H, activeXMin, activeXMax, activeYMin, activeYMax, padLeft: PAD.left, padTop: PAD.top };

  const startXAxisDrag = useMemo(
    () => makeScatterAxisDragHandler(
      'x',
      () => {
        const b = scatterDataBoundsRef.current;
        return xAxisRangeRef.current ?? { min: b.xMin, max: b.xMax };
      },
      xAxisDragRef,
      setXAxisRange,
      plotW,
    ),
    [plotW],
  );
  const startYAxisDrag = useMemo(
    () => makeScatterAxisDragHandler(
      'y',
      () => {
        const b = scatterDataBoundsRef.current;
        return yAxisRangeRef.current ?? { min: b.yMin, max: b.yMax };
      },
      yAxisDragRef,
      setYAxisRange,
      plotH,
    ),
    [plotH],
  );

  const xSc = (v: number) => PAD.left + ((v - activeXMin) / Math.max(activeXMax - activeXMin, 1e-9)) * plotW;
  const ySc = (v: number) => PAD.top + (1 - (v - activeYMin) / Math.max(activeYMax - activeYMin, 1e-9)) * plotH;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => activeXMin + (activeXMax - activeXMin) * t);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => activeYMin + (activeYMax - activeYMin) * t);
  const heightPreset = HEX_HEIGHT_PRESETS[heightIdx]?.value ?? 'auto';
  const height = heightPresetToCss(heightPreset, viewportHeight);
  const latestPoints = visiblePoints.filter(point => point.idx === selectedIdx);
  const pastPoints = visiblePoints.filter(point => point.idx < selectedIdx);
  const dimmedPastPoints = dimmedPoints.filter(point => point.idx < selectedIdx);
  const dimmedLatestPoints = dimmedPoints.filter(point => point.idx === selectedIdx);
  const regression = linearRegression(visiblePoints.map(point => ({ x: point[xField], y: point[yField] })));
  const meanX = visiblePoints.reduce((sum, point) => sum + point[xField], 0) / Math.max(visiblePoints.length, 1);
  const meanY = visiblePoints.reduce((sum, point) => sum + point[yField], 0) / Math.max(visiblePoints.length, 1);
  const isModified = periodDays !== 14 || showSlope || showCenter || selectedIdx !== maxIdx || xAxisRange !== null || yAxisRange !== null;
  const xAxisLabel = SCATTER_AXIS_OPTIONS.find(o => o.value === xField)?.label ?? 'Q';
  const yAxisLabel = SCATTER_AXIS_OPTIONS.find(o => o.value === yField)?.label ?? 'U%';
  const scatterHoverDim = (eq: string, opacity: number) => {
    if (hoveredEq === eq) return Math.min(1, opacity < 0.3 ? 0.85 : opacity);
    if (hoveredEq !== null) return opacity * 0.2;
    return opacity;
  };

  const startPlotSelection = (e: React.MouseEvent, svgX: number, svgY: number) => {
    if (e.button !== 0) return;
    const st = wheelStateRef.current;
    if (svgX < st.padLeft || svgX > st.padLeft + st.plotW || svgY < st.padTop || svgY > st.padTop + st.plotH) return;
    e.preventDefault();
    e.stopPropagation();
    const drag = activeDragRef.current;
    drag.additive = e.ctrlKey || e.metaKey;
    if (e.shiftKey) {
      drag.mode = 'lasso';
      drag.lassoPts = [{ x: svgX, y: svgY }];
      setSelOverlay({ type: 'lasso', pts: `${svgX.toFixed(1)},${svgY.toFixed(1)}` });
    } else {
      drag.mode = 'rect';
      drag.sx = svgX;
      drag.sy = svgY;
      drag.cx = svgX;
      drag.cy = svgY;
      setSelOverlay({ type: 'rect', x: svgX, y: svgY, w: 0, h: 0 });
    }
  };

  const startPlotPan = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    const st = wheelStateRef.current;
    const drag = activeDragRef.current;
    drag.mode = 'pan';
    drag.panStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      xMin: st.activeXMin,
      xMax: st.activeXMax,
      yMin: st.activeYMin,
      yMax: st.activeYMax,
    };
    setScatterPanCursor(true);
    setIsPanning(true);
  };

  const handlePlotMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const st = wheelStateRef.current;
    const svgX = ((e.clientX - r.left) / Math.max(r.width, 1)) * st.svgW;
    const svgY = ((e.clientY - r.top) / Math.max(r.height, 1)) * st.svgH;
    if (e.button === 1 || e.button === 2) {
      startPlotPan(e);
      return;
    }
    startPlotSelection(e, svgX, svgY);
  };

  const resetControls = () => {
    setPeriodDays(14);
    setShowSlope(false);
    setShowCenter(false);
    setSelectedIdx(maxIdx);
    setIsPlaying(false);
    setXAxisRange(null);
    setYAxisRange(null);
    setXField('q');
    setYField('u');
  };
  return (
    <div
      data-hex-card-id={dragCardId}
      ref={cardRef}
      className="draft-chart-card draft-ekpi-card draft-chart-card--h draft-hex-scatter-card draft-hex-slot-scatter"
      style={{
        ['--hex-scatter-card-height' as string]: height,
      }}
    >
      <div className="draft-ekpi-card-title draft-hex-chart-card__header">
        <DraftDragHandle title="드래그하여 카드 순서 변경" ariaLabel="드래그하여 카드 순서 변경" />
        <span>{HEX_SCATTER_CARD_TITLE}</span>
        <div className="draft-card-actions">
          <button
            className={`draft-chip-btn${showLegend ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowLegend(v => !v)}
            title="범례 표시"
          >
            범례
          </button>
          <button
            className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setControlsVisible(v => !v)}
            title="제어 영역 표시"
          >
            Control
          </button>
          <select
            className="draft-toolbar-select"
            value={widthIdx}
            onChange={e => setWidthIdx(Number(e.target.value))}
            title="Width 조정"
            aria-label="Width"
          >
            {HEX_WIDTH_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
          <select
            className="draft-toolbar-select"
            value={heightIdx}
            onChange={e => setHeightIdx(Number(e.target.value))}
            title="Height 조정"
            aria-label="Height"
          >
            {HEX_HEIGHT_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
          <button
            className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`}
            onClick={resetControls}
            title="초기화"
          >
            ↺
          </button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <select
            className="draft-toolbar-select"
            value={periodDays}
            onChange={e => setPeriodDays(Number(e.target.value))}
            title="기간 선택"
            aria-label="기간 선택"
          >
            <option value={14}>최근 14일</option>
            <option value={7}>최근 7일</option>
            <option value={30}>전체</option>
          </select>
          <button
            className={`draft-chip-btn${showSlope ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowSlope(v => !v)}
            title="회귀선 표시"
          >
            Slope
          </button>
          <button
            className={`draft-chip-btn${showCenter ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowCenter(v => !v)}
            title="중심선 표시"
          >
            Center
          </button>
          <span className="draft-scatter-axis-label">X</span>
          <select
            className="draft-toolbar-select"
            value={xField}
            onChange={e => { setXField(e.target.value as ScatterAxisField); setXAxisRange(null); }}
            aria-label="X축 데이터"
          >
            {SCATTER_AXIS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="draft-scatter-axis-label">Y</span>
          <select
            className="draft-toolbar-select"
            value={yField}
            onChange={e => { setYField(e.target.value as ScatterAxisField); setYAxisRange(null); }}
            aria-label="Y축 데이터"
          >
            {SCATTER_AXIS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="draft-hex-scatter-panel">
        <div ref={svgWrapRef} className="draft-hex-scatter-svg-wrap">
        <svg
          ref={svgRef}
          className={`draft-chart-svg draft-hex-scatter-svg${isPanning ? ' draft-hex-scatter-svg--panning' : ''}`}
          width={W} height={H}
          aria-label="Q U scatter"
          onMouseLeave={clearScatterDotHover}
        >
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            className="draft-hex-scatter-plot-bg"
          />
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            className="draft-hex-scatter-plot-hit"
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
            onMouseDown={handlePlotMouseDown}
            onDoubleClick={resetControls}
          />
          {xTicks.map((v, i) => (
            <line key={`vx-${i}`} x1={xSc(v)} y1={PAD.top} x2={xSc(v)} y2={PAD.top + plotH} className="draft-hex-scatter-grid" />
          ))}
          {yTicks.map((v, i) => (
            <line key={`vy-${i}`} x1={PAD.left} y1={ySc(v)} x2={PAD.left + plotW} y2={ySc(v)} className="draft-hex-scatter-grid" />
          ))}
          <line x1={PAD.left} y1={plotBottom} x2={PAD.left + plotW} y2={plotBottom} className="draft-hex-scatter-axis" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={plotBottom} className="draft-hex-scatter-axis" />
          <g className="draft-hex-scatter-axis-hits">
            <rect
              x={PAD.left}
              y={plotBottom}
              width={plotW}
              height={Math.max(H - plotBottom, 1)}
              fill="transparent"
              pointerEvents="all"
              className="draft-hex-scatter-axis-hit draft-hex-scatter-axis-hit--x"
              style={{ cursor: 'ew-resize' }}
              onMouseDown={startXAxisDrag}
              onContextMenu={ev => ev.preventDefault()}
              onDoubleClick={() => setXAxisRange(null)}
            />
            <rect
              x={0}
              y={PAD.top}
              width={PAD.left}
              height={plotH}
              fill="transparent"
              pointerEvents="all"
              className="draft-hex-scatter-axis-hit draft-hex-scatter-axis-hit--y"
              style={{ cursor: 'ns-resize' }}
              onMouseDown={startYAxisDrag}
              onContextMenu={ev => ev.preventDefault()}
              onDoubleClick={() => setYAxisRange(null)}
            />
          </g>
          {xTicks.map((v, i) => (
            <g key={`tx-${i}`}>
              <line
                x1={xSc(v)}
                y1={plotBottom}
                x2={xSc(v)}
                y2={plotBottom + HEX_SCATTER_AXIS_X_TICK_LEN}
                className="draft-hex-scatter-axis"
              />
              <text x={xSc(v)} y={xTickY} textAnchor="middle" className="draft-hex-scatter-tick">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {yTicks.map((v, i) => (
            <g key={`ty-${i}`}>
              <line
                x1={PAD.left - HEX_SCATTER_AXIS_Y_TICK_LEN}
                y1={ySc(v)}
                x2={PAD.left}
                y2={ySc(v)}
                className="draft-hex-scatter-axis"
              />
              <text
                x={yTickX}
                y={ySc(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="draft-hex-scatter-tick"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}
          {showCenter && (
            <>
              <line x1={xSc(meanX)} y1={PAD.top} x2={xSc(meanX)} y2={PAD.top + plotH} className="draft-hex-scatter-center" />
              <line x1={PAD.left} y1={ySc(meanY)} x2={PAD.left + plotW} y2={ySc(meanY)} className="draft-hex-scatter-center" />
              <text x={xSc(meanX) + 4} y={PAD.top + 11} textAnchor="start" className="draft-hex-scatter-stat-label">
                X̄={meanX.toFixed(2)}
              </text>
              <text x={PAD.left + plotW - 4} y={ySc(meanY) - 4} textAnchor="end" className="draft-hex-scatter-stat-label">
                Ȳ={meanY.toFixed(1)}
              </text>
            </>
          )}
          {showSlope && (
            <>
              <line
                x1={xSc(xMin)}
                y1={ySc(regression.m * xMin + regression.b)}
                x2={xSc(xMax)}
                y2={ySc(regression.m * xMax + regression.b)}
                className="draft-hex-scatter-slope"
              />
              <text x={PAD.left + plotW - 4} y={PAD.top + 11} textAnchor="end" className="draft-hex-scatter-stat-label draft-hex-scatter-stat-label--slope">
                y={regression.m.toFixed(3)}x{regression.b >= 0 ? '+' : ''}{regression.b.toFixed(1)}
              </text>
            </>
          )}
          {dimmedPastPoints.map(point => {
            const age = selectedIdx - point.idx;
            const maxAge = Math.max(periodDays - 1, 1);
            const alpha = scatterHoverDim(point.eq, Math.max(0.06, 0.18 - (age / maxAge) * 0.1));
            return (
              <circle
                key={`dimmed-past-${point.eq}-${point.idx}`}
                cx={xSc(point[xField])}
                cy={ySc(point[yField])}
                r={3.4}
                className="draft-hex-scatter-dot"
                style={{ fill: '#3d4a5c', opacity: alpha, cursor: 'pointer' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); selectEq(point.eq, e.ctrlKey || e.metaKey); }}
              />
            );
          })}
          {dimmedLatestPoints.map(point => (
            <circle
              key={`dimmed-latest-${point.eq}-${point.idx}`}
              cx={xSc(point[xField])}
              cy={ySc(point[yField])}
              r={4.6}
              className="draft-hex-scatter-dot draft-hex-scatter-dot--latest"
              style={{ fill: '#3d4a5c', opacity: scatterHoverDim(point.eq, 0.25), cursor: 'pointer' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); selectEq(point.eq, e.ctrlKey || e.metaKey); }}
            />
          ))}
          {pastPoints.map(point => {
            const color = eqColors[point.eq] ?? '#7dd3fc';
            const age = selectedIdx - point.idx;
            const maxAge = Math.max(periodDays - 1, 1);
            const alpha = scatterHoverDim(point.eq, Math.max(0.15, 0.55 - (age / maxAge) * 0.35));
            return (
              <circle
                key={`past-${point.eq}-${point.idx}`}
                cx={xSc(point[xField])}
                cy={ySc(point[yField])}
                r={3.4}
                className="draft-hex-scatter-dot"
                style={{ fill: color, opacity: alpha, cursor: 'pointer' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); selectEq(point.eq, e.ctrlKey || e.metaKey); }}
              />
            );
          })}
          {latestPoints.map(point => (
            <circle
              key={`latest-${point.eq}-${point.idx}`}
              cx={xSc(point[xField])}
              cy={ySc(point[yField])}
              r={hoveredEq === point.eq ? 5.6 : 4.6}
              className="draft-hex-scatter-dot draft-hex-scatter-dot--latest"
              style={{
                fill: eqColors[point.eq] ?? '#7dd3fc',
                opacity: scatterHoverDim(point.eq, 1),
                cursor: 'pointer',
              }}
              onMouseEnter={e => handleScatterDotEnter(e, point)}
              onMouseLeave={clearScatterDotHover}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); selectEq(point.eq, e.ctrlKey || e.metaKey); }}
            />
          ))}
          <text x={PAD.left + plotW / 2} y={xNameY} textAnchor="middle" className="draft-hex-scatter-axis-label">
            {SCATTER_AXIS_OPTIONS.find(o => o.value === xField)?.label ?? 'Q'}
          </text>
          <text
            transform={`translate(${hexScatterYAxisNameX(PAD.left)},${PAD.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="draft-hex-scatter-axis-label"
          >
            {SCATTER_AXIS_OPTIONS.find(o => o.value === yField)?.label ?? 'U%'}
          </text>
          {isPanning && (
            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              pointerEvents="all"
              className="draft-hex-scatter-plot-hit draft-hex-scatter-plot-hit--active"
              style={{ cursor: 'grabbing' }}
            />
          )}
          {selOverlay?.type === 'rect' && (
            <rect x={selOverlay.x} y={selOverlay.y} width={selOverlay.w} height={selOverlay.h}
              className="draft-hex-scatter-sel-rect" pointerEvents="none" />
          )}
          {selOverlay?.type === 'lasso' && (
            <polygon points={selOverlay.pts}
              className="draft-hex-scatter-sel-lasso" pointerEvents="none" />
          )}
          {tooltip && (() => {
            const { point } = tooltip;
            const tipW = 118;
            const tipH = 82;
            const tipX = tooltip.svgX + tipW + 10 > W ? tooltip.svgX - tipW - 4 : tooltip.svgX + 8;
            const tipY = Math.max(PAD.top, Math.min(PAD.top + plotH - tipH, tooltip.svgY - tipH / 2));
            const fmt = (v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));
            return (
              <g className="draft-hex-scatter-tooltip" pointerEvents="none">
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 15} className="draft-hex-scatter-tooltip-title"
                  fill={eqColors[point.eq] ?? '#94a3b8'}>{point.eq}</text>
                <text x={tipX + 8} y={tipY + 29} className="draft-hex-scatter-tooltip-line">{point.date}</text>
                <text x={tipX + 8} y={tipY + 43} className="draft-hex-scatter-tooltip-line">
                  {xAxisLabel}: {fmt(point[xField])}
                </text>
                <text x={tipX + 8} y={tipY + 57} className="draft-hex-scatter-tooltip-line">
                  {yAxisLabel}: {fmt(point[yField])}
                </text>
                <text x={tipX + 8} y={tipY + 71} className="draft-hex-scatter-tooltip-meta">
                  UA {fmt(point.ua)} · UC {fmt(point.uc)}
                </text>
              </g>
            );
          })()}
        </svg>
        </div>
        {showLegend && (
          <EqLegend eqs={eqNames} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
        )}
        {controlsVisible && (
          <div className="draft-timeline">
            <div className="draft-timeline-controls">
              <button
                className="draft-timeline-btn draft-timeline-btn--play"
                onClick={() => {
                  const nextPlaying = !isPlaying;
                  let idx = selectedIdx;
                  if (!isPlaying && selectedIdx >= maxIdx) { idx = sliderMin; setSelectedIdx(sliderMin); }
                  setIsPlaying(nextPlaying);
                  scatterOnSyncRef.current?.({ isPlaying: nextPlaying, date: dateLabels[idx] ?? '', idx });
                }}
                title="재생/정지"
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <select
                className="draft-timeline-speed"
                value={playSpeed}
                onChange={e => setPlaySpeed(e.target.value as '느림' | '보통' | '빠름')}
              >
                <option value="느림">느림</option>
                <option value="보통">보통</option>
                <option value="빠름">빠름</option>
              </select>
            </div>
            <div className="draft-timeline-date--start">{dateLabels[sliderMin] ?? '-'}</div>
            <div className="draft-timeline-track--grow">
              <input
                className="draft-timeline-range"
                type="range"
                min={sliderMin}
                max={maxIdx}
                value={selectedIdx}
                onChange={e => {
                  const idx = Number(e.target.value);
                  setIsPlaying(false);
                  setSelectedIdx(idx);
                  scatterOnSyncRef.current?.({ isPlaying: false, date: dateLabels[idx] ?? '', idx });
                }}
              />
            </div>
            <div className="draft-timeline-date">{dateLabels[selectedIdx] ?? '-'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

async function downloadHexWorkbook(
  filename: string,
  sheets: { name: string; data: (string | number)[][] }[],
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const { name, data } of sheets) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRows(data);
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf]));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function HexGridCard({
  title,
  widthIdx,
  setWidthIdx,
  heightIdx,
  setHeightIdx,
  cardClassName,
  forcedHeightPx,
  hiddenEqs,
  viewportHeight,
  selectedIdx,
  dragCardId,
}: {
  title: string;
  widthIdx: number;
  setWidthIdx: React.Dispatch<React.SetStateAction<number>>;
  heightIdx: number;
  setHeightIdx: (idx: number) => void;
  cardClassName?: string;
  forcedHeightPx?: number;
  hiddenEqs: Set<string>;
  viewportHeight: number;
  selectedIdx?: number;
  dragCardId?: string;
}) {
  const [controlsVisible, setControlsVisible] = useState(false);

  const heightPreset = HEX_HEIGHT_PRESETS[heightIdx]?.value ?? 'auto';
  const height = Number.isFinite(forcedHeightPx) && (forcedHeightPx ?? 0) > 0
    ? `${Math.round(forcedHeightPx as number)}px`
    : heightPresetToCss(heightPreset, viewportHeight);
  const allRows = useMemo(() => HEX_STREAM_GROUPS.flatMap(group => group.items.flatMap(item =>
    groupHexDataByStream(item.key).map(unit => {
      const di = selectedIdx !== undefined
        ? Math.min(selectedIdx, unit.q.length - 1)
        : unit.q.length - 1;
      const q = unit.q[di] ?? 0;
      const ua = unit.ua[di] ?? 0;
      const uc = unit.uc[di] ?? 0;
      const u = uc > 0 ? (ua / uc) * 100 : 0;
      return { stream: item.htxcrId, eq: unit.htxcrId, q, ua, uc, u };
    })
  )), [selectedIdx]);
  const rows = useMemo(
    () => (hiddenEqs.size === 0 ? allRows : allRows.filter(row => !hiddenEqs.has(row.eq))),
    [allRows, hiddenEqs]
  );

  const datasetDateLabel = selectedIdx !== undefined && HEX_ISO_DATES[selectedIdx]
    ? HEX_ISO_DATES[selectedIdx]
    : 'latest';

  const buildCurrentSheet = useCallback((): (string | number)[][] => {
    const header = ['Stream', '장비', 'Q', 'UA', 'UC', 'U%'];
    return [header, ...rows.map(r => [r.stream, r.eq, r.q, r.ua, r.uc, r.u])];
  }, [rows]);

  const buildTimeSeriesSheet = useCallback((): (string | number)[][] => {
    const allPoints = toHexScatterPoints();
    const visibleEqs = new Set(rows.map(r => r.eq));
    const filtered = allPoints.filter(p => visibleEqs.has(p.eq));
    const header = ['Date', '장비', 'Q', 'UA', 'UC', 'U%'];
    return [header, ...filtered.map(p => [p.date, p.eq, p.q, p.ua, p.uc, p.u])];
  }, [rows]);

  const buildTimeSeriesUnpivotSheet = useCallback((): (string | number)[][] => {
    const ts = buildTimeSeriesSheet();
    if (ts.length < 2) return [['Date', '장비', '변수', '값']];
    const valueHeaders = ts[0].slice(2) as string[];
    const rows: (string | number)[][] = [['Date', '장비', '변수', '값']];
    for (let i = 1; i < ts.length; i++) {
      const [date, eq, ...vals] = ts[i];
      for (let j = 0; j < valueHeaders.length; j++) {
        rows.push([date, eq, valueHeaders[j], vals[j]]);
      }
    }
    return rows;
  }, [buildTimeSeriesSheet]);

  const downloadExcel = () => {
    void downloadHexWorkbook(`hex_dataset_${datasetDateLabel}.xlsx`, [
      { name: '현재 표', data: buildCurrentSheet() },
      { name: '시계열', data: buildTimeSeriesSheet() },
      { name: '시계열_Unpivot', data: buildTimeSeriesUnpivotSheet() },
    ]);
  };

  return (
    <div
      data-hex-card-id={dragCardId}
      className={`draft-chart-card draft-ekpi-card draft-chart-card--h draft-hex-empty-card draft-hex-grid-card${cardClassName ? ` ${cardClassName}` : ''}`}
      style={{ ['--hex-empty-card-height' as string]: height, height, maxHeight: height }}
      aria-label={title}
    >
      <div className="draft-ekpi-card-title draft-hex-chart-card__header">
        <DraftDragHandle title="드래그하여 카드 순서 변경" ariaLabel="드래그하여 카드 순서 변경" />
        <span>{title}</span>
        <div className="draft-card-actions">
          <button
            className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setControlsVisible(v => !v)}
            title="제어 영역"
          >
            Control
          </button>
          <select
            className="draft-toolbar-select"
            value={widthIdx}
            onChange={e => setWidthIdx(Number(e.target.value))}
            title="Width 조정"
            aria-label={`${title} Width`}
          >
            {HEX_WIDTH_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
          <select
            className="draft-toolbar-select"
            value={heightIdx}
            onChange={e => setHeightIdx(Number(e.target.value))}
            title="Height 조정"
            aria-label={`${title} Height`}
          >
            {HEX_HEIGHT_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <button
            type="button"
            className="draft-chip-btn"
            onClick={downloadExcel}
            title="엑셀 다운로드 (현재 표·시계열 각각 시트)"
          >
            엑셀 ↓
          </button>
        </div>
      )}
      <div className="draft-hex-grid-card__body">
        <table className="draft-hex-grid-table">
          <thead>
            <tr>
              <th>Stream</th>
              <th>장비</th>
              <th>Q</th>
              <th>UA</th>
              <th>UC</th>
              <th>U%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6}>선택된 장비가 없습니다.</td></tr>
            ) : (
              rows.map(row => (
                <tr key={`${row.stream}-${row.eq}`}>
                  <td>{row.stream}</td>
                  <td>{row.eq}</td>
                  <td>{row.q.toFixed(1)}</td>
                  <td>{row.ua.toFixed(1)}</td>
                  <td>{row.uc.toFixed(1)}</td>
                  <td>{row.u.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HexTrendCard({
  widthIdx,
  setWidthIdx,
  heightIdx,
  setHeightIdx,
  cardClassName,
  hiddenEqs,
  selectEq,
  selectMultipleEqs,
  forcedHeightPx,
  syncPlayback,
  onPlaybackSync,
  viewportHeight,
  periodDays,
  setPeriodDays,
  controlsVisible,
  setControlsVisible,
  showLegend,
  setShowLegend,
  dragCardId,
}: {
  widthIdx: number;
  setWidthIdx: React.Dispatch<React.SetStateAction<number>>;
  heightIdx: number;
  setHeightIdx: (idx: number) => void;
  cardClassName?: string;
  hiddenEqs: Set<string>;
  selectEq: (eq: string, multi: boolean) => void;
  selectMultipleEqs: (eqs: string[]) => void;
  forcedHeightPx?: number;
  syncPlayback?: { seq: number; isPlaying: boolean; date: string; idx: number } | null;
  onPlaybackSync?: (payload: { isPlaying: boolean; date: string; idx: number }) => void;
  viewportHeight: number;
  periodDays: number;
  setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
  controlsVisible: boolean;
  setControlsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  showLegend: boolean;
  setShowLegend: React.Dispatch<React.SetStateAction<boolean>>;
  dragCardId?: string;
}) {
  const lineData = useMemo(() => toHexLinePoints(), []);
  const syncPlaybackRef = useRef(syncPlayback ?? null);
  syncPlaybackRef.current = syncPlayback ?? null;
  const trendOnSyncRef = useRef(onPlaybackSync);
  trendOnSyncRef.current = onPlaybackSync;
  const localIdxRef = useRef(0);
  const filteredDatesRef = useRef<string[]>([]);
  const datesRef = useRef<string[]>([]);
  const eqColors = useMemo(
    () => Object.fromEntries(ALL_HEX_EQ_NAMES.map(name => [name, EQ_GROUP_COLORS[name] ?? '#7dd3fc'])),
    []
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useContainerSize(wrapRef);
  const [playSpeed, setPlaySpeed] = useState(800);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localIdx, setLocalIdx] = useState(0);
  const [scaled, setScaled] = useState(true);
  const [split, setSplit] = useState(true);
  const [showSlope, setShowSlope] = useState(true);
  const [showCenter, setShowCenter] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);
  const [showUA, setShowUA] = useState(false);
  const [showUC, setShowUC] = useState(false);
  const [hoveredEq, setHoveredEq] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ key: string; date: string; value: number; svgX: number; svgY: number } | null>(null);
  const [singleAxisRange, setSingleAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [multiAxisRanges, setMultiAxisRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [xViewRange, setXViewRange] = useState<{ start: number; end: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const xPanRef = useRef<{ startX: number; visStart: number; visEnd: number; plotW: number } | null>(null);
  const axisDragRef = useRef<AxisDragState | null>(null);
  const wheelStateRef = useRef<MultiAxisWheelState>({
    visStart: 0, visEnd: 1, plotW: 400, plotH: 200, totalLeft: HEX_TREND_PAD.left, datesLen: 0,
    scaled: false,
    activeSeriesInfo: [],
    axisTypes: [],
    activeGlobalMin: 0, activeGlobalMax: 1, globalMin: 0, globalMax: 1,
    plotTop: HEX_TREND_PAD.top, svgW: 400, svgH: 280,
  });

  const eqs = useMemo(() => sortHexEqNames(lineData.map(d => d.eq)), [lineData]);
  const dates = useMemo(() => [...new Set(lineData.map(d => d.date))].sort(), [lineData]);
  const filteredDates = useMemo(() => {
    if (periodDays <= 0 || periodDays >= dates.length) return dates;
    return dates.slice(dates.length - periodDays);
  }, [dates, periodDays]);
  // 슬라이더는 dates 전체 기준 — localIdx는 dates 인덱스
  const maxIdx = Math.max(0, dates.length - 1);
  const trendSliderMin = periodDays > 0 && periodDays < dates.length
    ? Math.max(0, dates.length - periodDays)
    : 0;
  localIdxRef.current = localIdx;
  filteredDatesRef.current = filteredDates;
  datesRef.current = dates;
  const safeLocalIdx = Math.max(trendSliderMin, Math.min(maxIdx, localIdx));
  const activeDate = dates[safeLocalIdx] ?? dates[dates.length - 1] ?? '';

  useEffect(() => {
    setLocalIdx(maxIdx);
    setIsPlaying(false);
  }, [maxIdx]);

  useEffect(() => {
    setLocalIdx(prev => (prev < trendSliderMin ? maxIdx : prev));
  }, [trendSliderMin, maxIdx]);

  const fireTrendSync = (playing: boolean, idx: number) => {
    const d = datesRef.current;
    const fn = trendOnSyncRef.current;
    if (!fn) return;
    const globalDate = d[idx] ?? '';
    if (globalDate) fn({ isPlaying: playing, date: globalDate, idx });
  };

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      const cur = localIdxRef.current;
      if (cur >= maxIdx) {
        setIsPlaying(false);
        fireTrendSync(false, cur);
        return;
      }
      const next = cur + 1;
      setLocalIdx(next);
      fireTrendSync(true, next);
    }, playSpeed);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxIdx, playSpeed]);

  const hexScatterData = useMemo(() => toHexScatterPoints(), []);

  const dataMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const point of lineData) {
      for (const [k, v] of [[`${point.eq}:A`, point.x], [`${point.eq}:B`, point.y]] as [string, number][]) {
        if (!map.has(k)) map.set(k, new Map());
        map.get(k)!.set(point.date, v);
      }
    }
    for (const point of hexScatterData) {
      for (const [k, v] of [[`${point.eq}:UA`, point.ua], [`${point.eq}:UC`, point.uc]] as [string, number][]) {
        if (!map.has(k)) map.set(k, new Map());
        map.get(k)!.set(point.date, v);
      }
    }
    return map;
  }, [lineData, hexScatterData]);

  const varIncluded = (v: string): boolean => {
    if (v === 'A') return showA;
    if (v === 'B') return showB;
    if (v === 'UA') return showUA;
    if (v === 'UC') return showUC;
    return false;
  };

  const activeSeries = useMemo(
    () => eqs
      .flatMap(eq => [
        ...(showA  ? [`${eq}:A`]  : []),
        ...(showB  ? [`${eq}:B`]  : []),
        ...(showUA ? [`${eq}:UA`] : []),
        ...(showUC ? [`${eq}:UC`] : []),
      ])
      .filter(key => !hiddenEqs.has(key.split(':')[0])),
    [eqs, hiddenEqs, showA, showB, showUA, showUC]
  );
  const axisTypes = useMemo(
    () => [...new Set(activeSeries.map(k => k.split(':')[1]))],
    [activeSeries]
  );
  const useSplit = scaled && split && axisTypes.length >= 2;
  const activeSplitTypes = useMemo(
    () => useSplit ? ['A', 'B', 'UA', 'UC'].filter(v => axisTypes.includes(v)) : [],
    [useSplit, axisTypes]
  );
  const numBands = activeSplitTypes.length > 0 ? activeSplitTypes.length : 1;
  const extraLeft = (scaled && !useSplit) ? Math.max(0, axisTypes.length - 1) * HEX_TREND_AXIS_W : 0;
  const totalLeft = HEX_TREND_PAD.left + extraLeft;
  const plotTop = showCenter || showSlope ? HEX_TREND_CENTER_PAD_TOP : HEX_TREND_PAD.top;
  const padRight = showCenter ? HEX_TREND_CENTER_PAD_RIGHT : HEX_TREND_PAD.right;
  const plotW = Math.max(10, size.w - totalLeft - padRight);
  const plotH = Math.max(10, size.h - plotTop - HEX_TREND_PAD.bottom);
  const splitBandH = plotH / numBands;
  const visStart = xViewRange?.start ?? 0;
  const visEnd = xViewRange?.end ?? 1;
  const visRange = Math.max(visEnd - visStart, 1e-6);

  const seriesInfo = useMemo(() => activeSeries.map(key => {
    const [eq] = key.split(':');
    const dm = dataMap.get(key);
    const values = dates.map(d => dm?.get(d) ?? Number.NaN);
    const finite = values.filter(Number.isFinite);
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 1;
    const range = Math.max(max - min, 1e-6);
    return { key, values, min, max, range, color: eqColors[eq] ?? '#94a3b8' };
  }), [activeSeries, dataMap, dates, eqColors]);

  const globalMin = seriesInfo.length ? Math.min(...seriesInfo.map(s => s.min)) : 0;
  const globalMax = seriesInfo.length ? Math.max(...seriesInfo.map(s => s.max)) : 1;
  const globalAxis = singleAxisRange
    ? {
        min: singleAxisRange.min,
        max: singleAxisRange.max,
        range: Math.max(singleAxisRange.max - singleAxisRange.min, 1e-6),
      }
    : hexTrendPaddedAxis(globalMin, globalMax);
  const activeGlobalMin = globalAxis.min;
  const activeGlobalMax = globalAxis.max;
  const activeGlobalRange = globalAxis.range;

  const activeSeriesInfo = seriesInfo.map(s => {
    const [, axisType] = s.key.split(':');
    if (scaled) {
      const customRange = multiAxisRanges[axisType];
      const typeSeries = seriesInfo.filter(item => item.key.endsWith(`:${axisType}`));
      const dataMin = typeSeries.length ? Math.min(...typeSeries.map(item => item.min)) : 0;
      const dataMax = typeSeries.length ? Math.max(...typeSeries.map(item => item.max)) : 1;
      const typeAxis = customRange
        ? {
            min: customRange.min,
            max: customRange.max,
            range: Math.max(customRange.max - customRange.min, 1e-6),
          }
        : hexTrendPaddedAxis(dataMin, dataMax);
      return { ...s, axisMin: typeAxis.min, axisMax: typeAxis.max, axisRange: typeAxis.range };
    }
    return { ...s, axisMin: s.min, axisMax: s.max, axisRange: s.range };
  });

  const visIdx = useMemo(() => ({
    fvi: Math.max(0, Math.floor(visStart * (dates.length - 1))),
    lvi: Math.min(dates.length - 1, Math.ceil(visEnd * (dates.length - 1))),
  }), [visStart, visEnd, dates.length]);

  const centerMarks = useMemo(() => {
    if (!showCenter) return [];
    return buildABCenterMarks(lineData, dates, eqs, hiddenEqs, visIdx.fvi, visIdx.lvi, eqColors);
  }, [showCenter, lineData, dates, eqs, hiddenEqs, visIdx.fvi, visIdx.lvi, eqColors]);

  const centerScale = useCallback((m: { eq: string | null; var: 'A' | 'B'; color: string }) => {
    const key = m.eq ? `${m.eq}:${m.var}` : null;
    const s = key
      ? activeSeriesInfo.find(item => item.key === key)
      : activeSeriesInfo.find(item => item.key.endsWith(`:${m.var}`));
    if (!s) return null;
    return {
      color: m.color,
      axisMin: scaled ? s.axisMin : activeGlobalMin,
      axisRange: scaled ? s.axisRange : activeGlobalRange,
    };
  }, [activeSeriesInfo, scaled, activeGlobalMin, activeGlobalRange]);

  const HEX_VAR_COLORS: Record<string, string> = { A: '#94a3b8', B: '#7dd3fc', UA: '#3FB950', UC: '#D2A8FF' };
  const HEX_VAR_LABELS: Record<string, string> = { A: 'Q', B: 'U%', UA: 'UA', UC: 'UC' };
  const activeVarTypes = ['A', 'B', 'UA', 'UC'].filter(v => varIncluded(v));

  const slopeLines = useMemo(() => {
    if (!showSlope) return [] as {
      label: string; color: string; eq: string | null; var: string;
      reg: { m: number; b: number; r2: number }; i0: number; i1: number;
      axisMin: number; axisRange: number;
    }[];
    const { fvi, lvi } = visIdx;
    const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
    const useAverage = hiddenEqs.size === 0;
    const lines: {
      label: string; color: string; eq: string | null; var: string;
      reg: { m: number; b: number; r2: number }; i0: number; i1: number;
      axisMin: number; axisRange: number;
    }[] = [];
    const scaleFor = (v: string, eq: string | null) => {
      const key = eq ? `${eq}:${v}` : null;
      const s = key
        ? activeSeriesInfo.find(item => item.key === key)
        : activeSeriesInfo.find(item => item.key.endsWith(`:${v}`));
      if (!s) return null;
      return {
        color: eq ? s.color : (HEX_VAR_COLORS[v] ?? '#94a3b8'),
        axisMin: scaled ? s.axisMin : activeGlobalMin,
        axisRange: scaled ? s.axisRange : activeGlobalRange,
      };
    };
    const pushLine = (label: string, eq: string | null, v: string, indices: number[], vals: number[]) => {
      if (!varIncluded(v)) return;
      if (indices.length < 2) return;
      const reg = lineRegression(indices, vals);
      const sc = scaleFor(v, eq);
      if (!reg || !sc) return;
      lines.push({
        label: `${label} ${HEX_VAR_LABELS[v] ?? v}`,
        color: sc.color, eq, var: v, reg,
        i0: indices[0], i1: indices[indices.length - 1],
        axisMin: sc.axisMin, axisRange: sc.axisRange,
      });
    };
    if (useAverage) {
      for (const v of activeVarTypes) {
        const indices: number[] = [];
        const vals: number[] = [];
        for (let i = fvi; i <= lvi; i += 1) {
          const bucket: number[] = [];
          for (const eq of visibleEqs) {
            const value = dataMap.get(`${eq}:${v}`)?.get(dates[i]);
            if (Number.isFinite(value)) bucket.push(value as number);
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
        for (const v of activeVarTypes) {
          const indices: number[] = [];
          const vals: number[] = [];
          for (let i = fvi; i <= lvi; i += 1) {
            const value = dataMap.get(`${eq}:${v}`)?.get(dates[i]);
            if (Number.isFinite(value)) { indices.push(i); vals.push(value as number); }
          }
          pushLine(eq, eq, v, indices, vals);
        }
      }
    }
    return lines;
  }, [
    showSlope, showA, showB, showUA, showUC, visIdx, eqs, hiddenEqs, dataMap, dates,
    activeSeriesInfo, scaled, activeGlobalMin, activeGlobalRange,
  ]);

  useEffect(() => {
    if (periodDays <= 0 || periodDays >= dates.length) {
      setXViewRange(null);
    } else {
      const start = (dates.length - periodDays) / Math.max(dates.length - 1, 1);
      setXViewRange({ start, end: 1 });
    }
    setSingleAxisRange(null);
    setMultiAxisRanges({});
  }, [periodDays, dates.length]);

  useEffect(() => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
  }, [scaled, activeSeries.join('|')]);

  useEffect(() => {
    if (!scaled) setSplit(false);
  }, [scaled]);

  useEffect(() => {
    if (!syncPlayback) return;
    const globalIdx = dates.indexOf(syncPlayback.date);
    if (globalIdx >= 0) setLocalIdx(Math.max(0, Math.min(maxIdx, globalIdx)));
    if (!syncPlayback.isPlaying) setIsPlaying(false);
  }, [syncPlayback, dates, maxIdx]);


  wheelStateRef.current = {
    visStart, visEnd, plotW, plotH, totalLeft, datesLen: dates.length,
    scaled, activeSeriesInfo, axisTypes, activeGlobalMin, activeGlobalMax, globalMin, globalMax,
    plotTop, svgW: size.w, svgH: size.h,
  };

  useMultiAxisWheelZoom(svgRef, wheelStateRef, setXViewRange, setSingleAxisRange, setMultiAxisRanges);

  useLineTouchPan(svgRef, wheelStateRef, plotW, plotH, setIsPanning, setXViewRange);

  const xScale = (i: number) => {
    const frac = dates.length <= 1 ? 0 : i / (dates.length - 1);
    return totalLeft + ((frac - visStart) / visRange) * plotW;
  };
  const yScaleVar = useCallback((v: string, val: number, mn: number, rng: number) => {
    if (!useSplit) return plotTop + plotH - ((val - mn) / rng) * plotH;
    const bandIdx = Math.max(0, activeSplitTypes.indexOf(v));
    const bandTop = plotTop + bandIdx * splitBandH;
    return bandTop + splitBandH - ((val - mn) / rng) * splitBandH;
  }, [useSplit, plotTop, plotH, splitBandH, activeSplitTypes]);
  const yScale = (val: number, mn: number, rng: number, v?: string) =>
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
        const cy = useSplit ? yScaleVar(m.var, m.mean, sc.axisMin, sc.axisRange)
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
      return activeSplitTypes.flatMap((v, bi) => {
        const bandRaw = raw.filter(r => r.var === v);
        const bTop = plotTop + bi * splitBandH;
        return layoutHexTrendCenterLabels(bandRaw, bTop + 5, bTop + splitBandH - 5, HEX_TREND_CENTER_LABEL_MIN_DY);
      });
    }
    return layoutHexTrendCenterLabels(raw, plotTop + 5, plotTop + plotH - 5, HEX_TREND_CENTER_LABEL_MIN_DY);
  }, [showCenter, centerMarks, showA, showB, hoveredEq, centerScale, useSplit, plotTop, plotH, splitBandH, yScaleVar]);

  const startAxisDrag = useYAxisDrag(axisDragRef, plotH, setSingleAxisRange, setMultiAxisRanges);

  const resetAll = () => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
    if (periodDays <= 0 || periodDays >= dates.length) setXViewRange(null);
    else setXViewRange({ start: (dates.length - periodDays) / Math.max(dates.length - 1, 1), end: 1 });
    setShowSlope(false);
    setShowCenter(false);
    setShowA(true);
    setShowB(true);
    setShowUA(false);
    setShowUC(false);
    setScaled(true);
    setSplit(false);
    setHoveredEq(null);
    setControlsVisible(true);
    setShowLegend(true);
    setIsPlaying(false);
    setLocalIdx(maxIdx);
    selectMultipleEqs([]);
  };
  const isModified = useMemo(() =>
    singleAxisRange !== null || Object.keys(multiAxisRanges).length > 0 || showSlope || showCenter || !showA || !showB || showUA || showUC || !scaled || split,
  [singleAxisRange, multiAxisRanges, showSlope, showCenter, showA, showB, showUA, showUC, scaled, split]);

  const startPan = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const st = wheelStateRef.current;
    xPanRef.current = { startX: e.clientX, visStart: st.visStart, visEnd: st.visEnd, plotW: st.plotW };
    setIsPanning(true);
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (!xPanRef.current || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!xPanRef.current) return;
        const { startX, visStart: s, visEnd: e2, plotW: pw2 } = xPanRef.current;
        const vr = e2 - s;
        const dFrac = (-(ev.clientX - startX) / pw2) * vr;
        let ns = s + dFrac;
        let ne = e2 + dFrac;
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
    const st = wheelStateRef.current;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const mouseRelX = Math.max(0, Math.min(st.plotW, e.clientX - svgRect.left - st.totalLeft));
    const fracAtClick = st.visStart + (mouseRelX / st.plotW) * (st.visEnd - st.visStart);
    const startX = e.clientX;
    const curRange = st.visEnd - st.visStart;
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isPan) {
          const shift = ((ev.clientX - startX) / st.plotW) * curRange;
          let ns = st.visStart - shift;
          let ne = st.visEnd - shift;
          if (ns < 0) { ne -= ns; ns = 0; }
          if (ne > 1) { ns -= (ne - 1); ne = 1; }
          ns = Math.max(0, ns); ne = Math.min(1, ne);
          if (ne - ns >= 1 - 1e-9) setXViewRange(null);
          else setXViewRange({ start: ns, end: ne });
        } else {
          const factor = Math.exp((ev.clientX - startX) / 300);
          const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(st.datesLen - 1, 1));
          let ns = fracAtClick - ((fracAtClick - st.visStart) / curRange) * newRange;
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
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      key,
      date,
      value,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  const heightPreset = HEX_HEIGHT_PRESETS[heightIdx]?.value ?? 'auto';
  const height = Number.isFinite(forcedHeightPx) && (forcedHeightPx ?? 0) > 0
    ? `${Math.round(forcedHeightPx as number)}px`
    : heightPresetToCss(heightPreset, viewportHeight);

  return (
    <div
      data-hex-card-id={dragCardId}
      className={`draft-chart-card draft-ekpi-card draft-chart-card--h draft-hex-trend-card ${cardClassName ?? ''}`}
      style={{
        ['--hex-trend-card-height' as string]: height,
        height,
        maxHeight: height,
      }}
    >
      <div className="draft-ekpi-card-title draft-hex-chart-card__header">
        <DraftDragHandle title="드래그하여 카드 순서 변경" ariaLabel="드래그하여 카드 순서 변경" />
        <span>{HEX_TREND_TITLE}</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${showLegend ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowLegend(v => !v)} title="범례 표시">범례</button>
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setControlsVisible(v => !v)} title="제어 영역 표시">Control</button>
          <select
            className="draft-toolbar-select"
            value={widthIdx}
            onChange={e => setWidthIdx(Number(e.target.value))}
            title="Width 조정"
            aria-label="HEX Trend Width"
          >
            {HEX_WIDTH_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
          <select
            className="draft-toolbar-select"
            value={heightIdx}
            onChange={e => setHeightIdx(Number(e.target.value))}
            title="Height 조정"
            aria-label="HEX Trend Height"
          >
            {HEX_HEIGHT_PRESETS.map((p, i) => (
              <option key={p.value} value={i}>{p.label}</option>
            ))}
          </select>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`} onClick={resetAll} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} allLast />
          <button className={`draft-chip-btn${showA ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowA(v => !v)}>Q</button>
          <button className={`draft-chip-btn${showB ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowB(v => !v)}>U%</button>
          <button className={`draft-chip-btn${showUA ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            style={{ color: showUA ? '#3FB950' : undefined }}
            onClick={() => setShowUA(v => !v)}>UA</button>
          <button className={`draft-chip-btn${showUC ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            style={{ color: showUC ? '#D2A8FF' : undefined }}
            onClick={() => setShowUC(v => !v)}>UC</button>
          <button className={`draft-chip-btn${scaled ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setScaled(v => !v)} title="다중 Y축 전환">Multi Y</button>
          {scaled && axisTypes.length >= 2 && (
            <button className={`draft-chip-btn${split ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
              onClick={() => setSplit(v => !v)} title="변수별 밴드 분리">Split</button>
          )}
          <button className={`draft-chip-btn${showSlope ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowSlope(v => !v)} title="A·B 시계열 회귀선">Slope</button>
          <button className={`draft-chip-btn${showCenter ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowCenter(v => !v)} title="A·B 평균 수평선">Center</button>
          <button className={`draft-chip-btn${showMarkers ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowMarkers(v => !v)} title="데이터 마커 표시">Markers</button>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg draft-chart-touch" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <defs>
            <clipPath id="hex-trend-plot-clip">
              <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          <rect x={totalLeft} y={plotTop} width={plotW} height={plotH} fill="transparent"
            onDoubleClick={resetAll} onMouseDown={startPan}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }} />
          {useSplit ? (
            Array.from({ length: numBands }, (_, bi) =>
              [0, 0.5, 1].map(r => (
                <line key={`band${bi}-${r}`}
                  x1={totalLeft} y1={plotTop + bi * splitBandH + splitBandH * (1 - r)}
                  x2={totalLeft + plotW} y2={plotTop + bi * splitBandH + splitBandH * (1 - r)}
                  stroke="#1e293b" strokeWidth={1} />
              ))
            ).flat()
          ) : (
            [0, 0.25, 0.5, 0.75, 1].map(r => (
              <line key={r} x1={totalLeft} y1={plotTop + plotH * (1 - r)}
                x2={totalLeft + plotW} y2={plotTop + plotH * (1 - r)}
                stroke="#1e293b" strokeWidth={1} />
            ))
          )}
          {useSplit && Array.from({ length: numBands - 1 }, (_, i) => (
            <line key={`div${i}`}
              x1={totalLeft} y1={plotTop + (i + 1) * splitBandH}
              x2={totalLeft + plotW} y2={plotTop + (i + 1) * splitBandH}
              stroke="#334155" strokeWidth={1.5} />
          ))}
          {scaled ? (
            axisTypes.map((axisType, idx) => {
              const typeSeries = activeSeriesInfo.filter(s => s.key.endsWith(`:${axisType}`));
              const axMin = typeSeries.length ? typeSeries[0].axisMin : 0;
              const axMax = typeSeries.length ? typeSeries[0].axisMax : 1;
              const axRange = typeSeries.length ? typeSeries[0].axisRange : 1;
              const axColor = HEX_VAR_COLORS[axisType] ?? '#94a3b8';
              const bandIdx = useSplit ? Math.max(0, activeSplitTypes.indexOf(axisType)) : 0;
              const bandTop = useSplit ? plotTop + bandIdx * splitBandH : plotTop;
              const bandH = useSplit ? splitBandH : plotH;
              const axX = useSplit ? totalLeft : (idx === 0 ? totalLeft : totalLeft - idx * HEX_TREND_AXIS_W);
              return (
                <g key={axisType}
                  onMouseDown={e => startAxisDrag(e, 'multi', axMin, axMax, axisType)}
                  onContextMenu={ev => ev.preventDefault()}
                  onDoubleClick={() => setMultiAxisRanges(prev => { const n = { ...prev }; delete n[axisType]; return n; })}
                  style={{ cursor: 'ns-resize' }}>
                  <rect x={axX - HEX_TREND_AXIS_W + 2} y={bandTop} width={HEX_TREND_AXIS_W} height={bandH} fill="transparent" />
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
                  <text
                    transform={`translate(${hexTrendYAxisNameX(axX)},${bandTop + bandH / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill={axColor}
                    opacity={0.75}
                    pointerEvents="none"
                  >
                    {HEX_VAR_LABELS[axisType] ?? axisType}
                  </text>
                </g>
              );
            })
          ) : (
            <g onMouseDown={e => startAxisDrag(e, 'single', activeGlobalMin, activeGlobalMax)}
              onContextMenu={ev => ev.preventDefault()} style={{ cursor: 'ns-resize' }}>
              <rect x={0} y={plotTop} width={totalLeft} height={plotH} fill="transparent" />
              <line x1={totalLeft} y1={plotTop} x2={totalLeft} y2={plotTop + plotH} stroke="#334155" strokeWidth={1.5} />
              {Array.from({ length: 5 }, (_, i) => {
                const ratio = i / 4;
                const val = activeGlobalMin + ratio * activeGlobalRange;
                const y = plotTop + plotH * (1 - ratio);
                return (
                  <g key={i}>
                    <line x1={totalLeft - 4} y1={y} x2={totalLeft} y2={y} stroke="#334155" strokeWidth={1} />
                    <text x={totalLeft - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#7d8590">
                      {val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.round(val)}
                    </text>
                  </g>
                );
              })}
              <text transform={`translate(${hexTrendYAxisNameX(totalLeft)},${plotTop + plotH / 2}) rotate(-90)`} textAnchor="middle"
                fontSize="9" fontWeight="600" fill="#7d8590">Value</text>
            </g>
          )}
          <line x1={totalLeft} y1={plotTop + plotH} x2={totalLeft + plotW} y2={plotTop + plotH} stroke="#334155" strokeWidth={1.5} />
          {(() => {
            const { fvi, lvi } = visIdx;
            const visCount = lvi - fvi + 1;
            const step = Math.max(1, Math.ceil(visCount / 6));
            const ticks: number[] = [];
            for (let i = fvi; i <= lvi; i += step) ticks.push(i);
            if (ticks[ticks.length - 1] !== lvi) ticks.push(lvi);
            return ticks.map(i => {
              const x = xScale(i);
              if (x < totalLeft - 1 || x > totalLeft + plotW + 1) return null;
              return (
                <g key={i}>
                  <line x1={x} y1={plotTop + plotH} x2={x} y2={plotTop + plotH + 4} stroke="#334155" strokeWidth={1} />
                  <text x={x} y={plotTop + plotH + 13} textAnchor="middle" fontSize="9" fill="#7d8590">
                    {dates[i]?.slice(5) ?? ''}
                  </text>
                </g>
              );
            });
          })()}
          <rect x={totalLeft} y={plotTop + plotH} width={plotW} height={HEX_TREND_PAD.bottom}
            fill="transparent" onMouseDown={startXAxisZoom}
            onContextMenu={ev => ev.preventDefault()}
            style={{ cursor: 'ew-resize' }} />
          <g clipPath="url(#hex-trend-plot-clip)">
            {(() => {
              const ai = dates.indexOf(activeDate);
              if (ai < 0) return null;
              const x = xScale(ai);
              if (x < totalLeft - 1 || x > totalLeft + plotW + 1) return null;
              return <line x1={x} y1={plotTop} x2={x} y2={plotTop + plotH} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.9} />;
            })()}
            {activeSeriesInfo.map((s, sIdx) => {
              const [eq, lineVar] = s.key.split(':') as [string, string];
              const isHoveredEq = hoveredEq === eq;
              const dimSeries = hoveredEq !== null && !isHoveredEq;
              const sMin = scaled ? s.axisMin : activeGlobalMin;
              const sRange = scaled ? s.axisRange : activeGlobalRange;
              const isDashed = lineVar === 'B';
              const segments: string[][] = [];
              let cur: string[] = [];
              for (const [i, v] of s.values.entries()) {
                if (Number.isFinite(v)) cur.push(`${xScale(i)},${yScale(v, sMin, sRange, lineVar)}`);
                else if (cur.length > 1) { segments.push(cur); cur = []; }
                else cur = [];
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
                  {showMarkers && s.values.map((v, i) => {
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
            {showSlope && slopeLines.map((sl, li) => {
              const dim = hoveredEq !== null && sl.eq !== null && hoveredEq !== sl.eq;
              const y0 = sl.reg.m * sl.i0 + sl.reg.b;
              const y1 = sl.reg.m * sl.i1 + sl.reg.b;
              return (
                <line key={`slope-${li}`}
                  x1={xScale(sl.i0)} y1={yScale(y0, sl.axisMin, sl.axisRange, sl.var)}
                  x2={xScale(sl.i1)} y2={yScale(y1, sl.axisMin, sl.axisRange, sl.var)}
                  stroke={sl.color} strokeWidth={1.5}
                  strokeDasharray={sl.var === 'B' ? '5 4' : undefined}
                  opacity={dim ? 0.12 : 0.9}
                  pointerEvents="none" />
              );
            })}
            {tooltip && (() => {
              const [eq, v] = tooltip.key.split(':');
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
                  <text x={tipX + 8} y={tipY + 38} fontSize="9" fill="#94a3b8">{tooltip.value.toFixed(2)}</text>
                </>
              );
            })()}
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
        </svg>
      </div>
      {showLegend && (
        <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
      )}
      {controlsVisible && dates.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying}
          playSpeed={playSpeed}
          sliderIdx={safeLocalIdx}
          minIdx={trendSliderMin}
          maxIdx={maxIdx}
          startDate={dates[trendSliderMin] ?? ''}
          currentDate={activeDate}
          onPlay={() => {
            if (isPlaying) {
              setIsPlaying(false);
              fireTrendSync(false, safeLocalIdx);
              return;
            }
            const idx = safeLocalIdx >= maxIdx ? trendSliderMin : safeLocalIdx;
            if (safeLocalIdx >= maxIdx) setLocalIdx(trendSliderMin);
            setIsPlaying(true);
            fireTrendSync(true, idx);
          }}
          onSpeedChange={setPlaySpeed}
          onSlider={(idx) => { setLocalIdx(idx); fireTrendSync(false, idx); }}
        />
      )}
    </div>
  );
}

export const DraftHexPanel: React.FC<DraftHexPanelProps> = ({ layoutState, onLayoutStateChange }) => {
  const HEX_SLOT_IDS = new Set<HexSlotId>(['main', 'scatter', 'empty-stack']);
  const initialLayout = layoutState ?? createDefaultHexLayoutState();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 1000
  );
  const [spacingIdx, setSpacingIdx] = useState(initialLayout.spacingIdx);
  const [rowHeightIdx, setRowHeightIdx] = useState(initialLayout.rowHeightIdx);
  const [widthIdx, setWidthIdx] = useState(initialLayout.widthIdx);
  const [heightIdx, setHeightIdx] = useState(initialLayout.heightIdx);
  const [scatterWidthIdx, setScatterWidthIdx] = useState(initialLayout.scatterWidthIdx);
  const [scatterHeightIdx, setScatterHeightIdx] = useState(initialLayout.scatterHeightIdx);
  const [empty1WidthIdx, setEmpty1WidthIdx] = useState(initialLayout.empty1WidthIdx);
  const [empty1HeightIdx, setEmpty1HeightIdx] = useState(initialLayout.empty1HeightIdx);
  const [empty2WidthIdx, setEmpty2WidthIdx] = useState(initialLayout.empty2WidthIdx);
  const [empty2HeightIdx, setEmpty2HeightIdx] = useState(initialLayout.empty2HeightIdx);
  const [linkedPeriodDays, setLinkedPeriodDays] = useState(initialLayout.linkedPeriodDays);
  const [linkedControlsVisible, setLinkedControlsVisible] = useState(initialLayout.linkedControlsVisible);
  const [linkedShowLegend, setLinkedShowLegend] = useState(initialLayout.linkedShowLegend);
  const [hexSlotOrder, setHexSlotOrder] = useState<HexSlotId[]>(initialLayout.slotOrder);
  const [hiddenEqs, setHiddenEqs] = useState<Set<string>>(new Set(initialLayout.hiddenEqs));
  const [scatterXField, setScatterXField] = useState<ScatterAxisField>(initialLayout.scatterXField);
  const [scatterYField, setScatterYField] = useState<ScatterAxisField>(initialLayout.scatterYField);
  const [draggingHexSlotId, setDraggingHexSlotId] = useState<HexSlotId | null>(null);
  const [scatterResetSignal, setScatterResetSignal] = useState(0);
  const scatterCardRef = useRef<HTMLDivElement | null>(null);
  const [scatterRenderHeight, setScatterRenderHeight] = useState(0);
  const [sharedPlaybackSync, setSharedPlaybackSync] = useState<{ seq: number; isPlaying: boolean; date: string; idx: number } | null>(null);
  const width = HEX_WIDTH_PRESETS[widthIdx]?.value ?? '100%';
  const heightPreset = HEX_HEIGHT_PRESETS[heightIdx]?.value ?? 'auto';
  const height = heightPresetToCss(heightPreset, viewportHeight);
  const gap = HEX_SPACING_PRESETS[spacingIdx]?.gap ?? 8;
  const hideSparkline = width === '15%' || width === '10%';
  const mainWidthNum = widthPresetToNumber(width);
  const scatterWidthNum = widthPresetToNumber(HEX_WIDTH_PRESETS[scatterWidthIdx]?.value ?? '40%');
  const empty1WidthNum = widthPresetToNumber(HEX_WIDTH_PRESETS[empty1WidthIdx]?.value ?? '20%');
  const empty2WidthNum = widthPresetToNumber(HEX_WIDTH_PRESETS[empty2WidthIdx]?.value ?? '20%');
  const scatterHeightNum = heightPresetToPixels(HEX_HEIGHT_PRESETS[scatterHeightIdx]?.value ?? '70%', viewportHeight);
  const empty1HeightNum = heightPresetToPixels(HEX_HEIGHT_PRESETS[empty1HeightIdx]?.value ?? '35%', viewportHeight);
  const empty2HeightNum = heightPresetToPixels(HEX_HEIGHT_PRESETS[empty2HeightIdx]?.value ?? '35%', viewportHeight);
  useEffect(() => {
    const calcViewportBasis = () => {
      const panelEl = panelRef.current;
      if (!panelEl) return;
      const scrollEl = panelEl.closest('.draft-page--scroll') as HTMLElement | null;
      if (!scrollEl) {
        setViewportHeight(window.innerHeight);
        return;
      }
      const scrollRect = scrollEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      // top bar / section header가 차지한 영역을 제외한 현재 가시 높이 기준
      const available = Math.floor(scrollRect.bottom - panelRect.top - 8);
      if (available > 0) setViewportHeight(available);
    };
    calcViewportBasis();
    const panelEl = panelRef.current;
    const scrollEl = panelEl?.closest('.draft-page--scroll') as HTMLElement | null;
    const ro = new ResizeObserver(() => calcViewportBasis());
    if (panelEl) ro.observe(panelEl);
    if (scrollEl) ro.observe(scrollEl);
    window.addEventListener('resize', calcViewportBasis);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcViewportBasis);
    };
  }, []);
  useEffect(() => {
    const el = scatterCardRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setScatterRenderHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shouldStackEmptyCards = true;
  const stackContainerHeight = scatterRenderHeight > 0 ? scatterRenderHeight : scatterHeightNum;
  const stackHeightBudget = Math.max(0, stackContainerHeight - HEX_EMPTY_STACK_GAP_PX);
  const shouldAlignStackHeights = shouldStackEmptyCards
    && stackHeightBudget > 0
    && empty1HeightNum > 0
    && empty2HeightNum > 0;
  let alignedEmpty1Height: number | undefined;
  let alignedEmpty2Height: number | undefined;
  if (shouldAlignStackHeights) {
    const trendH = Math.min(empty1HeightNum, Math.max(1, stackHeightBudget - 1));
    const dataH = Math.max(1, stackHeightBudget - trendH);
    alignedEmpty1Height = trendH;
    alignedEmpty2Height = dataH;
  }
  const [hoveredEq, setHoveredEq] = useState<string | null>(null);
  const setTrendHeightLinked = useCallback((nextIdx: number) => {
    const rawPct = heightPresetPercentByIdx(nextIdx);
    if (rawPct === null) {
      setEmpty1HeightIdx(nextIdx);
      return;
    }
    const trendPct = Math.max(5, Math.min(95, Math.round(rawPct / 5) * 5));
    const dataPct = 100 - trendPct;
    setEmpty1HeightIdx(findHeightPresetIdxByPercent(trendPct));
    setEmpty2HeightIdx(findHeightPresetIdxByPercent(dataPct));
  }, []);
  const setDataHeightLinked = useCallback((nextIdx: number) => {
    const rawPct = heightPresetPercentByIdx(nextIdx);
    if (rawPct === null) {
      setEmpty2HeightIdx(nextIdx);
      return;
    }
    const dataPct = Math.max(5, Math.min(95, Math.round(rawPct / 5) * 5));
    const trendPct = 100 - dataPct;
    setEmpty2HeightIdx(findHeightPresetIdxByPercent(dataPct));
    setEmpty1HeightIdx(findHeightPresetIdxByPercent(trendPct));
  }, []);
  const selectEq = useCallback((eq: string, multi: boolean) => {
    setHiddenEqs(prev => {
      if (multi) {
        const next = new Set(prev);
        next.has(eq) ? next.delete(eq) : next.add(eq);
        return next;
      }
      const onlyThis = prev.size === ALL_HEX_EQ_NAMES.length - 1 && !prev.has(eq);
      return onlyThis ? new Set<string>() : new Set(ALL_HEX_EQ_NAMES.filter(e => e !== eq));
    });
  }, []);
  const selectMultipleEqs = useCallback((eqs: string[]) => {
    setHiddenEqs(eqs.length === 0
      ? new Set<string>()
      : new Set(ALL_HEX_EQ_NAMES.filter(n => !eqs.includes(n)))
    );
  }, []);
  const selectGroup = useCallback((groupEqNames: string[], multi: boolean) => {
    setHiddenEqs(prev => {
      if (multi) {
        const next = new Set(prev);
        const anyVisible = groupEqNames.some(n => !prev.has(n));
        groupEqNames.forEach(n => { if (anyVisible) next.add(n); else next.delete(n); });
        return next;
      }
      const allOthersHidden = ALL_HEX_EQ_NAMES.every(n => groupEqNames.includes(n) || prev.has(n));
      const allGroupVisible = groupEqNames.every(n => !prev.has(n));
      if (allOthersHidden && allGroupVisible) return new Set<string>();
      return new Set(ALL_HEX_EQ_NAMES.filter(n => !groupEqNames.includes(n)));
    });
  }, []);

  const resetHexAll = useCallback(() => {
    setHexSlotOrder([...DEFAULT_HEX_SLOT_ORDER]);
    setSpacingIdx(defaultSpacingPresetIdx());
    setRowHeightIdx(defaultRowHeightPresetIdx());
    setWidthIdx(defaultWidthPresetIdx());
    setHeightIdx(defaultHeightPresetIdx());
    setScatterWidthIdx(defaultScatterWidthPresetIdx());
    setScatterHeightIdx(defaultHeightPresetIdx());
    setEmpty1WidthIdx(defaultEmptyWidthPresetIdx());
    setEmpty1HeightIdx(defaultTrendHeightPresetIdx());
    setEmpty2WidthIdx(defaultEmptyWidthPresetIdx());
    setEmpty2HeightIdx(defaultGridHeightPresetIdx());
    setLinkedPeriodDays(14);
    setLinkedControlsVisible(true);
    setLinkedShowLegend(true);
    setHiddenEqs(new Set<string>());
    setScatterXField('q');
    setScatterYField('u');
    setHoveredEq(null);
    setScatterResetSignal(v => v + 1);
    setSharedPlaybackSync(null);
  }, []);
  const handleSharedPlaybackSync = useCallback((payload: { isPlaying: boolean; date: string; idx: number }) => {
    setSharedPlaybackSync(prev => ({
      seq: (prev?.seq ?? 0) + 1,
      isPlaying: payload.isPlaying,
      date: payload.date,
      idx: payload.idx,
    }));
  }, []);

  useEffect(() => {
    if (!layoutState) return;
    setHexSlotOrder(prev => sameStringArrays(prev, layoutState.slotOrder) ? prev : [...layoutState.slotOrder]);
    setSpacingIdx(prev => (prev === layoutState.spacingIdx ? prev : layoutState.spacingIdx));
    setRowHeightIdx(prev => (prev === layoutState.rowHeightIdx ? prev : layoutState.rowHeightIdx));
    setWidthIdx(prev => (prev === layoutState.widthIdx ? prev : layoutState.widthIdx));
    setHeightIdx(prev => (prev === layoutState.heightIdx ? prev : layoutState.heightIdx));
    setScatterWidthIdx(prev => (prev === layoutState.scatterWidthIdx ? prev : layoutState.scatterWidthIdx));
    setScatterHeightIdx(prev => (prev === layoutState.scatterHeightIdx ? prev : layoutState.scatterHeightIdx));
    setEmpty1WidthIdx(prev => (prev === layoutState.empty1WidthIdx ? prev : layoutState.empty1WidthIdx));
    setEmpty1HeightIdx(prev => (prev === layoutState.empty1HeightIdx ? prev : layoutState.empty1HeightIdx));
    setEmpty2WidthIdx(prev => (prev === layoutState.empty2WidthIdx ? prev : layoutState.empty2WidthIdx));
    setEmpty2HeightIdx(prev => (prev === layoutState.empty2HeightIdx ? prev : layoutState.empty2HeightIdx));
    setLinkedPeriodDays(prev => (prev === layoutState.linkedPeriodDays ? prev : layoutState.linkedPeriodDays));
    setLinkedControlsVisible(prev => (prev === layoutState.linkedControlsVisible ? prev : layoutState.linkedControlsVisible));
    setLinkedShowLegend(prev => (prev === layoutState.linkedShowLegend ? prev : layoutState.linkedShowLegend));
    setHiddenEqs(prev => {
      const next = sortedStrings(layoutState.hiddenEqs);
      const current = sortedStrings([...prev]);
      return sameStringArrays(current, next) ? prev : new Set(next);
    });
    setScatterXField(prev => (prev === layoutState.scatterXField ? prev : layoutState.scatterXField));
    setScatterYField(prev => (prev === layoutState.scatterYField ? prev : layoutState.scatterYField));
  }, [layoutState]);

  useEffect(() => {
    if (!onLayoutStateChange) return;
    const nextState: HexLayoutState = {
      slotOrder: [...hexSlotOrder],
      hiddenEqs: [...hiddenEqs],
      scatterXField,
      scatterYField,
      spacingIdx,
      rowHeightIdx,
      widthIdx,
      heightIdx,
      scatterWidthIdx,
      scatterHeightIdx,
      empty1WidthIdx,
      empty1HeightIdx,
      empty2WidthIdx,
      empty2HeightIdx,
      linkedPeriodDays,
      linkedControlsVisible,
      linkedShowLegend,
    };
    if (layoutState && sameHexLayoutState(layoutState, nextState)) return;
    onLayoutStateChange(nextState);
  }, [
    onLayoutStateChange,
    layoutState,
    hexSlotOrder,
    spacingIdx,
    rowHeightIdx,
    widthIdx,
    heightIdx,
    scatterWidthIdx,
    scatterHeightIdx,
    empty1WidthIdx,
    empty1HeightIdx,
    empty2WidthIdx,
    empty2HeightIdx,
    linkedPeriodDays,
    linkedControlsVisible,
    linkedShowLegend,
    hiddenEqs,
    scatterXField,
    scatterYField,
  ]);

  const reorderHexSlot = useCallback((draggingId: HexSlotId, targetId: HexSlotId) => {
    if (draggingId === targetId) return;
    setHexSlotOrder(prev => {
      const from = prev.indexOf(draggingId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggingId);
      return next;
    });
  }, []);

  return (
  <div
    ref={panelRef}
    className="draft-hex-chart-card-outer"
    style={{
      ['--hex-w-main-pct' as string]: String(mainWidthNum),
      ['--hex-w-scatter-pct' as string]: String(scatterWidthNum),
      ['--hex-w-empty1-pct' as string]: String(empty1WidthNum),
      ['--hex-w-empty2-pct' as string]: String(empty2WidthNum),
      ['--hex-empty-stack-gap' as string]: `${HEX_EMPTY_STACK_GAP_PX}px`,
    }}
    onDragStartCapture={e => {
      const draggingId = e.dataTransfer.getData('text/plain') as HexSlotId;
      if (!HEX_SLOT_IDS.has(draggingId)) return;
      setDraggingHexSlotId(draggingId);
    }}
    onDragOver={e => {
      const draggingId = draggingHexSlotId ?? (e.dataTransfer.getData('text/plain') as HexSlotId);
      if (!HEX_SLOT_IDS.has(draggingId)) return;
      const targetEl = (e.target as HTMLElement).closest<HTMLElement>('[data-hex-card-id]');
      const targetId = targetEl?.dataset.hexCardId as HexSlotId | undefined;
      if (!targetId || !HEX_SLOT_IDS.has(targetId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }}
    onDrop={e => {
      const draggingId = (e.dataTransfer.getData('text/plain') as HexSlotId) || draggingHexSlotId;
      const targetEl = (e.target as HTMLElement).closest<HTMLElement>('[data-hex-card-id]');
      const targetId = targetEl?.dataset.hexCardId as HexSlotId | undefined;
      if (!draggingId || !targetId || !HEX_SLOT_IDS.has(draggingId) || !HEX_SLOT_IDS.has(targetId)) {
        setDraggingHexSlotId(null);
        return;
      }
      e.preventDefault();
      reorderHexSlot(draggingId, targetId);
      setDraggingHexSlotId(null);
    }}
    onDragEnd={() => setDraggingHexSlotId(null)}
  >
    {hexSlotOrder.map(slotId => {
      if (slotId === 'main') {
        return (
          <div
            key="main"
            data-hex-card-id="main"
            className={`draft-chart-card draft-ekpi-card draft-chart-card--h draft-hex-chart-card draft-hex-slot-main${hideSparkline ? ' draft-hex-chart-card--hide-sparkline' : ''}${draggingHexSlotId === 'main' ? ' draft-card-slot--dragging' : ''}`}
            style={{
              ['--hex-card-height' as string]: height,
              ['--hex-row-h' as string]: `${HEX_ROW_HEIGHT_PRESETS[rowHeightIdx]?.value ?? 26}px`,
            }}
          >
            <div className="draft-ekpi-card-title draft-hex-chart-card__header">
              <DraftDragHandle title="드래그하여 카드 순서 변경" ariaLabel="드래그하여 카드 순서 변경" />
              <span>{HEX_CARD_TITLE}</span>
              <div className="draft-card-actions">
                <button
                  className="draft-chip-btn"
                  onClick={resetHexAll}
                  title="HEX 전체 초기화"
                  aria-label="HEX 전체 초기화"
                >
                  ↺
                </button>
                <select
                  className="draft-toolbar-select"
                  value={rowHeightIdx}
                  onChange={e => setRowHeightIdx(Number(e.target.value))}
                  title="Row Height 조정"
                  aria-label="Row Height"
                >
                  {HEX_ROW_HEIGHT_PRESETS.map((p, i) => (
                    <option key={p.value} value={i}>{p.label}</option>
                  ))}
                </select>
                <select
                  className="draft-toolbar-select"
                  value={spacingIdx}
                  onChange={e => setSpacingIdx(Number(e.target.value))}
                  title="여백 조정"
                  aria-label="여백"
                >
                  {HEX_SPACING_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
                <select
                  className="draft-toolbar-select"
                  value={widthIdx}
                  onChange={e => setWidthIdx(Number(e.target.value))}
                  title="Width 조정"
                  aria-label="Width"
                >
                  {HEX_WIDTH_PRESETS.map((p, i) => (
                    <option key={p.value} value={i}>{p.label}</option>
                  ))}
                </select>
                <select
                  className="draft-toolbar-select"
                  value={heightIdx}
                  onChange={e => setHeightIdx(Number(e.target.value))}
                  title="Height 조정"
                  aria-label="Height"
                >
                  {HEX_HEIGHT_PRESETS.map((p, i) => (
                    <option key={p.value} value={i}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="draft-hex-panel">
              <div className="draft-hex-panel__streams-col" style={{ gap }}>
                {HEX_STREAM_GROUPS.map(group => (
                  <HexStreamGroupPanel
                    key={group.id} group={group}
                    onRowSelect={selectEq}
                    onGroupSelect={selectGroup}
                    hiddenEqs={hiddenEqs}
                    hoveredEq={hoveredEq}
                    onHoverEq={setHoveredEq}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      }

      if (slotId === 'scatter') {
        return (
          <HexPredActualScatterCard
            key="scatter"
            dragCardId="scatter"
            cardRef={scatterCardRef}
            viewportHeight={viewportHeight}
            periodDays={linkedPeriodDays}
            setPeriodDays={setLinkedPeriodDays}
            controlsVisible={linkedControlsVisible}
            setControlsVisible={setLinkedControlsVisible}
            showLegend={linkedShowLegend}
            setShowLegend={setLinkedShowLegend}
            widthIdx={scatterWidthIdx}
            setWidthIdx={setScatterWidthIdx}
            heightIdx={scatterHeightIdx}
            setHeightIdx={setScatterHeightIdx}
            hiddenEqs={hiddenEqs}
            hoveredEq={hoveredEq}
            setHoveredEq={setHoveredEq}
            selectEq={selectEq}
            selectMultipleEqs={selectMultipleEqs}
            resetSignal={scatterResetSignal}
            onPlaybackSync={handleSharedPlaybackSync}
            incomingSync={sharedPlaybackSync}
            xField={scatterXField}
            setXField={setScatterXField}
            yField={scatterYField}
            setYField={setScatterYField}
          />
        );
      }

      return shouldStackEmptyCards ? (
        <div
          key="empty-stack"
          data-hex-card-id="empty-stack"
          className={`draft-hex-slot-empty-stack${draggingHexSlotId === 'empty-stack' ? ' draft-card-slot--dragging' : ''}`}
          style={
            stackContainerHeight > 0
              ? { height: `${stackContainerHeight}px`, maxHeight: `${stackContainerHeight}px` }
              : undefined
          }
        >
          <HexTrendCard
            dragCardId="empty-stack"
            viewportHeight={viewportHeight}
            periodDays={linkedPeriodDays}
            setPeriodDays={setLinkedPeriodDays}
            controlsVisible={linkedControlsVisible}
            setControlsVisible={setLinkedControlsVisible}
            showLegend={linkedShowLegend}
            setShowLegend={setLinkedShowLegend}
            widthIdx={empty1WidthIdx}
            setWidthIdx={setEmpty1WidthIdx}
            heightIdx={empty1HeightIdx}
            setHeightIdx={setTrendHeightLinked}
            cardClassName="draft-hex-slot-empty1"
            hiddenEqs={hiddenEqs}
            selectEq={selectEq}
            selectMultipleEqs={selectMultipleEqs}
            forcedHeightPx={alignedEmpty1Height}
            syncPlayback={sharedPlaybackSync}
            onPlaybackSync={handleSharedPlaybackSync}
          />
          <HexGridCard
            dragCardId="empty-stack"
            title="Data Set"
            viewportHeight={viewportHeight}
            widthIdx={empty1WidthIdx}
            setWidthIdx={setEmpty1WidthIdx}
            heightIdx={empty2HeightIdx}
            setHeightIdx={setDataHeightLinked}
            cardClassName="draft-hex-slot-empty2"
            forcedHeightPx={alignedEmpty2Height}
            hiddenEqs={hiddenEqs}
            selectedIdx={sharedPlaybackSync?.idx}
          />
        </div>
      ) : (
        <React.Fragment key="empty-stack">
          <HexTrendCard
            dragCardId="empty-stack"
            viewportHeight={viewportHeight}
            periodDays={linkedPeriodDays}
            setPeriodDays={setLinkedPeriodDays}
            controlsVisible={linkedControlsVisible}
            setControlsVisible={setLinkedControlsVisible}
            showLegend={linkedShowLegend}
            setShowLegend={setLinkedShowLegend}
            widthIdx={empty1WidthIdx}
            setWidthIdx={setEmpty1WidthIdx}
            heightIdx={empty1HeightIdx}
            setHeightIdx={setTrendHeightLinked}
            cardClassName="draft-hex-slot-empty1"
            hiddenEqs={hiddenEqs}
            selectEq={selectEq}
            selectMultipleEqs={selectMultipleEqs}
            syncPlayback={sharedPlaybackSync}
            onPlaybackSync={handleSharedPlaybackSync}
          />
          <HexGridCard
            dragCardId="empty-stack"
            title="Data Set"
            viewportHeight={viewportHeight}
            widthIdx={empty2WidthIdx}
            setWidthIdx={setEmpty2WidthIdx}
            heightIdx={empty2HeightIdx}
            setHeightIdx={setDataHeightLinked}
            cardClassName="draft-hex-slot-empty2"
            hiddenEqs={hiddenEqs}
            selectedIdx={sharedPlaybackSync?.idx}
          />
        </React.Fragment>
      );
    })}
  </div>
  );
};
