<div align="center">

<img src="./resources/icon.png" width="128" alt="Hydra Launcher icon"/>

<h1>Hydra Launcher for macOS</h1>

<p><strong>Play your game library on a Mac — including Windows games, with Wine set up for you.</strong></p>

[![Latest release](https://img.shields.io/github/v/release/SergNik38/hydra?label=release)](https://github.com/SergNik38/hydra/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/SergNik38/hydra/total)](https://github.com/SergNik38/hydra/releases)
[![macOS](https://img.shields.io/badge/macOS-Intel%20%7C%20Apple%20Silicon-black?logo=apple)](https://github.com/SergNik38/hydra/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**[⬇️ Download for macOS (Intel & Apple Silicon)](https://github.com/SergNik38/hydra/releases/latest)**

![Hydra Launcher](./docs/screenshot.png)

</div>

## About

This is an unofficial macOS port of [Hydra Launcher](https://github.com/hydralauncher/hydra), the open-source gaming platform built with Electron, React, TypeScript and Rust. It brings the full launcher to the Mac and adds what macOS needs to run Windows games — no manual Wine, CrossOver or bottle setup required.

## Features

- **Windows games on macOS** — Hydra downloads and manages its own Wine runtime (Wine Staging) on the first Windows game launch and creates a separate Wine prefix for every game.
- **One-click launch and stop** — Windows games are detected while running, playtime is tracked, and the Stop button closes the game and its Wine processes.
- **Installers just work** — `setup.exe` installers run through the same Wine, and the installed game is found inside its prefix automatically.
- **Native Mac games** — launch `.app` bundles and track them like any other game.
- **Full Hydra experience** — catalogue, profile and friends, achievements, downloads (direct links, debrid services, torrents) with automatic extraction and executable detection.
- **Cloud saves inside Wine prefixes** — save files of Windows games are found where Wine keeps them.
- **Desktop shortcuts** — launch any game straight from the Desktop.
- **Update notifications** — the app tells you when a new macOS release is out.

## Installation

1. Download the latest `.dmg` from [Releases](https://github.com/SergNik38/hydra/releases/latest).
2. Open it and drag **Hydra** to **Applications**.
3. The app is not notarized by Apple, so macOS blocks the first launch. Open **System Settings → Privacy & Security** and click **Open Anyway**, or run:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Hydra.app
   ```

The first Windows game you start downloads the Wine runtime (~190 MB) once.

## Requirements

- macOS on an Intel or Apple Silicon Mac. On Apple Silicon, Windows games run through Rosetta 2 (macOS offers to install it on the first Windows game launch).
- Internet connection for the catalogue, sign-in and the one-time Wine download.

## Status and known limitations

| Area | Status |
|---|---|
| Intel Macs | ✅ Released |
| Apple Silicon | ✅ Released |
| Windows games via Wine | ✅ Launch, tracking, stop, installers |
| Cloud saves in Wine prefixes | ✅ |
| Epic Games Store integration | ❌ Not supported on macOS yet |
| Code signing / notarization | ❌ Not yet (see Installation) |
| Automatic update install | ❌ You get a notification; install the new `.dmg` manually |

Game compatibility depends on Wine: many Windows games run, but games with kernel-level anti-cheat do not. Reports of what works are very welcome.

## FAQ

**Is this the official Hydra app?**
No. It is a community fork focused on macOS. The original project lives at [hydralauncher/hydra](https://github.com/hydralauncher/hydra).

**Do I need to install Wine, CrossOver or Whisky?**
No. Hydra downloads and manages its own Wine build.

**Where does Hydra keep Wine and game prefixes?**
In `~/Library/Application Support/hydralauncher/` (`wine-runtime` and `wine-prefixes`). You can change the prefix location in Settings → Compatibility.

**Why does macOS say the app can't be checked for malware?**
The app is signed ad hoc, not with a paid Apple Developer ID. Use **Open Anyway** once, as described above.

## Building from source

Requirements: Node.js, Yarn, Rust (`rustup`), Xcode Command Line Tools.

```bash
git clone https://github.com/SergNik38/hydra.git
cd hydra
yarn install                       # also builds the native addon for your Mac
cp .env.example .env               # fill in the API settings
yarn dev                           # run in development mode
```

Release build (both architectures):

```bash
HYDRA_NATIVE_ARCH=x64   yarn build:native
HYDRA_NATIVE_ARCH=arm64 yarn build:native
yarn build:mac-release 4.4.1001    # writes the .dmg files and latest-mac.yml to dist/
```

## Contributing

Issues and pull requests are welcome, especially game compatibility reports. When reporting a game problem, please include the game, the macOS version, your Mac's chip and the Hydra log from `~/Library/Application Support/hydralauncher/logs/`.

## Credits

Hydra Launcher is created by [Los Broxas](https://github.com/hydralauncher) and the [Hydra contributors](https://github.com/hydralauncher/hydra/graphs/contributors). The macOS Wine runtime is based on [Gcenx's macOS Wine builds](https://github.com/Gcenx/macOS_Wine_builds).

## License

[MIT](./LICENSE) — Copyright (c) 2024 Los Broxas. macOS port changes are released under the same license.
