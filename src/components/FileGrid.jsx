import React from 'react';

const EXT_BADGES = {
  MP3: 'badge-mp3', MP4: 'badge-mp4', WAV: 'badge-wav', CDG: 'badge-cdg',
  ZIP: 'badge-zip', KAR: 'badge-kar', OGG: 'badge-ogg', FLAC: 'badge-flac',
  M4A: 'badge-m4a', WMA: 'badge-wma', MKV: 'badge-mkv',
};

const COLUMNS = [
  { key: 'index',    label: '#',          width: 48,  className: 'cell-index' },
  { key: 'ext',      label: 'Type',        width: 60,  className: 'cell-type' },
  { key: 'artist',   label: 'Artist',      width: 200, className: 'cell-artist' },
  { key: 'title',    label: 'Title',       width: 200, className: 'cell-title' },
  { key: 'album',    label: 'Album',       width: 150, className: 'cell-album' },
  { key: 'discId',   label: 'Disc ID',     width: 100, className: 'cell-discid' },
  { key: 'year',     label: 'Year',        width: 60,  className: '' },
  { key: 'track',    label: 'Track',       width: 55,  className: '' },
  { key: 'fileName', label: 'File Name',   width: 260, className: '' },
];

export default function FileGrid({
  files,
  selected,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  sortKey,
  sortDir,
  onSort,
}) {
  if (!files || files.length === 0) return null;

  return (
    <div className="file-grid">
      <table className="grid-table">
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                style={{ width: col.width, minWidth: col.width }}
                onClick={() => col.key !== 'index' && onSort(col.key)}
                title={col.label}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {files.map((file, idx) => (
            <tr
              key={file.filePath}
              className={selected.has(idx) ? 'selected' : ''}
              onClick={(e) => onRowClick(idx, e)}
              onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(file)}
              onContextMenu={(e) => onContextMenu(e, idx)}
            >
              <td className="cell-index">{idx + 1}</td>
              <td className="cell-type">
                <span className={`badge ${EXT_BADGES[file.ext] || 'badge-default'}`}>
                  {file.ext}
                </span>
              </td>
              <td className="cell-artist" title={file.artist}>{file.artist}</td>
              <td className="cell-title"  title={file.title}>{file.title}</td>
              <td className="cell-album"  title={file.album}>{file.album}</td>
              <td className="cell-discid" title={file.discId}>{file.discId}</td>
              <td>{file.year}</td>
              <td>{file.track}</td>
              <td title={file.fileName}>{file.fileName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
