import React, { useState, useEffect } from 'react';

/**
 * Modal for editing a single file's metadata tags.
 * When multiple files are selected, it shows a bulk-edit mode (blank = no change).
 */
export default function EditModal({ files, onSave, onClose }) {
  const isBulk = files.length > 1;

  const [form, setForm] = useState({
    artist:  isBulk ? '' : (files[0]?.artist  || ''),
    title:   isBulk ? '' : (files[0]?.title   || ''),
    album:   isBulk ? '' : (files[0]?.album   || ''),
    discId:  isBulk ? '' : (files[0]?.discId  || ''),
    year:    isBulk ? '' : (files[0]?.year    || ''),
    track:   isBulk ? '' : (files[0]?.track   || ''),
  });

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = () => {
    // For bulk edit, only pass fields that the user actually typed something into
    if (isBulk) {
      const patch = {};
      for (const [k, v] of Object.entries(form)) {
        if (v.trim() !== '') patch[k] = v.trim();
      }
      onSave(files, patch);
    } else {
      const trimmed = {};
      for (const [k, v] of Object.entries(form)) trimmed[k] = v.trim();
      onSave(files, trimmed);
    }
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Submit on Enter (when not in a multiline field)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h3 id="modal-title">
            {isBulk
              ? `Edit Tags — ${files.length} files selected`
              : `Edit Tags — ${files[0]?.fileName}`}
          </h3>
          <button className="modal-close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="modal-body">
          {isBulk && (
            <p className="form-hint">
              Leave a field blank to keep each file's existing value. Only filled fields will be updated.
            </p>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="edit-artist">Artist</label>
            <input
              id="edit-artist"
              className="form-input"
              value={form.artist}
              onChange={set('artist')}
              onKeyDown={handleKeyDown}
              placeholder={isBulk ? '(mixed — leave blank to keep)' : 'Artist name'}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-title">Title</label>
            <input
              id="edit-title"
              className="form-input"
              value={form.title}
              onChange={set('title')}
              onKeyDown={handleKeyDown}
              placeholder={isBulk ? '(mixed — leave blank to keep)' : 'Song title'}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-album">Album</label>
            <input
              id="edit-album"
              className="form-input"
              value={form.album}
              onChange={set('album')}
              onKeyDown={handleKeyDown}
              placeholder={isBulk ? '(mixed — leave blank to keep)' : 'Album / manufacturer'}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-discid">Disc ID</label>
            <input
              id="edit-discid"
              className="form-input"
              value={form.discId}
              onChange={set('discId')}
              onKeyDown={handleKeyDown}
              placeholder={isBulk ? '(mixed — leave blank to keep)' : 'Disc / catalogue ID'}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="edit-year">Year</label>
              <input
                id="edit-year"
                className="form-input"
                value={form.year}
                onChange={set('year')}
                onKeyDown={handleKeyDown}
                placeholder="YYYY"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="edit-track">Track #</label>
              <input
                id="edit-track"
                className="form-input"
                value={form.track}
                onChange={set('track')}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 1"
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
