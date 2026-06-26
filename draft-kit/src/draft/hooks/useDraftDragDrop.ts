/** 카드 드래그&드롭 상태 및 재정렬 로직 */
import { useCallback, useState } from 'react';
import { resolveDraftDropTarget } from '../data-snapshotStorage';
import type { DraftCardId, DraftDropTarget } from '../types-draft';

export interface DraftDragDropHook {
  draggingId: DraftCardId | null;
  setDraggingId: (id: DraftCardId | null) => void;
  dropTarget: DraftDropTarget;
  setDropTarget: (t: DraftDropTarget) => void;
  handleDragOver: (
    e: React.DragEvent<HTMLDivElement>,
    fallbackDraggingId: DraftCardId | null,
  ) => void;
  handleDrop: (
    e: React.DragEvent<HTMLDivElement>,
    fallbackDraggingId: DraftCardId | null,
    onReorder: (dragging: DraftCardId, target: DraftCardId, pos: 'before' | 'after') => void,
  ) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  reorder: (
    dragging: DraftCardId,
    target: DraftCardId,
    position: 'before' | 'after',
    setOrder: React.Dispatch<React.SetStateAction<DraftCardId[]>>,
  ) => void;
}

export function useDraftDragDrop(): DraftDragDropHook {
  const [draggingId, setDraggingId] = useState<DraftCardId | null>(null);
  const [dropTarget, setDropTarget] = useState<DraftDropTarget>(null);

  const reorder = useCallback((
    dragging: DraftCardId,
    target: DraftCardId,
    position: 'before' | 'after',
    setOrder: React.Dispatch<React.SetStateAction<DraftCardId[]>>,
  ) => {
    if (dragging === target && position === 'before') return;
    setOrder(prev => {
      const from = prev.indexOf(dragging);
      const to = prev.indexOf(target);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      let insertIdx = position === 'before' ? to : to + 1;
      if (from < to) insertIdx -= 1;
      insertIdx = Math.max(0, Math.min(insertIdx, next.length));
      next.splice(insertIdx, 0, dragging);
      return next;
    });
  }, []);

  const handleDragOver = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    fallbackDraggingId: DraftCardId | null,
  ) => {
    const id = (e.dataTransfer.getData('text/plain') || fallbackDraggingId) as DraftCardId;
    if (!id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const next = resolveDraftDropTarget(
      e.clientX, e.clientY, e.currentTarget as HTMLDivElement, id,
    );
    setDropTarget(prev => {
      if (prev?.cardId === next?.cardId && prev?.position === next?.position) return prev;
      return next;
    });
  }, []);

  const handleDrop = useCallback((
    e: React.DragEvent<HTMLDivElement>,
    fallbackDraggingId: DraftCardId | null,
    onReorder: (dragging: DraftCardId, target: DraftCardId, pos: 'before' | 'after') => void,
  ) => {
    e.preventDefault();
    const id = (e.dataTransfer.getData('text/plain') || fallbackDraggingId) as DraftCardId;
    if (id && dropTarget) onReorder(id, dropTarget.cardId, dropTarget.position);
    setDraggingId(null);
    setDropTarget(null);
  }, [dropTarget]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
  }, []);

  return {
    draggingId, setDraggingId,
    dropTarget, setDropTarget,
    handleDragOver, handleDrop, handleDragLeave,
    reorder,
  };
}
