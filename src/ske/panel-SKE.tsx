import React, { useState, useEffect, useCallback, useRef, Fragment, useImperativeHandle, forwardRef } from 'react';
import '../draft/draft.css';
import { HEX_WIDTH_PRESETS } from '../draft/types-hex';
import { DraftDragHandle } from '../draft/ui';
import {
  applySkeLayoutDrop,
  resolveSkeDropFromPointer,
  type SkeDropTarget,
  type SkeLayout,
} from './data-skeLayout';
import {
  loadSkeLayout,
  loadSkeCards,
  resetSkeLayout,
  resetSkeCards,
  saveSkeLayout,
  saveSkeCards,
  type SkeCardSizes,
  type SkeLayoutSnapshot,
} from './data-skeLayoutStorage';
import { SKE_META, SKE_KPI, CQI_COLOR, ENERGY_COLOR, GROUP_COLORS, cqiFromValue, spanToDateRange, type DateRange } from './data-ske';
import { SKEKpiChart, FIELDS, Sparkline, type KpiField } from './chart-SKEKpi';
import { SKEFactorsChart } from './chart-SKEFactors';
import { SKEDetailChart } from './chart-SKEDetail';
import type { CqiLevel, EnergyType } from './data-ske';

// ── 높이 프리셋 ──────────────────────────────────────────────────────────────
const SKE_HEIGHT_PRESETS = [
  { label: '자동',  value: 'auto'  },
  { label: '80',    value: '80px'  },
  { label: '100',   value: '100px' },
  { label: '120',   value: '120px' },
  { label: '140',   value: '140px' },
  { label: '160',   value: '160px' },
  { label: '180',   value: '180px' },
  { label: '200',   value: '200px' },
  { label: '240',   value: '240px' },
  { label: '280',   value: '280px' },
  { label: '320',   value: '320px' },
  { label: '360',   value: '360px' },
  { label: '400',   value: '400px' },
  { label: '460',   value: '460px' },
  { label: '520',   value: '520px' },
  { label: '560',   value: '560px' },
  { label: '600',   value: '600px' },
] as const;

const SKE_GAP = 10;

function gapAdjustedWidth(pct: string): string {
  const x = parseFloat(pct);
  if (!isFinite(x) || x === 0) return pct;
  const gapPerCard = (1 - x / 100) * SKE_GAP;
  return gapPerCard > 0 ? `calc(${pct} - ${gapPerCard}px)` : pct;
}

function getColWidthStyle(
  col: string[],
  sizes: SkeCardSizes,
): React.CSSProperties {
  let maxPct = 0;
  for (const id of col) {
    const v = sizes[id]?.width ?? '33%';
    if (v === '100%') {
      const w = gapAdjustedWidth('100%');
      return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
    }
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > maxPct) maxPct = n;
  }
  const w = gapAdjustedWidth(`${maxPct || 33}%`);
  return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
}

const DEFAULT_CARD_SIZES: SkeCardSizes = {
  'kpi-summary':    { width: '20%', height: '300px' },
  'kpi-energy':     { width: '20%', height: '250px' },
  'kpi-header':     { width: '20%', height: '250px' },
  'chart-kpi':      { width: '50%', height: '500px' },
  'chart-dataset':  { width: '50%', height: '300px' },
  'chart-factors':  { width: '30%', height: '320px' },
  'chart-detail':   { width: '30%', height: '480px' },
};

// ── EditableSelect ────────────────────────────────────────────────────────────
const CUSTOM_OPT = '__custom__';

interface EditableSelectProps {
  presets: readonly { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  title?: string;
}

const EditableSelect: React.FC<EditableSelectProps> = ({ presets, value, onChange, suffix, title }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    setEditing(false);
    const t = raw.trim();
    if (!t) return;
    onChange(/^\d+(\.\d+)?$/.test(t) ? t + suffix : t);
  };

  const startEdit = () => {
    setDraft(value !== 'auto' ? value.replace(suffix, '') : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const isCustom = !presets.some(p => p.value === value);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        className="draft-toolbar-select"
        title={title}
        value={isCustom ? CUSTOM_OPT : value}
        style={editing ? { visibility: 'hidden' } : undefined}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => e.target.value === CUSTOM_OPT ? startEdit() : onChange(e.target.value)}
        onDoubleClick={startEdit}
      >
        {presets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        {isCustom
          ? <option value={CUSTOM_OPT}>✏ {value}</option>
          : <option value={CUSTOM_OPT}>직접입력...</option>}
      </select>
      {editing && (
        <input
          ref={inputRef}
          className="draft-toolbar-select"
          style={{ position: 'absolute', inset: 0, width: '100%', boxSizing: 'border-box' }}
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

// ── CardWrapper ───────────────────────────────────────────────────────────────
interface CardWrapperProps {
  id: string;
  title: string;
  sizes: SkeCardSizes;
  onUpdate: (patch: Partial<{ width: string; height: string }>) => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onReset?: () => void;
  className?: string;
  dragging?: boolean;
  fillColumn?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const CardWrapper: React.FC<CardWrapperProps> = ({
  id, title, sizes, onUpdate, children, actions, onReset, className,
  dragging, fillColumn, onDragStart, onDragEnd,
}) => {
  const s = sizes[id] ?? { width: '33%', height: 'auto' };
  const fixedH = s.height !== 'auto';
  const cardWidth = fillColumn ? '100%' : gapAdjustedWidth(s.width);

  return (
    <div
      className={[
        'ske-card',
        'apc-card',
        'draft-ekpi-card',
        fixedH   ? 'apc-card--fixed-h'  : '',
        dragging ? 'apc-card--dragging' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      data-ske-card-id={id}
      style={{
        width: cardWidth,
        maxWidth: '100%',
        ...(fixedH ? { height: s.height, '--apc-flex-basis': s.height } as React.CSSProperties : {}),
      }}
      onDragEnd={onDragEnd}
    >
      <div className="draft-ekpi-card-title">
        <DraftDragHandle
          draggable
          title="드래그하여 카드 이동"
          ariaLabel="드래그하여 카드 이동"
          onDragStart={e => {
            e.stopPropagation();
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
            const card = (e.currentTarget as HTMLElement).closest('.ske-card') as HTMLElement;
            if (card) {
              const rect = card.getBoundingClientRect();
              e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
            }
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
        />
        <span className="apc-card-title-text" style={{ fontSize: 14 }}>{title}</span>
        {actions}
        <EditableSelect
          presets={HEX_WIDTH_PRESETS}
          value={s.width}
          onChange={v => onUpdate({ width: v })}
          suffix="%"
          title="너비"
        />
        <EditableSelect
          presets={SKE_HEIGHT_PRESETS}
          value={s.height}
          onChange={v => onUpdate({ height: v })}
          suffix="px"
          title="높이"
        />
        {onReset && (
          <button
            className="draft-chip-btn"
            title="초기화"
            onClick={onReset}
            style={{ fontSize: 13, padding: '1px 6px', lineHeight: 1 }}
          >↺</button>
        )}
      </div>
      {fixedH ? <div className="apc-card-body">{children}</div> : children}
    </div>
  );
};

// ── 카드 컨텐츠: kpi-header ───────────────────────────────────────────────────
interface KpiHeaderCardProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  kpiData: KpiRow[];
}

const KpiHeaderCard: React.FC<KpiHeaderCardProps> = ({ selectedDate, onDateChange, kpiData }) => {
  const meta = SKE_META;

  const todayIdx = kpiData.findIndex(r => r.date === selectedDate);
  const todayRow = todayIdx >= 0 ? kpiData[todayIdx] : kpiData[kpiData.length - 1];
  const prevRow  = todayIdx > 0 ? kpiData[todayIdx - 1] : kpiData[kpiData.length - 2];

  const cqiLevel: CqiLevel = cqiFromValue(todayRow.cqi_avg);

  // 선택일 기준 앞 30일 CQI 시계열
  const endIdx = todayIdx >= 0 ? todayIdx + 1 : kpiData.length;
  const recentKpi = kpiData.slice(Math.max(0, endIdx - 30), endIdx);
  const cqiSeries = recentKpi.map(r => r.cqi_avg);
  const cqiMin = Math.min(...cqiSeries);
  const cqiMax = Math.max(...cqiSeries);

  // 전일 대비 등락
  const deltaMj   = prevRow ? todayRow.total_mj - prevRow.total_mj : 0;
  const deltaCost = prevRow ? todayRow.total_cost_mwon - prevRow.total_cost_mwon : 0;
  const deltaCdu  = prevRow ? todayRow.cdu_bbl - prevRow.cdu_bbl : 0;

  const sign = (v: number) => v >= 0 ? '+' : '';

  const cqiDesc: Record<CqiLevel, string> = {
    High:   '설명력 신뢰 (< 0.5)',
    Medium: '설명력 보통 (0.5–1.0)',
    Low:    '설명력 주의 (≥ 1.0)',
  };

  const SPARK_W = 80, SPARK_H = 28;

  return (
    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 7, height: '100%', overflow: 'hidden' }}>

      {/* 기준일 선택 드롭다운 + 증감 버튼 */}
      {(() => {
        const dates = kpiData.map(r => r.date);
        const curIdx = dates.indexOf(selectedDate);
        const canPrev = curIdx > 0;
        const canNext = curIdx < dates.length - 1;
        const btnStyle = (enabled: boolean): React.CSSProperties => ({
          padding: '2px 7px', borderRadius: 4, fontSize: 13, lineHeight: 1,
          background: '#071220', border: '1px solid #1e3a5f',
          color: enabled ? '#7dd3fc' : '#1e3a5f',
          cursor: enabled ? 'pointer' : 'default',
        });
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap' }}>기준일</span>
            <select
              value={selectedDate}
              onChange={e => onDateChange(e.target.value)}
              className="draft-toolbar-select"
              style={{ width: 100, fontSize: 11, fontWeight: 700, color: '#7dd3fc' }}
            >
              {kpiData.map(r => <option key={r.date} value={r.date}>{r.date}</option>)}
            </select>
            <button style={btnStyle(canPrev)} disabled={!canPrev}
              onClick={() => canPrev && onDateChange(dates[curIdx - 1])}>‹</button>
            <button style={btnStyle(canNext)} disabled={!canNext}
              onClick={() => canNext && onDateChange(dates[curIdx + 1])}>›</button>
            <button style={{ ...btnStyle(curIdx < dates.length - 1), fontSize: 10, padding: '2px 6px' }}
              disabled={curIdx === dates.length - 1}
              onClick={() => onDateChange(dates[dates.length - 1])}>Today</button>
            <span style={{ fontSize: 10, color: '#334155', whiteSpace: 'nowrap', marginLeft: 2 }}>{meta.model.version}</span>
          </div>
        );
      })()}

      {/* 전일 대비 요약 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: '총에너지', value: `${sign(deltaMj)}${deltaMj.toFixed(1)}`,   unit: 'MMJ', fieldColor: '#e2e8f0' },
          { label: '총비용',   value: `${sign(deltaCost)}${deltaCost.toFixed(0)}`, unit: 'M원', fieldColor: '#fb923c' },
          { label: '처리량',   value: `${sign(deltaCdu)}${deltaCdu.toFixed(0)}`,   unit: 'BBL', fieldColor: '#fbbf24' },
        ].map(({ label, value, unit, fieldColor }) => (
          <div key={label} style={{
            flex: 1, padding: '4px 6px', background: '#071220',
            borderRadius: 5, border: `1px solid ${fieldColor}22`,
          }}>
            <div style={{ fontSize: 9, color: fieldColor, opacity: 0.6, marginBottom: 1 }}>{label} 전일比</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: fieldColor, lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* CQI 스파크라인 */}
      <div style={{ background: '#071220', borderRadius: 6, border: '1px solid #1e3a5f', padding: '5px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{
            padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: CQI_COLOR[cqiLevel] + '22', color: CQI_COLOR[cqiLevel],
            border: `1px solid ${CQI_COLOR[cqiLevel]}44`,
          }}>
            CQI {cqiLevel}
          </div>
          <span style={{ fontSize: 10, color: '#334155' }}>{todayRow.cqi_avg.toFixed(3)}</span>
          <span style={{ fontSize: 9, color: '#475569', marginLeft: 2 }}>{cqiDesc[cqiLevel]}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: '#334155' }}>최근 30일</span>
        </div>
        <svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
          {(() => {
            const y05 = SPARK_H - ((0.5 - cqiMin) / Math.max(cqiMax - cqiMin, 0.01)) * SPARK_H;
            return <line x1={0} y1={y05} x2={SPARK_W} y2={y05} stroke="#334155" strokeWidth={0.8} strokeDasharray="2 2" />;
          })()}
          <polyline
            points={cqiSeries.map((v, i) => {
              const x = (i / Math.max(cqiSeries.length - 1, 1)) * SPARK_W;
              const y = SPARK_H - ((v - cqiMin) / Math.max(cqiMax - cqiMin, 0.01)) * SPARK_H;
              return `${x},${y}`;
            }).join(' ')}
            fill="none" stroke={CQI_COLOR[cqiLevel]} strokeWidth={1.2} opacity={0.85}
          />
          {(() => {
            const last = cqiSeries[cqiSeries.length - 1];
            const ly = SPARK_H - ((last - cqiMin) / Math.max(cqiMax - cqiMin, 0.01)) * SPARK_H;
            return <circle cx={SPARK_W} cy={ly} r={2} fill={CQI_COLOR[cqiLevel]} />;
          })()}
        </svg>
      </div>

      {/* 모델 수식 + 그룹 범례 */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, color: '#334155' }}>
          <span style={{ color: '#38bdf8' }}>▶ </span>
          <strong style={{ color: '#64748b' }}>Δy = f(운전변수)</strong>
          &nbsp;XGBoost+SHAP · {meta.model.type}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {meta.groups.map(g => (
            <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#64748b' }}>
              <svg width={6} height={6}><circle cx={3} cy={3} r={3} fill={GROUP_COLORS[g] ?? '#64748b'} /></svg>
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── KPI 데이터 로컬스토리지 오버라이드 ─────────────────────────────────────────
const KPI_DATA_KEY = 'ske-kpi-data-override-v1';

function loadKpiOverride(): KpiRow[] | null {
  try {
    const raw = localStorage.getItem(KPI_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as KpiRow[];
  } catch { return null; }
}

function saveKpiOverride(rows: KpiRow[]): void {
  try { localStorage.setItem(KPI_DATA_KEY, JSON.stringify(rows)); } catch { /* quota */ }
}

function resetKpiOverride(): void {
  try { localStorage.removeItem(KPI_DATA_KEY); } catch { /* ignore */ }
}

function parseExcelToKpiRows(data: (string | number)[][]): KpiRow[] {
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).map(row => {
    const obj: Record<string, string | number> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    const n = (k: string) => parseFloat(String(obj[k] ?? '')) || 0;
    const cqiRaw = String(obj['CQI 등급'] ?? obj['cqi_level'] ?? '');
    const cqiLevel: CqiLevel = cqiRaw === 'High' ? 'High' : cqiRaw === 'Low' ? 'Low' : 'Medium';
    return {
      date: String(obj['날짜'] ?? obj['date'] ?? ''),
      fg_bbl: n('FG (BBL)') || n('fg_bbl'),
      stm_esston: n('STM (ESSTON)') || n('stm_esston'),
      elec_kwh: n('ELEC (KWH)') || n('elec_kwh'),
      // CDU (kBBL) 컬럼은 다운로드 시 /1000 변환된 값 — 다시 *1000 해야 원본 BBL
      cdu_bbl: obj['CDU (kBBL)'] !== undefined ? n('CDU (kBBL)') * 1000 : n('cdu_bbl'),
      atm_temp: n('기온 (℃)') || n('atm_temp'),
      rain_mm: n('강수량 (mm)') || n('rain_mm'),
      fg_mj: n('FG (MMJ)') || n('fg_mj'),
      stm_mj: n('STM (MMJ)') || n('stm_mj'),
      elec_mj: n('ELEC (MMJ)') || n('elec_mj'),
      total_mj: n('총에너지 (MMJ)') || n('total_mj'),
      sec_mj_per_bbl: n('SEC (MJ/BBL)') || n('sec_mj_per_bbl'),
      fg_cost_mwon: n('fg_cost_mwon'),
      stm_cost_mwon: n('stm_cost_mwon'),
      elec_cost_mwon: n('elec_cost_mwon'),
      total_cost_mwon: n('총비용 (M원)') || n('total_cost_mwon'),
      unit_cost_won_per_bbl: n('원단위비용 (원/BBL)') || n('unit_cost_won_per_bbl'),
      cqi_avg: n('CQI') || n('cqi_avg'),
      cqi_level: cqiLevel,
    } as KpiRow;
  }).filter(r => r.date && r.date !== '');
}

// ── 카드 컨텐츠: chart-dataset ────────────────────────────────────────────────
async function downloadSkeWorkbook(
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

const KPI_COLS: { key: keyof typeof SKE_KPI[0]; label: string; fmt: (v: number) => string }[] = [
  { key: 'date',                  label: '날짜',           fmt: v => String(v) },
  { key: 'cdu_bbl',               label: 'CDU (kBBL)',     fmt: v => (v / 1000).toFixed(1) },
  { key: 'total_mj',              label: '총에너지 (MMJ)', fmt: v => v.toFixed(1) },
  { key: 'fg_bbl',                label: 'FG (BBL)',       fmt: v => v.toFixed(0) },
  { key: 'fg_mj',                 label: 'FG (MMJ)',       fmt: v => v.toFixed(1) },
  { key: 'stm_esston',            label: 'STM (ESSTON)',   fmt: v => v.toFixed(0) },
  { key: 'stm_mj',                label: 'STM (MMJ)',      fmt: v => v.toFixed(1) },
  { key: 'elec_kwh',              label: 'ELEC (KWH)',     fmt: v => v.toFixed(0) },
  { key: 'elec_mj',               label: 'ELEC (MMJ)',     fmt: v => v.toFixed(1) },
  { key: 'sec_mj_per_bbl',        label: 'SEC (MJ/BBL)',   fmt: v => v.toFixed(1) },
  { key: 'total_cost_mwon',       label: '총비용 (M원)',   fmt: v => v.toFixed(0) },
  { key: 'unit_cost_won_per_bbl', label: '원단위비용 (원/BBL)', fmt: v => v.toFixed(0) },
  { key: 'rain_mm',               label: '강수량 (mm)',    fmt: v => v.toFixed(1) },
  { key: 'atm_temp',              label: '기온 (℃)',       fmt: v => v.toFixed(1) },
  { key: 'cqi_avg',               label: 'CQI',            fmt: v => v.toFixed(3) },
  { key: 'cqi_level',             label: 'CQI 등급',       fmt: v => String(v) },
];

interface SkeDatasetCardProps {
  kpiData: KpiRow[];
  onKpiOverride: (rows: KpiRow[]) => void;
  onKpiReset: () => void;
  onRowSelect?: (date: string | null) => void;
  selectedDate?: string | null;
}

const SkeDatasetCard: React.FC<SkeDatasetCardProps> = ({ kpiData, onKpiOverride, onKpiReset, onRowSelect, selectedDate }) => {
  const [sortCol, setSortCol] = React.useState<string>('date');
  const [sortAsc, setSortAsc] = React.useState(false);
  const [filter, setFilter]   = React.useState('');
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const rows = React.useMemo(() => {
    let data = [...kpiData];
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      data = data.filter(r => r.date.includes(q) || r.cqi_level.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      const av = a[sortCol as keyof typeof a] as string | number;
      const bv = b[sortCol as keyof typeof b] as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return data;
  }, [sortCol, sortAsc, filter]);

  const handleSort = (key: string) => {
    if (sortCol === key) setSortAsc(p => !p);
    else { setSortCol(key); setSortAsc(true); }
  };

  const handleDownload = () => {
    const header = KPI_COLS.map(c => c.label);
    const data = [header, ...kpiData.map(r =>
      KPI_COLS.map(c => c.key === 'date' || c.key === 'cqi_level'
        ? r[c.key] as string
        : r[c.key] as number,
      ),
    )];
    void downloadSkeWorkbook(`ske_kpi_${SKE_META.target_date}.xlsx`, [{ name: 'KPI 데이터', data }]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const buf = await file.arrayBuffer();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      // ExcelJS row.values는 1-indexed sparse array — index 0은 undefined
      const allRows: (string | number)[][] = [];
      ws.eachRow({ includeEmpty: false }, row => {
        const vals: (string | number)[] = [];
        // row.values[0]은 항상 undefined, 1부터 시작
        for (let c = 1; c <= (row.values as unknown[]).length; c++) {
          const cell = row.getCell(c);
          vals.push(cell.text ?? cell.value as string | number ?? '');
        }
        allRows.push(vals);
      });
      const parsed = parseExcelToKpiRows(allRows);
      if (parsed.length === 0) { alert('유효한 KPI 데이터를 찾을 수 없습니다.\n첫 행이 헤더(날짜, CDU(kBBL) 등)인지 확인해주세요.'); return; }
      saveKpiOverride(parsed);
      onKpiOverride(parsed);
    } catch (err) { alert(`엑셀 파일 파싱 실패: ${String(err)}`); }
  };

  return (
    <div className="draft-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="draft-ekpi-card-title">
        <div className="draft-card-actions" style={{ marginLeft: 0 }}>
          <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{SKE_META.data_range}</span>
          <span style={{ fontSize: 11, color: '#475569' }}>{rows.length}행</span>
          <input
            type="text"
            placeholder="날짜/CQI 필터"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
              color: '#94a3b8', fontSize: 11, padding: '2px 8px', width: 120,
            }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <input ref={uploadRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
            <button className="draft-chip-btn" onClick={() => uploadRef.current?.click()} title="엑셀 업로드">엑셀 ↑</button>
            <button className="draft-chip-btn" onClick={() => { resetKpiOverride(); onKpiReset(); }} title="원본 데이터로 초기화">초기화</button>
            <button className="draft-chip-btn" onClick={handleDownload} title="엑셀 다운로드">엑셀 ↓</button>
          </div>
        </div>
      </div>
      <div className="draft-hex-grid-card__body" style={{ flex: 1, minHeight: 0 }}>
        <table className="draft-hex-grid-table">
          <thead>
            <tr>
              {KPI_COLS.map(c => (
                <th key={c.key} onClick={() => handleSort(c.key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  {c.label}
                  {sortCol === c.key && <span style={{ marginLeft: 3, fontSize: 11 }}>{sortAsc ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isSelected = selectedDate === r.date;
              return (
                <tr key={r.date}
                  onClick={() => onRowSelect?.(isSelected ? null : r.date)}
                  style={{ cursor: 'pointer', background: isSelected ? '#1e3a5f44' : undefined }}>
                  {KPI_COLS.map(c => {
                    const raw = r[c.key];
                    const val = c.key === 'date' || c.key === 'cqi_level'
                      ? String(raw) : c.fmt(raw as number);
                    const isDate = c.key === 'date';
                    const isCqiLevel = c.key === 'cqi_level';
                    const cqiColor = isCqiLevel
                      ? (raw === 'High' ? '#34d399' : raw === 'Medium' ? '#fbbf24' : '#f87171') : undefined;
                    return (
                      <td key={c.key} style={{
                        color: isDate ? (isSelected ? '#7dd3fc' : '#7dd3fc') : isCqiLevel ? cqiColor : undefined,
                        fontWeight: isDate || isCqiLevel || isSelected ? 600 : undefined,
                        textAlign: c.key === 'date' || c.key === 'cqi_level' ? 'left' : 'right',
                        outline: isSelected && isDate ? '1px solid #3b82f6' : undefined,
                      }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── 카드 컨텐츠: kpi-summary ──────────────────────────────────────────────────
interface KpiSummaryCardProps {
  activeField: KpiField;
  onFieldChange: (f: KpiField) => void;
  selectedDate: string;
  kpiData: KpiRow[];
}

const SPARK_DAYS = 30;

const KpiSummaryCard: React.FC<KpiSummaryCardProps> = ({ activeField, onFieldChange, selectedDate, kpiData }) => {
  const todayIdx = kpiData.findIndex(r => r.date === selectedDate);
  const todayRow = todayIdx >= 0 ? kpiData[todayIdx] : kpiData[kpiData.length - 1];
  const endIdx = todayIdx >= 0 ? todayIdx + 1 : kpiData.length;
  const recentData = kpiData.slice(Math.max(0, endIdx - SPARK_DAYS), endIdx);

  const items: { field: KpiField; value: string; sub?: string }[] = [
    { field: 'total_mj',              value: todayRow.total_mj.toFixed(1) },
    { field: 'cdu_bbl',               value: (todayRow.cdu_bbl / 1000).toFixed(1),
      sub: `${todayRow.cdu_bbl.toFixed(0)} BBL` },
    { field: 'total_cost_mwon',       value: todayRow.total_cost_mwon.toFixed(0),
      sub: `${(todayRow.total_cost_mwon / 1000).toFixed(2)} B원` },
    { field: 'sec_mj_per_bbl',        value: todayRow.sec_mj_per_bbl.toFixed(1) },
    { field: 'unit_cost_won_per_bbl', value: todayRow.unit_cost_won_per_bbl.toFixed(0) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '6px 10px', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      {items.map(({ field, value, sub }, idx) => {
        const meta = FIELDS.find(f => f.key === field)!;
        const isActive = activeField === field;
        const sparkVals = recentData.map(r => r[field] as number);
        return (
          <div key={field}
            onClick={() => onFieldChange(field)}
            style={{
              background: isActive ? meta.color + '18' : '#071220',
              border: `1px solid ${isActive ? meta.color + '88' : '#1e293b'}`,
              borderRadius: 7, padding: '6px 8px', cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              gridColumn: idx === 0 ? '1 / -1' : undefined,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gridTemplateRows: 'auto auto auto',
              columnGap: 4,
              rowGap: 1,
              alignItems: 'center',
              overflow: 'hidden',
            }}>
            {/* 라벨 */}
            <div style={{ fontSize: 11, color: '#64748b', gridColumn: 1, gridRow: 1, lineHeight: 1 }}>{meta.label}</div>
            {/* Sparkline — 라벨/값 옆에 세로 span */}
            <div style={{ gridColumn: 2, gridRow: '1 / 4', display: 'flex', alignItems: 'center' }}>
              <Sparkline values={sparkVals} color={meta.color} width={52} height={28} />
            </div>
            {/* 값 + 단위 한 줄 */}
            <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: meta.color, lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{meta.unit}</span>
            </div>
            {/* 원본 단위 서브텍스트 */}
            {sub && (
              <div style={{ gridColumn: 1, gridRow: 3, fontSize: 10, color: '#334155', lineHeight: 1 }}>{sub}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── 카드 컨텐츠: kpi-energy ───────────────────────────────────────────────────
interface KpiEnergyCardProps {
  activeEnergy: EnergyType | null;
  onEnergyChange: (e: EnergyType | null) => void;
  selectedDate: string;
  kpiData: KpiRow[];
}

const ENERGY_SPARK_DAYS = 30;

const KpiEnergyCard: React.FC<KpiEnergyCardProps> = ({ activeEnergy, onEnergyChange, selectedDate, kpiData }) => {
  const todayIdx = kpiData.findIndex(r => r.date === selectedDate);
  const todayRow = todayIdx >= 0 ? kpiData[todayIdx] : kpiData[kpiData.length - 1];
  const endIdx = todayIdx >= 0 ? todayIdx + 1 : kpiData.length;
  const energySparkData: Record<EnergyType, number[]> = {
    FG:    kpiData.slice(Math.max(0, endIdx - ENERGY_SPARK_DAYS), endIdx).map(r => r.fg_mj),
    Steam: kpiData.slice(Math.max(0, endIdx - ENERGY_SPARK_DAYS), endIdx).map(r => r.stm_mj),
    ELEC:  kpiData.slice(Math.max(0, endIdx - ENERGY_SPARK_DAYS), endIdx).map(r => r.elec_mj),
  };
  const total = todayRow.total_mj;
  const items: { key: EnergyType; label: string; mj: number; cost: number; raw: number; rawUnit: string }[] = todayRow ? [
    { key: 'FG',    label: 'Fuel Gas', mj: todayRow.fg_mj,   cost: todayRow.fg_cost_mwon,   raw: todayRow.fg_bbl,      rawUnit: 'BBL'    },
    { key: 'Steam', label: 'Steam',    mj: todayRow.stm_mj,  cost: todayRow.stm_cost_mwon,  raw: todayRow.stm_esston,  rawUnit: 'ESSTON' },
    { key: 'ELEC',  label: 'ELEC',     mj: todayRow.elec_mj, cost: todayRow.elec_cost_mwon, raw: todayRow.elec_kwh,    rawUnit: 'KWH'    },
  ] : [];
  return (
    <div style={{ padding: '6px 10px', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>에너지 구성 — 클릭으로 차트 연동</div>
      {items.map(({ key, label, mj, cost, raw, rawUnit }) => {
        const pct = total > 0 ? (mj / total) * 100 : 0;
        const color = ENERGY_COLOR[key];
        const isActive = activeEnergy === key;
        const dimmed = activeEnergy !== null && !isActive;
        return (
          <div key={key}
            onClick={() => onEnergyChange(isActive ? null : key)}
            style={{
              marginBottom: 7, cursor: 'pointer',
              padding: '4px 6px', borderRadius: 6,
              background: isActive ? color + '18' : 'transparent',
              border: `1px solid ${isActive ? color + '66' : 'transparent'}`,
              transition: 'background 0.15s, border-color 0.15s',
              opacity: dimmed ? 0.4 : 1,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              columnGap: 6,
              alignItems: 'center',
            }}>
            {/* 왼쪽: 라벨 + 바 + 수치 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 11, color, fontWeight: isActive ? 700 : 600 }}>{label}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {raw.toFixed(0)} <span style={{ color: '#475569' }}>{rawUnit}</span>
                </span>
              </div>
              <div style={{ height: 5, background: '#1e293b', borderRadius: 3 }}>
                <div style={{ height: 5, width: `${pct}%`, background: color, borderRadius: 3,
                  boxShadow: isActive ? `0 0 6px ${color}88` : undefined }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
                <span style={{ fontSize: 10, color: '#475569' }}>{pct.toFixed(1)}% · {mj.toFixed(1)} M MJ</span>
                <span style={{ fontSize: 10, color: '#475569' }}>{(cost / 1000).toFixed(2)} B원</span>
              </div>
            </div>
            {/* 오른쪽: 스파크라인 */}
            <Sparkline values={energySparkData[key]} color={color} width={52} height={26} />
          </div>
        );
      })}
    </div>
  );
};

// ── 메인 SKE 대시보드 ─────────────────────────────────────────────────────────
export interface SKEDashboardHandle {
  getSnapshot: () => SkeLayoutSnapshot;
  applySnapshot: (s: SkeLayoutSnapshot) => void;
  reset: () => void;
}

interface SKEDashboardProps {
  onReset?: () => void;
  rowHeights?: number[];
  onRowCountChange?: (count: number) => void;
}

export const SKEDashboard = forwardRef<SKEDashboardHandle, SKEDashboardProps>(function SKEDashboard({ onReset, rowHeights, onRowCountChange }, ref) {
  const [sizes, setSizes] = useState<SkeCardSizes>(() => ({
    ...DEFAULT_CARD_SIZES,
    ...loadSkeCards(),
  }));
  const [layout, setLayout]         = useState<SkeLayout>(loadSkeLayout);
  const [activeKpiField, setActiveKpiField] = useState<KpiField>('total_mj');
  const [activeEnergy, setActiveEnergy]     = useState<EnergyType | null>(null);
  const [factorGroup, setFactorGroup]       = useState<string | null>(null);
  const [kpiViewMode, setKpiViewMode]       = useState<'single' | 'energy'>('single');
  const [dateRange, setDateRange]           = useState<DateRange>('30d');
  const [kpiData, setKpiData]               = useState<KpiRow[]>(() => loadKpiOverride() ?? SKE_KPI);
  const [selectedDate, setSelectedDate]     = useState<string>(() => {
    const data = loadKpiOverride() ?? SKE_KPI;
    return data[data.length - 1]?.date ?? SKE_KPI[SKE_KPI.length - 1].date;
  });
  const [datasetSelectedDate, setDatasetSelectedDate] = useState<string | null>(null);
  const [wfFromDate, setWfFromDate]         = useState<string>(() => {
    const n = SKE_KPI.length;
    return SKE_KPI[Math.max(0, n - 30)]?.date ?? SKE_KPI[0]?.date ?? '';
  });
  const [wfToDate, setWfToDate]             = useState<string>(SKE_KPI[SKE_KPI.length - 1].date);

  // From/To 날짜가 바뀔 때 span → dateRange 자동 갱신
  const updateWfFrom = useCallback((date: string) => {
    setWfFromDate(date);
    setWfToDate(prev => {
      const fromIdx = SKE_KPI.findIndex(r => r.date === date);
      const toIdx   = SKE_KPI.findIndex(r => r.date === prev);
      const span = Math.abs((toIdx >= 0 ? toIdx : SKE_KPI.length - 1) - (fromIdx >= 0 ? fromIdx : 0)) + 1;
      setDateRange(spanToDateRange(span));
      return prev;
    });
  }, []);
  const updateWfTo = useCallback((date: string) => {
    setWfToDate(date);
    setWfFromDate(prev => {
      const toIdx   = SKE_KPI.findIndex(r => r.date === date);
      const fromIdx = SKE_KPI.findIndex(r => r.date === prev);
      const span = Math.abs((toIdx >= 0 ? toIdx : SKE_KPI.length - 1) - (fromIdx >= 0 ? fromIdx : 0)) + 1;
      setDateRange(spanToDateRange(span));
      return prev;
    });
  }, []);

  // 카드별 리셋 key — 값이 바뀌면 해당 카드가 재마운트됨
  const [cardKeys, setCardKeys] = useState<Record<string, number>>({});

  const [draggingId, setDragging]   = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<SkeDropTarget | null>(null);

  const dropTargetRef  = useRef<SkeDropTarget | null>(null);
  const draggingIdRef  = useRef<string | null>(null);
  const layoutRef      = useRef<SkeLayout>(layout);
  const undoStackRef   = useRef<SkeLayout[]>([]);
  const didDropRef     = useRef(false);

  dropTargetRef.current = dropTarget;
  layoutRef.current     = layout;

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
    const next = resolveSkeDropFromPointer(
      e.clientX, e.clientY,
      e.currentTarget as HTMLElement,
      draggingIdRef.current,
    );
    if (!next) { setDropTarget(null); return; }
    setDropTarget(prev => {
      if (
        prev?.kind     === next.kind &&
        prev?.targetId === next.targetId &&
        prev?.rowIndex === next.rowIndex &&
        prev?.colIndex === next.colIndex
      ) return prev;
      return next;
    });
  }, []);

  const applyDrop = useCallback(() => {
    const from = draggingIdRef.current;
    const dt   = dropTargetRef.current;
    if (!from || !dt) return;
    const current = layoutRef.current;
    const next = applySkeLayoutDrop(current, from, dt);
    undoStackRef.current = [...undoStackRef.current.slice(-19), current];
    setLayout(next);
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  const handleWrapDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    didDropRef.current = true;
    applyDrop();
  }, [applyDrop]);

  const updSize = (id: string, patch: Partial<{ width: string; height: string }>) =>
    setSizes(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  useEffect(() => { onRowCountChange?.(layout.length); }, [layout.length, onRowCountChange]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        const prev = stack[stack.length - 1];
        undoStackRef.current = stack.slice(0, -1);
        setLayout(prev);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { saveSkeLayout(layout); }, [layout]);
  useEffect(() => { saveSkeCards(sizes);   }, [sizes]);

  const handleReset = useCallback(() => {
    resetSkeLayout();
    resetSkeCards();
    setSizes({ ...DEFAULT_CARD_SIZES });
    setLayout(loadSkeLayout());
    undoStackRef.current = [];
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
    onReset?.();
  }, [onReset]);

  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  useImperativeHandle(ref, () => ({
    getSnapshot: () => ({ layout: layoutRef.current, cards: sizesRef.current }),
    applySnapshot: (s: SkeLayoutSnapshot) => {
      saveSkeLayout(s.layout);
      saveSkeCards(s.cards);
      setSizes({ ...DEFAULT_CARD_SIZES, ...s.cards });
      setLayout(s.layout);
      undoStackRef.current = [];
    },
    reset: handleReset,
  }), [handleReset]);

  const dndProps = (id: string) => ({
    dragging:    draggingId === id,
    onDragStart: () => handleDragStart(id),
    onDragEnd:   handleDragEnd,
  });

  const bumpCardKey = useCallback((id: string) => {
    setCardKeys(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const renderCard = (id: string, fillColumn = false): React.ReactNode => {
    const cardKey = `${id}-${cardKeys[id] ?? 0}`;
    const commonProps = {
      id,
      sizes,
      onUpdate: (patch: Partial<{ width: string; height: string }>) => updSize(id, patch),
      fillColumn,
      ...dndProps(id),
    };

    switch (id) {
      case 'kpi-header':
        return (
          <CardWrapper key={id} title="기준일 · 모델 · CQI"
            onReset={() => { setSelectedDate(kpiData[kpiData.length - 1]?.date ?? SKE_KPI[SKE_KPI.length - 1].date); }}
            {...commonProps}>
            <KpiHeaderCard selectedDate={selectedDate} onDateChange={setSelectedDate} kpiData={kpiData} />
          </CardWrapper>
        );
      case 'kpi-summary':
        return (
          <CardWrapper key={id} title="KPI"
            onReset={() => { setActiveKpiField('total_mj'); setActiveEnergy(null); setKpiViewMode('single'); }}
            {...commonProps}>
            <KpiSummaryCard
              activeField={activeKpiField}
              onFieldChange={f => { setActiveKpiField(f); setActiveEnergy(null); setKpiViewMode('single'); }}
              selectedDate={selectedDate}
              kpiData={kpiData}
            />
          </CardWrapper>
        );
      case 'kpi-energy':
        return (
          <CardWrapper key={id} title="에너지원"
            onReset={() => { setActiveEnergy(null); setKpiViewMode('single'); }}
            {...commonProps}>
            <KpiEnergyCard
              activeEnergy={activeEnergy}
              onEnergyChange={e => {
                setActiveEnergy(e);
                setKpiViewMode(e !== null ? 'energy' : 'single');
              }}
              selectedDate={selectedDate}
              kpiData={kpiData}
            />
          </CardWrapper>
        );
      case 'chart-dataset':
        return (
          <CardWrapper key={id} title="데이터셋"
            onReset={() => bumpCardKey(id)}
            {...commonProps}>
            <SkeDatasetCard
              key={cardKey}
              kpiData={kpiData}
              onKpiOverride={rows => { setKpiData(rows); }}
              onKpiReset={() => { setKpiData(SKE_KPI); }}
              onRowSelect={date => setDatasetSelectedDate(prev => prev === date ? null : date)}
              selectedDate={datasetSelectedDate}
            />
          </CardWrapper>
        );
      case 'chart-kpi':
        return (
          <CardWrapper key={id} title="KPI 시계열"
            onReset={() => {
              setActiveKpiField('total_mj');
              setActiveEnergy(null);
              setKpiViewMode('single');
              setDateRange('30d');
              setSelectedDate(SKE_KPI[SKE_KPI.length - 1].date);
              bumpCardKey(id);
            }}
            {...commonProps}>
            <SKEKpiChart
              key={cardKey}
              activeField={activeKpiField}
              onFieldChange={f => { setActiveKpiField(f); setActiveEnergy(null); setKpiViewMode('single'); }}
              activeEnergy={activeEnergy}
              onEnergyChange={e => { setActiveEnergy(e); setKpiViewMode(e !== null ? 'energy' : 'single'); }}
              viewMode={kpiViewMode}
              onViewModeChange={m => { setKpiViewMode(m); if (m === 'single') setActiveEnergy(null); }}
              onDateRangeChange={setDateRange}
              dateRange={dateRange}
              anchorDate={selectedDate}
              onAnchorDateChange={setSelectedDate}
              onToDateChange={updateWfTo}
              onFromDateChange={updateWfFrom}
              highlightDate={datasetSelectedDate ?? undefined}
            />
          </CardWrapper>
        );
      case 'chart-factors':
        return (
          <CardWrapper key={id} title="변동요인 Waterfall"
            onReset={() => { setFactorGroup(null); bumpCardKey(id); }}
            {...commonProps}>
            <SKEFactorsChart
              key={cardKey}
              selectedGroup={factorGroup}
              onGroupSelect={g => setFactorGroup(g)}
              activeEnergy={activeEnergy}
              dateRange={dateRange}
              anchorDate={wfToDate}
              fromDate={wfFromDate}
            />
          </CardWrapper>
        );
      case 'chart-detail':
        return (
          <CardWrapper key={id} title="피처 SHAP 드릴다운"
            onReset={() => bumpCardKey(id)}
            {...commonProps}>
            <SKEDetailChart
              key={cardKey}
              selectedGroup={factorGroup}
              activeEnergy={activeEnergy ?? undefined}
              dateRange={dateRange}
            />
          </CardWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="apc-page" style={{ paddingBottom: 0, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 드래그/드롭 영역 */}
      <div
        className={['apc-main-wrap', draggingId ? 'apc-main-wrap--dragging' : ''].filter(Boolean).join(' ')}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
        onDragOver={handleWrapDragOver}
        onDrop={handleWrapDrop}
      >
        {/* 맨 위 new-row 슬롯 */}
        {draggingId && (
          <div
            className={[
              'ske-row-above-slot',
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
            style={dropTarget.indicatorWidth != null
              ? { width: dropTarget.indicatorWidth, marginLeft: dropTarget.indicatorMarginLeft ?? 0 }
              : undefined}
          />
        )}

        {layout.map((row, ri) => {
          const rowH = rowHeights?.[ri];
          return (
          <div key={`row-${ri}`} className="ske-row apc-row" data-ske-row-index={ri}>
            <div className="apc-row-cols"
              style={rowH ? { height: rowH, minHeight: rowH, maxHeight: rowH, overflow: 'hidden' } : undefined}>
              {row.map((col, ci) => (
                <Fragment key={`col-${ri}-${ci}`}>
                  {dropTarget?.kind === 'col-before' && dropTarget.rowIndex === ri && dropTarget.colIndex === ci && (
                    <div className="apc-drop-indicator apc-drop-indicator--col" />
                  )}
                  <div
                    className={`ske-column apc-column${col.length > 1 ? ' ske-column--stack apc-column--stack' : ''}`}
                    data-ske-col-index={ci}
                    style={getColWidthStyle(col, sizes)}
                  >
                    {col.map(id => {
                      const dt = dropTarget;
                      const isAbove = dt?.kind === 'stack-above' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const isBelow = dt?.kind === 'stack-below' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const dropCls = isAbove ? 'apc-card--drop-above' : isBelow ? 'apc-card--drop-below' : '';
                      const card = renderCard(id, true);
                      const node = dropCls && React.isValidElement(card)
                        ? React.cloneElement(card as React.ReactElement<{ className?: string }>, {
                            className: [(card.props as { className?: string }).className, dropCls]
                              .filter(Boolean).join(' ') || undefined,
                          })
                        : card;
                      return <Fragment key={id}>{node}</Fragment>;
                    })}
                    {/* 스택 하단 드롭 슬롯 */}
                    {draggingId && col.length > 0 && (
                      <div className="ske-col-stack-slot" style={{ height: 12, minHeight: 12 }} aria-hidden="true" />
                    )}
                  </div>
                  {dropTarget?.kind === 'col-after' && dropTarget.rowIndex === ri && dropTarget.colIndex === ci && (
                    <div className="apc-drop-indicator apc-drop-indicator--col" />
                  )}
                </Fragment>
              ))}
            </div>

            {/* row 아래 new-row 슬롯 */}
            {draggingId && (
              <div
                className={[
                  'ske-row-below-slot',
                  'apc-row-below-slot',
                  dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri
                    ? 'apc-row-below-slot--active'
                    : '',
                ].filter(Boolean).join(' ')}
                data-ske-row-index={ri}
                aria-hidden="true"
              >
                <span className="apc-row-below-slot__label">+ New Row</span>
              </div>
            )}
            {dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri && (
              <div
                className="apc-drop-indicator apc-drop-indicator--row"
                style={dropTarget.indicatorWidth != null
                  ? { width: dropTarget.indicatorWidth, marginLeft: dropTarget.indicatorMarginLeft ?? 0 }
                  : undefined}
              />
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
});

export default SKEDashboard;
