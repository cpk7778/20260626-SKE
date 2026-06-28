import { useState } from 'react';
import '../draft/draft.css';
import { SKE_META, SKE_KPI, CQI_COLOR, ENERGY_COLOR, GROUP_COLORS, cqiFromValue } from './data-ske';
import { SKEKpiChart } from './chart-SKEKpi';
import { SKEFactorsChart } from './chart-SKEFactors';
import { SKEDetailChart } from './chart-SKEDetail';
import type { CqiLevel, EnergyType } from './data-ske';

type TabId = 'kpi' | 'factors' | 'detail';

// ── KPI 요약 카드 ─────────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, color, sub,
}: { label: string; value: string; unit: string; color: string; sub?: string }) {
  return (
    <div style={{
      background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
      padding: '12px 16px', flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: '#334155', marginTop: 2 }}>{unit}</div>
      {sub && <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── 에너지별 분해 카드 ────────────────────────────────────────────────────────

function EnergyBreakdownCard({ today }: { today: typeof SKE_KPI[0] | undefined }) {
  if (!today) return null;
  const items: { key: EnergyType; label: string; mj: number; cost: number; raw: string }[] = [
    { key: 'FG', label: 'Fuel Gas', mj: today.fg_mj, cost: today.fg_cost_mwon, raw: `${(today.fg_bbl / 1000).toFixed(0)}k BBL` },
    { key: 'Steam', label: 'Steam', mj: today.stm_mj, cost: today.stm_cost_mwon, raw: `${today.stm_esston.toFixed(0)} ESSTON` },
    { key: 'ELEC', label: 'ELEC', mj: today.elec_mj, cost: today.elec_cost_mwon, raw: `${(today.elec_kwh / 1000).toFixed(0)}k KWH` },
  ];
  const totalMj = today.total_mj;

  return (
    <div style={{
      background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10,
      padding: '12px 16px', flex: '0 0 auto', minWidth: 220,
    }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>에너지 구성 (M MJ)</div>
      {items.map(item => {
        const pct = totalMj > 0 ? (item.mj / totalMj) * 100 : 0;
        const color = ENERGY_COLOR[item.key];
        return (
          <div key={item.key} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color, fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {item.mj.toFixed(1)} · {(item.cost / 1000).toFixed(2)}B원 · {item.raw}
              </span>
            </div>
            <div style={{ height: 4, background: '#1e293b', borderRadius: 2 }}>
              <div style={{ height: 4, width: `${pct}%`, background: color, borderRadius: 2, opacity: 0.85 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export function SKEEnergyPage() {
  const [activeTab, setActiveTab] = useState<TabId>('kpi');
  const meta = SKE_META;
  const cqiLevel: CqiLevel = cqiFromValue(meta.cqi.today);

  // 기준일에 가장 가까운 KPI 행
  const todayRow = SKE_KPI.find(r => r.date === meta.target_date) ?? SKE_KPI[SKE_KPI.length - 1];

  const tabs: { id: TabId; label: string; desc: string }[] = [
    { id: 'kpi', label: 'KPI 시계열', desc: '일별 에너지·비용·원단위 추이' },
    { id: 'factors', label: '변동요인 분석', desc: '운전 그룹별 에너지 증감 기여 (Waterfall)' },
    { id: 'detail', label: '피처 드릴다운', desc: 'SHAP 기반 피처별 상세 기여도' },
  ];

  return (
    <div className="draft-page-content draft-dashboard-page draft-page--scroll">
      <div className="draft-artifacts-container draft-artifacts-container--pad">

        {/* ── 헤더 ── */}
        <div className="draft-artifacts-top-bar" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
          <div>
            <h2 className="draft-artifacts-title" style={{ fontSize: 20, marginBottom: 4 }}>
              CLX 에너지 변동 분석 서비스
            </h2>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
              기준일&nbsp;<strong style={{ color: '#7dd3fc' }}>{meta.target_date}</strong>
              &nbsp;·&nbsp;데이터&nbsp;<span style={{ color: '#64748b' }}>{meta.data_range}</span>
              &nbsp;·&nbsp;모델&nbsp;<span style={{ color: '#64748b' }}>{meta.model.version}</span>
            </div>
            {/* XAI 설명 배너 */}
            <div style={{
              marginTop: 6, padding: '5px 10px', background: '#0f172a', borderRadius: 6,
              border: '1px solid #1e3a5f', fontSize: 11, color: '#64748b',
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span style={{ color: '#38bdf8' }}>▶</span>
              <span>
                <strong style={{ color: '#94a3b8' }}>Δy = f(운전변수)</strong>
                &nbsp;— 어제 실적 기준, 오늘의 에너지 증감 원인을 XGBoost+SHAP으로 100% 설명
              </span>
              <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                보정식:&nbsp;
                <code style={{ color: '#a78bfa', fontSize: 10 }}>
                  corrected_SHAP = SHAP + residual × (|SHAP| / Σ|SHAP|)
                </code>
              </span>
            </div>
          </div>
          {/* CQI 배지 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <div style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: CQI_COLOR[cqiLevel] + '20',
              color: CQI_COLOR[cqiLevel],
              border: `1px solid ${CQI_COLOR[cqiLevel]}44`,
            }}>
              해석신뢰도 CQI {cqiLevel}
            </div>
            <div style={{ fontSize: 10, color: '#334155' }}>
              |residual| / Σ|SHAP| = {meta.cqi.today.toFixed(3)}
            </div>
          </div>
        </div>

        {/* ── KPI 요약 카드 행 ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <KpiCard
            label="총 에너지"
            value={meta.kpi_today.total_mj.toFixed(1)}
            unit="M MJ"
            color="#38bdf8"
            sub={`CDU ${todayRow ? (todayRow.cdu_bbl / 1000).toFixed(0) : '-'}k BBL`}
          />
          <KpiCard
            label="에너지 원단위"
            value={meta.kpi_today.sec.toFixed(1)}
            unit="MJ/BBL"
            color="#a78bfa"
          />
          <KpiCard
            label="총 비용"
            value={(meta.kpi_today.total_cost_mwon / 1000).toFixed(2)}
            unit="B원"
            color="#fb923c"
            sub={`${meta.kpi_today.total_cost_mwon.toFixed(0)} M원`}
          />
          <KpiCard
            label="비용 원단위"
            value={meta.kpi_today.unit_cost_won_per_bbl.toFixed(0)}
            unit="원/BBL"
            color="#34d399"
          />
          {/* 에너지 구성 분해 */}
          <EnergyBreakdownCard today={todayRow} />
        </div>

        {/* ── 운전요인 그룹 범례 ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#334155' }}>운전요인:</span>
          {meta.groups.map(g => (
            <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
              <svg width={9} height={9}>
                <circle cx={4.5} cy={4.5} r={4.5} fill={GROUP_COLORS[g] ?? '#64748b'} />
              </svg>
              {g}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#334155' }}>
            FG&nbsp;
            <span style={{ color: ENERGY_COLOR.FG }}>■</span>
            &nbsp;Steam&nbsp;
            <span style={{ color: ENERGY_COLOR.Steam }}>■</span>
            &nbsp;ELEC&nbsp;
            <span style={{ color: ENERGY_COLOR.ELEC }}>■</span>
          </span>
        </div>

        {/* ── 탭 ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid #1e293b' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={`draft-tab${activeTab === t.id ? ' draft-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#334155', alignSelf: 'center', paddingRight: 4 }}>
            {tabs.find(t => t.id === activeTab)?.desc}
          </span>
        </div>

        {/* ── 차트 패널 ── */}
        <div style={{ height: 'calc(100vh - 340px)', minHeight: 380 }}>
          {activeTab === 'kpi' && <SKEKpiChart />}
          {activeTab === 'factors' && <SKEFactorsChart />}
          {activeTab === 'detail' && <SKEDetailChart />}
        </div>

      </div>
    </div>
  );
}
