# IronOrr Karaoke File Software (IKFS)

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
- **Built-in updater** with visible app version and check-for-updates action

## Supported Formats

| Format | Read Tags | Write Tags |
|--------|-----------|------------|
| MP3    | ✅        | ✅         |
| WAV    | ✅        | ⏳ planned  |
| MP4    | ✅        | ⏳ planned  |
| MKV    | ✅        | ⏳ planned  |
| OGG    | ✅        | ⏳ planned  |
| FLAC   | ✅        | ⏳ planned  |
| M4A    | ✅        | ⏳ planned  |
| WMA    | ✅        | ⏳ planned  |
| CDG    | ✅        | —          |
| KAR    | ✅        | —          |
| ZIP (MP3+G) | ✅  | ✅         |

> **Note:** Tag write-back for WAV, MP4, MKV, OGG, FLAC, M4A, and WMA is not yet implemented
> (no lightweight cross-platform library is included for these formats yet). Edits to those
> files are previewed in the UI but not persisted to disk. MP3 and MP3+G (ZIP) fully support
> write-back via `node-id3`.

## Auto Update Workflow

The app checks for updates in packaged builds (not dev mode) and shows current version/status in the status bar.

To publish an update for installed users:

1. Bump `version` in `package.json` (for example `1.0.0` → `1.0.1`).
2. Commit and push your code changes.
3. Set a GitHub token in your shell session:
   - PowerShell: `$env:GH_TOKEN="<your_token>"`
4. Run:
   - `npm run publish:electron`
5. This uploads installer + update metadata to GitHub Releases for this repository.
6. Installed users will receive update availability and download/install prompts automatically.

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

# Build and publish release artifacts for auto-update
npm run publish:electron
```

## Tech Stack

- **Electron 41** — cross-platform desktop shell
- **React 19** — UI framework
- **Vite 8** — build tool
- **music-metadata** — read audio/video tags (MP3, FLAC, OGG, MP4, etc.)
- **node-id3** — write ID3 tags to MP3 and MP3+G files
- **adm-zip** — read/write MP3+G zip archives

## Web Paywall Page (Before Download)

A standalone page is included to gate downloads behind payment:

- `paywall.html`
- `paywall.css`
- `paywall.config.js`
- `paywall.js`

### Configure

Edit `paywall.config.js`:

- `priceLabel`: text shown on page
- `apiBaseUrl`: backend API base URL (example: `http://localhost:8787`)
- `amount`: checkout amount sent to backend order creation
- `currency`: checkout currency code (example: `USD`)
- `storageKey`: local browser key for unlocked state

### Flow

1. User clicks **Buy Now (PayPal)**.
2. Frontend calls `POST /api/paypal/order`.
3. Backend creates PayPal order and returns `approvalUrl`.
4. Browser redirects to PayPal for approval.
5. User returns to paywall with `?token=<order_id>` or `?order_id=<order_id>`.
6. Frontend verifies payment with `GET /api/download/token?order_id=...`.
7. Frontend receives signed token and enables `GET /api/download?token=...`.

> Note: This mode verifies payment server-side before unlocking download access.

### GitHub Pages Deployment

A workflow is included at `.github/workflows/paywall-pages.yml`.

It publishes the paywall as your Pages root (`index.html`) from these files:

- `paywall.html` (published as `index.html`)
- `paywall.css`
- `paywall.js`
- `paywall.config.js`

#### Enable Pages in GitHub

1. Open repository settings → **Pages**.
2. For **Build and deployment**, choose **GitHub Actions** as source.
3. Push to `main` (or run the workflow manually).

Your paywall URL will be:

- `https://<owner>.github.io/<repo>/`

### PayPal API Secure Mode (Server-Verified)

The paywall backend can verify PayPal payments before issuing a short-lived download token.

#### 1) Install dependencies

```bash
npm install
```

#### 2) Configure environment

Copy `.env.example` to `.env` and set values:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `DOWNLOAD_FILE_PATH`
- `TOKEN_SECRET`
- optional: `PAYPAL_ENV`, `PAYPAL_API_BASE`, `PAYWALL_SUCCESS_URL`, `PAYWALL_CANCEL_URL`, `PAYWALL_ORIGIN`, `PAYPAL_AMOUNT`, `PAYPAL_CURRENCY`, `PORT`, `TOKEN_TTL_SECONDS`

#### 3) Start secure paywall API

```bash
npm run paywall:server
```

#### 4) API flow

1. Frontend calls `POST /api/paypal/order`.
2. Backend creates PayPal order and returns approval URL.
3. Buyer completes PayPal approval/capture flow.
4. Frontend verifies with backend (`GET /api/download/token?order_id=...`).
5. Frontend receives signed token and downloads via `GET /api/download?token=...`.
