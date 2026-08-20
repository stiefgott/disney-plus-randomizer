# Disney+ Random

An unofficial, privacy-friendly browser extension that adds random title, series, movie, and episode selection to Disney+.

> This project is not affiliated with, endorsed by, or sponsored by Disney. A separate Disney+ subscription is required.

## Browser support

| Browser family | Status |
| --- | --- |
| Chromium — Chrome, Brave, Edge, Dia, Vivaldi | Supported |
| Firefox | Work in progress |
| Safari for macOS | Planned |

The project is being prepared around one shared codebase. Browser-specific manifests and packages will be added only after they have been tested reliably.

## Languages

- English is the default interface language.
- German can be selected from the extension popup.
- The selected language is stored locally and remains active after restarting the browser.
- The translation layer uses English as its canonical source language so additional languages can be added later without changing the feature code.

## Features

- **Random recommendation:** Opens the details of a random title matching the active filters without starting playback.
- **Play a filtered selection:** Starts a random movie or chooses a random series and episode from the filtered catalog.
- **Local series playlists:** Creates reusable mixes from selected shows and uses them as the source for continuous random playback.
- **Random episode:** Chooses a random season and episode directly from a series page.
- **Disney+-style series control:** Adds a compact shuffle button next to the native series actions.
- **Player shuffle control:** Adds a shuffle control to the Disney+ player. Its tooltip shows whether shuffle is enabled and which source is active.
- **Catalog and filters:** Filters detected titles by content type, category, Disney+/Hulu source, and supported Disney+ studios.
- **Automatic local catalog sync:** Reads the catalog shown by the currently signed-in Disney+ session without requesting device location or using an external catalog server.
- **Playback priority:** Stops a running background scan when video playback starts so the scanner does not compete with the player for resources.
- **Continue Watching detection:** Associates episode links with their series so shuffle can continue after an episode was started from Continue Watching.
- **Catalog management:** Titles can be enabled, paused, filtered, assigned to playlists, deleted, or reset locally.
- **Skip watched episodes:** Avoids episodes that Disney+ marks as fully watched when the information is available.
- **Keyboard shortcut:** `Ctrl+Shift+Y` or `Command+Shift+Y` chooses a random series.

## Install the Chromium development build

1. Download and extract the Chromium package.
2. Open your browser's extension management page, such as `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted `DisneyPlus-Random` folder.
6. Reload an already open Disney+ tab.

Brave, Edge, Dia, Vivaldi, and other Chromium-based browsers use the same development package.

## How catalog sync works

Disney+ loads catalog pages dynamically. The extension visits the visible series, movie, Originals, Disney+, Hulu, and available studio sections using the currently signed-in Disney+ session. A successful full scan is not repeated automatically for at least twelve hours and can be started manually from the catalog page.

The **Recommendations** and **For You** sections are intentionally excluded. Existing catalog entries are enriched with content type, categories, current availability, source, and studio information during later scans.

Direct playback is a best-effort convenience. If Disney+ or the browser blocks an automatic transition, the correct series details page still opens and playback can be started manually.

## Privacy

Detected URLs, titles, playlists, history, filters, language, and settings remain in the browser's local extension storage. The extension contains no analytics, advertising, telemetry, location request, cloud synchronization, or external catalog server.

The extension does not bypass DRM and does not modify Disney+ account settings.

## Development status

The Chromium release is the current priority. Firefox and Safari packages will be published only after browser-specific player integration, background behavior, storage, and packaging have been tested. Until then, they remain explicitly marked as work in progress.
