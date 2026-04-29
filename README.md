# KJ Karaoke File Manager

A cross-platform desktop karaoke file manager built with Electron + React. Designed as a modern, open alternative to KJ File Manager.

## Features

- **Load entire folders** of karaoke/audio/video files recursively
- **Grid view** with columns: Artist, Title, Album, Disc ID, Year, Track, File Name, Type
- **Batch tag editing** for hundreds of files at once
- **Shift Fields Left / Right** — instantly correct mislabeled Artist ↔ Title ↔ Album metadata
- **Swap Artist ↔ Title** — one-click fix for the most common labeling error
- **Right-click context menu** with all editing options
- **Multi-select** with Ctrl+Click (individual) and Shift+Click (range)
- **Search / filter** by artist, title, album, or filename
- **Sortable columns** (click any column header)
- **Write-back to disk** — changes are saved directly into the file's ID3/metadata tags
- **MP3+G (ZIP) support** — reads and writes tags inside the inner MP3

## Supported Formats

| Format | Read Tags | Write Tags |
|--------|-----------|------------|
| MP3    | ✅        | ✅         |
| WAV    | ✅        | —          |
| MP4    | ✅        | —          |
| MKV    | ✅        | —          |
| OGG    | ✅        | —          |
| FLAC   | ✅        | —          |
| M4A    | ✅        | —          |
| WMA    | ✅        | —          |
| CDG    | ✅        | —          |
| KAR    | ✅        | —          |
| ZIP (MP3+G) | ✅  | ✅         |

## Field Shift Operations

When karaoke files are mislabeled (e.g., Artist shows the song title and Title shows the artist name), use:

- **Shift Left**: `Artist ← Title ← Album` (Title moves to Artist, Album moves to Title, Artist moves to Album)
- **Shift Right**: `Artist → Title → Album` (Artist moves to Title, Title moves to Album, Album moves to Artist)
- **Swap Artist ↔ Title**: Direct swap of just the Artist and Title fields

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+A` | Select all visible files |
| `F2` | Edit tags for selected files |
| `Esc` | Close modal / context menu |

## Development

```bash
# Install dependencies
npm install

# Start development (Vite + Electron hot-reload)
npm run dev

# Build for production
npm run build

# Build distributable installer
npm run build:electron
```

## Tech Stack

- **Electron 41** — cross-platform desktop shell
- **React 19** — UI framework
- **Vite 8** — build tool
- **music-metadata** — read audio/video tags (MP3, FLAC, OGG, MP4, etc.)
- **node-id3** — write ID3 tags to MP3 and MP3+G files
- **adm-zip** — read/write MP3+G zip archives
