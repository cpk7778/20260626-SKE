/** 레이아웃 스냅샷 저장·삭제·적용 — 탭별로 재사용 가능한 제네릭 훅 */
import { useState } from 'react';
import {
  formatSnapshotLabel,
  loadSnapshots,
  saveSnapshots,
} from '../data-snapshotStorage';
import type { LayoutSnapshot } from '../types-draft';

export interface UseLayoutSnapshotReturn<T> {
  snapshots: LayoutSnapshot<T>[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  save: (getState: () => T) => void;
  remove: () => void;
  /** 스냅샷을 선택하고 normalize된 state를 반환 — null이면 적용 불가 */
  apply: (id: string, normalize: (v: unknown) => T | null) => T | null;
}

export function useLayoutSnapshot<T>(
  storageKey: string,
  initialNormalize?: (v: unknown) => T | null,
): UseLayoutSnapshotReturn<T> {
  const [snapshots, setSnapshots] = useState<LayoutSnapshot<T>[]>(() => {
    const raw = loadSnapshots<unknown>(storageKey);
    if (!initialNormalize) return raw as LayoutSnapshot<T>[];
    return raw
      .map(s => {
        const state = initialNormalize(s.state);
        return state ? ({ ...s, state } as LayoutSnapshot<T>) : null;
      })
      .filter((v): v is LayoutSnapshot<T> => v !== null);
  });

  const [selectedId, setSelectedId] = useState('');

  function save(getState: () => T) {
    const createdAt = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next: LayoutSnapshot<T>[] = [
      { id, createdAt, label: formatSnapshotLabel(createdAt), state: getState() },
      ...snapshots,
    ];
    setSnapshots(next);
    saveSnapshots(storageKey, next);
    setSelectedId(id);
  }

  function remove() {
    if (!selectedId) return;
    const next = snapshots.filter(s => s.id !== selectedId);
    setSnapshots(next);
    saveSnapshots(storageKey, next);
    setSelectedId('');
  }

  function apply(id: string, normalize: (v: unknown) => T | null): T | null {
    setSelectedId(id);
    const snapshot = snapshots.find(s => s.id === id);
    if (!snapshot) return null;
    return normalize(snapshot.state);
  }

  return { snapshots, selectedId, setSelectedId, save, remove, apply };
}
