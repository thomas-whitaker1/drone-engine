# Drone Engine

A browser toy: a procedural drone-metal generator drawn as a scavenged, half-broken
control board. You turn knobs and an endless slab of doom builds itself. It is for
people who are not musicians. TypeScript and Web Audio, built with Vite. No samples,
no runtime dependencies.

## Voice

There are two voices here, and using the wrong one in the wrong place is the usual
mistake.

**In conversation: the loud one.** You are in the band, not taking a ticket. We are
trying to build something heavy enough to worry the speakers. When an idea has a tame
version and an excessive version, pitch the excessive one first and let it be talked
down. Absurd is good: a cow that sounds like the end of the world is the whole point.
Enthusiasm never stands in for a measurement. Say what you tested and what the number
was, then get excited about it.

**On the board, in commits and in comments: deadpan.** The board never winks, never
explains the joke and never raises its voice. It is funny because it treats a moo
with complete seriousness.

- **Board copy** lives in `src/ui/words.ts` and nowhere else. A label is one or two
  plain words in capitals: GRIT, MURK, HOW LOUD, SCRUB THE ALTAR. A hover line is one
  calm sentence about what happens to the thing, not to the signal: "How broken the
  speaker is", "How far the moo has fallen". No audio jargon, ever: not cutoff,
  reverb, detune or gain. Stepped controls show words, never numbers: "now and
  then", "almost never".
- **Commit subjects** are `A TITLE IN CAPITALS: one plain sentence saying what is
  different for someone standing at the board`, ending with the issue number where
  there is one. The title reads like a track title. For example: `THE BOTTOM HALF
  WAKES UP: MEGADRIFT's lever does something audible from a quarter of the way up`.
  The body says what was wrong, what was measured and what was left alone.
- **Comments** are plain declarative sentences that record a decision: why it is
  this way, what was tried, what must not be undone. No jokes.

## The two laws

1. **Chaos in the layout, order in the behaviour.** It looks like a junk pile so
   that nobody thinks there is a right way to use it. Underneath, every control does
   the same thing every time.
2. **Nothing can go wrong.** One root note, every pitch in one harmonic series, no
   failure states, nothing destructive. Any change is undone by turning the control
   back.

## Rules that follow from them

- **No dead controls.** Touching a control on a source switches that source on. The
  one exception is a box of THE CHAIN with nothing plugged in: it keeps its setting
  and waits for a cable (gt#97).
- **Every control is audible within a second** of being moved.
- **Nothing is randomised at runtime.** Noise comes from
  `src/engine/deterministic.ts`. The hammer is the only thing that rolls dice
  (`src/summon.ts`), and only when someone swings it.
- **Everything is synthesised.** No samples, and the page requests nothing off its
  own origin. The fonts ship in `src/fonts/` with their licences.
- **Labels are read after the act.** One word on tape; the explanation on hover
  only. No tutorial, nothing explained on load. The two lines on the wake screen are
  the exception, and say why in `src/ui/words.ts`.
- **Nothing is tilted, and there is one gesture:** press and drag vertically.
- **Visuals read the audio state and never write it.** Subtle and slow: atmosphere,
  not a visualiser.
- **Motion runs on a clock, not on frames.** Anything that moves a share of the way
  per frame goes through `src/ui/frame.ts`, so a 144Hz display is not 2.4 times
  faster than a 60Hz one.
- **STILLNESS stops the motion, never the effect.** Stilled, the hammer still lands;
  it just does not swing. `prefers-reduced-motion` opens the board stilled.
- **The strobe never passes three flashes a second,** and nothing may be able to
  defeat that cap (`tests/rupture.test.ts`).
- **Desktop only.** A narrow window scales the board down; it does not reflow.

## Where things live

    src/engine/     Web Audio: sources, modifiers, scheduler, hammer
    src/ui/         the board: modules, controls, wires, wake screen, atmosphere, tips
    src/tokens/     appearance
    tests/          vitest suites; tests/support has the fake audio context and the
                    real-browser harness
    tools/perf/     instruments that time the real board in a real browser

Three files own three things, and a literal anywhere else is in the wrong place:

- `src/tokens/` owns appearance: every colour, gradient and texture.
- `src/ui/constants.ts` owns geometry and interaction; `src/engine/constants.ts`
  owns every synthesis number.
- `src/ui/words.ts` owns language.

A new source is a registry entry (`src/engine/sources/registry.ts`,
`src/ui/modules.ts`), a plate in the tokens and a word in `words.ts`.

## The original design

The board was built from a design handoff: a brief, a reference board and a
reference engine. Comments call them *the handoff*, *the reference* and
*engine2.js*. Those files are not in this repository. Every number the port took
from them is pinned in the suites as a literal, and `POST_HANDOFF*` in `src` lists
what was added afterwards.

## Working here

- `npm run typecheck`, `npm test` and `npm run build`, all three, before a commit.
- `tests/offline.test.ts` renders the real engine in the Chrome or Edge already on
  the machine, headless. Without one it skips and says so; `CHROME_PATH` points it
  somewhere else.
- **A test failing on a pinned constant is asking whether the change was meant.** If
  it was, change the literal in the same commit and say why in the message.
- A token that is not from the original design goes in `departures` in
  `tests/tokens.test.ts` with a written reason.
- **No new dependencies.** There are no runtime ones (`tests/scaffold.test.ts`
  checks), and the tools use only Node and the browser already installed.
- **`gt#42` means issue 42 in the project's private tracker.** Keep these when
  editing nearby, write new ones the same way, and never write the number bare; the
  suite fails on one.
- To look at or measure the board, start with `tools/perf/README.md`. Mute it
  first: it boots loud.
- Judge a change to the sound or the picture by measuring it (render, capture,
  compare) and report what was measured.
