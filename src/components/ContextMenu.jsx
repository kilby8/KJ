import React, { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  // Adjust position so the menu stays within the viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw)  el.style.left = `${x - rect.width}px`;
    if (rect.bottom > vh) el.style.top  = `${y - rect.height}px`;
  }, [x, y]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className="context-menu-sep" />;
        if (item.type === 'header')    return <div key={i} className="context-menu-header">{item.label}</div>;
        return (
          <div
            key={i}
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => { item.action(); onClose(); }}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
