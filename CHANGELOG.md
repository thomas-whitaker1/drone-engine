# Changelog

## 1.0.0 (2026-11-15)

Initial public release.

- Eleven synthesised sources: GUITAR WALL, BASS, CHAINSAW, SAXOPHONE and THROAT
  drone; SLOW HIT, CYMBAL SWELL, THE VOICE, MARACAS, COW and LASER CANNON strike
  against a shared heartbeat. Each has HOW LOUD and one control of its own;
  strikes add HOW OFTEN.
- THE CHAIN: seven boxes (GRIT, MURK, WOBBLE, CAVERN, DOPPLER, MAGNETS, OFFSET)
  patched by dragging a cable from any OUT socket to any IN. Boxes feed boxes;
  loops are refused. Click a cable to pull it.
- Four controls for the whole board: SERIOUSNESS (pitch down, room longer),
  TUNING (six roots, named by feel), PACE (the heartbeat, 36 to 72 a minute) and
  MEGADRIFT (how much the board wanders off on its own).
- SMASH IT, a drop hammer that re-rolls every setting and the patch. It is the
  only thing on the board that is random.
- COME APART, a guarded button that arms the heavier effects: torn slices, a
  colour split, a rolling band, a melt and a strobe held to three flashes a
  second.
- STILLNESS stops all motion and keeps every effect. The board opens stilled
  when the system asks for reduced motion.
- The board weathers as it runs and wears where it is touched, and remembers
  both between visits. SCRUB THE ALTAR resets it.
- It opens on a lever, WAKE IT, with a line saying it starts loud and flashes,
  and brings the sound up over four seconds. A narrow screen is told the board
  will be too small to use.
- Motion runs on a clock, so the room breathes and settles at the same pace on a
  30Hz, 60Hz or 144Hz display.
- No samples, no runtime dependencies, and no request off the page's own
  origin. The build is one page and one script (about 58 kB gzipped) with
  relative addresses, four typefaces, and the licences of all of it.
- A suite of 1,363 tests, one of which renders the real engine in a real
  headless browser, and `tools/perf` for timing the board in one.
