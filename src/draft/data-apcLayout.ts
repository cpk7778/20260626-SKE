/** APC 대시보드 2D 레이아웃 — Row × Column × Stack(세로 쌓기) */

export type ApcColumn = string[];
export type ApcRow = ApcColumn[];
export type ApcLayout = ApcRow[];

export type ApcDropKind = 'col-before' | 'col-after' | 'stack-below' | 'stack-above' | 'row-below' | 'row-above';

export type ApcDropTarget = {
  kind: ApcDropKind;
  targetId: string;
  rowIndex: number;
  colIndex?: number;
  indicatorWidth?: number;
  indicatorMarginLeft?: number;
};

export function cloneLayout(layout: ApcLayout): ApcLayout {
  return layout.map(row => row.map(col => [...col]));
}

export function findCard(
  layout: ApcLayout,
  id: string,
): { row: number; col: number; stack: number } | null {
  for (let row = 0; row < layout.length; row++) {
    for (let col = 0; col < layout[row].length; col++) {
      const stack = layout[row][col].indexOf(id);
      if (stack !== -1) return { row, col, stack };
    }
  }
  return null;
}

export function compactLayout(layout: ApcLayout): ApcLayout {
  return layout
    .map(r => r.map(col => [...col]).filter(col => col.length > 0))
    .filter(r => r.length > 0);
}

export function removeCard(layout: ApcLayout, id: string): ApcLayout {
  return compactLayout(
    layout.map(r =>
      r.map(col => col.filter(cid => cid !== id)),
    ),
  );
}

export function insertStackBelow(layout: ApcLayout, targetId: string, cardId: string): ApcLayout {
  const next = cloneLayout(removeCard(layout, cardId));
  const loc = findCard(next, targetId);
  if (!loc) return layout;
  next[loc.row][loc.col].splice(loc.stack + 1, 0, cardId);
  return compactLayout(next);
}

export function insertStackAbove(layout: ApcLayout, targetId: string, cardId: string): ApcLayout {
  const next = cloneLayout(removeCard(layout, cardId));
  const loc = findCard(next, targetId);
  if (!loc) return layout;
  next[loc.row][loc.col].splice(loc.stack, 0, cardId);
  return compactLayout(next);
}

export function insertColBeside(
  layout: ApcLayout,
  targetId: string,
  cardId: string,
  before: boolean,
): ApcLayout {
  const next = cloneLayout(removeCard(layout, cardId));
  const loc = findCard(next, targetId);
  if (!loc) return layout;
  const at = before ? loc.col : loc.col + 1;
  next[loc.row].splice(at, 0, [cardId]);
  return compactLayout(next);
}

export function insertRowBelowTarget(layout: ApcLayout, targetId: string, cardId: string): ApcLayout {
  const next = cloneLayout(removeCard(layout, cardId));
  const loc = findCard(next, targetId);
  if (!loc) return layout;
  next.splice(loc.row + 1, 0, [[cardId]]);
  return compactLayout(next);
}

export function insertRowAboveFirst(layout: ApcLayout, cardId: string): ApcLayout {
  const next = cloneLayout(removeCard(layout, cardId));
  next.splice(0, 0, [[cardId]]);
  return compactLayout(next);
}

export function applyLayoutDrop(layout: ApcLayout, cardId: string, dt: ApcDropTarget): ApcLayout {
  let result: ApcLayout;
  switch (dt.kind) {
    case 'stack-below':
      result = insertStackBelow(layout, dt.targetId, cardId);
      break;
    case 'stack-above':
      result = insertStackAbove(layout, dt.targetId, cardId);
      break;
    case 'col-before':
      result = insertColBeside(layout, dt.targetId, cardId, true);
      break;
    case 'col-after':
      result = insertColBeside(layout, dt.targetId, cardId, false);
      break;
    case 'row-below':
      result = insertRowBelowTarget(layout, dt.targetId, cardId);
      break;
    case 'row-above':
      result = insertRowAboveFirst(layout, cardId);
      break;
    default:
      return layout;
  }
  return findCard(result, cardId) ? result : layout;
}

/** 열 사이·행 끝 드롭 (카드 사이보다 넓게) */
const GAP_HIT_PAD = 24;
/** 맨 오른쪽 col-after 최소 hit 너비(px) — KPI 행 끝 등 */
const ROW_TRAIL_MIN_PX = 120;
/** 카드 가장자리 드롭 구역 (비율) — min()-거리 비교는 부동소수점으로 깜빡임 유발 */
const CARD_EDGE_ZONE = 0.22;
/** 스택 컬럼 카드 사이 CSS gap — APC_GAP와 일치 */
const STACK_CARD_GAP = 10;

export function resolveApcDropFromPointer(
  clientX: number,
  clientY: number,
  wrap: HTMLElement,
  draggingId: string,
): ApcDropTarget | null {
  const wrapRect = wrap.getBoundingClientRect();

  const indicatorUnder = (rect: DOMRect) => ({
    indicatorWidth: rect.width,
    indicatorMarginLeft: rect.left - wrapRect.left,
  });

  const colAfterAnchor = (
    rowIndex: number,
    colIndex: number,
    anchor: HTMLElement,
  ): ApcDropTarget => ({
    kind: 'col-after',
    targetId: anchor.dataset.apcCardId!,
    rowIndex,
    colIndex,
  });

  const lastColAnchor = (rowEl: HTMLElement): { anchor: HTMLElement; colIndex: number } | null => {
    const columns = [...rowEl.querySelectorAll<HTMLElement>('.apc-column')];
    if (columns.length === 0) return null;
    const lastCol = columns[columns.length - 1];
    const stackCards = [...lastCol.querySelectorAll<HTMLElement>('.apc-card')].filter(
      el => el.dataset.apcCardId && el.dataset.apcCardId !== draggingId,
    );
    const anchor = stackCards[stackCards.length - 1];
    if (!anchor?.dataset.apcCardId) return null;
    return { anchor, colIndex: columns.length - 1 };
  };

  const stackBelowCard = (
    rowIndex: number,
    colIndex: number,
    cardEl: HTMLElement,
  ): ApcDropTarget => {
    const id = cardEl.dataset.apcCardId!;
    const rect = cardEl.getBoundingClientRect();
    return {
      kind: 'stack-below',
      targetId: id,
      rowIndex,
      colIndex,
      ...indicatorUnder(rect),
    };
  };

  // row-above 슬롯 — 첫 번째 Row 위에 새 Row 삽입
  for (const slot of wrap.querySelectorAll<HTMLElement>('.apc-row-above-slot')) {
    const rect = slot.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
    const firstRow = wrap.querySelector<HTMLElement>('.apc-row');
    const colsEl = firstRow?.querySelector<HTMLElement>('.apc-row-cols');
    const rowRect = (colsEl ?? firstRow)?.getBoundingClientRect();
    const firstId = firstRow
      ? [...firstRow.querySelectorAll<HTMLElement>('.apc-card')]
          .find(c => c.dataset.apcCardId && c.dataset.apcCardId !== draggingId)?.dataset.apcCardId
      : undefined;
    if (!firstId || !rowRect) continue;
    return {
      kind: 'row-above',
      targetId: firstId,
      rowIndex: 0,
      indicatorWidth: rowRect.width,
      indicatorMarginLeft: rowRect.left - wrapRect.left,
    };
  }

  // row-below 슬롯 — 가장 먼저 확인 (cardEls 루프보다 우선)
  for (const slot of wrap.querySelectorAll<HTMLElement>('.apc-row-below-slot')) {
    const rect = slot.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    const rowEl = slot.closest<HTMLElement>('.apc-row');
    if (!rowEl) continue;
    const rowIndex = Number(rowEl.dataset.apcRowIndex ?? 0);
    const colsEl = rowEl.querySelector<HTMLElement>('.apc-row-cols');
    const rowRect = (colsEl ?? rowEl).getBoundingClientRect();
    const allCards = rowEl.querySelectorAll<HTMLElement>('.apc-card');
    let lastId = '';
    allCards.forEach(c => {
      const cid = c.dataset.apcCardId;
      if (cid && cid !== draggingId) lastId = cid;
    });
    if (!lastId) continue;
    return {
      kind: 'row-below',
      targetId: lastId,
      rowIndex,
      indicatorWidth: rowRect.width,
      indicatorMarginLeft: rowRect.left - wrapRect.left,
    };
  }

  // 드래그 중 열 하단 슬롯 — 카드 아래 세로 쌓기 (ApcDashboard apc-col-stack-slot)
  for (const slot of wrap.querySelectorAll<HTMLElement>('.apc-col-stack-slot')) {
    const rect = slot.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    const colEl = slot.closest<HTMLElement>('.apc-column');
    const rowEl = slot.closest<HTMLElement>('.apc-row');
    if (!colEl || !rowEl) continue;
    const rowIndex = Number(rowEl.dataset.apcRowIndex ?? 0);
    const colIndex = Number(colEl.dataset.apcColIndex ?? 0);
    const stackCards = [...colEl.querySelectorAll<HTMLElement>('.apc-card')].filter(
      el => el.dataset.apcCardId && el.dataset.apcCardId !== draggingId,
    );
    const anchor = stackCards[stackCards.length - 1];
    if (anchor?.dataset.apcCardId) {
      return stackBelowCard(rowIndex, colIndex, anchor);
    }
  }

  // 드래그 중 Row 끝 슬롯 (ApcDashboard apc-col-trail-slot)
  for (const slot of wrap.querySelectorAll<HTMLElement>('.apc-col-trail-slot')) {
    const rect = slot.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    const rowEl = slot.closest<HTMLElement>('.apc-row');
    if (!rowEl) continue;
    const rowIndex = Number(rowEl.dataset.apcRowIndex ?? 0);
    const hit = lastColAnchor(rowEl);
    if (hit) return colAfterAnchor(rowIndex, hit.colIndex, hit.anchor);
  }

  const cardEls = [...wrap.querySelectorAll<HTMLElement>('.apc-card')].filter(
    el => el.dataset.apcCardId && el.dataset.apcCardId !== draggingId,
  );

  for (const el of cardEls) {
    const id = el.dataset.apcCardId!;
    const rowEl = el.closest<HTMLElement>('.apc-row');
    const colEl = el.closest<HTMLElement>('.apc-column');
    const rowIndex = Number(rowEl?.dataset.apcRowIndex ?? 0);
    const colIndex = Number(colEl?.dataset.apcColIndex ?? 0);
    const isInStack = colEl?.classList.contains('apc-column--stack') ?? false;
    let rect = el.getBoundingClientRect();
    const columns = rowEl ? [...rowEl.querySelectorAll<HTMLElement>('.apc-column')] : [];
    const isLastCol = columns.length > 0 && colIndex === columns.length - 1;
    if (isLastCol && rowEl) {
      const colsEl = rowEl.querySelector<HTMLElement>('.apc-row-cols');
      const colsRect = (colsEl ?? rowEl).getBoundingClientRect();
      const trailRight = Math.max(
        colsRect.right,
        wrapRect.right,
        rect.right + ROW_TRAIL_MIN_PX,
      );
      if (
        clientX >= rect.left &&
        clientX <= trailRight &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const relX = (clientX - rect.left) / Math.max(rect.width, 1);
        if (relX >= 0.45) {
          return colAfterAnchor(rowIndex, colIndex, el);
        }
      }
    }
    // 스택 컬럼은 카드 아래 gap(10px)까지 히트 영역 확장
    const bottomBoundary = isInStack ? rect.bottom + STACK_CARD_GAP : rect.bottom;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > bottomBoundary) {
      continue;
    }
    // gap 구간에 있으면 바로 stack-below 반환
    if (isInStack && clientY > rect.bottom) {
      return stackBelowCard(rowIndex, colIndex, el);
    }

    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;

    if (relY < CARD_EDGE_ZONE) {
      // 스택 컬럼 상단 → 위에 삽입, 단독 컬럼 → 앞에 새 열
      if (isInStack) return { kind: 'stack-above', targetId: id, rowIndex, colIndex };
      return { kind: 'col-before', targetId: id, rowIndex, colIndex };
    }
    if (relY > 1 - CARD_EDGE_ZONE) {
      return stackBelowCard(rowIndex, colIndex, el);
    }
    if (relX < CARD_EDGE_ZONE) {
      return { kind: 'col-before', targetId: id, rowIndex, colIndex };
    }
    return { kind: 'col-after', targetId: id, rowIndex, colIndex };
  }

  // 열 사이 gap + 맨 오른쪽 여백(예상 절감 오른쪽에 LNG 놓기)
  for (const rowEl of wrap.querySelectorAll<HTMLElement>('.apc-row')) {
    const rowIndex = Number(rowEl.dataset.apcRowIndex ?? 0);
    const colsEl = rowEl.querySelector<HTMLElement>('.apc-row-cols');
    const columns = [...rowEl.querySelectorAll<HTMLElement>('.apc-column')];
    if (columns.length === 0) continue;

    const colsRect = (colsEl ?? rowEl).getBoundingClientRect();

    for (let i = 0; i < columns.length - 1; i++) {
      const leftRect = columns[i].getBoundingClientRect();
      const rightRect = columns[i + 1].getBoundingClientRect();
      const gapLeft = leftRect.right - GAP_HIT_PAD;
      const gapRight = rightRect.left + GAP_HIT_PAD;
      if (clientX <= gapLeft || clientX >= gapRight) continue;
      const rowTop = Math.min(leftRect.top, rightRect.top);
      const rowBottom = Math.max(leftRect.bottom, rightRect.bottom);
      if (clientY < rowTop || clientY > rowBottom) continue;
      const stackCards = [...columns[i].querySelectorAll<HTMLElement>('.apc-card')].filter(
        el => el.dataset.apcCardId && el.dataset.apcCardId !== draggingId,
      );
      const anchor = stackCards[stackCards.length - 1];
      if (!anchor?.dataset.apcCardId) continue;
      return colAfterAnchor(rowIndex, i, anchor);
    }

    const lastCol = columns[columns.length - 1];
    const lastRect = lastCol.getBoundingClientRect();
    const trailLeft = lastRect.right - GAP_HIT_PAD;
    const trailRight = Math.max(
      colsRect.right,
      wrapRect.right,
      lastRect.right + ROW_TRAIL_MIN_PX,
    ) + GAP_HIT_PAD;
    if (
      clientX > trailLeft &&
      clientX <= trailRight &&
      clientY >= colsRect.top &&
      clientY <= colsRect.bottom
    ) {
      const stackCards = [...lastCol.querySelectorAll<HTMLElement>('.apc-card')].filter(
        el => el.dataset.apcCardId && el.dataset.apcCardId !== draggingId,
      );
      const anchor = stackCards[stackCards.length - 1];
      if (anchor?.dataset.apcCardId) {
        return colAfterAnchor(rowIndex, columns.length - 1, anchor);
      }
    }
  }

  return null;
}

export const INITIAL_APC_LAYOUT: ApcLayout = [
  // Row 1 — 태그계통 스택 | 공정흐름-현재 | 공정흐름-최적화 | KPI 스택
  [['tags-fuel', 'tags-h2', 'tags-og'], ['schematic'], ['schematic-opt'], ['kpi-lng', 'kpi-og', 'kpi-dump', 'kpi-fuel', 'kpi-save']],
  // Row 2 — 업무흐름 | 트렌드 | [CV운전범위+MV조작변수] | [MV제약+CV제어변수]
  [['optimize'], ['trend'], ['cv-const', 'mv'], ['mv-const', 'cv']],
  // Row 3 — 목적함수 | 솔버제어 | 솔버로그 | 권고사항 | 예상절감KPI
  [['objectives'], ['solver-ctrl'], ['solver-log'], ['recommends'], ['kpi-result']],
];
