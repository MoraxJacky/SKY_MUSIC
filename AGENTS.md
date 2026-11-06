# SKY_MUSIC contributor instructions

- Active source in this repository is `studio/`; the public Pages entry is the generated root `index.html`.
- Read `studio/docs/PLAYER_TEMPLATE.md` before changing the player. Preserve the user-selected v7 typography, material treatment, 4x8 score, clear current-beat highlight, pause-and-seek navigation and shared theme behavior.
- Edit `studio/src/`, `studio/app/index.html` and `studio/app/styles.css`; run `python -X utf8 scripts/build.py` from `studio/`, then copy `SkyMusicStudio_Standalone.html` to root `index.html`.
- All themes share one player shell and editor. Use `38-player-template.js` color tokens and portable `theme.appearance`; do not duplicate entire player pages for themes.
- Keep read-only startup, explicit editing, isolated working copy and save/direct/save-as behavior. Preserve storage keys and existing Canon events unless requested otherwise.
- Run static/data checks, Node syntax and `tests/v04-interactions.cjs`; visual/theme changes also need `tests/legacy_layout.py` and `tests/player_template.py` with new output directories. Browser tests need Playwright and Edge; preserve imported historical screenshots.
- Preserve legacy backups, licenses and unrelated files. No force pushes. Track Pages publishing and verify the live page after authorized publication.

- Instrument catalogue/loading lives in `studio/src/18-instruments.js`; shared smooth wheel and picker behavior lives in `studio/src/39-player-interactions.js`. Read `studio/docs/INSTRUMENTS_AND_SKY.md`; preserve sample attribution. Build embeds `instrument-samples.js` but does not regenerate it. After sample changes run `scripts/fetch_instruments.py --verify`; audio changes need `tests/instruments.py --online --output <new directory>` (real network), and picker changes need `tests/range_picker.py`. Sky original is the ordinary piano C4-C6 baseline, not a universal seasonal/instrument tuning.

- Score data, player behavior settings and themes have independent authoritative sources in `studio/config/`; read its README. Build regenerates `studio-config.js`, `builtins.js` and `player-styles.css`. Use `scripts/configuration.py --check` and `tests/config_separation.py --output <new directory>`. Preserve theme CSS slots in base `app/styles.css`; edit preset-specific styles in `config/themes/style-rules.json`. Never duplicate per-song/per-theme interaction handlers.
