import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './draft.css';
import { HEX_WIDTH_PRESETS } from './types-hex';
import {
  applyLayoutDrop,
  resolveApcDropFromPointer,
  type ApcDropTarget,
  type ApcLayout,
} from './data-apcLayout';
import {
  defaultApcLayout,
  loadApcLayoutFromStorage,
  loadApcCardsFromStorage,
  resetApcLayoutStorage,
  resetApcCardsStorage,
  saveApcLayoutToStorage,
  saveApcCardsToStorage,
} from './data-apcLayoutStorage';
import { DraftDragHandle } from './ui';

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface MV { name: string; unit: string; v: number; sp: number; max: number; color: string; }
interface CV { name: string; unit: string; v: number; sp: number; tol: number; st: 'ok' | 'warn' | 'bad'; }
interface LogEntry { ts: string; msg: string; }
interface TagRow { tag: string; name: string; v: string; st: 'ok' | 'warn'; }

interface CardState { width: string; height: string; }

/* 높이 프리셋 — 고정 픽셀 (vpH 공유 없이 카드별 독립) */
const APC_HEIGHT_PRESETS = [
  { label: '자동', value: 'auto'  },
  { label: '80',   value: '80px'  },
  { label: '100',  value: '100px' },
  { label: '120',  value: '120px' },
  { label: '140',  value: '140px' },
  { label: '160',  value: '160px' },
  { label: '180',  value: '180px' },
  { label: '190',  value: '190px' },
  { label: '200',  value: '200px' },
  { label: '235',  value: '235px' },
  { label: '240',  value: '240px' },
  { label: '280',  value: '280px' },
  { label: '320',  value: '320px' },
  { label: '360',  value: '360px' },
  { label: '400',  value: '400px' },
  { label: '480',  value: '480px' },
  { label: '500',  value: '500px' },
  { label: '560',  value: '560px' },
  { label: '600',  value: '600px' },
] as const;

/* 서식 직렬화 — CardState가 이미 string이므로 pass-through */
export type SerializedCards = Record<string, { width: string; height: string }>;
export function serializeCards(cards: Record<string, CardState>): SerializedCards { return cards; }
export function deserializeCards(raw: SerializedCards): Record<string, CardState> { return raw; }


const APC_GAP = 10;

/* gap을 고려한 flex 너비 — X% + X% = 정확히 1행 */
function gapAdjustedWidth(pct: string): string {
  const x = parseFloat(pct);
  if (!isFinite(x) || x === 0) return pct;
  const gapPerCard = (1 - x / 100) * APC_GAP;
  return gapPerCard > 0 ? `calc(${pct} - ${gapPerCard}px)` : pct;
}

/** 열 너비 = 스택 안 카드 중 최대 너비 (행 기준 %) */
function getColWidthStyle(
  col: string[],
  cardStates: Record<string, CardState>,
): React.CSSProperties {
  let maxPct = 0;
  for (const id of col) {
    const v = cardStates[id]?.width ?? '20%';
    if (v === '100%') {
      const w = gapAdjustedWidth('100%');
      return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
    }
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > maxPct) maxPct = n;
  }
  const w = gapAdjustedWidth(`${maxPct || 20}%`);
  return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
}

const DEFAULT_CARDS: Record<string, CardState> = {
  // Row 1 — 태그 스택 (15% × 140px)
  'tags-fuel':     { width: '15%', height: '140px' },
  'tags-h2':       { width: '15%', height: '140px' },
  'tags-og':       { width: '15%', height: '140px' },
  // Row 1 — 공정 흐름 (35% × 600px)
  'schematic':     { width: '35%', height: '600px' },
  'schematic-opt': { width: '35%', height: '600px' },
  // Row 1 — KPI 스택 (15% × 100px)
  'kpi-lng':       { width: '15%', height: '100px' },
  'kpi-og':        { width: '15%', height: '100px' },
  'kpi-dump':      { width: '15%', height: '100px' },
  'kpi-fuel':      { width: '15%', height: '100px' },
  'kpi-save':      { width: '15%', height: '100px' },
  // Row 2 — 업무흐름·트렌드 (25% × 500px)
  'optimize':      { width: '25%', height: '500px' },
  'trend':         { width: '25%', height: '500px' },
  // Row 2 — CV운전범위 + MV조작변수 스택
  'cv-const':      { width: '20%', height: '100px' },
  'mv':            { width: '25%', height: '270px' },
  // Row 2 — MV제약 + CV제어변수 스택
  'mv-const':      { width: '25%', height: '180px' },
  'cv':            { width: '25%', height: '270px' },
  // Row 3 — 5종 (20% × 240px)
  'objectives':    { width: '20%', height: '240px' },
  'solver-ctrl':   { width: '20%', height: '240px' },
  'solver-log':    { width: '20%', height: '240px' },
  'recommends':    { width: '20%', height: '240px' },
  'kpi-result':    { width: '20%', height: '240px' },
};

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const TREND_BASE = [6.2, 5.8, 5.5, 5.1, 4.9, 4.6, 4.4, 4.2];

const INITIAL_MVS: MV[] = [
  { name: 'LNG 밸브',   unit: '%',   v: 38,  sp: 35,  max: 100, color: '#534AB7' },
  { name: 'C3 공급량',  unit: 't/h', v: 2.1, sp: 2.5, max: 5,   color: '#0F6E56' },
  { name: 'PSA 부하',   unit: '%',   v: 74,  sp: 80,  max: 100, color: '#534AB7' },
  { name: 'HP(3) 부하',   unit: '%',     v: 82,  sp: 85,  max: 100, color: '#534AB7' },
  { name: '외부도입 유량', unit: 'Nm³/h', v: 3.2, sp: 5.0, max: 20,  color: '#888780' },
];

const INITIAL_CVS: CV[] = [
  { name: 'HP Header P', unit: 'barg',   v: 48.2, sp: 48.0, tol: 1.0, st: 'ok'   },
  { name: 'LP Header P', unit: 'barg',   v: 12.8, sp: 13.0, tol: 0.5, st: 'ok'   },
  { name: 'Fuel 열량',   unit: 'Mcal/h', v: 318,  sp: 320,  tol: 5,   st: 'ok'   },
  { name: 'H₂ 당량',    unit: 'Nm³/h',  v: 24.6, sp: 25.0, tol: 1.0, st: 'ok'   },
  { name: 'LP H₂ Dump', unit: 'Nm³/h',  v: 0.3,  sp: 0,    tol: 2,   st: 'warn' },
  { name: 'Flaring',     unit: 'Nm³/h',  v: 0.0,  sp: 0,    tol: 0.5, st: 'ok'   },
];

const INITIAL_LOGS: LogEntry[] = [
  { ts: '14:05:00', msg: 'Cycle #251 수렴 완료' },
  { ts: '14:04:15', msg: 'LP Dump 최소화 솔루션 반영' },
  { ts: '14:03:45', msg: 'LNG 밸브 38%→35% 조정' },
  { ts: '14:03:00', msg: 'OG 조성 변동 감지' },
  { ts: '14:02:15', msg: 'H₂ 당량 모델 업데이트' },
  { ts: '14:01:30', msg: 'Cycle #250 수렴 완료' },
];

const TAG_GROUPS: { id: string; title: string; rows: TagRow[] }[] = [
  { id: 'tags-h2', title: 'H₂ 계통', rows: [
    { tag: 'FT-101', name: 'HP H₂ Header 유량', v: '18.4 Nm³/h', st: 'ok'   },
    { tag: 'PT-102', name: 'HP H₂ Header 압력', v: '48.2 barg',  st: 'ok'   },
    { tag: 'FT-201', name: 'LP H₂ Header 유량', v: '9.2 Nm³/h',  st: 'ok'   },
    { tag: 'PT-202', name: 'LP H₂ Header 압력', v: '12.8 barg',  st: 'ok'   },
    { tag: 'AT-301', name: 'PSA 출구 순도',      v: '99.2 %',     st: 'ok'   },
  ]},
  { id: 'tags-fuel', title: 'Fuel 계통', rows: [
    { tag: 'FT-401', name: 'Fuel Header 유량', v: '12.1 Nm³/h', st: 'ok' },
    { tag: 'AT-402', name: 'Fuel 열량',        v: '318 Mcal/h', st: 'ok' },
    { tag: 'FT-403', name: 'LNG 공급량',       v: '4.2 t/h',    st: 'ok' },
    { tag: 'FT-404', name: 'C3 공급량',        v: '2.1 t/h',    st: 'ok' },
    { tag: 'FT-501', name: 'Flaring 유량',     v: '0.0 Nm³/h',  st: 'ok' },
  ]},
  { id: 'tags-og', title: 'Off Gas / 원료', rows: [
    { tag: 'FT-601', name: 'OG 발생량',         v: '8.3 Nm³/h',  st: 'ok'   },
    { tag: 'AT-602', name: 'OG H₂ 조성',        v: '38.2 %',     st: 'warn' },
    { tag: 'AT-603', name: 'OG CH₄ 조성',       v: '32.1 %',     st: 'ok'   },
    { tag: 'AT-604', name: 'H₂ 당량',           v: '24.6 Nm³/h', st: 'ok'   },
    { tag: 'TT-701', name: 'Steam Boiler 온도', v: '312 °C',     st: 'ok'   },
  ]},
];

const OPTIMIZE_STEPS = [
  { title: '데이터 수신 및 전처리',   desc: 'DCS 실시간 태그 수집 → 이상값 필터링 → GC 조성 업데이트',       badge: 'apc-sb-auto',   blbl: '자동' },
  { title: '공정 모델 업데이트',      desc: 'Off Gas 조성 변동 반영 → H₂ 당량 재산출 → PSA 효율 모델 갱신', badge: 'apc-sb-auto',   blbl: '자동' },
  { title: 'LP 최적화 솔버 실행',     desc: '목적함수(LNG Cost 최소화) + 제약조건 적용 → MV 최적값 계산',   badge: 'apc-sb-auto',   blbl: '자동' },
  { title: '솔루션 검토 및 승인',     desc: '수렴 여부 확인 → MV 변화량 체크 → 운전원 승인 또는 자동 실행',  badge: 'apc-sb-manual', blbl: '검토' },
  { title: 'DCS Setpoint 전달',       desc: '최적 MV값을 DCS PID 컨트롤러 SP로 자동 기록 → 밸브 실행',     badge: 'apc-sb-auto',   blbl: '자동' },
  { title: '결과 모니터링 및 피드백', desc: 'CV 실제값 추적 → 편차 발생 시 알람 → 다음 사이클 모델 보정',   badge: 'apc-sb-review', blbl: '검토' },
];

const MV_CONSTRAINTS = [
  { name: 'LNG 밸브 개도', lo: '10 %',    hi: '90 %',     cur: '38 %',      ok: true },
  { name: 'C3 공급량',     lo: '0 t/h',   hi: '4.0 t/h',  cur: '2.1 t/h',   ok: true },
  { name: 'PSA 부하율',    lo: '40 %',    hi: '100 %',    cur: '74 %',      ok: true },
  { name: 'HP(3) 부하율',  lo: '50 %',    hi: '100 %',    cur: '82 %',      ok: true },
  { name: '외부도입 유량', lo: '0 Nm³/h', hi: '20 Nm³/h', cur: '3.2 Nm³/h', ok: true },
];

const CV_CONSTRAINTS = [
  { name: 'HP Header P', lo: '47.0', hi: '49.0', cur: '48.2', ok: true },
  { name: 'LP Header P', lo: '12.5', hi: '13.5', cur: '12.8', ok: true },
  { name: 'Fuel 열량',   lo: '315',  hi: '325',  cur: '318',  ok: true },
  { name: 'H₂ 당량',    lo: '23.0', hi: '27.0', cur: '24.6', ok: true },
  { name: 'LP H₂ Dump', lo: '0',    hi: '2.0',  cur: '0.3',  ok: true },
];

const OBJECTIVES = [
  { name: 'LNG 단가',      v: '₩180,000/t',  w: 'High' as const },
  { name: 'C3 단가',       v: '₩120,000/t',  w: 'Mid'  as const },
  { name: 'H₂ 당량 가치', v: '₩95,000/Nm³', w: 'Mid'  as const },
  { name: 'Dump 패널티',   v: '₩50,000/Nm³', w: 'Low'  as const },
];

const RESULTS = [
  { name: 'LNG',       before: '5.1 t/h', after: '4.2 t/h', delta: '-0.9', good: true  },
  { name: 'C3',        before: '1.5 t/h', after: '2.1 t/h', delta: '+0.6', good: false },
  { name: 'OG 활용',   before: '79%',     after: '91%',      delta: '+12%', good: true  },
  { name: 'LP Dump',   before: '2.4',     after: '0.3',      delta: '-2.1', good: true  },
  { name: 'Fuel 열량', before: '315',     after: '318',      delta: '+3',   good: true  },
];

const CONTRIBUTIONS = [
  { name: 'OG → Fuel 대체', pct: 52, color: '#534AB7' },
  { name: 'C3 LNG 대체',    pct: 28, color: '#0F6E56' },
  { name: 'PSA 효율 향상',  pct: 12, color: '#1D9E75' },
  { name: 'Dump 감소',      pct: 8,  color: '#BA7517' },
];

const RECOMMENDATIONS = [
  'PSA 부하율 80% 목표 달성 시 추가 5% 절감 가능',
  'OG 조성 모니터링 주기 단축 권고 (현 3분→1분)',
  'C3 장기계약 물량 확대 검토 필요',
];

const W_COLOR: Record<string, string> = { High: '#A32D2D', Mid: '#854F0B', Low: '#0F6E56' };

/* ─────────────────────────────────────────────
   LIVE DATA HOOK
───────────────────────────────────────────── */
const jitter = (v: number, d: number) =>
  Math.round((v + (Math.random() - 0.5) * d) * 10) / 10;

function useLiveData() {
  const [mvs, setMVs]      = useState<MV[]>(INITIAL_MVS);
  const [cvs, setCVs]      = useState<CV[]>(INITIAL_CVS);
  const [logs, setLogs]    = useState<LogEntry[]>(INITIAL_LOGS);
  const [cycle, setCycle]  = useState(251);
  const [lngKpi, setLng]   = useState(4.2);
  const [ogKpi,  setOg]    = useState(91);
  const [fuelKpi,setFuel]  = useState(318);

  const tick = useCallback(() => {
    setCVs(prev => prev.map((c, i) => {
      const vals = [jitter(48.2,.3), jitter(12.8,.2), jitter(318,3), jitter(24.6,.3), c.v, c.v];
      return { ...c, v: vals[i] };
    }));
    setMVs(prev => prev.map((m, i) => {
      if (i === 0) return { ...m, v: jitter(38, 1) };
      if (i === 1) return { ...m, v: jitter(2.1, 0.1) };
      if (i === 3) return { ...m, v: jitter(82, 1) };
      return m;
    }));
    setLng(jitter(4.2, 0.1));
    setOg(Math.round(jitter(91, 1)));
    setFuel(Math.round(jitter(318, 3)));
  }, []);

  const runSolver = useCallback(() => {
    setCycle(prev => {
      const next = prev + 1;
      const ts = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLogs(p => [{ ts, msg: `Cycle #${next} 수렴 완료` }, ...p.slice(0, 7)]);
      return next;
    });
    tick();
  }, [tick]);

  useEffect(() => { const id = setInterval(tick, 4000); return () => clearInterval(id); }, [tick]);

  return { mvs, cvs, logs, cycle, lngKpi, ogKpi, fuelKpi, runSolver };
}

/* ─────────────────────────────────────────────
   CARD WRAPPER
───────────────────────────────────────────── */
interface CardWrapperProps {
  id: string;
  icon?: string;
  title: string;
  state: CardState;
  onUpdate: (patch: Partial<CardState>) => void;
  children: React.ReactNode;
  className?: string;
  dragging?: boolean;
  fillColumn?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/* ─────────────────────────────────────────────
   EDITABLE SELECT — 드롭다운 + 직접입력
───────────────────────────────────────────── */
const APC_CUSTOM_OPT = '__custom__';

interface EditableSelectProps {
  presets: readonly { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  className?: string;
  title?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}

const EditableSelect: React.FC<EditableSelectProps> = ({
  presets, value, onChange, suffix, className, title, onMouseDown,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    setEditing(false);
    const t = raw.trim();
    if (!t) return;
    const normalized = /^\d+(\.\d+)?$/.test(t) ? t + suffix : t;
    onChange(normalized);
  };

  const startEdit = () => {
    setDraft(value !== 'auto' ? value.replace(suffix, '') : '');
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  };

  const isCustom = !presets.some(p => p.value === value);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        className={className}
        title={title}
        value={isCustom ? APC_CUSTOM_OPT : value}
        style={editing ? { visibility: 'hidden' } : undefined}
        onMouseDown={onMouseDown}
        onChange={e => {
          if (e.target.value === APC_CUSTOM_OPT) { startEdit(); }
          else { onChange(e.target.value); }
        }}
        onDoubleClick={startEdit}
      >
        {presets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        {isCustom
          ? <option value={APC_CUSTOM_OPT}>✏ {value}</option>
          : <option value={APC_CUSTOM_OPT}>직접입력...</option>
        }
      </select>
      {editing && (
        <input
          ref={inputRef}
          className={className}
          style={{ position: 'absolute', inset: 0, width: '100%', boxSizing: 'border-box', textAlign: 'left' }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
        />
      )}
    </div>
  );
};

const CardWrapper: React.FC<CardWrapperProps> = ({
  id: _id, icon, title, state, onUpdate, children, className,
  dragging, fillColumn, onDragStart, onDragEnd,
}) => {
  const widthVal  = state.width  ?? '100%';
  const heightVal = state.height ?? 'auto';
  const fixedH    = heightVal !== 'auto';
  const cardWidth = fillColumn ? '100%' : gapAdjustedWidth(widthVal);

  return (
    <div
      className={[
        'apc-card',
        'draft-ekpi-card',
        fixedH   ? 'apc-card--fixed-h'  : '',
        dragging ? 'apc-card--dragging' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      data-apc-card-id={_id}
      style={{ width: cardWidth, maxWidth: '100%', ...(fixedH ? { height: heightVal, '--apc-flex-basis': heightVal } as React.CSSProperties : {}) }}
      onDragEnd={onDragEnd}
    >
      <div className="draft-ekpi-card-title">
        <DraftDragHandle
          draggable
          title="드래그하여 카드 순서 변경"
          ariaLabel="드래그하여 카드 순서 변경"
          onDragStart={e => {
            e.stopPropagation();
            e.dataTransfer.setData('text/plain', _id);
            e.dataTransfer.effectAllowed = 'move';
            const card = (e.currentTarget as HTMLElement).closest('.apc-card') as HTMLElement;
            if (card) {
              const rect = card.getBoundingClientRect();
              e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
            }
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
        />
        {icon && <i className={`ti ${icon}`} aria-hidden="true" />}
        <span className="apc-card-title-text">{title}</span>
        <EditableSelect
          className="draft-toolbar-select"
          presets={HEX_WIDTH_PRESETS}
          value={state.width}
          onChange={v => onUpdate({ width: v })}
          suffix="%"
          title="너비"
          onMouseDown={e => e.stopPropagation()}
        />
        <EditableSelect
          className="draft-toolbar-select"
          presets={APC_HEIGHT_PRESETS}
          value={state.height}
          onChange={v => onUpdate({ height: v })}
          suffix="px"
          title="높이"
          onMouseDown={e => e.stopPropagation()}
        />
      </div>
      {fixedH
        ? <div className="apc-card-body">{children}</div>
        : children
      }
    </div>
  );
};

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */
const CV_ICON: Record<string, string> = { ok: 'ti-circle-check', warn: 'ti-alert-triangle', bad: 'ti-alert-circle' };

const CVRow: React.FC<{ cv: CV }> = ({ cv }) => {
  const cls = cv.st === 'ok' ? 'apc-cv-ok' : cv.st === 'warn' ? 'apc-cv-warn' : 'apc-cv-bad';
  const dev = Math.round(Math.abs(cv.v - cv.sp) * 10) / 10;
  return (
    <div className="apc-data-row">
      <div style={{ flex: 1 }}>
        <div className="apc-row-name">{cv.name}</div>
        <div className="apc-row-sub">SP {cv.sp} ±{cv.tol} {cv.unit}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={`apc-row-val ${cls}`}>
          <i className={`ti ${CV_ICON[cv.st]}`} aria-hidden="true" /> {cv.v}
        </div>
        <div className="apc-row-sub">Δ {dev}</div>
      </div>
    </div>
  );
};

const MVRow: React.FC<{ mv: MV }> = ({ mv }) => {
  const pct   = Math.min(100, Math.round((mv.v / mv.max) * 100));
  const spPct = Math.min(100, Math.round((mv.sp / mv.max) * 100));
  return (
    <div className="apc-mv-row">
      <div className="apc-mv-row-label">
        <span className="apc-row-name">{mv.name}</span>
        <span className="apc-row-val">{mv.v}<span className="apc-row-unit"> {mv.unit}</span></span>
      </div>
      <div className="apc-mv-row-bar">
        <div className="apc-bar-track">
          <div className="apc-bar-fill" style={{ width: `${pct}%`, background: mv.color }} />
          <div className="apc-bar-sp" style={{ left: `${spPct}%` }} />
        </div>
        <span className="apc-row-sub">SP {mv.sp}</span>
      </div>
    </div>
  );
};

const TrendBars: React.FC<{ values: number[] }> = ({ values }) => {
  const max = Math.max(...values);
  return (
    <div className="apc-trend-bars">
      {values.map((v, i) => (
        <div key={i} className="apc-trend-bar"
          style={{ height: Math.round((v / max) * 36), background: `rgba(83,74,183,${(0.3 + 0.7*(i/(values.length-1))).toFixed(2)})` }}
          title={`${v} t/h`}
        />
      ))}
    </div>
  );
};

const ProcessSchematic: React.FC = () => (
  <svg width="100%" viewBox="0 -28 640 268" role="img" style={{ display: 'block' }}>
    <title>Fuel/H₂ 실시간 공정 흐름도</title>
    <defs>
      <marker id="apc-ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
    <rect x="2" y="26" width="82" height="154" rx="3" fill="none" stroke="#B4B2A9" strokeWidth="0.8" strokeDasharray="5 3"/>
    <text x="43" y="40" textAnchor="middle" style={{fontSize:10,fill:'#5F5E5A',fontWeight:500}}>HP &amp; Fuel Src</text>
    <line x1="8" y1="45" x2="78" y2="45" stroke="#B4B2A9" strokeWidth="0.3"/>
    {['LNG','C3','저가 LNG','장기계약C3','Off Gas'].map((t,i)=>(
      <text key={t} x="43" y={57+i*13} textAnchor="middle" style={{fontSize:9.5,fill:'#888780'}}>{t}</text>
    ))}
    <rect x="10" y="144" width="66" height="18" rx="2" fill="#FAEEDA" stroke="#BA7517" strokeWidth="0.5"/>
    <text x="43" y="157" textAnchor="middle" style={{fontSize:10,fill:'#633806'}}>Fuel 공급 ▶</text>
    <rect x="106" y="38"  width="58" height="36" rx="2" fill="#EEEDFE" stroke="#534AB7" strokeWidth="1"/>
    <text x="135" y="52" textAnchor="middle" style={{fontSize:11,fill:'#3C3489',fontWeight:500}}>HP (3)</text>
    <text x="135" y="66" textAnchor="middle" style={{fontSize:10,fill:'#534AB7'}}>● ON</text>
    <rect x="106" y="126" width="58" height="36" rx="2" fill="#EEEDFE" stroke="#534AB7" strokeWidth="1"/>
    <text x="135" y="140" textAnchor="middle" style={{fontSize:11,fill:'#3C3489',fontWeight:500}}>PSA (5)</text>
    <text x="135" y="154" textAnchor="middle" style={{fontSize:10,fill:'#534AB7'}}>LP→HP</text>
    <rect x="106" y="194" width="58" height="28" rx="2" fill="#F1EFE8" stroke="#888780" strokeWidth="0.8"/>
    <text x="135" y="212" textAnchor="middle" style={{fontSize:11,fill:'#444441',fontWeight:500}}>Process</text>
    <rect x="222" y="26"  width="122" height="24" rx="2" fill="none" stroke="#534AB7" strokeWidth="2.5"/>
    <text x="283" y="42" textAnchor="middle" style={{fontSize:11,fill:'#534AB7',fontWeight:500}}>HP H₂  Header</text>
    <text x="283" y="19" textAnchor="middle" style={{fontSize:9,fill:'#888780'}}>48.2 barg · 18.4 Nm³/h</text>
    <rect x="222" y="154" width="122" height="24" rx="2" fill="none" stroke="#0F6E56" strokeWidth="2.5"/>
    <text x="283" y="170" textAnchor="middle" style={{fontSize:11,fill:'#0F6E56',fontWeight:500}}>LP H₂  Header</text>
    <text x="283" y="191" textAnchor="middle" style={{fontSize:9,fill:'#888780'}}>12.8 barg · 9.2 Nm³/h</text>
    <rect x="222" y="78"  width="122" height="20" rx="2" fill="none" stroke="#BA7517" strokeWidth="1"/>
    <text x="283" y="92" textAnchor="middle" style={{fontSize:10,fill:'#854F0B'}}>F/G Header · 318 Mcal/h</text>
    <path d="M164 56 L188 56 L188 38 L222 38"   stroke="#534AB7" strokeWidth="1.5" fill="none" markerEnd="url(#apc-ar)"/>
    <path d="M164 144 L188 144 L188 163 L222 163" stroke="#0F6E56" strokeWidth="1.5" fill="none" markerEnd="url(#apc-ar)"/>
    <path d="M164 144 L188 144 L188 38 L222 38"  stroke="#534AB7" strokeWidth="1" strokeDasharray="5 3" fill="none" markerEnd="url(#apc-ar)"/>
    <path d="M164 208 L196 208 L196 163 L222 163" stroke="#0F6E56" strokeWidth="1" fill="none" markerEnd="url(#apc-ar)"/>
    <line x1="84" y1="76"  x2="106" y2="56"  stroke="#888780" strokeWidth="1" markerEnd="url(#apc-ar)"/>
    <line x1="84" y1="106" x2="106" y2="144" stroke="#888780" strokeWidth="1" markerEnd="url(#apc-ar)"/>
    <line x1="76" y1="152" x2="106" y2="208" stroke="#888780" strokeWidth="0.8" strokeDasharray="3 2" markerEnd="url(#apc-ar)"/>
    <rect x="382" y="16"  width="62" height="30" rx="2" fill="#EEEDFE" stroke="#534AB7" strokeWidth="0.8"/>
    <text x="413" y="27" textAnchor="middle" style={{fontSize:10,fill:'#3C3489',fontWeight:500}}>User A</text>
    <text x="413" y="39" textAnchor="middle" style={{fontSize:10,fill:'#534AB7'}}>고순도</text>
    <rect x="382" y="54"  width="62" height="30" rx="2" fill="#EEEDFE" stroke="#534AB7" strokeWidth="0.8"/>
    <text x="413" y="65" textAnchor="middle" style={{fontSize:10,fill:'#3C3489',fontWeight:500}}>User B</text>
    <text x="413" y="77" textAnchor="middle" style={{fontSize:10,fill:'#534AB7'}}>고/저순도</text>
    <rect x="382" y="148" width="62" height="30" rx="2" fill="#E1F5EE" stroke="#0F6E56" strokeWidth="0.8"/>
    <text x="413" y="159" textAnchor="middle" style={{fontSize:10,fill:'#085041',fontWeight:500}}>User C</text>
    <text x="413" y="171" textAnchor="middle" style={{fontSize:10,fill:'#0F6E56'}}>저순도</text>
    <path d="M344 32 L364 32 L382 32"           stroke="#534AB7" strokeWidth="1.5" fill="none" markerEnd="url(#apc-ar)"/>
    <path d="M344 38 L364 38 L364 69 L382 69"   stroke="#534AB7" strokeWidth="1.2" fill="none" markerEnd="url(#apc-ar)"/>
    <line x1="344" y1="163" x2="382" y2="163"  stroke="#0F6E56" strokeWidth="1.5" markerEnd="url(#apc-ar)"/>
    <rect x="488" y="98"  width="16" height="120" rx="2" fill="none" stroke="#BA7517" strokeWidth="2.5"/>
    <text x="496" y="160" textAnchor="middle" style={{fontSize:9,fill:'#854F0B'}} transform="rotate(-90,496,160)">Fuel Header</text>
    <line x1="444" y1="31"  x2="496" y2="120" stroke="#BA7517" strokeWidth="1" strokeDasharray="4 2" markerEnd="url(#apc-ar)"/>
    <line x1="444" y1="69"  x2="496" y2="150" stroke="#BA7517" strokeWidth="1" markerEnd="url(#apc-ar)"/>
    <line x1="444" y1="163" x2="488" y2="188" stroke="#BA7517" strokeWidth="1" markerEnd="url(#apc-ar)"/>
    <rect x="516" y="14"  width="50" height="24" rx="2" fill="#FCEBEB" stroke="#E24B4A" strokeWidth="1"/>
    <text x="541" y="30" textAnchor="middle" style={{fontSize:11,fill:'#791F1F',fontWeight:500}}>Flare</text>
    <line x1="496" y1="98" x2="496" y2="38" stroke="#E24B4A" strokeWidth="1.2"/>
    <line x1="496" y1="38" x2="516" y2="26" stroke="#E24B4A" strokeWidth="1.2" markerEnd="url(#apc-ar)"/>
    <rect x="516" y="148" width="50" height="24" rx="2" fill="#FAEEDA" stroke="#BA7517" strokeWidth="0.8"/>
    <text x="541" y="164" textAnchor="middle" style={{fontSize:10,fill:'#633806'}}>Process</text>
    <rect x="516" y="180" width="50" height="24" rx="2" fill="#F1EFE8" stroke="#888780" strokeWidth="0.8"/>
    <text x="541" y="196" textAnchor="middle" style={{fontSize:10,fill:'#444441'}}>User</text>
    <line x1="504" y1="158" x2="516" y2="160" stroke="#BA7517" strokeWidth="1" markerEnd="url(#apc-ar)"/>
    <line x1="504" y1="204" x2="516" y2="192" stroke="#888780" strokeWidth="0.8" markerEnd="url(#apc-ar)"/>
    <line x1="344" y1="168" x2="413" y2="210" stroke="#0F6E56" strokeWidth="0.8" strokeDasharray="4 2" markerEnd="url(#apc-ar)"/>
    <text x="370" y="224" textAnchor="middle" style={{fontSize:9,fill:'#0F6E56'}}>LP H₂ Dump</text>
    <rect x="229" y="-24" width="68" height="16" rx="2" fill="#F1EFE8" stroke="#888780" strokeWidth="0.8"/>
    <text x="263" y="-12" textAnchor="middle" style={{fontSize:10,fill:'#444441',fontWeight:500}}>외부도입</text>
    <line x1="263" y1="-8" x2="263" y2="26" stroke="#534AB7" strokeWidth="1.5" markerEnd="url(#apc-ar)"/>
    <text x="352" y="-18" style={{fontSize:9,fill:'#888780'}}>Off Gas to 외부 HP</text>
    <line x1="350" y1="-21" x2="420" y2="-21" stroke="#888780" strokeWidth="0.8" markerEnd="url(#apc-ar)"/>
  </svg>
);

/* ─────────────────────────────────────────────
   PROCESS FLOW OPT (React Flow)
───────────────────────────────────────────── */
const FLOW_OPT_NODES: Node[] = [
  // Source
  { id: 'src', position: { x: 0, y: 80 }, data: { label: 'HP & Fuel Src\nLNG / C3\n저가LNG / 장기계약C3\nOff Gas' }, style: { width: 95, fontSize: 9, background: '#1a1f2e', border: '1px dashed #666', color: '#aaa', whiteSpace: 'pre-line', textAlign: 'center', padding: '6px 4px' } },
  // HP(3) 압축기
  { id: 'hp3', position: { x: 120, y: 20 }, data: { label: 'HP (3)\nCmp-HP3' }, style: { width: 80, fontSize: 10, background: '#1e1a3a', border: '1.5px solid #7c6ff7', color: '#a89ffa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // PSA(5) LP→HP
  { id: 'psa5', position: { x: 120, y: 175 }, data: { label: 'PSA(5)\nLP→HP' }, style: { width: 80, fontSize: 10, background: '#1a2e28', border: '1px solid #0F6E56', color: '#5eb89b', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // Process (from plant)
  { id: 'process-in', position: { x: 0, y: 250 }, data: { label: 'Process\n(Reformer 등)' }, style: { width: 90, fontSize: 9, background: '#1e1e1e', border: '1px solid #666', color: '#aaa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'filter', position: { x: 120, y: 310 }, data: { label: 'Filter' }, style: { width: 80, fontSize: 10, background: '#1e1e1e', border: '1px solid #555', color: '#aaa', textAlign: 'center', padding: '5px 4px' } },
  // Headers
  { id: 'hp-hdr', position: { x: 240, y: 40 }, data: { label: 'HP H₂ Header\n48.2 barg · 18.4 Nm³/h' }, style: { width: 130, fontSize: 10, background: 'none', border: '2px solid #534AB7', color: '#9d96e8', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'fg-hdr', position: { x: 240, y: 160 }, data: { label: 'F/G Header\n318 Mcal/h' }, style: { width: 130, fontSize: 9, background: 'none', border: '1px solid #BA7517', color: '#d4891a', textAlign: 'center', padding: '5px 4px', whiteSpace: 'pre-line' } },
  { id: 'lp-hdr', position: { x: 240, y: 250 }, data: { label: 'LP H₂ Header\n12.8 barg · 9.2 Nm³/h' }, style: { width: 130, fontSize: 10, background: 'none', border: '2px solid #0F6E56', color: '#5eb89b', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // Users
  { id: 'user-a', position: { x: 410, y: 10 }, data: { label: 'User A\nHigh Purity' }, style: { width: 90, fontSize: 10, background: '#1e1a3a', border: '1px solid #534AB7', color: '#a89ffa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'user-b', position: { x: 410, y: 80 }, data: { label: 'User B\nHigh/Low Purity' }, style: { width: 90, fontSize: 10, background: '#1e1a3a', border: '1px solid #534AB7', color: '#a89ffa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'user-c', position: { x: 410, y: 255 }, data: { label: 'User C\nLow Purity' }, style: { width: 90, fontSize: 10, background: '#1a2e28', border: '1px solid #0F6E56', color: '#5eb89b', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // Fuel Header + downstream
  { id: 'fuel-hdr', position: { x: 410, y: 155 }, data: { label: 'Fuel\nHeader' }, style: { width: 70, fontSize: 10, background: 'none', border: '2px solid #BA7517', color: '#d4891a', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'fired-htr', position: { x: 520, y: 130 }, data: { label: 'Process\nFired Heater' }, style: { width: 90, fontSize: 10, background: '#2a1e0e', border: '1px solid #BA7517', color: '#d4891a', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  { id: 'gen-fuel', position: { x: 520, y: 210 }, data: { label: 'General\nUser Fuel' }, style: { width: 90, fontSize: 10, background: '#1e1e1e', border: '1px solid #888', color: '#aaa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // Flare
  { id: 'flare', position: { x: 525, y: 20 }, data: { label: 'Flare\nStack' }, style: { width: 80, fontSize: 10, background: '#2a1212', border: '1px solid #E24B4A', color: '#e77', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
  // LP Dump
  { id: 'lp-dump', position: { x: 410, y: 330 }, data: { label: 'LP H₂\nDump' }, style: { width: 80, fontSize: 9, background: '#1a2e28', border: '1px dashed #0F6E56', color: '#5eb89b', textAlign: 'center', padding: '5px 4px', whiteSpace: 'pre-line' } },
  // 외부도입 (외부 HP Source — 신설 중)
  { id: 'ext-import', position: { x: 240, y: -70 }, data: { label: '외부도입\n(외부 HP)' }, style: { width: 100, fontSize: 10, background: '#1e1e2e', border: '1.5px dashed #534AB7', color: '#a89ffa', textAlign: 'center', padding: '6px 4px', whiteSpace: 'pre-line' } },
];

const FLOW_OPT_EDGES: Edge[] = [
  // Source → trains
  { id: 'e-src-hp3',    source: 'src',       target: 'hp3',      style: { stroke: '#7c6ff7', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#7c6ff7' } },
  { id: 'e-src-psa5',   source: 'src',       target: 'psa5',     style: { stroke: '#0F6E56', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  // HP(3) → HP H₂ Header
  { id: 'e-hp3-hphdr',  source: 'hp3',       target: 'hp-hdr',   style: { stroke: '#7c6ff7', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#7c6ff7' } },
  // PSA(5) LP→HP: HP 승압 출력, LP 생산, 퍼지→FG
  { id: 'e-psa5-hphdr', source: 'psa5',      target: 'hp-hdr',   style: { stroke: '#0F6E56', strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  { id: 'e-psa5-lphdr', source: 'psa5',      target: 'lp-hdr',   style: { stroke: '#0F6E56', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  { id: 'e-psa5-fg',    source: 'psa5',      target: 'fg-hdr',   style: { stroke: '#BA7517', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#BA7517' } },
  // 외부도입 → HP H₂ Header (신설 중, 점선)
  { id: 'e-ext-hphdr',  source: 'ext-import',target: 'hp-hdr',   style: { stroke: '#534AB7', strokeWidth: 1.5, strokeDasharray: '5 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#534AB7' } },
  // Process → filter → LP
  { id: 'e-proc-flt',   source: 'process-in',target: 'filter',   style: { stroke: '#888', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#888' } },
  { id: 'e-flt-lphdr',  source: 'filter',    target: 'lp-hdr',   style: { stroke: '#0F6E56', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  // HP Header → Users A, B
  { id: 'e-hphdr-ua',   source: 'hp-hdr',    target: 'user-a',   style: { stroke: '#7c6ff7', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#7c6ff7' } },
  { id: 'e-hphdr-ub',   source: 'hp-hdr',    target: 'user-b',   style: { stroke: '#7c6ff7', strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#7c6ff7' } },
  // LP Header → User C
  { id: 'e-lphdr-uc',   source: 'lp-hdr',    target: 'user-c',   style: { stroke: '#0F6E56', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  // LP Header → LP Dump
  { id: 'e-lphdr-dump', source: 'lp-hdr',    target: 'lp-dump',  style: { stroke: '#0F6E56', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#0F6E56' } },
  // FG Header → Fuel Header
  { id: 'e-fg-fuelhdr',  source: 'fg-hdr',   target: 'fuel-hdr', style: { stroke: '#BA7517', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#BA7517' } },
  // Users → Fuel Header
  { id: 'e-ua-fuelhdr',  source: 'user-a',   target: 'fuel-hdr', style: { stroke: '#BA7517', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#BA7517' } },
  { id: 'e-ub-fuelhdr',  source: 'user-b',   target: 'fuel-hdr', style: { stroke: '#BA7517', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#BA7517' } },
  // Fuel Header → Fired Heater, General Fuel
  { id: 'e-fhdr-fired',  source: 'fuel-hdr', target: 'fired-htr',style: { stroke: '#BA7517', strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#BA7517' } },
  { id: 'e-fhdr-gen',    source: 'fuel-hdr', target: 'gen-fuel', style: { stroke: '#888', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#888' } },
  // Fuel Header → Flare
  { id: 'e-fhdr-flare',  source: 'fuel-hdr', target: 'flare',    style: { stroke: '#E24B4A', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#E24B4A' } },
];

const ProcessFlowOpt: React.FC = () => (
  <div style={{ width: '100%', height: '100%', minHeight: 320 }}>
    <ReactFlow
      nodes={FLOW_OPT_NODES}
      edges={FLOW_OPT_EDGES}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      minZoom={0.4}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#2a2f3e" />
    </ReactFlow>
  </div>
);

/* ─────────────────────────────────────────────
   ROOT COMPONENT
───────────────────────────────────────────── */
export const ApcDashboard: React.FC = () => {
  const [clock, setClock]         = useState('');
  const [running, setRunning]     = useState(false);
  const [cards, setCards]         = useState<Record<string, CardState>>(() => {
    const raw = loadApcCardsFromStorage() as Record<string, Record<string, unknown>>;
    const first = Object.values(raw)[0];
    if (first && typeof first['widthIdx'] === 'number') {
      // 구버전 index 포맷 마이그레이션
      const migrated = Object.fromEntries(Object.entries(raw).map(([id, s]) => [id, {
        width:  (HEX_WIDTH_PRESETS as readonly { value: string }[])[s['widthIdx'] as number]?.value ?? '20%',
        height: (APC_HEIGHT_PRESETS as readonly { value: string }[])[s['heightIdx'] as number]?.value ?? 'auto',
      }]));
      return { ...DEFAULT_CARDS, ...migrated };
    }
    return { ...DEFAULT_CARDS, ...(raw as unknown as Record<string, CardState>) };
  });
  const [layout, setLayout]         = useState<ApcLayout>(loadApcLayoutFromStorage);
  const [, setUndoStack]   = useState<ApcLayout[]>([]);
  const [draggingId, setDragging]   = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ApcDropTarget | null>(null);
  const dropTargetRef = useRef<ApcDropTarget | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const layoutRef = useRef<ApcLayout>(layout);
  const didDropRef = useRef(false);
  dropTargetRef.current = dropTarget;
  layoutRef.current = layout;
  const { mvs, cvs, logs, cycle, lngKpi, ogKpi, fuelKpi, runSolver } = useLiveData();

  const handleDragStart = useCallback((id: string) => {
    didDropRef.current = false;
    draggingIdRef.current = id;
    requestAnimationFrame(() => setDragging(id));
  }, []);

  const handleDragEnd = useCallback(() => {
    requestAnimationFrame(() => {
      if (!didDropRef.current) {
        draggingIdRef.current = null;
        setDragging(null);
        setDropTarget(null);
      }
      didDropRef.current = false;
    });
  }, []);

  const handleWrapDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggingIdRef.current) return;
    const next = resolveApcDropFromPointer(
      e.clientX,
      e.clientY,
      e.currentTarget as HTMLElement,
      draggingIdRef.current,
    );
    if (!next) {
      setDropTarget(null);
      return;
    }
    setDropTarget(prev => {
      if (
        prev?.kind === next.kind &&
        prev?.targetId === next.targetId &&
        prev?.rowIndex === next.rowIndex &&
        prev?.colIndex === next.colIndex
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const applyDrop = useCallback(() => {
    const from = draggingIdRef.current;
    const dt = dropTargetRef.current;
    if (!from || !dt) return;
    setLayout(prev => {
      const next = applyLayoutDrop(prev, from, dt);
      setUndoStack(stack => [...stack.slice(-19), prev]);
      return next;
    });
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  const handleWrapDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    didDropRef.current = true;
    applyDrop();
  }, [applyDrop]);

  const upd = (id: string, patch: Partial<CardState>) =>
    setCards(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        setUndoStack(stack => {
          if (stack.length === 0) return stack;
          const prev = stack[stack.length - 1];
          setLayout(prev);
          return stack.slice(0, -1);
        });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { saveApcLayoutToStorage(layout); }, [layout]);
  useEffect(() => { saveApcCardsToStorage(cards); }, [cards]);

  const handleLayoutReset = useCallback(() => {
    resetApcLayoutStorage();
    resetApcCardsStorage();
    setCards(DEFAULT_CARDS);
    const fresh = defaultApcLayout();
    setLayout(fresh);
    setUndoStack([]);
    layoutRef.current = fresh;
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  const handleRun = () => { setRunning(true); runSolver(); setTimeout(() => setRunning(false), 1400); };
  const hasWarn   = cvs.some(c => c.st === 'warn');

  const KPI_DATA: Record<string, { label: string; val: string; unit: string; delta: string }> = {
    'kpi-lng':  { label: 'LNG 사용량',     val: lngKpi.toFixed(1), unit: 't/h',    delta: '▼ 18% vs base' },
    'kpi-og':   { label: 'Off Gas 활용률', val: String(ogKpi),     unit: '%',       delta: '▲ 목표 달성'   },
    'kpi-dump': { label: 'LP H₂ Dump',    val: '0.3',             unit: 'Nm³/h',  delta: '▼ 최소화'      },
    'kpi-fuel': { label: 'Fuel 열량',      val: String(fuelKpi),   unit: 'Mcal/h', delta: '목표 ±2%'      },
    'kpi-save': { label: '예상 절감',       val: '124',             unit: '만원/일', delta: '▲ vs 수동'     },
  };

  const dndProps = (id: string) => ({
    dragging:    draggingId === id,
    onDragStart: () => handleDragStart(id),
    onDragEnd:   handleDragEnd,
  });

  const renderCard = (id: string, fillColumn = false): React.ReactNode => {
    const s   = cards[id];
    const upd1 = (p: Partial<CardState>) => upd(id, p);
    const d   = dndProps(id);

    /* KPI 카드 */
    if (id in KPI_DATA) {
      const k = KPI_DATA[id];
      return (
        <CardWrapper key={id} id={id} icon="ti-chart-bar" title={k.label} state={s} onUpdate={upd1} className="apc-kpi-card" fillColumn={fillColumn} {...d}>
          <div><span className="apc-kpi-num">{k.val}</span><span className="apc-kpi-unit"> {k.unit}</span></div>
          <div className="apc-kpi-delta apc-delta-good">{k.delta}</div>
        </CardWrapper>
      );
    }

    /* 태그 카드 */
    const tagGroup = TAG_GROUPS.find(g => g.id === id);
    if (tagGroup) {
      return (
        <CardWrapper key={id} id={id} icon="ti-database" title={tagGroup.title} state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
          {tagGroup.rows.map(r => (
            <div key={r.tag} className="apc-data-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="apc-tag-code">{r.tag}</span>
                <span className="apc-row-sub" style={{ marginLeft: 6 }}>{r.name}</span>
              </div>
              <span className="apc-row-val" style={{ color: r.st === 'warn' ? '#d29922' : '#c9d1d9', flexShrink: 0 }}>
                {r.st === 'warn' && <i className="ti ti-alert-triangle" style={{ fontSize: 11, marginRight: 3 }} aria-hidden="true" />}
                {r.v}
              </span>
            </div>
          ))}
        </CardWrapper>
      );
    }

    /* 개별 카드 */
    switch (id) {
      case 'schematic':
        return (
          <CardWrapper key={id} id={id} icon="ti-topology-star-ring" title="공정 흐름 — 현재 상태" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <ProcessSchematic />
          </CardWrapper>
        );
      case 'schematic-opt':
        return (
          <CardWrapper key={id} id={id} icon="ti-arrows-maximize" title="공정 흐름 — 최적화" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <ProcessFlowOpt />
          </CardWrapper>
        );
      case 'cv':
        return (
          <CardWrapper key={id} id={id} icon="ti-target" title="CV — 제어변수" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {cvs.map((cv, i) => <CVRow key={i} cv={cv} />)}
          </CardWrapper>
        );
      case 'mv':
        return (
          <CardWrapper key={id} id={id} icon="ti-adjustments-alt" title="MV — 조작변수" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <div className="apc-mv-list">
              {mvs.map((mv, i) => <MVRow key={i} mv={mv} />)}
            </div>
          </CardWrapper>
        );
      case 'optimize':
        return (
          <CardWrapper key={id} id={id} icon="ti-list-numbers" title="최적화 업무 흐름" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {OPTIMIZE_STEPS.map((step, i) => (
              <div key={i} className="apc-step-row">
                <div className="apc-step-num">{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="apc-step-title">{step.title}</div>
                  <div className="apc-step-desc">{step.desc}</div>
                  <span className={`apc-step-badge ${step.badge}`}>{step.blbl}</span>
                </div>
              </div>
            ))}
          </CardWrapper>
        );
      case 'solver-log':
        return (
          <CardWrapper key={id} id={id} icon="ti-terminal-2" title="솔버 로그" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {logs.slice(0, 6).map((l, i) => (
              <div key={i} className="apc-log-line">
                <span className="apc-log-ts">{l.ts}</span>
                <span className="apc-row-sub">{l.msg}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'solver-ctrl':
        return (
          <CardWrapper key={id} id={id} icon="ti-player-play" title="솔버 제어" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {[
              { label: '현재 사이클', value: `#${cycle}`, cls: '' },
              { label: '상태',        value: 'Converged',  cls: 'apc-cv-ok' },
              { label: '반복횟수',    value: '14 iter',    cls: '' },
              { label: '소요시간',    value: '0.8 s',      cls: '' },
            ].map(row => (
              <div key={row.label} className="apc-data-row">
                <span className="apc-row-sub">{row.label}</span>
                <span className={`apc-row-val ${row.cls}`}>{row.value}</span>
              </div>
            ))}
            <button className="apc-run-btn" onClick={handleRun} disabled={running}>
              <i className={`ti ${running ? 'ti-loader-2' : 'ti-player-play'}`}
                style={running ? { display: 'inline-block', animation: 'apc-spin .8s linear infinite' } : {}}
                aria-hidden="true" />
              {running ? '실행 중...' : '수동 실행'}
            </button>
          </CardWrapper>
        );
      case 'trend':
        return (
          <CardWrapper key={id} id={id} icon="ti-chart-line" title="LNG 트렌드 & 절감 분석" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <TrendBars values={TREND_BASE} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, marginBottom: 12 }}>
              <span className="apc-row-sub">-8 step (6.2 t/h)</span>
              <span className="apc-row-sub">현재 (4.2 t/h)</span>
            </div>
            <div className="apc-sub-title">절감 기여도</div>
            {CONTRIBUTIONS.map(r => (
              <div key={r.name} className="apc-contrib-row">
                <span className="apc-row-sub" style={{ width: 110, flexShrink: 0 }}>{r.name}</span>
                <div style={{ flex: 1, height: 5, background: '#21262d', borderRadius: 3 }}>
                  <div style={{ width: `${r.pct}%`, height: 5, borderRadius: 3, background: r.color }} />
                </div>
                <span className="apc-row-val" style={{ width: 28, textAlign: 'right', fontSize: 11 }}>{r.pct}%</span>
              </div>
            ))}
            <div className="apc-sub-title" style={{ marginTop: 10 }}>결과 요약</div>
            {RESULTS.map(r => (
              <div key={r.name} className="apc-result-row">
                <span className="apc-row-sub" style={{ width: 60 }}>{r.name}</span>
                <span className="apc-row-sub">{r.before}</span>
                <span style={{ color: '#6e7681' }}>→</span>
                <span className="apc-row-val" style={{ color: r.good ? '#1d9e75' : '#854F0B' }}>{r.after}</span>
                <span style={{ fontSize: 11, color: r.good ? '#1d9e75' : '#854F0B' }}>{r.delta}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'mv-const':
        return (
          <CardWrapper key={id} id={id} icon="ti-lock-open" title="MV 제약 조건" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <div className="apc-constraint-hdr"><span>항목</span><span>Lo ~ Hi</span><span>현재</span></div>
            {MV_CONSTRAINTS.map(r => (
              <div key={r.name} className="apc-constraint-row">
                <span className="apc-row-sub">{r.name}</span>
                <span className="apc-row-sub">{r.lo} ~ {r.hi}</span>
                <span className={`apc-row-val ${r.ok ? 'apc-cv-ok' : 'apc-cv-warn'}`}>{r.cur}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'cv-const':
        return (
          <CardWrapper key={id} id={id} icon="ti-target" title="CV 운전 범위" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            <div className="apc-constraint-hdr"><span>항목</span><span>Lo ~ Hi</span><span>현재</span></div>
            {CV_CONSTRAINTS.map(r => (
              <div key={r.name} className="apc-constraint-row">
                <span className="apc-row-sub">{r.name}</span>
                <span className="apc-row-sub">{r.lo}~{r.hi}</span>
                <span className={`apc-row-val ${r.ok ? 'apc-cv-ok' : 'apc-cv-warn'}`}>{r.cur}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'objectives':
        return (
          <CardWrapper key={id} id={id} icon="ti-currency-won" title="목적함수 가중치" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {OBJECTIVES.map(r => (
              <div key={r.name} className="apc-constraint-row">
                <span className="apc-row-sub">{r.name}</span>
                <span className="apc-row-sub">{r.v}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: W_COLOR[r.w] }}>{r.w}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'recommends':
        return (
          <CardWrapper key={id} id={id} icon="ti-bulb" title="권고사항" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {RECOMMENDATIONS.map((r, i) => (
              <div key={i} className="apc-recommend-row" style={{ borderBottom: i < 2 ? '1px solid #21262d' : 'none' }}>
                <i className="ti ti-arrow-right" style={{ color: '#534AB7', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <span className="apc-row-sub">{r}</span>
              </div>
            ))}
          </CardWrapper>
        );
      case 'kpi-result':
        return (
          <CardWrapper key={id} id={id} icon="ti-chart-bar" title="예상 절감 KPI" state={s} onUpdate={upd1} fillColumn={fillColumn} {...d}>
            {[
              { label: '예상 절감 (일)', val: '124 만원', delta: '▲ vs 수동운전', good: true },
              { label: 'LNG 절감률',    val: '18.0 %',  delta: '▼ vs baseline', good: true },
              { label: 'OG 활용률',     val: '91 %',    delta: '▲ +12pp',       good: true },
              { label: 'Dump 저감',     val: '87 %',    delta: '▼ 최소화',      good: true },
            ].map(k => (
              <div key={k.label} className="apc-data-row">
                <span className="apc-row-sub">{k.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="apc-row-val">{k.val}</div>
                  <div className={`apc-kpi-delta ${k.good ? 'apc-delta-good' : 'apc-delta-warn'}`}>{k.delta}</div>
                </div>
              </div>
            ))}
          </CardWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="apc-page">
      <div className="apc-status-bar">
        <span className="apc-badge apc-badge--run">
          <i className="ti ti-circle-check" aria-hidden="true" />Running
        </span>
        <span className="apc-badge apc-badge--ok">Converged</span>
        {hasWarn && <span className="apc-badge apc-badge--warn">Attention</span>}
        <span className="apc-status-meta">Scan 60 s</span>
        <span className="apc-status-sep" />
        <span className="apc-status-meta">Horizon 30 step</span>
        <span className="apc-status-sep" />
        <span className="apc-status-meta">Solver: LP</span>
        <span className="apc-status-sep" />
        <span className="apc-status-meta">Cycle #{cycle}</span>
        <div style={{ flex: 1 }} />
        <div className="apc-layout-persist">
          <span className="apc-layout-persist-label" title="카드 배치가 브라우저에 자동 저장됩니다">
            배치 자동 저장
          </span>
          <button
            type="button"
            className="apc-layout-reset-btn"
            onClick={handleLayoutReset}
            title="저장된 배치를 지우고 기본 레이아웃으로 되돌립니다"
          >
            Reset
          </button>
        </div>
        <span className="apc-status-meta">{clock}</span>
      </div>
      <div
        className={['apc-main-wrap', draggingId ? 'apc-main-wrap--dragging' : ''].filter(Boolean).join(' ')}
        onDragOver={handleWrapDragOver}
        onDrop={handleWrapDrop}
      >
        {draggingId && (
          <div
            className={[
              'apc-row-above-slot',
              dropTarget?.kind === 'row-above' ? 'apc-row-above-slot--active' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            <span className="apc-row-above-slot__label">+ New Row</span>
          </div>
        )}
        {dropTarget?.kind === 'row-above' && (
          <div
            className="apc-drop-indicator apc-drop-indicator--row"
            style={
              dropTarget.indicatorWidth != null
                ? { width: dropTarget.indicatorWidth, marginLeft: dropTarget.indicatorMarginLeft ?? 0 }
                : undefined
            }
          />
        )}
        {layout.map((row, ri) => (
          <div key={`row-${ri}`} className="apc-row" data-apc-row-index={ri}>
            <div className="apc-row-cols">
              {row.map((col, ci) => (
                <Fragment key={`col-${ri}-${ci}`}>
                  {dropTarget?.kind === 'col-before' &&
                    dropTarget.rowIndex === ri &&
                    dropTarget.colIndex === ci && (
                      <div className="apc-drop-indicator apc-drop-indicator--col" />
                    )}
                  <div
                    className={`apc-column${col.length > 1 ? ' apc-column--stack' : ''}`}
                    data-apc-col-index={ci}
                    style={getColWidthStyle(col, cards)}
                  >
                    {col.map(id => {
                      const dt = dropTarget;
                      const isAbove = dt?.kind === 'stack-above' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const isBelow = dt?.kind === 'stack-below' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const dropCls = isAbove ? 'apc-card--drop-above' : isBelow ? 'apc-card--drop-below' : '';
                      const card = renderCard(id, true);
                      const node = dropCls && React.isValidElement(card)
                        ? React.cloneElement(card as React.ReactElement<{ className?: string }>, {
                            className: [(card.props as { className?: string }).className, dropCls].filter(Boolean).join(' ') || undefined,
                          })
                        : card;
                      return <Fragment key={id}>{node}</Fragment>;
                    })}
                  </div>
                  {dropTarget?.kind === 'col-after' &&
                    dropTarget.rowIndex === ri &&
                    dropTarget.colIndex === ci && (
                      <div className="apc-drop-indicator apc-drop-indicator--col" />
                    )}
                </Fragment>
              ))}
            </div>
            {draggingId && (
              <div
                className={[
                  'apc-row-below-slot',
                  dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri
                    ? 'apc-row-below-slot--active'
                    : '',
                ].filter(Boolean).join(' ')}
                aria-hidden="true"
              >
                <span className="apc-row-below-slot__label">+ New Row</span>
              </div>
            )}
            {dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri && (
              <div
                className="apc-drop-indicator apc-drop-indicator--row"
                style={
                  dropTarget.indicatorWidth != null
                    ? {
                        width: dropTarget.indicatorWidth,
                        marginLeft: dropTarget.indicatorMarginLeft ?? 0,
                      }
                    : undefined
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApcDashboard;
