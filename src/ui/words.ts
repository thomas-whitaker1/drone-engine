// Every word the board says, and the only place any of them is written down.
//
// The brief treats the interface's language as a design decision with the same
// weight as the layout — *"Plain language everywhere. Never use audio jargon.
// Use the vocabulary below"* — and then gives a table of exact strings. A rule
// like that cannot be kept by a codebase that spells its copy wherever the copy
// happens to be needed: a new control gets its language chosen by whatever
// literal is nearest in the file, which is how a board grows a *cutoff* knob.
// So the vocabulary is a module, and the components read from it.
//
// This completes the split the rest of src/ui already runs on. **src/tokens
// owns appearance** — every colour, gradient and texture. **./constants owns
// geometry and interaction** — the sizes a thing is cut to and how it answers a
// hand. **This file owns language**, and nothing else here has an opinion about
// any of the three.
//
// Three consequences worth stating, because they are the reasons rather than
// the tidiness:
//
// - **The absence is the rule, and it is typed.** HOW LOUD and HOW OFTEN
//   explain themselves and are the two rows the brief's table marks "—". A
//   {@link Word} without a `tip` is that decision, stated once where the words
//   are, rather than a silent gap in a lookup map somewhere else.
// - **{@link TIPS} is derived, not maintained.** The tip layer looks a hovered
//   thing up by the word painted on its tape, so the table it reads is keyed by
//   `label` — but it is built from the entries below rather than typed out a
//   second time, so a word and its line cannot drift apart.
// - **The whole vocabulary is one read.** tests/words.test.ts holds every
//   string in this file to what the handoff wrote, which is only possible
//   because there is a `this file` to hold.
//
// Not an i18n layer. There is one locale, the copy is English by design, and
// nothing here is keyed by anything but what it means.

import type { SourceId } from '../engine/constants';

/**
 * One word painted on the board, and the line it says when a hand finds it.
 *
 * `tip` is absent where the control explains itself — see {@link CONTROLS}. It
 * is optional rather than nullable because the two are not the same statement:
 * a missing tip is a control that needs none, not a control whose line has yet
 * to be written.
 */
export interface Word {
  /** What is painted on the tape strip, and what the tip layer looks up by. */
  readonly label: string;
  /** The hover line, where there is one. Read after the act, never before. */
  readonly tip?: string;
}

const word = (label: string, tip?: string): Word => (tip === undefined ? { label } : { label, tip });

/**
 * Every control on the board, by the thing it sets — plus the two buttons,
 * which are not controls but are hovered like them.
 *
 * HOW LOUD and HOW OFTEN carry no tip, and that is the rule rather than an
 * oversight: they are the two rows the brief's vocabulary table leaves blank,
 * because a control whose name is already a plain-language question has nothing
 * left for a tip to add.
 */
export const CONTROLS = {
  // ----------------------------------------------------------- the three globals
  seriousness: word('SERIOUSNESS', 'How much this wants to be taken seriously'),
  tuning: word('TUNING', 'How deep the whole thing sits'),

  /**
   * The lever that lets the board move on its own (gt#43), and the fourth word the
   * handoff never wrote — see {@link POST_HANDOFF}.
   *
   * It keeps the rule every entry here keeps, and it is the one where keeping it
   * took some doing: what sits behind this control is twenty-nine sine waves on
   * mutually prime periods, and the line says *wanders off on its own* because
   * that is what a person experiences. Not *modulation*, not *LFO*, not
   * *automation* — a board that describes its own machinery is a board explaining
   * why it is interesting instead of being interesting.
   *
   * *on its own* is doing the load-bearing half of it. The whole point of the
   * feature is that this is the one thing here that happens with no hand on the
   * board, and a line that only said "how much it wanders" would read as another
   * amount somebody sets and watches sit still.
   */
  megadrift: word('MEGADRIFT', 'How much it wanders off on its own'),

  /**
   * The heartbeat, as a word (gt#45), and the fifth the handoff never wrote — see
   * {@link POST_HANDOFF}.
   *
   * **PACE rather than TEMPO**, and that is the file's whole rule applied to the
   * one control most likely to break it. Tempo is the word a musician reaches
   * for, and reaching for it here would put the first piece of audio jargon on a
   * board that has spent eleven modules and seven boxes avoiding it. *How fast
   * the whole thing moves* is what a person actually wants to know, and *moves*
   * is deliberate over *plays* or *runs* — the board's pulse is something you
   * watch as much as hear.
   *
   * The other half of the bargain is {@link PACE_WORDS}: this is the one setting
   * on the board with an obvious number behind it, and there is not a single
   * number painted anywhere here. There should not be a first one.
   */
  pace: word('PACE', 'How fast the whole thing moves'),

  // ------------------------------------------- what every module has, or nearly
  // Neither has a hover line: a control whose name is already a plain-language
  // question has nothing left for a tip to add. HOW LOUD is no longer taped
  // under its fader (gt#90) — a gauge stands there — so a hover says the name
  // itself. That is ./tips's rule about any unlettered control, not a line
  // written here.
  loud: word('HOW LOUD'),
  often: word('HOW OFTEN'),

  // ------------------------------------ the eleven characters, in build order
  crowd: word('CROWD', 'How many guitars showed up'),
  heft: word('HEFT', 'How much floor it takes up'),
  revs: word('REVS', "How hard it's being worked"),
  agony: word('AGONY', 'How badly it wants out'),
  whistle: word('WHISTLE', 'Where the overtone sits'),
  weight: word('WEIGHT', 'How much the room shakes'),
  hiss: word('HISS', 'How much air it moves'),
  mode: word('MODE', 'What the throat is doing'),
  frenzy: word('FRENZY', 'How out of hand the rattle gets'),
  despair: word('DESPAIR', 'How far the moo has fallen'),
  charge: word('CHARGE', 'How big the shot is'),

  // ------------------------------------------ the seven boxes, in chain order
  grit: word('GRIT', 'How broken the speaker is'),
  murk: word('MURK', 'How much is buried under sludge'),
  wobble: word('WOBBLE', 'How many players are slightly out of tune'),
  cavern: word('CAVERN', 'How big the room is'),

  /**
   * The three boxes gt#41 added, and three more words the handoff never wrote —
   * see {@link POST_HANDOFF}.
   *
   * Each line is the one the issue itself chose, and each keeps the rule the
   * transcribed four keep: it says what the box does to the sound and never how.
   * There is a delay line in all three of them and none of the three lines
   * contains the word *delay*, which is the whole discipline of this file working
   * on copy that was written after the brief rather than in it.
   */
  doppler: word('DOPPLER', "How fast it's going past you"),
  magnets: word('MAGNETS', 'How much something is pulling at it'),
  offset: word('OFFSET', 'How far behind it drags'),

  // ------------------------------------------------------------ the two buttons
  /**
   * The hammer in THE FOG, and the third word the handoff never wrote (gt#40) —
   * see {@link POST_HANDOFF}.
   *
   * It replaces SUMMON, which was a verdigris dome saying *"Decides everything
   * for you"* — a polite sentence for the most violent act on the board. One
   * press still re-rolls every source, every box, both globals and the whole
   * patch; nothing about what it does has changed. What changed is that the
   * object and the word now admit it.
   *
   * "Breaks everything and starts again" is plain about damage in the same way
   * COME APART is, and for the same reason: a person should be able to tell from
   * the tape. It is also the truth rather than theatre — the board this lands on
   * is not the board that was there, and nothing about it is recoverable.
   */
  smash: word('SMASH IT', 'Breaks everything and starts again'),
  /**
   * The tape in the corner. Keyed by what is painted rather than by what the
   * button is called: the reference's `HOVER` map spells it `SCRUB`, and the
   * tape reads SCRUB THE ALTAR.
   */
  scrub: word('SCRUB THE ALTAR', 'Makes it look new again'),

  /**
   * The second tape in that corner, and the only word on this board the handoff
   * never wrote (gt#33) — see {@link POST_HANDOFF}.
   *
   * Every other entry here answers a question about the sound. This one answers
   * a question about the person looking at the screen: it stops the board moving
   * and changes nothing about what comes out of the speakers. The line says
   * "moving" rather than "flashing" or "animating" for that reason — it is a
   * promise about the eyes, made in the same plain language as the rest.
   */
  stillness: word('STILLNESS', 'Stops the board moving'),

  /**
   * The third tape in that corner, and the second word the handoff never wrote
   * (gt#39) — see {@link POST_HANDOFF}.
   *
   * It is the exact inverse of the one above it, which is why the two sit
   * together: STILLNESS stops the board moving and this lets it fall apart, and
   * pressing one un-does the other. The line says what it does rather than what
   * it is made of, like every other entry here — nobody needs the words *glitch*,
   * *strobe* or *chromatic* to decide whether they want this.
   *
   * Both strings are deliberately plain about damage. A person who does not want
   * the screen to tear should be able to tell from the tape, not from pressing it.
   */
  apart: word('COME APART', 'Lets the board fall to pieces'),
} as const satisfies Record<string, Word>;

/**
 * The words that arrived after the handoff, and the whole of the exception the
 * suite makes for them.
 *
 * tests/words.test.ts quotes every string in this file back against the design
 * handoff, which is what keeps the copy from drifting toward jargon one control
 * at a time. That check can only cover words the handoff actually contains — so
 * a word added since is named here, once, rather than the check being loosened
 * for everything. The list being short and explicit is the point: adding to it
 * is a visible decision, and every other assertion in that suite still covers
 * these entries exactly as it covers the transcribed ones.
 *
 * The third entry is a different case from the first two and it is worth saying
 * so, because it is the one that could turn this list into a loophole. STILLNESS
 * and COME APART are words the handoff never had *because the things they name
 * did not exist*. SMASH IT names something the handoff did have, under a word it
 * did write — SUMMON — and gt#40 replaced it deliberately. The exemption is the
 * same and so is the bargain, but the reason to watch this one is that "the
 * handoff does not say this" must never become a way to quietly overwrite what
 * it does say. The old word is gone from the board, not hidden behind a new one.
 */
export const POST_HANDOFF: readonly string[] = [
  CONTROLS.stillness.label,
  CONTROLS.apart.label,
  CONTROLS.smash.label,
  // The three chain boxes gt#41 added. A different kind of entry from the three
  // above and worth saying so: those name *buttons* the handoff never had, while
  // these name three more of a thing it does describe — the boxes of THE CHAIN,
  // of which it drew four. So the exemption here is narrower than it looks. Each
  // of these is still held to every rule a transcribed word keeps; what it is
  // excused from is only the one check that asks the handoff a question the
  // handoff cannot answer.
  CONTROLS.doppler.label,
  CONTROLS.magnets.label,
  CONTROLS.offset.label,
  // The two character controls gt#42 added, and the same narrow kind of exemption
  // again: the handoff describes source modules and drew nine of them, so these
  // name more of a thing it does have. Both keep the rule every transcribed
  // character word keeps — they say what the module does and never how it is
  // built. There is a filter, a resonator and a delay line behind them, and
  // neither line contains any of those words.
  CONTROLS.whistle.label,
  CONTROLS.charge.label,
  // MEGADRIFT (gt#43), and a fourth kind of entry again — the narrowest one yet.
  // The three above name *buttons* the handoff never had and the five below them
  // name more of a thing it does describe. This names a **global**, of which the
  // handoff drew exactly two and considered the row closed. So it is the entry to
  // watch: a third global is a change to the handoff's own idea of what the board
  // is, not an addition inside a list it left open. It is exempt from the one
  // check that would ask the handoff a question the handoff cannot answer, and
  // from nothing else.
  CONTROLS.megadrift.label,
  // PACE (gt#45), and the same narrow kind of entry as MEGADRIFT above it — a
  // fourth global on a board the handoff drew with two. What makes it a
  // different case from that one is that the handoff *does* describe the thing
  // behind it: "default 48 BPM (make configurable 36–72)" is in the README, in
  // numbers, in a paragraph about the scheduler. What it never did was write a
  // word for it, because it never imagined the setting reaching the board. So
  // the exemption here is from the one check that would look for a label the
  // handoff had no reason to invent, and from nothing else.
  CONTROLS.pace.label,
];

// ------------------------------------------------------- what the steps are called

/** HOW OFTEN, in order. Index 0 is every beat; index 4 is one beat in sixteen. */
export const OFTEN_WORDS = ['constantly', 'often', 'now and then', 'rarely', 'almost never'] as const;

/**
 * TUNING's six positions, in order. Words rather than notes: the control says
 * how deep the whole thing sits, and a non-musician has no use for a root
 * frequency.
 */
export const TUNE_WORDS = ['LOW', 'LOWER', 'DEEP', 'SUNKEN', 'ABYSS', 'BEDROCK'] as const;

/** THE VOICE's four modes, in the order `VOICE_MODES` builds them. */
export const MODE_WORDS = ['GROWL', 'CHANT', 'SHRIEK', 'WHISPER'] as const;

/**
 * PACE's four positions, slowest first, against `TEMPOS` in ../engine/constants
 * (gt#45). The board opens on the second one, which is the reference's own 48.
 *
 * Every other stepped list here is either a range said in words — LOW through
 * BEDROCK — or a set of named things, like the four MODEs. This one is a range
 * said in *gaits*, and the four are chosen so that the ordering is legible
 * without the numbers: a funeral is slower than a dirge, a trudge is heavier
 * than a walk. Nobody has to know that the gap is twelve beats a minute, which
 * is the entire point of the control being words.
 *
 * `SLOW` was the obvious third word and is deliberately not used. The board
 * already has a SLOW HIT, and a stepped word that is also half a module name is
 * a word two different things on one screen answer to.
 */
export const PACE_WORDS = ['FUNERAL', 'DIRGE', 'TRUDGE', 'WALKING'] as const;

/**
 * The stepped words the handoff never wrote — a third register beside
 * {@link POST_HANDOFF} and {@link POST_HANDOFF_COPY}, and separate from both for
 * the same reason they are separate from each other: each list is checked by
 * assertions that only make sense for its own kind of string.
 *
 * {@link POST_HANDOFF} holds control *labels*, and its checks demand an
 * uppercase word carrying a hover line. {@link POST_HANDOFF_COPY} holds
 * *sentences*, and its checks look for them in what the board paints rather than
 * in the control table. A word on a selector's caption is neither: it has no tip
 * of its own — the control it sits under carries that — and it is a step in a
 * range rather than a thing said. Widening either list to admit one would blunt
 * exactly the check that list exists for.
 *
 * The bargain is identical, though, and it is the bargain rather than the list
 * that matters: naming a word here is a visible decision, every check that can
 * still apply to it does, and the suite fails the day the handoff turns out to
 * contain it after all. The other three stepped lists are not here and must not
 * be — HOW OFTEN, TUNING and MODE are all quoted back at the reference word for
 * word, spelling and order together.
 */
export const POST_HANDOFF_STEPS: readonly string[] = [...PACE_WORDS];

// ------------------------------------------------------------ what is painted on

/**
 * The eleven plates, across the top of each module. A plate is not a control, so
 * none of these has a tip — hovering a name says nothing, on purpose.
 */
export const SOURCE_NAMES: Readonly<Record<SourceId, string>> = {
  guitar: 'GUITAR WALL',
  bass: 'BASS',
  chainsaw: 'CHAINSAW',
  sax: 'SAXOPHONE',
  throat: 'THROAT',
  slowhit: 'SLOW HIT',
  cymbal: 'CYMBAL SWELL',
  voice: 'THE VOICE',
  maracas: 'MARACAS',
  cow: 'COW',
  laser: 'LASER CANNON',
};

// The six wells had names stencilled into them — THE FOG, THE PULSE and four
// more — and do not any more (gt#110). They named a part of the board to a person
// who had no use for the name: nothing is ever addressed by its well, no line
// refers to one, and the wells are told apart by where they are. Each keeps its
// stencilled figure, which was never a word. The code still calls a well by its
// id; that is a name for the people building the board, not for the one at it.

/**
 * Both jack captions, on a chain box. The only two words on the board that name
 * a wire.
 *
 * A source module's jack carries neither (gt#110): a module has one socket, and a
 * single socket has no direction to be told apart from. A box has two, and
 * which end is which is the whole of how a wire is run.
 */
export const JACK = { in: 'IN', out: 'OUT' } as const;

/**
 * What a jack says when a hand finds it, and the whole of how the board
 * explains patching (gt#110).
 *
 * This was painted on the plate, in two places: two lines at the far end of the
 * top row saying that sources feed the chain and a wire is dragged from OUT to
 * IN, and a line over the chain saying an unplugged thing goes straight to the
 * speakers. Both were instructions sitting on a board whose rule is that
 * meaning arrives after the act — a label is read once a hand has already
 * found the thing. So they are here, on the two things they were about, and a
 * person meets them at the moment they are useful: with the cursor on a socket.
 *
 * `out` carries the default as well as the gesture, because that is the socket
 * the default belongs to — it is what happens to this thing's sound if the
 * gesture is never made.
 */
export const JACK_TIPS = {
  out: 'Drag a wire from here to an IN. With no wire, it goes straight to the speakers',
  in: 'Drop a wire here',
} as const;

/** The one word on the wake screen, and it is an instruction rather than a label. */
export const WAKE_LABEL = 'WAKE IT';

/**
 * The line under the tape, and the only sentence on this board that is meant to
 * be read *before* the thing it describes (gt#44).
 *
 * Everywhere else, meaning arrives after the act: a one-word tape, and a plain
 * line on hover once a hand has already found the control. That rule works
 * because every other gesture here is undoable and none of them is loud. This
 * one is neither. The board boots already playing into whatever the system
 * volume happens to be, and gt#39's shelf puts a strobe on the heartbeat — so the
 * one moment that exists before any of that has to spend itself saying so.
 *
 * Three things about the wording, because each was chosen against an alternative:
 *
 * - **It names the flashing as well as the volume**, before the strobe exists.
 *   Naming only the loudness would be honest today and would need rewriting the
 *   week gt#39 lands, which is exactly when nobody would remember to.
 * - **It does not say "photosensitive epilepsy".** That is the accurate clinical
 *   phrase and it turns the screen into a liability notice, which is the one
 *   thing this screen is built not to be. Plain language about what will happen
 *   is the brief's rule and it is also the more useful sentence.
 * - **It ends in an instruction.** "turn it down first" is something a person can
 *   act on in the two seconds they have; a hazard with no action attached is
 *   just a thing to feel bad about having read.
 *
 * The other half of taking this seriously is not copy at all — `SOFT_START`
 * brings the master up from silence over four seconds, for everyone who does not
 * read this.
 */
export const WAKE_WARNING = 'it starts loud, and it flashes — turn it down first';

/**
 * A second line on the wake screen, and only on a screen too narrow to hold the
 * board (gt#37).
 *
 * The board is one fixed plate and a narrow window scales it down rather than
 * rearranging it, so on a phone it arrives at about a quarter size: every
 * control is there and none of them is big enough for a finger. There is no
 * phone layout, on purpose, and somebody about to pull the lever on one is owed
 * that before they pull it rather than after. Same register as the warning
 * above it: lower case, plain, no apology, and it says what will happen rather
 * than what to do — there is nothing to do but find a bigger screen.
 */
export const WAKE_NARROW = 'built for a big screen — it will be tiny here';

/**
 * Copy the handoff never wrote, as {@link POST_HANDOFF} is for words it never
 * painted — and kept as a second list rather than folded into that one because
 * the two are different kinds of thing.
 *
 * {@link POST_HANDOFF} holds control *labels*: the suite's exception checks walk
 * it expecting an uppercase word carrying a hover line, which is what a control
 * is. A sentence under a lever is none of those, and nor is the line a socket
 * says (gt#110) — the handoff painted its patching instructions on the plate and
 * never wrote a hover line for a jack. Widening those checks to accept either
 * would blunt the thing they exist to catch. Same discipline, though,
 * and it is the discipline rather than the list that matters: naming a string
 * here is a visible decision, every check that can still apply to it does, and
 * the suite fails if the handoff turns out to contain it after all.
 */
export const POST_HANDOFF_COPY: readonly string[] = [WAKE_WARNING, WAKE_NARROW, JACK_TIPS.out, JACK_TIPS.in];

// ---------------------------------------------------------------- the tip table

/**
 * Every tip a *word* on the board has, keyed by the word painted on the
 * control's tape strip — which is how the tip layer looks one up, and why no id
 * appears here. The two a socket says are not in it: a socket has no word, and
 * the layer knows one by what it is. See {@link JACK_TIPS}.
 *
 * Derived from {@link CONTROLS} rather than written out: this is the same table
 * said a second way, for a reader that has a painted word and wants a line. The
 * two controls with no tip are simply not in it, so a word that isn't there
 * shows nothing and there is no "no tip" case to maintain.
 */
export const TIPS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(CONTROLS)
    .filter((entry): entry is Required<Word> => entry.tip !== undefined)
    .map((entry) => [entry.label, entry.tip]),
);
