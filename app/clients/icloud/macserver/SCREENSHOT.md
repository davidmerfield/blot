# Screenshot endpoint setup

## Dependencies
1. Install Node dependencies in `app/clients/icloud/macserver/` so Playwright and the ad blocker are available:
   ```bash
   npm install
   ```
2. Install the Chromium runtime used by Playwright:
   ```bash
   npx playwright install chromium
   ```

## System requirements
- At least 2 vCPUs and 2–4 GB RAM are recommended to support concurrent Chromium contexts.
- Ensure sufficient disk space for temporary browser data and screenshots.
- Keep the host patched so the bundled Chromium can launch without sandbox issues.

## Configuration
- The endpoint inherits the existing `Authorization` header check; no additional environment variables are required beyond the existing macserver `.env` values.
- Default behavior:
  - Viewport: 1440x900
  - Device scale factor: 2 (Retina)
  - Global concurrency: 4 captures
  - Per-domain concurrency: 2 captures
  - Timeout: 30 seconds (clamped between 1–120 seconds)
  - User agent: macOS Chrome
  - Locale: en-US

## Monitoring and operations
- The Chromium instance is long-lived. Monitor memory/CPU for the `macserver` process and restart if usage grows unexpectedly.
- The adblocker filter lists refresh daily; temporary failures log warnings but do not crash the server.
- Browser lifecycle ties into `SIGTERM`/`SIGINT` to ensure graceful shutdowns during deploys.

## Troubleshooting
- **Chromium fails to launch**: re-run `npx playwright install chromium` and confirm the host allows Playwright to download/execute the browser binary.
- **High resource usage**: lower the global/per-domain concurrency in `screenshot/limiters.js` or scale the host vertically.
- **Repeated capture failures**: validate the target URL is public and reachable, confirm the Authorization header is set, and inspect server logs for adblocker initialization errors.
- **Stuck browser state**: restart the macserver process to force a clean Chromium instance.

## Optional additions
- Run `npx playwright install webkit` if future WebKit support is desired; update the launch code before switching engines.
