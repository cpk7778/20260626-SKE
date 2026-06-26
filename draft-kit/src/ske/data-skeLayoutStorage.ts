import { cloneSkeLayout, INITIAL_SKE_LAYOUT, SKE_CARD_IDS, type SkeLayout } from './data-skeLayout';

const LAYOUT_KEY = 'ske-layout-v1';
const CARDS_KEY  = 'ske-cards-v1';

const KNOWN_IDS = new Set(SKE_CARD_IDS);

function isValidLayout(raw: unknown): raw is SkeLayout {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const seen = new Set<string>();
  for (const row of raw) {
    if (!Array.isArray(row) || row.length === 0) return false;
    for (const col of row) {
      if (!Array.isArray(col) || col.length === 0) return false;
      for (const id of col) {
        if (typeof id !== 'string' || !KNOWN_IDS.has(id as never) || seen.has(id)) return false;
        seen.add(id);
      }
    }
  }
  return seen.size === KNOWN_IDS.size;
}

export function loadSkeLayout(): SkeLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return cloneSkeLayout(INITIAL_SKE_LAYOUT);
    const parsed: unknown = JSON.parse(raw);
    return isValidLayout(parsed) ? parsed : cloneSkeLayout(INITIAL_SKE_LAYOUT);
  } catch { return cloneSkeLayout(INITIAL_SKE_LAYOUT); }
}

export function saveSkeLayout(layout: SkeLayout): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* quota */ }
}

export function resetSkeLayout(): void {
  try { localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ }
}

// ── 카드 크기 저장 ─────────────────────────────────────────────────────────
export type SkeCardSizes = Record<string, { width: string; height: string }>;

export function loadSkeCards(): SkeCardSizes {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SkeCardSizes;
  } catch { return {}; }
}

export function saveSkeCards(cards: SkeCardSizes): void {
  try { localStorage.setItem(CARDS_KEY, JSON.stringify(cards)); } catch { /* quota */ }
}

export function resetSkeCards(): void {
  try { localStorage.removeItem(CARDS_KEY); } catch { /* ignore */ }
}
