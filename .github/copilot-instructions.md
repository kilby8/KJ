# Copilot Instructions

## Project Guidelines
- User prefers GitHub Actions releases to use built-in GITHUB_TOKEN with explicit workflow permissions including contents: write (and packages: write when needed).
- When pushing changes in this workspace, provide a workflow update progress bar/status summary.
- Use PayPal credentials consumed via API environment variables for backend wiring.
- Keep the current local .env secret values in place for now instead of removing them.

## Media Processing Guidelines
- For non-MP3 metadata writes in Electron, prefer FFmpeg fallback with extension-based routing, -c copy stream copy, atomic temp-file replacement, and consistent {ok,error} IPC responses.