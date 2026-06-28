import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { scaleLinearY, genTicks } from '../draft/shared';
import { useContainerSize } from '../draft/shared';
import { SKE_KPI, CQI_COLOR, ENERGY_COLOR, spanToDateRange, type KpiRow, type CqiLevel, type EnergyType, type DateRange } from './data-ske';
import {
  useMultiAxisWheelZoom, useLineTouchPan, useYAxisDrag,
  type MultiAxisWheelState, type AxisDragState,
} from '../draft/core/interaction';
import { ChartTimeline } from '../draft/core/componentsTimeline';

// ── 단일 지표 모드 필드 정의 ──────────────────────────────────────────────────

export type KpiField = 'total_mj' | 'sec_mj_per_bbl' | 'total_cost_mwon' | 'unit_cost_won_per_bbl' | 'cdu_bbl';
export type ViewMode = 'single' | 'energy';

export const FIELDS: { key: KpiField; label: string; unit: string; color: string }[] = [
  { key: 'total_mj',               label: '총 에너지',    unit: 'M MJ',    color: '#e2e8f0' },
  { key: 'sec_mj_per_bbl',         label: '에너지 원단위', unit: 'MJ/BBL',  color: '#a78bfa' },
  { key: 'total_cost_mwon',        label: '총 비용',      unit: 'M원',     color: '#fb923c' },
  { key: 'unit_cost_won_per_bbl',  label: '비용 원단위',  unit: '원/BBL',  color: '#34d399' },
  { key: 'cdu_bbl',                label: '원유처리량',   unit: 'BBL',     color: '#fbbf24' },
];

// FG/Steam/ELEC MJ 동시 비교용
const ENERGY_LINES: { key: 'fg_mj' | 'stm_mj' | 'elec_mj'; energy: EnergyType; label: string }[] = [
  { key: 'fg_mj', energy: 'FG', label: 'FG (M MJ)' },
  { key: 'stm_mj', energy: 'Steam', label: 'Steam (M MJ)' },
  { key: 'elec_mj', energy: 'ELEC', label: 'ELEC (M MJ)' },
];

function fmtVal(v: number, key: KpiField) {
  if (key === 'cdu_bbl') return (v / 1000).toFixed(0) + 'k';
  if (key === 'unit_cost_won_per_bbl') return v.toFixed(0);
  if (key === 'total_cost_mwon') return (v / 1000).toFixed(1) + 'B';
  return v.toFixed(1);
}

const DEFAULT_VIEW_DAYS = 30;
const DRAG_MIN_DAYS = 1;

interface SKEKpiChartProps {
  activeField?: KpiField;
  onFieldChange?: (f: KpiField) => void;
  activeEnergy?: EnergyType | null;
  onEnergyChange?: (e: EnergyType | null) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
  onDateRangeChange?: (range: DateRange) => void;
  dateRange?: DateRange;
  anchorDate?: string;
  onAnchorDateChange?: (date: string) => void;
  onToDateChange?: (date: string) => void;
  onFromDateChange?: (date: string) => void;
  highlightDate?: string;
}

// 스파크라인 미니 컴포넌트 (KPI 요약 카드에서도 사용)
export function Sparkline({
  values, color, width = 60, height = 24,
}: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const range = hi - lo || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - ((v - lo) / range) * (height - 2) - 1}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2}
        strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={(values.length - 1) * step} cy={height - ((values[values.length - 1] - lo) / range) * (height - 2) - 1}
        r={2} fill={color} />
    </svg>
  );
}

export function SKEKpiChart({
  activeField: fieldProp, onFieldChange,
  activeEnergy: energyProp, onEnergyChange,
  viewMode: viewModeProp, onViewModeChange,
  onDateRangeChange,
  dateRange: dateRangeProp,
  anchorDate,
  onAnchorDateChange,
  onToDateChange,
  onFromDateChange,
  highlightDate,
}: SKEKpiChartProps = {}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const svgRef = useRef<SVGSVGElement>(null);

  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('single');
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = (m: ViewMode) => { setInternalViewMode(m); onViewModeChange?.(m); };

  const [internalField, setInternalField] = useState<KpiField>('total_mj');
  const activeField = fieldProp ?? internalField;
  const setActiveField = (f: KpiField) => { setInternalField(f); onFieldChange?.(f); };

  // Multi-Y / Split 상태 (single 모드 전용)
  const [multiY, setMultiY] = useState(false);
  const [split, setSplit] = useState(false);

  // X축 뷰 범위 (0~1 fraction, null = 전체)
  const [xViewRange, setXViewRange] = useState<{ start: number; end: number } | null>(() => {
    const n = SKE_KPI.length;
    if (n <= DEFAULT_VIEW_DAYS) return null;
    return { start: (n - DEFAULT_VIEW_DAYS) / n, end: 1 };
  });

  // xViewRange → DateRange 버킷 변환 + 우측 끝 날짜 부모에 알림
  // 단, 외부 prop 변경으로 xViewRange가 바뀐 직후에는 역방향 알림을 스킵해 루프 차단
  const suppressNotifyRef = useRef(false);
  useEffect(() => {
    if (suppressNotifyRef.current) { suppressNotifyRef.current = false; return; }
    // xViewRange pan/zoom은 세로선(anchorDate)에 영향 주지 않음
  }, [xViewRange]);

  // dateRangeProp은 Waterfall 표시 범위 전달용 — xViewRange는 변경하지 않음

  // anchorDate 변경 → xViewRange 우측 경계를 해당 날짜로 이동 (스팬 유지)
  const prevAnchorRef = useRef<string | undefined>(anchorDate);
  useEffect(() => {
    if (anchorDate === undefined) return;
    if (anchorDate === prevAnchorRef.current) return;
    prevAnchorRef.current = anchorDate;
    const n = SKE_KPI.length;
    const idx = SKE_KPI.findIndex(r => r.date === anchorDate);
    if (idx < 0) return;
    const newEnd = (idx + 1) / n;
    suppressNotifyRef.current = true;
    setXViewRange(prev => {
      if (prev === null) return null;
      const span = prev.end - prev.start;
      const clampedEnd = Math.max(span, Math.min(1, newEnd));
      const clampedStart = clampedEnd - span;
      return { start: clampedStart, end: clampedEnd };
    });
  }, [anchorDate]);

  // 타임라인 재생 state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(400);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlay = useCallback(() => {
    if (playIntervalRef.current) { clearInterval(playIntervalRef.current); playIntervalRef.current = null; }
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (prev) {
        if (playIntervalRef.current) { clearInterval(playIntervalRef.current); playIntervalRef.current = null; }
        return false;
      }
      return true;
    });
  }, []);

  // onAnchorDateChange를 ref로 유지 — interval 클로저에서 최신 값 참조
  const onAnchorDateChangeRef = useRef(onAnchorDateChange);
  onAnchorDateChangeRef.current = onAnchorDateChange;

  // 재생 중: xViewRange를 오른쪽으로 한 칸씩 이동 + 끝 날짜를 anchorDate로 동기화
  useEffect(() => {
    if (!isPlaying) return;
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    playIntervalRef.current = setInterval(() => {
      const n = SKE_KPI.length;
      setXViewRange(prev => {
        const cur = prev ?? { start: 0, end: 1 };
        const span = cur.end - cur.start;
        const step = 1 / n;
        const newEnd = Math.min(1, cur.end + step);
        const newStart = newEnd - span;
        const endIdx = Math.min(n - 1, Math.round(newEnd * n) - 1);
        const date = SKE_KPI[Math.max(0, endIdx)]?.date;
        if (date) onAnchorDateChangeRef.current?.(date);
        if (newEnd >= 1) { stopPlay(); return { start: Math.max(0, newStart), end: 1 }; }
        return { start: newStart, end: newEnd };
      });
    }, playSpeed);
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, playSpeed, stopPlay]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hiddenEnergy] = useState<Set<EnergyType>>(new Set());
  const [isPanning, setIsPanning] = useState(false);
  // Waterfall 세로선 위치 — anchorDate prop과 독립적으로 관리
  const [wfToDate, setWfToDate] = useState<string>(() =>
    anchorDate ?? SKE_KPI[SKE_KPI.length - 1]?.date ?? ''
  );
  const [wfFromDate, setWfFromDate] = useState<string>(() => {
    const n = SKE_KPI.length;
    const toIdx = anchorDate ? SKE_KPI.findIndex(r => r.date === anchorDate) : n - 1;
    const resolvedTo = toIdx >= 0 ? toIdx : n - 1;
    const spanDays = 30;
    return SKE_KPI[Math.max(0, resolvedTo - spanDays + 1)]?.date ?? SKE_KPI[0]?.date ?? '';
  });
  // Y축 드래그 범위 override — single모드 단일축, multiY모드 그룹별
  const [singleAxisRange, setSingleAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [multiAxisRanges, setMultiAxisRanges] = useState<Record<string, { min: number; max: number }>>({});
  // energy 모드 에너지별 Y축 override
  const [energyAxisRanges, setEnergyAxisRanges] = useState<Record<string, { min: number; max: number }>>({});
  const axisDragRef = useRef<AxisDragState | null>(null);
  const xPanRef = useRef<{ startX: number; visStart: number; visEnd: number; plotW: number } | null>(null);
  const [dragSelect, setDragSelect] = useState<{ x1: number; x2: number } | null>(null);

  const fieldMeta = FIELDS.find(f => f.key === activeField)!;

  // Multi-Y 축 그룹 정의
  const AXIS_GROUPS = [
    { id: 'energy', label: 'MJ',    color: '#e2e8f0', fields: ['total_mj', 'sec_mj_per_bbl'] as KpiField[] },
    { id: 'cost',   label: '원',    color: '#fb923c', fields: ['total_cost_mwon', 'unit_cost_won_per_bbl'] as KpiField[] },
    { id: 'cdu',    label: 'BBL',   color: '#fbbf24', fields: ['cdu_bbl'] as KpiField[] },
  ] as const;
  const AXIS_W = 46; // 추가 Y축 너비

  const allData = SKE_KPI;
  // Multi-Y 모드에서는 추가 Y축만큼 PAD_L 확장
  const baseL = 56;
  const extraAxes = multiY
    ? (viewMode === 'single' ? AXIS_GROUPS.length - 1 : ENERGY_LINES.length - 1)
    : 0;
  const PAD_L = baseL + extraAxes * AXIS_W;
  const PAD_R = 16, PAD_T = 24, PAD_B = 28;
  const plotW = Math.max(10, size.w - PAD_L - PAD_R);
  const plotH = Math.max(10, size.h - PAD_T - PAD_B);
  const useSplit = multiY && split;
  // single 모드: 상(energy+cdu) / 하(cost) 2단 분할
  // energy 모드: FG / Steam / ELEC 3단 분할
  const splitBandH = viewMode === 'energy' ? plotH / 3 : plotH / 2;
  // energy split: 각 에너지 라인의 bandTop
  const energySplitTop = useCallback((li: number) => PAD_T + li * splitBandH, [PAD_T, splitBandH]);

  // ── 각 필드 자연 스케일 (allData 기준 — pan 시 Y축 점프 방지) ──
  const fieldScalesNatural = useMemo(() => {
    const result: Record<KpiField, { min: number; max: number }> = {} as never;
    for (const f of FIELDS) {
      const vals = allData.map(r => r[f.key] as number);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const pad = (hi - lo) * 0.08 || 1;
      result[f.key] = { min: lo - pad, max: hi + pad };
    }
    return result;
  }, []);

  // override가 있으면 override, 없으면 자연 스케일 사용
  // multiY 모드에서만 그룹별 override, single 모드에서는 singleAxisRange 사용
  const getFieldScale = useCallback((field: KpiField) => {
    const nat = fieldScalesNatural[field];
    let override: { min: number; max: number } | undefined;
    if (multiY) {
      const grp = AXIS_GROUPS.find(g => (g.fields as readonly KpiField[]).includes(field));
      override = grp ? multiAxisRanges[grp.id] : undefined;
    } else {
      override = singleAxisRange ?? undefined;
    }
    const { min, max } = override ?? nat;
    return { min, max, yOf: (v: number, top: number, h: number) => scaleLinearY(v, min, max, top, h) };
  }, [fieldScalesNatural, multiY, multiAxisRanges, singleAxisRange]);

  const activeScale = getFieldScale(activeField);

  // Split 모드: 필드가 속한 그룹 → 상/하 패널 결정 (energy=상단, cost=하단, cdu=상단)
  const getPanel = (field: KpiField): 'top' | 'bottom' => {
    const group = AXIS_GROUPS.find(g => (g.fields as readonly KpiField[]).includes(field));
    return group?.id === 'cost' ? 'bottom' : 'top';
  };

  const yOfField = useCallback((field: KpiField, v: number): number => {
    const sc = getFieldScale(field);
    if (useSplit) {
      const panel = getPanel(field);
      const top = panel === 'top' ? PAD_T : PAD_T + splitBandH;
      return sc.yOf(v, top, splitBandH);
    }
    return sc.yOf(v, PAD_T, plotH);
  }, [getFieldScale, useSplit, PAD_T, splitBandH, plotH]);

  // ── 에너지 비교 스케일 (allData 기준) ──
  const energySeriesRaw = useMemo(() => ENERGY_LINES.map(el => allData.map(r => r[el.key] as number)), []);
  // 정규화 (multiY 비활성 시 사용) — 전체 범위 기준으로 정규화하여 pan 시 축 점프 방지
  const energyNorm = useMemo(() => energySeriesRaw.map(vals => {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    return vals.map(v => (v - lo) / range);
  }), [energySeriesRaw]);
  // 에너지별 자연 스케일
  const energyNaturalScales = useMemo(() => ENERGY_LINES.map((el, li) => {
    const vals = energySeriesRaw[li];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || 1;
    return { min: lo - pad, max: hi + pad };
  }), [energySeriesRaw]);
  // override 포함 에너지 스케일
  const energyScales = useMemo(() => ENERGY_LINES.map((el, li) => {
    const nat = energyNaturalScales[li];
    const ov = energyAxisRanges[el.energy];
    const { min, max } = ov ?? nat;
    return { min, max, yOf: (v: number) => scaleLinearY(v, min, max, PAD_T, plotH) };
  }), [energyNaturalScales, energyAxisRanges, PAD_T, plotH]);

  // wheelStateRef — HEX Trend와 동일한 MultiAxisWheelState 형태
  const wheelStateRef = useRef<MultiAxisWheelState>({
    visStart: 0, visEnd: 1, plotW: 400, plotH: 200,
    totalLeft: baseL, datesLen: allData.length, scaled: multiY,
    activeSeriesInfo: [], axisTypes: [],
    activeGlobalMin: 0, activeGlobalMax: 1, globalMin: 0, globalMax: 1,
    plotTop: PAD_T, svgW: size.w, svgH: size.h,
  });

  // 단일Y 글로벌 min/max
  const singleGlobalMin = singleAxisRange?.min ?? activeScale.min;
  const singleGlobalMax = singleAxisRange?.max ?? activeScale.max;

  // axisTypes: single모드 = ['single'], energy모드 = energy keys, multiY single = AXIS_GROUPS ids
  const axisTypes = useMemo(() => {
    if (viewMode === 'energy' && multiY) return ENERGY_LINES.map(el => el.energy);
    if (viewMode === 'single' && multiY) return AXIS_GROUPS.map(g => g.id);
    return ['single'];
  }, [viewMode, multiY]);

  const activeSeriesInfo = useMemo(() => {
    if (viewMode === 'energy' && multiY) {
      return ENERGY_LINES.map((el, li) => {
        const sc = energyScales[li];
        return { key: el.energy, axisMin: sc.min, axisMax: sc.max, axisRange: Math.max(sc.max - sc.min, 1e-6) };
      });
    }
    if (viewMode === 'single' && multiY) {
      return AXIS_GROUPS.map(grp => {
        const ov = multiAxisRanges[grp.id];
        const repField = grp.fields[0];
        const nat = fieldScalesNatural[repField];
        const { min, max } = ov ?? nat;
        return { key: grp.id, axisMin: min, axisMax: max, axisRange: Math.max(max - min, 1e-6) };
      });
    }
    return [{ key: 'single', axisMin: singleGlobalMin, axisMax: singleGlobalMax, axisRange: Math.max(singleGlobalMax - singleGlobalMin, 1e-6) }];
  }, [viewMode, multiY, energyScales, multiAxisRanges, fieldScalesNatural, singleGlobalMin, singleGlobalMax]);

  // wheelStateRef 매 렌더 동기화
  wheelStateRef.current = {
    visStart: xViewRange?.start ?? 0,
    visEnd: xViewRange?.end ?? 1,
    plotW, plotH, totalLeft: PAD_L,
    datesLen: allData.length,
    scaled: multiY,
    activeSeriesInfo,
    axisTypes,
    activeGlobalMin: singleGlobalMin,
    activeGlobalMax: singleGlobalMax,
    globalMin: activeScale.min,
    globalMax: activeScale.max,
    plotTop: PAD_T,
    svgW: size.w, svgH: size.h,
  };

  // Y축 드래그 override 적용 핸들러
  const setSingleAxisRangeForWheel = useCallback((r: { min: number; max: number }) => {
    setSingleAxisRange(r);
  }, []);
  const setMultiAxisRangesForWheel = useCallback<React.Dispatch<React.SetStateAction<Record<string, { min: number; max: number }>>>>(action => {
    if (viewMode === 'energy') {
      setEnergyAxisRanges(action as React.SetStateAction<Record<string, { min: number; max: number }>>);
    } else {
      setMultiAxisRanges(action as React.SetStateAction<Record<string, { min: number; max: number }>>);
    }
  }, [viewMode]);

  // HEX Trend와 동일한 훅 연결
  useMultiAxisWheelZoom(svgRef, wheelStateRef, r => setXViewRange(r ? r : null), setSingleAxisRangeForWheel, setMultiAxisRangesForWheel);
  useLineTouchPan(svgRef, wheelStateRef, plotW, plotH, setIsPanning, r => setXViewRange(r ? r : null));
  const axisDragH = useSplit ? splitBandH : plotH;
  const startAxisDrag = useYAxisDrag(axisDragRef, axisDragH, setSingleAxisRangeForWheel, setMultiAxisRangesForWheel);

  // Y축 스케일 초기화 (데이터/뷰 변경 시)
  useEffect(() => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
    setEnergyAxisRanges({});
  }, [viewMode, multiY]);

  // X축 하단 drag — 좌클릭: X축 줌, 우클릭/shift: pan (HEX Trend startXAxisZoom과 동일)
  const startXAxisZoom = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const isPan = e.button === 2 || e.shiftKey;
    const st = wheelStateRef.current;
    const { visStart: vs, visEnd: ve, plotW: pw, datesLen: dn } = st;
    const svgRect = svgRef.current!.getBoundingClientRect();
    const mouseRelX = Math.max(0, Math.min(pw, e.clientX - svgRect.left - PAD_L));
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
          const newRange = Math.max(Math.min(curRange * factor, 1), DRAG_MIN_DAYS / Math.max(dn - 1, 1));
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
  }, [PAD_L]);

  // 플롯 영역 인터랙션:
  //   좌클릭(button=0): mousedown → From 이동, mouseup → To 이동 (드래그로 구간 지정)
  //   휠버튼(button=1): pan
  //   Ctrl+좌클릭+드래그: 영역 선택 확대
  const startPan = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();

    if (e.ctrlKey && e.button === 0) {
      // ── Ctrl+드래그: 영역 선택 → 확대 ──
      const svgRect = svgRef.current!.getBoundingClientRect();
      const svgScaleX = size.w / svgRect.width;
      const startSvgX = (e.clientX - svgRect.left) * svgScaleX;
      const clampX = (x: number) => Math.max(PAD_L, Math.min(PAD_L + plotW, x));
      setDragSelect({ x1: clampX(startSvgX), x2: clampX(startSvgX) });

      const onMove = (ev: MouseEvent) => {
        const x = (ev.clientX - svgRect.left) * svgScaleX;
        setDragSelect({ x1: clampX(startSvgX), x2: clampX(x) });
      };
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const x2 = clampX((ev.clientX - svgRect.left) * svgScaleX);
        const rawLeft = Math.min(startSvgX, x2);
        const rawRight = Math.max(startSvgX, x2);
        setDragSelect(null);
        const st = wheelStateRef.current;
        const { visStart: vs, visEnd: ve, plotW: pw } = st;
        const span = ve - vs;
        const fracLeft  = vs + ((rawLeft  - PAD_L) / pw) * span;
        const fracRight = vs + ((rawRight - PAD_L) / pw) * span;
        const ns = Math.max(0, fracLeft);
        const ne = Math.min(1, fracRight);
        const n = allData.length;
        if (ne - ns < DRAG_MIN_DAYS / Math.max(n - 1, 1)) return;
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    if (e.button === 1) {
      // ── 휠버튼 drag: X pan ──
      const st = wheelStateRef.current;
      xPanRef.current = { startX: e.clientX, visStart: st.visStart, visEnd: st.visEnd, plotW: st.plotW };
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
      return;
    }

    // ── 좌클릭: mousedown → From 고정, drag 중 To 프리뷰, mouseup → To 확정 ──
    const svgRect = svgRef.current!.getBoundingClientRect();
    const svgScaleX = size.w / svgRect.width;

    const svgXToIdx = (clientX: number) => {
      const x = (clientX - svgRect.left) * svgScaleX;
      const st = wheelStateRef.current;
      const { visStart: vs, visEnd: ve, plotW: pw } = st;
      const frac = vs + ((x - PAD_L) / pw) * (ve - vs);
      const n = allData.length;
      return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    };

    // mousedown → From 고정
    const anchorIdx = svgXToIdx(e.clientX);
    const anchorDateStr = allData[anchorIdx]?.date ?? '';
    setWfFromDate(anchorDateStr);
    onFromDateChange?.(anchorDateStr);
    setIsDraggingWfLine(true);

    let moved = false;
    const onMove = (ev: MouseEvent) => {
      moved = true;
      const curIdx = svgXToIdx(ev.clientX);
      const fromI = Math.min(anchorIdx, curIdx);
      const toI   = Math.max(anchorIdx, curIdx);
      setWfFromDate(allData[fromI]?.date ?? '');
      setWfToDate(allData[toI]?.date ?? '');
    };
    const onUp = (ev: MouseEvent) => {
      setIsDraggingWfLine(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const curIdx = svgXToIdx(ev.clientX);
      if (!moved || curIdx === anchorIdx) {
        // 단순 클릭 — From만 이동, To는 From 이후 기존 To 유지(그대로)
        const fromDate = allData[anchorIdx]?.date ?? '';
        setWfFromDate(fromDate);
        onFromDateChange?.(fromDate);
      } else {
        const fromI = Math.min(anchorIdx, curIdx);
        const toI   = Math.max(anchorIdx, curIdx);
        const fromDate = allData[fromI]?.date ?? '';
        const toDate   = allData[toI]?.date ?? '';
        setWfFromDate(fromDate);
        setWfToDate(toDate);
        onFromDateChange?.(fromDate);
        onToDateChange?.(toDate);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [PAD_L, size.w, allData, onFromDateChange, onToDateChange]);

  const resetAxisRanges = useCallback(() => {
    setSingleAxisRange(null);
    setMultiAxisRanges({});
    setEnergyAxisRanges({});
  }, []);

  const xViewStart = xViewRange?.start ?? 0;
  const xViewEnd = xViewRange?.end ?? 1;
  const xViewSpan = Math.max(xViewEnd - xViewStart, 1e-6);
  const xScale = plotW / xViewSpan;
  const xOf = useCallback((i: number) => {
    const n = allData.length;
    const frac = n <= 1 ? 0 : i / (n - 1);
    return PAD_L + (frac - xViewStart) * xScale;
  }, [PAD_L, xViewStart, xScale]);

  const yOfS = useCallback((v: number) => activeScale.yOf(v, PAD_T, plotH), [activeScale, PAD_T, plotH]);
  const yOfN = useCallback((v: number) => PAD_T + plotH - v * plotH, [PAD_T, plotH]);

  const yTicksS = useMemo(() => genTicks(activeScale.min, activeScale.max, 5), [activeScale.min, activeScale.max]);

  // X축 레이블: allData 기준 visStart~visEnd 범위 내 인덱스
  const fvi = Math.max(0, Math.floor(xViewStart * (allData.length - 1)) - 1);
  const lvi = Math.min(allData.length - 1, Math.ceil(xViewEnd * (allData.length - 1)) + 1);
  const visCount = lvi - fvi + 1;
  const xLabelStep = Math.max(1, Math.ceil(visCount / 8));
  const xLabels = useMemo(() => allData
    .map((r, i) => ({ i, label: r.date.slice(5) }))
    .filter(({ i }) => i >= fvi && i <= lvi && (visCount <= 8 || (i - fvi) % xLabelStep === 0)),
    [fvi, lvi, visCount, xLabelStep]);

  // ── Waterfall 구간 세로선 (내부 state 기반, xViewRange와 독립) ──
  const wfToIdx = useMemo(() => {
    const i = allData.findIndex(r => r.date === wfToDate);
    return i >= 0 ? i : allData.length - 1;
  }, [wfToDate]);
  const wfFromIdx = useMemo(() => {
    const i = allData.findIndex(r => r.date === wfFromDate);
    return i >= 0 ? i : 0;
  }, [wfFromDate]);
  // 편의상 별칭 유지
  const wfEndIdx = wfToIdx;
  const wfStartIdx = wfFromIdx;
  const wfSpanDays = wfToIdx - wfFromIdx + 1;

  const [isDraggingWfLine, setIsDraggingWfLine] = useState(false);

  const makeWfLineDrag = useCallback((mode: 'to' | 'from') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWfLine(true);
    const svgRect = svgRef.current!.getBoundingClientRect();
    const svgScaleX = size.w / svgRect.width;
    const onMove = (ev: MouseEvent) => {
      const x = (ev.clientX - svgRect.left) * svgScaleX;
      const n = allData.length;
      const vs = xViewRange?.start ?? 0;
      const ve = xViewRange?.end ?? 1;
      const frac = vs + ((x - PAD_L) / plotW) * (ve - vs);
      const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
      const date = allData[i]?.date;
      if (!date) return;
      if (mode === 'to') {
        setWfToDate(date);
        onToDateChange?.(date);
      } else {
        setWfFromDate(date);
        onFromDateChange?.(date);
      }
    };
    const onUp = () => {
      setIsDraggingWfLine(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size.w, PAD_L, plotW, xViewRange, onToDateChange, onFromDateChange, wfFromIdx, wfToIdx]);

  const startWfToLineDrag = useMemo(() => makeWfLineDrag('to'), [makeWfLineDrag]);
  const startWfFromLineDrag = useMemo(() => makeWfLineDrag('from'), [makeWfLineDrag]);

  // hover는 allData 기준 인덱스 사용
  const hovRow: KpiRow | null = hoverIdx !== null ? allData[hoverIdx] : null;

  // ── 마우스 hover — allData 기준 index 계산 ──
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning || xPanRef.current || dragSelect !== null || isDraggingWfLine) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * size.w;
    const n = allData.length;
    const vs = xViewRange?.start ?? 0;
    const ve = xViewRange?.end ?? 1;
    const frac = vs + ((x - PAD_L) / plotW) * (ve - vs);
    const i = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(fvi, Math.min(lvi, i)));
  }, [size.w, plotW, isPanning, dragSelect, isDraggingWfLine, xViewRange, fvi, lvi, PAD_L]);

  const gradId = `ske-kpi-grad-${activeField}`;

  // ── polyline points 메모화 — pan/zoom 시 xOf가 바뀔 때만 재계산 ──
  const singleFieldPoints = useMemo(() => {
    const fields = multiY ? FIELDS : [fieldMeta];
    return fields.map(f => ({
      key: f.key,
      pts: allData.map((r, i) => {
        const x = xOf(i);
        if (x < PAD_L - 2 || x > PAD_L + plotW + 2) return null;
        const sc = getFieldScale(f.key);
        const y = useSplit
          ? (() => { const panel = getPanel(f.key); const top = panel === 'top' ? PAD_T : PAD_T + splitBandH; return sc.yOf(r[f.key] as number, top, splitBandH); })()
          : sc.yOf(r[f.key] as number, PAD_T, plotH);
        return `${x},${y}`;
      }).filter(Boolean).join(' '),
      areaPath: !multiY && allData.slice(fvi, lvi + 1).length >= 2
        ? (() => {
            const visVals = allData.slice(fvi, lvi + 1);
            const sc = getFieldScale(f.key);
            return `M${xOf(fvi)},${sc.yOf(visVals[0][f.key] as number, PAD_T, plotH)} `
              + visVals.map((r, ii) => `L${xOf(fvi + ii)},${sc.yOf(r[f.key] as number, PAD_T, plotH)}`).join(' ')
              + ` L${xOf(lvi)},${PAD_T + plotH} L${xOf(fvi)},${PAD_T + plotH} Z`;
          })()
        : '',
    }));
  }, [multiY, fieldMeta, xOf, PAD_L, plotW, getFieldScale, useSplit, PAD_T, splitBandH, plotH, fvi, lvi]);

  const energyLinePoints = useMemo(() => ENERGY_LINES.map((el, li) => ({
    key: el.energy,
    pts: allData.map((r, i) => {
      const x = xOf(i);
      if (x < PAD_L - 2 || x > PAD_L + plotW + 2) return null;
      let y: number;
      if (multiY && useSplit) {
        const bandTop = energySplitTop(li);
        y = scaleLinearY(r[el.key] as number, energyScales[li].min, energyScales[li].max, bandTop, splitBandH);
      } else if (multiY) {
        y = energyScales[li].yOf(r[el.key] as number);
      } else if (useSplit) {
        const bandTop = energySplitTop(li);
        y = PAD_T + li * splitBandH + splitBandH - energyNorm[li][i] * splitBandH;
      } else {
        y = yOfN(energyNorm[li][i]);
      }
      return `${x},${y}`;
    }).filter(Boolean).join(' '),
  })), [xOf, PAD_L, plotW, multiY, useSplit, energyScales, energyNorm, yOfN, energySplitTop, splitBandH]);

  const cqiDots = useMemo(() => allData
    .slice(fvi, lvi + 1)
    .map((r, ii) => {
      if (r.cqi_level === 'High') return null;
      const i = fvi + ii;
      const sc = getFieldScale(activeField);
      const y = useSplit
        ? (() => { const panel = getPanel(activeField); const top = panel === 'top' ? PAD_T : PAD_T + splitBandH; return sc.yOf(r[activeField] as number, top, splitBandH); })()
        : sc.yOf(r[activeField] as number, PAD_T, plotH);
      return { i, cx: xOf(i), cy: y, level: r.cqi_level as CqiLevel };
    })
    .filter(Boolean) as { i: number; cx: number; cy: number; level: CqiLevel }[],
  [fvi, lvi, xOf, getFieldScale, activeField, useSplit, PAD_T, splitBandH, plotH]);

  // CQI Low 구간 — allData 기준, 화면에 보이는 범위만
  const cqiLowRanges = useMemo(() => {
    const ranges: { x1: number; x2: number }[] = [];
    let rs: number | null = null;
    allData.forEach((r, i) => {
      if (i < fvi || i > lvi) { if (rs !== null) { ranges.push({ x1: xOf(rs), x2: xOf(i - 1) }); rs = null; } return; }
      if (r.cqi_level === 'Low') { if (rs === null) rs = i; }
      else { if (rs !== null) { ranges.push({ x1: xOf(rs), x2: xOf(i - 1) }); rs = null; } }
    });
    if (rs !== null) ranges.push({ x1: xOf(rs), x2: xOf(lvi) });
    return ranges;
  }, [fvi, lvi, xOf]);

  const visibleDays = lvi - fvi + 1;

  return (
    <div className="draft-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="draft-ekpi-card-title" style={{ justifyContent: 'flex-start' }}>
        <div className="draft-card-actions" style={{ flexWrap: 'wrap' }}>
          {/* 뷰 모드 */}
          <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
            {(['single', 'energy'] as ViewMode[]).map(m => (
              <button key={m}
                className={`draft-chip-btn${viewMode === m ? ' draft-chip-btn--active' : ''}`}
                style={{ borderRadius: 0, border: 'none', borderRight: m === 'single' ? '1px solid #334155' : 'none' }}
                onClick={() => setViewMode(m)}>
                {m === 'single' ? 'KPI' : '에너지원'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className={`draft-chip-btn${multiY ? ' draft-chip-btn--active' : ''}`}
              style={{ borderRadius: 0, border: 'none', borderRight: '1px solid #334155' }}
              onClick={() => { setMultiY(v => !v); if (split && multiY) setSplit(false); }}>
              Multi Y
            </button>
            <button
              className={`draft-chip-btn${split ? ' draft-chip-btn--active' : ''}${!multiY ? ' draft-chip-btn--dim' : ''}`}
              style={{ borderRadius: 0, border: 'none' }}
              disabled={!multiY}
              onClick={() => setSplit(v => !v)}>
              Split
            </button>
          </div>
        </div>
      </div>



      <div ref={wrapRef} className="draft-chart-wrap" style={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} className="draft-chart-svg draft-chart-touch" width={size.w} height={size.h}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}>

          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fieldMeta.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={fieldMeta.color} stopOpacity="0.02" />
            </linearGradient>
            <clipPath id="ske-kpi-clip">
              <rect x={PAD_L} y={PAD_T - 2} width={plotW} height={plotH + 4} />
            </clipPath>
          </defs>

          {/* 배경 */}
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />

          {/* CQI Low 구간 음영 */}
          {cqiLowRanges.map((r, ri) => (
            <rect key={ri} x={r.x1 - 2} y={PAD_T} width={Math.max(4, r.x2 - r.x1 + 4)} height={plotH}
              fill="#ef4444" opacity={0.18} clipPath="url(#ske-kpi-clip)" />
          ))}

          {viewMode === 'single' && (
            <>
              {/* Split 구분선 */}
              {useSplit && (
                <line x1={PAD_L} y1={PAD_T + splitBandH} x2={PAD_L + plotW} y2={PAD_T + splitBandH}
                  stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" />
              )}

              {/* Y축 — Multi-Y 시 그룹별, 단일 시 하나 */}
              {multiY ? (
                AXIS_GROUPS.map((grp, gi) => {
                  const repField = grp.fields.find(f => f === activeField) ?? grp.fields[0];
                  const ov = multiAxisRanges[grp.id];
                  const nat = fieldScalesNatural[repField];
                  const { min: axMin, max: axMax } = ov ?? nat;
                  const axRange = Math.max(axMax - axMin, 1e-6);
                  const panel = useSplit ? getPanel(repField) : null;
                  const bandTop = panel === 'bottom' ? PAD_T + splitBandH : PAD_T;
                  const bandH = useSplit ? splitBandH : plotH;
                  const axX = baseL + gi * AXIS_W;
                  const ticks = genTicks(axMin, axMax, 4);
                  return (
                    <g key={grp.id}
                      onMouseDown={e => startAxisDrag(e, 'multi', axMin, axMax, grp.id)}
                      onContextMenu={e => e.preventDefault()}
                      onDoubleClick={() => setMultiAxisRanges(prev => { const n = { ...prev }; delete n[grp.id]; return n; })}
                      style={{ cursor: 'ns-resize' }}>
                      <rect x={axX - AXIS_W + 2} y={bandTop} width={AXIS_W} height={bandH} fill="transparent" />
                      <line x1={axX} y1={bandTop} x2={axX} y2={bandTop + bandH}
                        stroke={grp.color} strokeWidth={1.5} opacity={0.7} />
                      {ticks.map((t, ti) => {
                        const y = bandTop + bandH * (1 - (t - axMin) / axRange);
                        if (y < bandTop - 1 || y > bandTop + bandH + 1) return null;
                        return (
                          <g key={ti}>
                            <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.6} />
                            <line x1={axX - 3} y1={y} x2={axX} y2={y} stroke={grp.color} strokeWidth={1} />
                            <text x={axX - 5} y={y + 3} textAnchor="end" fontSize={9} fill={grp.color} opacity={0.9}>
                              {fmtVal(t, repField)}
                            </text>
                          </g>
                        );
                      })}
                      <text x={axX - AXIS_W / 2} y={bandTop + bandH / 2} textAnchor="middle"
                        fontSize={9} fill={grp.color} opacity={0.6}
                        transform={`rotate(-90,${axX - AXIS_W / 2},${bandTop + bandH / 2})`}>
                        {grp.label}
                      </text>
                    </g>
                  );
                })
              ) : (
                <g onMouseDown={e => startAxisDrag(e, 'single', singleGlobalMin, singleGlobalMax)}
                  onContextMenu={e => e.preventDefault()}
                  onDoubleClick={resetAxisRanges}
                  style={{ cursor: 'ns-resize' }}>
                  <rect x={0} y={PAD_T} width={PAD_L} height={plotH} fill="transparent" />
                  <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#334155" strokeWidth={1.5} />
                  {yTicksS.map((t, ti) => {
                    const y = yOfS(t);
                    if (y < PAD_T - 1 || y > PAD_T + plotH + 1) return null;
                    return (
                      <g key={ti}>
                        <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.8} />
                        <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke="#334155" strokeWidth={1} />
                        <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={11} fill="#475569">
                          {fmtVal(t, activeField)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* 각 필드 라인 */}
              <g clipPath="url(#ske-kpi-clip)">
                {singleFieldPoints.map(({ key, pts, areaPath }) => {
                  const f = FIELDS.find(f => f.key === key)!;
                  const isActive = f.key === activeField;
                  if (!multiY) {
                    return (
                      <g key={key}>
                        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
                        <polyline points={pts} fill="none" stroke={f.color} strokeWidth={1.8}
                          strokeLinejoin="round" strokeLinecap="round" />
                      </g>
                    );
                  }
                  return (
                    <polyline key={key} points={pts} fill="none" stroke={f.color}
                      strokeWidth={isActive ? 2.2 : 1.2}
                      strokeLinejoin="round" strokeLinecap="round"
                      opacity={isActive ? 1 : 0.55}
                      strokeDasharray={isActive ? undefined : '5 3'}
                    />
                  );
                })}
              </g>

              {/* CQI Medium/Low 점 */}
              {cqiDots.map(({ i, cx, cy, level }) => (
                <circle key={i} cx={cx} cy={cy} r={3}
                  fill={CQI_COLOR[level]} opacity={0.9} clipPath="url(#ske-kpi-clip)" />
              ))}

              {/* Multi-Y 범례 */}
              {multiY && (
                <g>
                  {FIELDS.map((f, fi) => {
                    const isActive = f.key === activeField;
                    return (
                      <g key={f.key} style={{ cursor: 'pointer' }} onClick={() => setActiveField(f.key)}>
                        <rect x={PAD_L + plotW - 130} y={PAD_T + fi * 16} width={128} height={14} rx={2}
                          fill={isActive ? f.color + '22' : 'transparent'} />
                        <line x1={PAD_L + plotW - 128} y1={PAD_T + fi * 16 + 7}
                          x2={PAD_L + plotW - 112} y2={PAD_T + fi * 16 + 7}
                          stroke={f.color} strokeWidth={isActive ? 2 : 1.2}
                          strokeDasharray={isActive ? undefined : '4 2'} />
                        <text x={PAD_L + plotW - 108} y={PAD_T + fi * 16 + 11}
                          fontSize={10} fill={f.color} opacity={isActive ? 1 : 0.6}>
                          {f.label} ({f.unit})
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </>
          )}

          {viewMode === 'energy' && (
            <>
              {/* Split 구분선 */}
              {useSplit && ENERGY_LINES.slice(1).map((_, li) => (
                <line key={li} x1={PAD_L} y1={energySplitTop(li + 1)} x2={PAD_L + plotW} y2={energySplitTop(li + 1)}
                  stroke="#334155" strokeWidth={1.5} strokeDasharray="4 3" />
              ))}

              {/* Y축 — Multi-Y 시 에너지별, 단일 시 정규화 % */}
              {multiY ? (
                ENERGY_LINES.map((el, li) => {
                  const color = ENERGY_COLOR[el.energy];
                  const sc = energyScales[li];
                  const axX = baseL + li * AXIS_W;
                  const bandTop = useSplit ? energySplitTop(li) : PAD_T;
                  const bandH = useSplit ? splitBandH : plotH;
                  const ticks = genTicks(sc.min, sc.max, useSplit ? 3 : 4);
                  return (
                    <g key={el.energy}
                      onMouseDown={e => startAxisDrag(e, 'multi', sc.min, sc.max, el.energy)}
                      onContextMenu={e => e.preventDefault()}
                      onDoubleClick={() => setEnergyAxisRanges(prev => { const n = { ...prev }; delete n[el.energy]; return n; })}
                      style={{ cursor: 'ns-resize' }}>
                      <rect x={axX - AXIS_W + 2} y={bandTop} width={AXIS_W} height={bandH} fill="transparent" />
                      <line x1={axX} y1={bandTop} x2={axX} y2={bandTop + bandH} stroke={color} strokeWidth={1.5} opacity={0.7} />
                      {ticks.map((t, ti) => {
                        const y = useSplit
                          ? scaleLinearY(t, sc.min, sc.max, bandTop, bandH)
                          : sc.yOf(t);
                        if (y < bandTop - 1 || y > bandTop + bandH + 1) return null;
                        return (
                          <g key={ti}>
                            <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.6} />
                            <line x1={axX - 3} y1={y} x2={axX} y2={y} stroke={color} strokeWidth={1} />
                            <text x={axX - 5} y={y + 3} textAnchor="end" fontSize={9} fill={color} opacity={0.9}>
                              {t.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}
                      <text x={axX - AXIS_W / 2} y={bandTop + bandH / 2} textAnchor="middle"
                        fontSize={9} fill={color} opacity={0.6}
                        transform={`rotate(-90,${axX - AXIS_W / 2},${bandTop + bandH / 2})`}>
                        {el.energy}
                      </text>
                    </g>
                  );
                })
              ) : (
                useSplit ? (
                  // split + !multiY: 각 밴드에 에너지명 레이블만
                  ENERGY_LINES.map((el, li) => {
                    const color = ENERGY_COLOR[el.energy];
                    const bandTop = energySplitTop(li);
                    return (
                      <g key={el.energy}>
                        <line x1={baseL} y1={bandTop} x2={baseL} y2={bandTop + splitBandH} stroke={color} strokeWidth={1} opacity={0.5} />
                        {[0, 0.5, 1].map((t, ti) => {
                          const y = bandTop + splitBandH - t * splitBandH;
                          return (
                            <g key={ti}>
                              <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.6} />
                              <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={9} fill={color} opacity={0.6}>
                                {(t * 100).toFixed(0)}%
                              </text>
                            </g>
                          );
                        })}
                        <text x={baseL - 2} y={bandTop + splitBandH / 2} textAnchor="end" fontSize={10}
                          fill={color} fontWeight="600">
                          {el.energy}
                        </text>
                      </g>
                    );
                  })
                ) : (
                  <g onMouseDown={e => e.preventDefault()} style={{ cursor: 'default' }}>
                    <line x1={baseL} y1={PAD_T} x2={baseL} y2={PAD_T + plotH} stroke="#475569" strokeWidth={1} opacity={0.4} />
                    {[0, 0.25, 0.5, 0.75, 1].map((t, ti) => {
                      const y = yOfN(t);
                      return (
                        <g key={ti}>
                          <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.6} />
                          <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#475569">
                            {(t * 100).toFixed(0)}%
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )
              )}
              <g clipPath="url(#ske-kpi-clip)">
                {energyLinePoints.map(({ key, pts }) => {
                  if (hiddenEnergy.has(key as EnergyType)) return null;
                  const color = ENERGY_COLOR[key as EnergyType];
                  const isActive = energyProp === key;
                  const dimmed = energyProp !== null && energyProp !== undefined && !isActive;
                  return (
                    <polyline key={key} points={pts} fill="none"
                      stroke={color} strokeWidth={isActive ? 2.4 : 1.6}
                      strokeLinejoin="round" strokeLinecap="round"
                      opacity={dimmed ? 0.2 : 0.9} />
                  );
                })}
              </g>
              {/* 에너지 Multi-Y 범례 */}
              {multiY && (
                <g>
                  {ENERGY_LINES.map((el, li) => {
                    const color = ENERGY_COLOR[el.energy];
                    return (
                      <g key={el.energy}>
                        <line x1={PAD_L + plotW - 100} y1={PAD_T + li * 16 + 7}
                          x2={PAD_L + plotW - 84} y2={PAD_T + li * 16 + 7}
                          stroke={color} strokeWidth={2} />
                        <text x={PAD_L + plotW - 80} y={PAD_T + li * 16 + 11} fontSize={10} fill={color}>
                          {el.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </>
          )}

          {/* X축 라인 */}
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH}
            stroke="#334155" strokeWidth={1.5} />

          {/* X축 레이블 */}
          {xLabels.map(({ i, label }) => (
            <g key={i}>
              <line x1={xOf(i)} y1={PAD_T + plotH} x2={xOf(i)} y2={PAD_T + plotH + 4} stroke="#334155" strokeWidth={1} />
              <text x={xOf(i)} y={PAD_T + plotH + 14} textAnchor="middle" fontSize={10} fill="#475569"
                transform={`rotate(-20,${xOf(i)},${PAD_T + plotH + 14})`}>
                {label}
              </text>
            </g>
          ))}

          {/* Ctrl+드래그 선택 영역 표시 */}
          {dragSelect && (() => {
            const rx = Math.min(dragSelect.x1, dragSelect.x2);
            const rw = Math.abs(dragSelect.x2 - dragSelect.x1);
            return (
              <>
                <rect x={rx} y={PAD_T} width={rw} height={plotH}
                  fill="#3b82f6" opacity={0.15} pointerEvents="none" />
                <rect x={rx} y={PAD_T} width={rw} height={plotH}
                  fill="none" stroke="#60a5fa" strokeWidth={1} strokeDasharray="4 3"
                  opacity={0.8} pointerEvents="none" />
              </>
            );
          })()}

          {/* 플롯 인터랙션 영역 — 좌클릭drag=From/To, 휠버튼drag=pan, Ctrl+좌클릭drag=확대 */}
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="transparent"
            onMouseDown={startPan}
            onAuxClick={e => e.preventDefault()}
            onDoubleClick={resetAxisRanges}
            onContextMenu={e => e.preventDefault()}
            style={{ cursor: isPanning ? 'grabbing' : isDraggingWfLine ? 'ew-resize' : 'crosshair' }} />

          {/* X축 하단 drag 영역 — 좌클릭 = X zoom, 우클릭 = X pan */}
          <rect x={PAD_L} y={PAD_T + plotH} width={plotW} height={PAD_B} fill="transparent"
            onMouseDown={startXAxisZoom}
            onContextMenu={e => e.preventDefault()}
            style={{ cursor: 'ew-resize' }} />

          {/* 호버 */}
          {hoverIdx !== null && hovRow && (() => {
            const hx = xOf(hoverIdx);
            if (hx < PAD_L - 1 || hx > PAD_L + plotW + 1) return null;
            const isEnergy = viewMode === 'energy';
            const isMultiY = viewMode === 'single' && multiY;
            const tipW = isEnergy ? 178 : isMultiY ? 172 : 156;
            const tipH = isEnergy ? 96 : isMultiY ? 14 + FIELDS.length * 16 + 24 : 76;
            const tipX = hx + tipW + 12 > size.w ? hx - tipW - 6 : hx + 8;
            const tipY = Math.max(PAD_T, Math.min(PAD_T + plotH - tipH, size.h / 2 - tipH / 2));
            const hovFieldVal = hovRow[activeField] as number;
            const hy = isEnergy
              ? (multiY ? energyScales[0].yOf(hovRow[ENERGY_LINES[0].key] as number) : yOfN(energyNorm[0][hoverIdx] ?? 0))
              : yOfField(activeField, hovFieldVal);
            return (
              <g pointerEvents="none">
                <line x1={hx} y1={PAD_T} x2={hx} y2={PAD_T + plotH}
                  stroke="#7dd3fc" strokeWidth={0.8} strokeDasharray="3 3" />
                <circle cx={hx} cy={hy} r={4}
                  fill={isEnergy ? ENERGY_COLOR.FG : fieldMeta.color} />
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize={12} fill="#64748b">{hovRow.date}</text>
                {isEnergy ? (
                  <>
                    {ENERGY_LINES.map((el, li) => !hiddenEnergy.has(el.energy) && (
                      <text key={el.energy} x={tipX + 8} y={tipY + 28 + li * 16} fontSize={12}
                        fill={ENERGY_COLOR[el.energy]} fontWeight="600">
                        {el.energy} {(hovRow[el.key] as number).toFixed(1)} M MJ
                      </text>
                    ))}
                    <text x={tipX + 8} y={tipY + 86} fontSize={11} fill="#475569">
                      CDU {(hovRow.cdu_bbl / 1000).toFixed(0)}k BBL
                    </text>
                  </>
                ) : isMultiY ? (
                  <>
                    {FIELDS.map((f, fi) => (
                      <text key={f.key} x={tipX + 8} y={tipY + 28 + fi * 16} fontSize={11}
                        fill={f.color} fontWeight={f.key === activeField ? '700' : '400'}>
                        {f.label}: {fmtVal(hovRow[f.key] as number, f.key)} {f.unit}
                      </text>
                    ))}
                    <text x={tipX + 8} y={tipY + tipH - 8} fontSize={10} fill="#475569">
                      CQI {hovRow.cqi_level} ({hovRow.cqi_avg.toFixed(2)})
                    </text>
                  </>
                ) : (
                  <>
                    <text x={tipX + 8} y={tipY + 30} fontSize={12} fill={fieldMeta.color} fontWeight="700">
                      {fmtVal(hovFieldVal, activeField)} {fieldMeta.unit}
                    </text>
                    <text x={tipX + 8} y={tipY + 46} fontSize={12} fill="#64748b">
                      CDU {(hovRow.cdu_bbl / 1000).toFixed(0)}k BBL · {hovRow.atm_temp.toFixed(1)}℃
                    </text>
                    <rect x={tipX + 8} y={tipY + tipH - 14} width={52} height={11} rx={3}
                      fill={CQI_COLOR[hovRow.cqi_level]} opacity={0.18} />
                    <text x={tipX + 34} y={tipY + tipH - 5} textAnchor="middle" fontSize={11}
                      fill={CQI_COLOR[hovRow.cqi_level]} fontWeight="600">
                      CQI {hovRow.cqi_level} ({hovRow.cqi_avg.toFixed(2)})
                    </text>
                  </>
                )}
              </g>
            );
          })()}

          {/* 데이터셋 선택 날짜 하이라이트 */}
          {highlightDate && (() => {
            const hi = allData.findIndex(r => r.date === highlightDate);
            if (hi < 0) return null;
            const hx = xOf(hi);
            if (hx < PAD_L - 1 || hx > PAD_L + plotW + 1) return null;
            return (
              <g pointerEvents="none">
                <line x1={hx} y1={PAD_T} x2={hx} y2={PAD_T + plotH}
                  stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.9} />
                <rect x={hx - 22} y={PAD_T + 2} width={44} height={14} rx={3}
                  fill="#4c1d95" opacity={0.85} />
                <text x={hx} y={PAD_T + 12} textAnchor="middle" fontSize={10}
                  fill="#c4b5fd" fontWeight="600">
                  {highlightDate.slice(5)}
                </text>
              </g>
            );
          })()}

          {/* Waterfall 구간 표시 */}
          {(() => {
            const x1 = xOf(wfStartIdx);
            const x2 = xOf(wfEndIdx);
            const inView = x2 >= PAD_L - 1 && x1 <= PAD_L + plotW + 1;
            if (!inView) return null;
            const cx1 = Math.max(PAD_L, x1);
            const cx2 = Math.min(PAD_L + plotW, x2);
            const HANDLE_W = 8;
            return (
              <g>
                {/* 구간 음영 */}
                <rect x={cx1} y={PAD_T} width={Math.max(0, cx2 - cx1)} height={plotH}
                  fill="#f59e0b" opacity={0.07} pointerEvents="none" clipPath="url(#ske-kpi-clip)" />
                {/* 시작선 + 날짜 레이블 + 드래그 핸들 */}
                <g style={{ cursor: isDraggingWfLine ? 'ew-resize' : 'col-resize' }}
                  onMouseDown={startWfFromLineDrag}>
                  {x1 >= PAD_L && x1 <= PAD_L + plotW && (
                    <line x1={x1} y1={PAD_T} x2={x1} y2={PAD_T + plotH}
                      stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} pointerEvents="none" />
                  )}
                  {/* 레이블 + 히트영역은 선이 뷰 밖이어도 항상 렌더 */}
                  <rect x={Math.max(PAD_L, x1) - 28} y={PAD_T - 16} width={56} height={14} rx={3}
                    fill="#92400e" opacity={0.7} pointerEvents="none" />
                  <text x={Math.max(PAD_L, x1)} y={PAD_T - 5} textAnchor="middle" fontSize={10}
                    fill="#fcd34d" fontWeight="600" pointerEvents="none">
                    {allData[wfStartIdx]?.date.slice(5)}
                  </text>
                  <rect x={Math.max(PAD_L, x1) - HANDLE_W / 2} y={PAD_T - 16} width={HANDLE_W} height={plotH + 16}
                    fill="transparent" />
                </g>
                {/* 종료선 + 날짜 레이블 + 드래그 핸들 */}
                {x2 >= PAD_L && x2 <= PAD_L + plotW && (
                  <g style={{ cursor: isDraggingWfLine ? 'ew-resize' : 'col-resize' }}
                    onMouseDown={startWfToLineDrag}>
                    <line x1={x2} y1={PAD_T} x2={x2} y2={PAD_T + plotH}
                      stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} pointerEvents="none" />
                    <rect x={x2 - 28} y={PAD_T - 16} width={56} height={14} rx={3}
                      fill="#92400e" opacity={0.9} pointerEvents="none" />
                    <text x={x2} y={PAD_T - 5} textAnchor="middle" fontSize={10}
                      fill="#fcd34d" fontWeight="600" pointerEvents="none">
                      {allData[wfEndIdx]?.date.slice(5)}
                    </text>
                    {/* 히트 영역 — 선 + 레이블 포함 */}
                    <rect x={x2 - HANDLE_W / 2} y={PAD_T - 16} width={HANDLE_W} height={plotH + 16}
                      fill="transparent" />
                  </g>
                )}
              </g>
            );
          })()}

        </svg>
      </div>

      {/* 타임라인 */}
      {(() => {
        const n = SKE_KPI.length;
        const endIdx = xViewRange ? Math.min(n - 1, Math.round(xViewRange.end * n) - 1) : n - 1;
        const sliderIdx = Math.max(0, endIdx);
        return (
          <ChartTimeline
            isPlaying={isPlaying}
            playSpeed={playSpeed}
            sliderIdx={sliderIdx}
            minIdx={0}
            maxIdx={n - 1}
            startDate={SKE_KPI[0]?.date ?? ''}
            currentDate={SKE_KPI[sliderIdx]?.date ?? ''}
            onPlay={togglePlay}
            onSpeedChange={v => { setPlaySpeed(v); }}
            onSlider={v => {
              stopPlay();
              suppressNotifyRef.current = true;
              setXViewRange(prev => {
                if (prev === null) return null;
                const span = prev.end - prev.start;
                const rawEnd = (v + 1) / n;
                const clampedEnd = Math.max(span, Math.min(1, rawEnd));
                return { start: clampedEnd - span, end: clampedEnd };
              });
              const date = SKE_KPI[v]?.date;
              if (date) onAnchorDateChange?.(date);
            }}
          />
        );
      })()}


      {/* 하단 범례 */}
      <div style={{ display: 'flex', gap: 12, padding: '4px 12px 8px', fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
        {(['High', 'Medium', 'Low'] as CqiLevel[]).map(l => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={8} height={8}><circle cx={4} cy={4} r={4} fill={CQI_COLOR[l]} /></svg>
            CQI {l}{l === 'Low' ? ' (배경 음영)' : ''}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
          {allData[fvi]?.date.slice(5)} ~ {allData[lvi]?.date.slice(5)} ({visibleDays}일)
        </span>
        <span>
          {viewMode === 'single' ? `단위: ${fieldMeta.unit}` : multiY ? '에너지원 독립 Y축 (M MJ)' : '각 에너지 개별 정규화'}
        </span>
      </div>
    </div>
  );
}
