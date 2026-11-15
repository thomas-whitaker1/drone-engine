// The board's whole vocabulary. Copy is a design decision here rather than a
// detail — the brief says *"Plain language everywhere. Never use audio jargon.
// Use the vocabulary below"* and then gives the exact strings — so this suite
// treats it the way the others treat the geometry: every word is quoted back
// against the handoff it was written in, and a line that drifts toward jargon
// fails here rather than surviving until someone reads the board.
//
// Two of these tests are about the *file* rather than about any string in it,
// and they are the ones that keep gt#26 from quietly undoing itself:
//
// - **Nothing painted is written anywhere else.** The last test scans the whole
//   of src for a quoted copy of any word in the vocabulary. One hit outside
//   src/ui/words.ts and the consolidation has begun coming apart.
// - **The absence is checked as hard as the presence.** HOW LOUD and HOW OFTEN
//   are the two rows the brief's table marks "—", and that they have no tip is
//   asserted against the table itself, not merely observed.
//
// A third thing became true with gt#33, and it is the one that had to be thought
// about rather than transcribed. Quoting every word back against the handoff can
// only ever cover words the handoff *has*, and the board has now grown one it
// never had: STILLNESS is not a control the design bundle describes, because it
// is not about the sound at all. The exception is not made by loosening the
// checks — that would let the next drifted line through with it — but by naming
// the word, once, in `POST_HANDOFF`. Every check below that can still apply to
// it does, and the two that structurally cannot say so out loud.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTROLS,
  JACK,
  JACK_TIPS,
  MODE_WORDS,
  MODIFIER_DEFS,
  OFTEN_WORDS,
  PACE_WORDS,
  POST_HANDOFF,
  POST_HANDOFF_COPY,
  POST_HANDOFF_STEPS,
  SOURCE_DEFS,
  SOURCE_NAMES,
  sourceDefs,
  TIPS,
  TUNE_WORDS,
  WAKE_LABEL,
  WAKE_NARROW,
  WAKE_WARNING,
} from '../src/ui';
import type { Word } from '../src/ui';
import { MODIFIER_IDS, POST_HANDOFF_SOURCES, SOURCE_IDS } from '../src/engine/constants';

const entries = Object.values(CONTROLS) as readonly Word[];

/** Everything the board paints, in one list — which is the point of the file. */
const everything: readonly string[] = [
  ...entries.map((entry) => entry.label),
  ...OFTEN_WORDS,
  ...TUNE_WORDS,
  ...MODE_WORDS,
  ...PACE_WORDS,
  ...Object.values(SOURCE_NAMES),
  ...Object.values(JACK),
  ...Object.values(JACK_TIPS),
  WAKE_LABEL,
  WAKE_WARNING,
  WAKE_NARROW,
];

/**
 * Everything painted that the handoff cannot be asked about: both word lists,
 * plus the plates of the modules it never drew (gt#42). A module name is not a
 * control label, so it cannot go in `POST_HANDOFF` — that list is checked to
 * hold only words this board paints on a *control* — but it is exempt for
 * exactly the same reason, and it is derived from `POST_HANDOFF_SOURCES` rather
 * than spelled again so the two can never disagree about which modules are new.
 */
const unwritten: readonly string[] = [
  ...POST_HANDOFF,
  ...POST_HANDOFF_COPY,
  ...POST_HANDOFF_STEPS,
  ...POST_HANDOFF_SOURCES.map((id) => SOURCE_NAMES[id]),
];

describe('the vocabulary', () => {
  it('gives every control that needs explaining a line, and no plate', () => {
    for (const def of sourceDefs()) {
      expect(def.char.tip, def.char.label).toBeDefined();
      expect(TIPS[def.char.label], def.char.label).toBe(def.char.tip);
      // A module name is not a control, so it says nothing.
      expect(TIPS[def.name]).toBeUndefined();
    }
    for (const def of Object.values(MODIFIER_DEFS)) {
      expect(TIPS[def.word.label], def.word.label).toBe(def.word.tip);
    }
    // Nor is either jack caption. A socket does say something on hover (gt#110),
    // but it says it as a socket, not by the word under it — a module's socket
    // has no word at all and says the same line.
    for (const name of Object.values(JACK)) {
      expect(TIPS[name], name).toBeUndefined();
    }
  });

  it('says how a wire is run on the sockets, in plain words and nowhere else (gt#110)', () => {
    // The handoff painted this on the plate: two lines of instruction in the
    // top row and a footnote over the chain. Both are gone, and what they said
    // is what a socket says when a hand finds it — the gesture and the default
    // on the end a wire starts from, the other half of the gesture on the end
    // it finishes at.
    expect(JACK_TIPS.out).toContain(JACK.in);
    expect(JACK_TIPS.out).toContain('speakers');
    expect(JACK_TIPS.in).toContain('wire');
    for (const line of Object.values(JACK_TIPS)) {
      // The rule every line keeps: what happens, never what it is made of.
      for (const jargon of ['patch', 'route', 'signal', 'output', 'input', 'master', 'bus']) {
        expect(line.toLowerCase(), `${line}: ${jargon}`).not.toContain(jargon);
      }
      // And not reachable by a painted word, so no tape can ever be given it.
      expect(Object.values(TIPS), line).not.toContain(line);
    }
    // The old copy is not kept as dead vocabulary.
    for (const gone of ['sources feed the chain', 'unplugged things']) {
      expect(everything.join('|'), gone).not.toContain(gone);
    }
  });

  it('leaves HOW LOUD and HOW OFTEN out, because they explain themselves', () => {
    expect(CONTROLS.loud.tip).toBeUndefined();
    expect(CONTROLS.often.tip).toBeUndefined();
    expect(TIPS[CONTROLS.loud.label]).toBeUndefined();
    expect(TIPS[CONTROLS.often.label]).toBeUndefined();
  });

  it('is the whole of what the board can say, and nothing is spelled twice', () => {
    const labels = entries.map((entry) => entry.label);
    expect(new Set(labels).size, labels.join(', ')).toBe(labels.length);

    // The four globals, HOW LOUD and HOW OFTEN, one character word per module,
    // one per box, and the four buttons — of which STILLNESS (gt#33), COME APART
    // (gt#39) and SMASH IT (gt#40) are three the handoff never wrote. gt#40 did not move
    // the count, having replaced a word rather than added one; MEGADRIFT (gt#43)
    // and PACE (gt#45) each did, and they are the only two that added a *global* —
    // a row the handoff drew twice and considered finished.
    expect(labels).toHaveLength(6 + SOURCE_IDS.length + MODIFIER_IDS.length + 4);
    expect(labels.filter((label) => !POST_HANDOFF.includes(label))).toHaveLength(
      labels.length - POST_HANDOFF.length,
    );
    expect(Object.keys(TIPS).sort()).toEqual(
      entries.filter((entry) => entry.tip !== undefined).map((entry) => entry.label).sort(),
    );
  });

  it('reaches the tip table by way of the entry, never by a second spelling', () => {
    // The table is derived, so a line cannot be changed in one place and left
    // stale in the other — there is no other place.
    for (const entry of entries) {
      if (entry.tip === undefined) expect(TIPS[entry.label], entry.label).toBeUndefined();
      else expect(TIPS[entry.label], entry.label).toBe(entry.tip);
    }
  });
});

describe('what the handoff says', () => {
  it('says every hover line the handoff wrote, word for word', () => {
    const written = Object.fromEntries(
      Object.entries(TIPS).filter(([label]) => !POST_HANDOFF.includes(label)),
    );
    expect(written).toEqual({
      SERIOUSNESS: 'How much this wants to be taken seriously',
      TUNING: 'How deep the whole thing sits',
      CROWD: 'How many guitars showed up',
      HEFT: 'How much floor it takes up',
      REVS: "How hard it's being worked",
      AGONY: 'How badly it wants out',
      WEIGHT: 'How much the room shakes',
      HISS: 'How much air it moves',
      MODE: 'What the throat is doing',
      FRENZY: 'How out of hand the rattle gets',
      DESPAIR: 'How far the moo has fallen',
      GRIT: 'How broken the speaker is',
      MURK: 'How much is buried under sludge',
      WOBBLE: 'How many players are slightly out of tune',
      CAVERN: 'How big the room is',
      'SCRUB THE ALTAR': 'Makes it look new again',
    });
  });

  it('keeps the post-handoff list to words this board really does paint', () => {
    // The exception has to stay an exception: a word that has left the board
    // must leave this list with it, or the list rots into a place where a
    // drifted line can hide. Same reasoning as the tokens suite's `departures`
    // register.
    for (const label of POST_HANDOFF) {
      expect(
        entries.some((entry) => entry.label === label),
        `${label} is not a word this board paints`,
      ).toBe(true);
    }
  });

  it('holds the post-handoff copy to the same bargain, sentences included', () => {
    // The second list earns its exemption the same way and loses it the same way.
    // What differs is only the first half: a line under the lever is painted on
    // the screen rather than on a control's tape, so it is checked against what
    // the board actually says instead of against the control table (gt#44).
    for (const line of POST_HANDOFF_COPY) {
      expect(everything, `${line} is not copy this board paints`).toContain(line);
      // The two lists stay separate on purpose — POST_HANDOFF's checks want an
      // uppercase label carrying a hover line, and none of that is true here.
      expect(POST_HANDOFF, line).not.toContain(line);
    }
  });

  it('holds the post-handoff steps to the same bargain, and to nothing looser', () => {
    // The third register (gt#45), earned and lost exactly as the other two are.
    // What differs is which half of the usual pair applies: a word on a
    // selector's caption is painted by the board but carries no tip of its own —
    // the control above it does — so it is checked against what the board says
    // rather than against the control table, and it must not turn up in either of
    // the other lists.
    for (const step of POST_HANDOFF_STEPS) {
      expect(everything, `${step} is not a word this board paints`).toContain(step);
      expect(step, step).toBe(step.toUpperCase());
      expect(POST_HANDOFF, step).not.toContain(step);
      expect(POST_HANDOFF_COPY, step).not.toContain(step);
      // And a step is not a control, so it says nothing on hover.
      expect(TIPS[step], step).toBeUndefined();
    }
    // The other three stepped lists stay out of it. All three are quoted back at
    // the reference word for word below, and a list that could be moved in here
    // to dodge that quote is the one way this register could rot.
    for (const quoted of [...OFTEN_WORDS, ...TUNE_WORDS, ...MODE_WORDS]) {
      expect(POST_HANDOFF_STEPS, quoted).not.toContain(quoted);
    }
    expect(POST_HANDOFF_STEPS).toEqual([...PACE_WORDS]);
  });

  it('warns before the lever, in plain language and without a diagnosis', () => {
    // The wake screen is the one place meaning is read before the act rather
    // than after it, and the wording is the whole of the decision: it names both
    // hazards, ends in something a person can do about them, and does not reach
    // for the clinical phrase that would turn the screen into a liability notice.
    expect(WAKE_WARNING).toBe('it starts loud, and it flashes — turn it down first');
    expect(POST_HANDOFF_COPY).toContain(WAKE_WARNING);
    for (const named of ['loud', 'flashes', 'turn it down']) {
      expect(WAKE_WARNING, named).toContain(named);
    }
    for (const jargon of ['epilep', 'photosensit', 'seizure', 'warning', 'disclaim']) {
      expect(WAKE_WARNING.toLowerCase(), jargon).not.toContain(jargon);
    }
  });

  it('tells a narrow screen what it is about to get, in the same breath as the warning', () => {
    // The second line under the lever (gt#37), and only where the board will
    // come out too small to use. It says what will happen and stops: there is
    // no phone layout to point at and nothing to apologise for.
    expect(WAKE_NARROW).toBe('built for a big screen — it will be tiny here');
    expect(POST_HANDOFF_COPY).toContain(WAKE_NARROW);
    expect(WAKE_NARROW).toBe(WAKE_NARROW.toLowerCase());
    for (const stiff of ['mobile', 'device', 'support', 'sorry', 'please', 'desktop', 'optimi']) {
      expect(WAKE_NARROW, stiff).not.toContain(stiff);
    }
  });

  it('holds the post-handoff words to every rule the transcribed ones keep', () => {
    // Not transcribable is not the same as not checked. Each of the three carries
    // a painted word and a plain-language line like every other entry, reaches the
    // tip table by derivation like every other entry, and — the rule the brief
    // actually cares about — says what it does without naming a mechanism.
    for (const label of POST_HANDOFF) {
      const entry = entries.find((item) => item.label === label);
      expect(entry?.tip, label).toBeTruthy();
      expect(TIPS[label], label).toBe(entry?.tip);
      expect(label, label).toBe(label.toUpperCase());
    }
  });

  it('cuts the seven rows of the brief’s table exactly, blanks included', () => {
    // The two blank rows are the rule stated at its source: a control whose name
    // is already a plain-language question has nothing left for a tip to add.
    // Each row is: what it really is (never said on the board), the label, the
    // hover line.
    const table: ReadonlyArray<readonly [Word, string, string | undefined]> = [
      /* Distortion drive */ [CONTROLS.grit, 'GRIT', 'How broken the speaker is'],
      /* Filter cutoff */ [CONTROLS.murk, 'MURK', 'How much is buried under sludge'],
      /* Reverb send */ [CONTROLS.cavern, 'CAVERN', 'How big the room is'],
      /* Detune / chorus */ [CONTROLS.wobble, 'WOBBLE', 'How many players are slightly out of tune'],
      /* Volume */ [CONTROLS.loud, 'HOW LOUD', undefined],
      /* Trigger rate */ [CONTROLS.often, 'HOW OFTEN', undefined],
      /* Master pitch + reverb tail */ [CONTROLS.seriousness, 'SERIOUSNESS', 'How much this wants to be taken seriously'],
    ];
    for (const [entry, label, tip] of table) {
      expect(entry.label).toBe(label);
      expect(entry.tip, label).toBe(tip);
    }
  });

  it('paints every word the handoff paints', () => {
    // IN and OUT are left out: two letters and three letters are a substring of
    // half the prose, so they are pinned against the reference markup instead —
    // see the jack quotes in the module and modifier suites.
    const painted = everything
      .filter((word) => !Object.values(JACK).includes(word as 'IN' | 'OUT'))
      .filter((word) => !unwritten.includes(word));
    expect(painted).toEqual([
      'SERIOUSNESS', 'TUNING', 'HOW LOUD', 'HOW OFTEN', 'CROWD', 'HEFT', 'REVS', 'AGONY',
      'WEIGHT', 'HISS', 'MODE', 'FRENZY', 'DESPAIR', 'GRIT', 'MURK', 'WOBBLE', 'CAVERN',
      'SCRUB THE ALTAR', 'constantly', 'often', 'now and then', 'rarely', 'almost never',
      'LOW', 'LOWER', 'DEEP', 'SUNKEN', 'ABYSS', 'BEDROCK', 'GROWL', 'CHANT', 'SHRIEK',
      'WHISPER', 'GUITAR WALL', 'BASS', 'CHAINSAW', 'SAXOPHONE', 'SLOW HIT', 'CYMBAL SWELL',
      'THE VOICE', 'MARACAS', 'COW', 'WAKE IT',
    ]);
  });

  it('still spells the stepped words and the two buttons the way the reference does', () => {
    const pins: Array<[string, unknown, unknown]> = [
      ['often words', OFTEN_WORDS, ['constantly', 'often', 'now and then', 'rarely', 'almost never']],
      ['tuning words', TUNE_WORDS, ['LOW', 'LOWER', 'DEEP', 'SUNKEN', 'ABYSS', 'BEDROCK']],
      ['mode words', MODE_WORDS, ['GROWL', 'CHANT', 'SHRIEK', 'WHISPER']],
      // SUMMON's row was here. gt#40 replaced the word along with the object, so
      // there is no longer anything on this board for the reference's `>SUMMON<`
      // to be checked against — and quoting the new word here would be asserting
      // that a handoff written before it contains it. It is in POST_HANDOFF
      // instead, where the tests above hold it to the opposite: that the handoff
      // really does *not* have it, and that it still keeps every rule the
      // transcribed words keep.
      ['scrub label', CONTROLS.scrub.label, 'SCRUB THE ALTAR'],
      // The hint and the footnote were quoted here. gt#110 took both off the
      // plate — what they said is a hover line on the sockets now — so the rows
      // are gone rather than loosened, and the new lines are in
      // POST_HANDOFF_COPY, held to the opposite: that the handoff has no such
      // hover line.
      ['wake label', WAKE_LABEL, 'WAKE IT'],
    ];
    for (const [name, actual, pinned] of pins) expect(actual, name).toEqual(pinned);
  });

  it('names every plate the way the reference does, and no well at all', () => {
    // The reference stencils a name into each of its six wells and this board
    // does not (gt#110): a stated departure, like the hammer. So there is nothing
    // here to pin for them, and the names must not survive as vocabulary —
    // THE VOICE apart, which is also a module and is painted as one.
    for (const title of ['THE FOG', 'THE PULSE', 'THE JUNK DRAWER', 'THE FOUNDATION', 'THE CHAIN']) {
      expect(everything, title).not.toContain(title);
    }
    // A plate name is a row in the reference's own module list: the nine it
    // drew. THROAT and LASER CANNON are not in it and are registered as such.
    const nine = SOURCE_IDS.filter((each) => !POST_HANDOFF_SOURCES.includes(each));
    expect(Object.fromEntries(nine.map((id) => [id, SOURCE_NAMES[id]]))).toEqual({
      guitar: 'GUITAR WALL',
      bass: 'BASS',
      chainsaw: 'CHAINSAW',
      sax: 'SAXOPHONE',
      slowhit: 'SLOW HIT',
      cymbal: 'CYMBAL SWELL',
      voice: 'THE VOICE',
      maracas: 'MARACAS',
      cow: 'COW',
    });
    expect(Object.keys(SOURCE_NAMES)).toEqual([...SOURCE_IDS]);
    for (const def of sourceDefs()) expect(def.name).toBe(SOURCE_NAMES[def.id]);
  });
});

describe('one place, and only one', () => {
  /** Every .ts file under src, by repo-relative path. */
  function sources(): Array<[string, string]> {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const walk = (dir: string, prefix: string): Array<[string, string]> =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        const name = `${prefix}${entry.name}`;
        if (entry.isDirectory()) return walk(path, `${name}/`);
        return entry.name.endsWith('.ts') ? [[name, readFileSync(path, 'utf8')] as [string, string]] : [];
      });
    return walk(root, 'src/');
  }

  it('holds every painted string, and no other file writes one down', () => {
    // The reason the file earns its place: a new control gets its language
    // chosen where all the other language is visible, rather than being nudged
    // toward jargon by whatever literal happens to be nearest. That only holds
    // while there is nowhere else to put one.
    // HOW OFTEN's five words are left out of the scan and only out of the scan:
    // they are ordinary lowercase English — 'often', 'rarely' — and collide with
    // identifiers that are not copy at all, `control('often', …)` among them. The
    // reference quote above already pins all five, spelling and order together.
    const scanned = everything.filter((word) => !OFTEN_WORDS.includes(word as never));
    const elsewhere = sources().filter(([name]) => name !== 'src/ui/words.ts');
    const strays: string[] = [];
    for (const [name, source] of elsewhere) {
      for (const painted of scanned) {
        for (const quote of ["'", '"', '`']) {
          if (source.includes(`${quote}${painted}${quote}`)) strays.push(`${name}: ${painted}`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  it('leaves ./constants holding numbers and ./tokens holding colours', () => {
    const source = new Map(sources());
    const constants = source.get('src/ui/constants.ts') ?? '';
    // The three content files split appearance, geometry and language. What is
    // asserted here is the third boundary — the other two predate this file.
    for (const gone of ['summonLabel', 'scrubLabel', 'zones:', 'inCaption', 'outCaption']) {
      expect(constants, gone).not.toContain(gone);
    }
    expect(Object.keys(SOURCE_DEFS)).toEqual([...SOURCE_IDS]);
  });
});
