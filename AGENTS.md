# SKY_MUSIC contributor instructions

- Active source in this repository is `studio/`; the public Pages entry is the generated root `index.html`.
- Read `studio/docs/PLAYER_TEMPLATE.md` before changing the player. Preserve the user-selected v7 typography, material treatment, 4x8 score, clear current-beat highlight, pause-and-seek navigation and shared theme behavior.
- Edit `studio/src/`, `studio/app/index.html` and `studio/app/styles.css`; run `python -X utf8 scripts/build.py` from `studio/`, then copy `SkyMusicStudio_Standalone.html` to root `index.html`.
- All themes share one player shell and editor. Use `38-player-template.js` color tokens and portable `theme.appearance`; do not duplicate entire player pages for themes.
- Keep read-only startup, explicit editing, isolated working copy and save/direct/save-as behavior. Preserve storage keys and existing Canon events unless requested otherwise.
- Run static/data checks, Node syntax and `tests/v04-interactions.cjs`; visual/theme changes also need `tests/legacy_layout.py` and `tests/player_template.py` with new output directories. Browser tests need Playwright and Edge; preserve imported historical screenshots.
- Preserve legacy backups, licenses and unrelated files. No force pushes. Track Pages publishing and verify the live page after authorized publication.
