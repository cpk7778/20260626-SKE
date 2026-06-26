/** Draft 차트 그리드 · EquipmentChartsSection */
import React, { useContext, useState } from 'react';
import { ChartFontContext, DraftEqHoverContext } from './shared';
import { ChartProviders } from './shared';
import { BUILT_IN_DATA, SHAP_DATE_IDX_DEFAULT } from './data-draft';
import { XYScatterChart as DraftXYScatterChart } from './chart-XYScatter';
import { XYLineChart as DraftXYLineChart } from './chart-XYLine';
import { GaugeChart } from './chart-Gauge';
import { BulletChart } from './chart-Bullet';
import { SHAPChart } from './chart-SHAP';
import { SHAPByEquipChart } from './chart-SHAPByEquip';
import { PredActualLineChart } from './chart-PredActualLine';
import { PredActualScatterChart } from './chart-PredActualScatter';
import { SteamPredictionChart } from './chart-SteamPrediction';

// ── DraftChartGrid ────────────────────────────────────────────────────────────
export function DraftChartGrid({
  cols,
  gap,
  children,
  onDragOver,
  onDrop,
  onDragLeave,
}: {
  cols: number;
  gap: number;
  children: React.ReactNode;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
}) {
  const chartFont = useContext(ChartFontContext);
  const { setHoveredEq } = useContext(DraftEqHoverContext);
  return (
    <div
      className="draft-chart-grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, fontFamily: chartFont, gap }}
      onMouseLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHoveredEq(null);
        }
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      {children}
    </div>
  );
}

// ── EquipmentChartsSection ────────────────────────────────────────────────────
export function EquipmentChartsSection({ chartHeight, cols = 2 }: { chartHeight?: number; cols?: number }) {
  const [shapDateIdx, setShapDateIdx] = useState(SHAP_DATE_IDX_DEFAULT);
  const [periodDays, setPeriodDays] = useState(14);

  return (
    <ChartProviders
      fontIdx={0}
      profileIdx={0}
      shapDateIdx={shapDateIdx}
      setShapDateIdx={setShapDateIdx}
      periodDays={periodDays}
      setPeriodDays={setPeriodDays}
    >
      <DraftChartGrid cols={cols} gap={12}>
        <DraftXYScatterChart chartHeight={chartHeight} />
        <DraftXYLineChart data={BUILT_IN_DATA} chartHeight={chartHeight} />
        <GaugeChart data={BUILT_IN_DATA} chartHeight={chartHeight} />
        <BulletChart data={BUILT_IN_DATA} chartHeight={chartHeight} />
        <SHAPChart chartHeight={chartHeight} />
        <SHAPByEquipChart chartHeight={chartHeight} />
        <PredActualLineChart chartHeight={chartHeight} />
        <PredActualScatterChart chartHeight={chartHeight} />
        <SteamPredictionChart chartHeight={chartHeight} />
      </DraftChartGrid>
    </ChartProviders>
  );
}
