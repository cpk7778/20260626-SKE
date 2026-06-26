import { cloneLayout, INITIAL_APC_LAYOUT, type ApcLayout } from './data-apcLayout';

export const APC_LAYOUT_STORAGE_KEY = 'investops-apc-layout-v7';

const KNOWN_CARD_IDS = new Set(
  INITIAL_APC_LAYOUT.flatMap(row => row.flatMap(col => col)),
);

function isValidLayout(layout: unknown): layout is ApcLayout {
  if (!Array.isArray(layout) || layout.length === 0) return false;
  const seen = new Set<string>();
  for (const row of layout) {
    if (!Array.isArray(row) || row.length === 0) return false;
    for (const col of row) {
      if (!Array.isArray(col) || col.length === 0) return false;
      for (const id of col) {
        if (typeof id !== 'string' || !KNOWN_CARD_IDS.has(id) || seen.has(id)) return false;
        seen.add(id);
      }
    }
  }
  return seen.size === KNOWN_CARD_IDS.size;
}

export function loadApcLayoutFromStorage(): ApcLayout {
  try {
    const raw = localStorage.getItem(APC_LAYOUT_STORAGE_KEY);
    if (!raw) return cloneLayout(INITIAL_APC_LAYOUT);
    const parsed: unknown = JSON.parse(raw);
    if (!isValidLayout(parsed)) return cloneLayout(INITIAL_APC_LAYOUT);
    return parsed;
  } catch {
    return cloneLayout(INITIAL_APC_LAYOUT);
  }
}

export function saveApcLayoutToStorage(layout: ApcLayout): void {
  try {
    localStorage.setItem(APC_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode */
  }
}

export function resetApcLayoutStorage(): void {
  try {
    localStorage.removeItem(APC_LAYOUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function defaultApcLayout(): ApcLayout {
  return cloneLayout(INITIAL_APC_LAYOUT);
}

/* ── 카드 크기(widthIdx / heightIdx) 저장 ──────────────────────────────── */

export const APC_CARDS_STORAGE_KEY = 'investops-apc-cards-v1';

export type ApcCardSizes = Record<string, { width: string; height: string }>;

export function loadApcCardsFromStorage(): ApcCardSizes {
  try {
    const raw = localStorage.getItem(APC_CARDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ApcCardSizes;
  } catch {
    return {};
  }
}

export function saveApcCardsToStorage(cards: ApcCardSizes): void {
  try {
    localStorage.setItem(APC_CARDS_STORAGE_KEY, JSON.stringify(cards));
  } catch { /* quota / private mode */ }
}

export function resetApcCardsStorage(): void {
  try {
    localStorage.removeItem(APC_CARDS_STORAGE_KEY);
  } catch { /* ignore */ }
}
