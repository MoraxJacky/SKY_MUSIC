# Added instrument samples and attribution

FluidR3 GM SoundFont: Frank Wen and contributors. MP3 rendering and web distribution: Benjamin Gleitzman, MIDI.js Soundfonts.

- Source: https://github.com/gleitz/midi-js-soundfonts
- Pinned revision: `044fab8e1456bfafc5776e86dfd6bb8697149aef`.
- Rendered FluidR3 GM samples are distributed as CC BY 3.0 US according to the upstream README: https://github.com/gleitz/midi-js-soundfonts/blob/044fab8e1456bfafc5776e86dfd6bb8697149aef/README.md
- License and terms: https://creativecommons.org/licenses/by/3.0/us/ and https://creativecommons.org/licenses/by/3.0/us/legalcode
- Packaging software notice is preserved in `MIDI-JS-SOUNDFONTS-MIT.txt`; it does not replace the sample license.
- Offline subsets: orchestral harp, music box, flute and nylon acoustic guitar. C4 through B6 (MIDI 60–95), 36 notes each.
- Changes: selected notes extracted from the upstream data-URI map and embedded for offline playback. Audio bytes are unchanged. Sample names, source hashes and per-file hashes are recorded in `sources/instruments-manifest.json`.
- Online subsets: electric piano 1, violin, cello, string ensemble 1 and choir aahs, from the same pinned source and under the same attribution terms.

Existing online Yamaha C5 / Salamander Grand Piano samples: Alexander Holm, CC BY 3.0, https://creativecommons.org/licenses/by/3.0/ . Upstream description and credit are preserved in `Salamander-README.txt`; source: https://github.com/Tonejs/audio/tree/master/salamander . Samples are streamed, not included in this new offline subset.

The pre-existing TimGM6mb piano and its original `GPL-2.0.txt` remain unchanged. The new instruments are general musical instrument samples; they are not recordings extracted from Sky. The “Sky original” option describes the normal piano pitch baseline, not a claim that these sounds are official Sky audio.
