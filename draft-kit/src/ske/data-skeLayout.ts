/** SKE 대시보드 2D 레이아웃 — ApcLayout과 동일한 구조 */

export type SkeColumn = string[];
export type SkeRow    = SkeColumn[];
export type SkeLayout = SkeRow[];

// ── 카드 ID 목록 ────────────────────────────────────────────────────────────
// kpi-header  : 헤더 (기준일·모델·CQI·에너지 구성)
// kpi-summary : KPI 요약 4개 수치 카드
// kpi-energy  : 에너지 구성 분해 바
// chart-kpi   : KPI 시계열 차트
// chart-factors : 변동요인 Waterfall
// chart-detail  : 피처 SHAP 드릴다운

export const SKE_CARD_IDS = [
  'kpi-header',
  'kpi-summary',
  'kpi-energy',
  'chart-kpi',
  'chart-factors',
  'chart-detail',
] as const;

export type SkeCardId = typeof SKE_CARD_IDS[number];

// ── 기본 레이아웃 ─────────────────────────────────────────────────────────────
// Row 0: 헤더 | 요약 | 에너지 구성
// Row 1: KPI 시계열 | 변동요인 | 드릴다운
export const INITIAL_SKE_LAYOUT: SkeLayout = [
  [['kpi-header'], ['kpi-summary'], ['kpi-energy']],
  [['chart-kpi'], ['chart-factors'], ['chart-detail']],
];

// ── ApcLayout 유틸 복제 ───────────────────────────────────────────────────────

export function cloneSkeLayout(l: SkeLayout): SkeLayout {
  return l.map(row => row.map(col => [...col]));
}

export function compactSkeLayout(l: SkeLayout): SkeLayout {
  return l
    .map(r => r.map(col => [...col]).filter(col => col.length > 0))
    .filter(r => r.length > 0);
}

export function findSkeCard(l: SkeLayout, id: string) {
  for (let ri = 0; ri < l.length; ri++)
    for (let ci = 0; ci < l[ri].length; ci++) {
      const si = l[ri][ci].indexOf(id);
      if (si !== -1) return { row: ri, col: ci, stack: si };
    }
  return null;
}

function removeSkeCard(l: SkeLayout, id: string): SkeLayout {
  return compactSkeLayout(l.map(r => r.map(col => col.filter(c => c !== id))));
}

export type SkeDropKind = 'col-before' | 'col-after' | 'stack-below' | 'stack-above' | 'row-below' | 'row-above';

export type SkeDropTarget = {
  kind: SkeDropKind;
  targetId: string;
  rowIndex: number;
  colIndex?: number;
  indicatorWidth?: number;
  indicatorMarginLeft?: number;
};

export function applySkeLayoutDrop(layout: SkeLayout, cardId: string, dt: SkeDropTarget): SkeLayout {
  const remove = () => cloneSkeLayout(removeSkeCard(layout, cardId));

  const insertStackBelow = () => {
    const next = remove();
    const loc = findSkeCard(next, dt.targetId);
    if (!loc) return layout;
    next[loc.row][loc.col].splice(loc.stack + 1, 0, cardId);
    return compactSkeLayout(next);
  };
  const insertStackAbove = () => {
    const next = remove();
    const loc = findSkeCard(next, dt.targetId);
    if (!loc) return layout;
    next[loc.row][loc.col].splice(loc.stack, 0, cardId);
    return compactSkeLayout(next);
  };
  const insertColBefore = () => {
    const next = remove();
    const loc = findSkeCard(next, dt.targetId);
    if (!loc) return layout;
    next[loc.row].splice(loc.col, 0, [cardId]);
    return compactSkeLayout(next);
  };
  const insertColAfter = () => {
    const next = remove();
    const loc = findSkeCard(next, dt.targetId);
    if (!loc) return layout;
    next[loc.row].splice(loc.col + 1, 0, [cardId]);
    return compactSkeLayout(next);
  };
  const insertRowBelow = () => {
    const next = remove();
    const loc = findSkeCard(next, dt.targetId);
    if (!loc) return layout;
    next.splice(loc.row + 1, 0, [[cardId]]);
    return compactSkeLayout(next);
  };
  const insertRowAbove = () => {
    const next = remove();
    next.splice(0, 0, [[cardId]]);
    return compactSkeLayout(next);
  };

  let result: SkeLayout;
  switch (dt.kind) {
    case 'stack-below': result = insertStackBelow(); break;
    case 'stack-above': result = insertStackAbove(); break;
    case 'col-before':  result = insertColBefore();  break;
    case 'col-after':   result = insertColAfter();   break;
    case 'row-below':   result = insertRowBelow();   break;
    case 'row-above':   result = insertRowAbove();   break;
    default: return layout;
  }
  return findSkeCard(result, cardId) ? result : layout;
}

// ── 포인터 → 드롭 타겟 (ApcLayout resolveApcDropFromPointer 패턴) ────────────
const GAP_HIT   = 24;
const EDGE_ZONE = 0.22;
const STACK_GAP = 10;

export function resolveSkeDropFromPointer(
  clientX: number,
  clientY: number,
  wrap: HTMLElement,
  draggingId: string,
): SkeDropTarget | null {
  const wrapRect = wrap.getBoundingClientRect();

  const indUnder = (rect: DOMRect) => ({
    indicatorWidth: rect.width,
    indicatorMarginLeft: rect.left - wrapRect.left,
  });

  // row-above
  for (const slot of wrap.querySelectorAll<HTMLElement>('.ske-row-above-slot')) {
    const r = slot.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
    const firstRow = wrap.querySelector<HTMLElement>('.ske-row');
    const firstId = firstRow
      ? [...firstRow.querySelectorAll<HTMLElement>('.ske-card')]
          .find(c => c.dataset.skeCardId && c.dataset.skeCardId !== draggingId)?.dataset.skeCardId
      : undefined;
    const rowRect = firstRow?.getBoundingClientRect();
    if (!firstId || !rowRect) continue;
    return { kind: 'row-above', targetId: firstId, rowIndex: 0, ...indUnder(rowRect) };
  }

  // row-below
  for (const slot of wrap.querySelectorAll<HTMLElement>('.ske-row-below-slot')) {
    const r = slot.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
    const rowEl = slot.closest<HTMLElement>('.ske-row');
    if (!rowEl) continue;
    const rowIndex = Number(rowEl.dataset.skeRowIndex ?? 0);
    const rowRect = rowEl.getBoundingClientRect();
    const allCards = rowEl.querySelectorAll<HTMLElement>('.ske-card');
    let lastId = '';
    allCards.forEach(c => { if (c.dataset.skeCardId && c.dataset.skeCardId !== draggingId) lastId = c.dataset.skeCardId!; });
    if (!lastId) continue;
    return { kind: 'row-below', targetId: lastId, rowIndex, ...indUnder(rowRect) };
  }

  // col-stack-slot
  for (const slot of wrap.querySelectorAll<HTMLElement>('.ske-col-stack-slot')) {
    const r = slot.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
    const colEl = slot.closest<HTMLElement>('.ske-column');
    const rowEl = slot.closest<HTMLElement>('.ske-row');
    if (!colEl || !rowEl) continue;
    const rowIndex = Number(rowEl.dataset.skeRowIndex ?? 0);
    const colIndex = Number(colEl.dataset.skeColIndex ?? 0);
    const cards = [...colEl.querySelectorAll<HTMLElement>('.ske-card')]
      .filter(el => el.dataset.skeCardId && el.dataset.skeCardId !== draggingId);
    const anchor = cards[cards.length - 1];
    if (anchor?.dataset.skeCardId)
      return { kind: 'stack-below', targetId: anchor.dataset.skeCardId!, rowIndex, colIndex, ...indUnder(anchor.getBoundingClientRect()) };
  }

  // card hit
  const cardEls = [...wrap.querySelectorAll<HTMLElement>('.ske-card')]
    .filter(el => el.dataset.skeCardId && el.dataset.skeCardId !== draggingId);

  for (const el of cardEls) {
    const id = el.dataset.skeCardId!;
    const rowEl = el.closest<HTMLElement>('.ske-row');
    const colEl = el.closest<HTMLElement>('.ske-column');
    const rowIndex = Number(rowEl?.dataset.skeRowIndex ?? 0);
    const colIndex = Number(colEl?.dataset.skeColIndex ?? 0);
    const isStack = colEl?.classList.contains('ske-column--stack') ?? false;
    const rect = el.getBoundingClientRect();
    const bottomBoundary = isStack ? rect.bottom + STACK_GAP : rect.bottom;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > bottomBoundary) continue;
    if (isStack && clientY > rect.bottom)
      return { kind: 'stack-below', targetId: id, rowIndex, colIndex, ...indUnder(rect) };
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    if (relY < EDGE_ZONE) return isStack ? { kind: 'stack-above', targetId: id, rowIndex, colIndex } : { kind: 'col-before', targetId: id, rowIndex, colIndex };
    if (relY > 1 - EDGE_ZONE) return { kind: 'stack-below', targetId: id, rowIndex, colIndex, ...indUnder(rect) };
    if (relX < EDGE_ZONE) return { kind: 'col-before', targetId: id, rowIndex, colIndex };
    return { kind: 'col-after', targetId: id, rowIndex, colIndex };
  }

  // gap between columns
  for (const rowEl of wrap.querySelectorAll<HTMLElement>('.ske-row')) {
    const rowIndex = Number(rowEl.dataset.skeRowIndex ?? 0);
    const columns  = [...rowEl.querySelectorAll<HTMLElement>('.ske-column')];
    if (columns.length === 0) continue;
    for (let i = 0; i < columns.length - 1; i++) {
      const lr = columns[i].getBoundingClientRect();
      const rr = columns[i + 1].getBoundingClientRect();
      if (clientX < lr.right - GAP_HIT || clientX > rr.left + GAP_HIT) continue;
      if (clientY < Math.min(lr.top, rr.top) || clientY > Math.max(lr.bottom, rr.bottom)) continue;
      const cards = [...columns[i].querySelectorAll<HTMLElement>('.ske-card')]
        .filter(el => el.dataset.skeCardId && el.dataset.skeCardId !== draggingId);
      const anchor = cards[cards.length - 1];
      if (anchor?.dataset.skeCardId) return { kind: 'col-after', targetId: anchor.dataset.skeCardId!, rowIndex, colIndex: i };
    }
  }

  return null;
}
