import React from 'react';
import { eqColor } from './math';

export interface EqLegendProps {
  eqs: string[];
  hiddenEqs: Set<string>;
  eqColors: Record<string, string>;
  onSelect: (eq: string, multi: boolean) => void;
}

// 단독 선택 상태(isOnly)일 때 별도 스타일 적용해 "이 항목만 표시 중" 피드백 제공
export const EqLegend = React.memo(function EqLegend({ eqs, hiddenEqs, eqColors, onSelect }: EqLegendProps) {
  return (
    <div className="draft-legend">
      {eqs.map(eq => {
        const isOnly = hiddenEqs.size === eqs.length - 1 && !hiddenEqs.has(eq);
        const hidden = hiddenEqs.has(eq);
        return (
          <button type="button" key={eq}
            className={`draft-legend-item${hidden ? ' draft-legend-item--hidden' : ''}${isOnly ? ' draft-legend-item--only' : ''}`}
            onClick={e => onSelect(eq, e.ctrlKey || e.metaKey)}>
            <svg width="8" height="8" aria-hidden>
              <circle cx="4" cy="4" r="4" fill={hidden ? '#334155' : eqColor(eqColors, eq)} />
            </svg>
            {eq}
          </button>
        );
      })}
    </div>
  );
});
