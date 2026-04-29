import { useState, useCallback, useRef } from 'react';

/**
 * Toast notification hook.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

/**
 * Selection hook for multi-select with Shift/Ctrl.
 */
export function useSelection(items) {
  const [selected, setSelected] = useState(new Set());
  const lastClickedIndex = useRef(null);

  const handleRowClick = useCallback((index, e) => {
    setSelected(prev => {
      const next = new Set(prev);

      if (e.shiftKey && lastClickedIndex.current !== null) {
        // Range select
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        for (let i = start; i <= end; i++) {
          if (items[i]) next.add(i);
        }
        return next;
      }

      if (e.ctrlKey || e.metaKey) {
        // Toggle individual
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        lastClickedIndex.current = index;
        return next;
      }

      // Single select
      lastClickedIndex.current = index;
      return new Set([index]);
    });
  }, [items]);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((_, i) => i)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    lastClickedIndex.current = null;
  }, []);

  return { selected, handleRowClick, selectAll, clearSelection, setSelected };
}
