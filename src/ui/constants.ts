// Every number the board's hardware is cut to, and the only place any of them is
// written down. Values are transcribed from the original design's reference
// markup, whose files are not in the repository — the suites pin each one it
// wrote, so a slipped digit fails the suite rather than the eye.
//
// The split against the other two content files is deliberate and holds for the
// rest of src/ui: **src/tokens owns appearance** — every colour, gradient, shadow
// and texture — **./words owns language**, every string the board says, and
// **this file owns geometry and interaction**, the sizes a thing is cut to and
// the numbers that decide how it answers a hand. A gradient belongs there; the
// word painted on the tape belongs there; the angle it is rotated through
// belongs here. Nothing below is a string a user reads.

// ----------------------------------------------------------------- interaction

/**
 * A drag this far, in either direction, covers a control's whole range. It is
 * the same 150px for the 42px HOW OFTEN selector and the 112px SERIOUSNESS
 * wheel: the hand learns one gesture and it fits everything on the board.
 *
 * And it is 150px of *screen*, not 150px of board — it is deliberately not
 * divided by `--fit` on a narrow window, where the board is drawn small (gt#22).
 * That follows from the same rule: the gesture is already decoupled from the
 * size of the thing it moves, so there is nothing left for the drawn scale to
 * be measured against. Scaling it would only make a small window twitchier —
 * at `--fit` 0.6 a control would go end to end in 90px of travel — and the
 * hand doing the travelling never got smaller.
 */
export const DRAG = { fullRangePx: 150 } as const;

/**
 * The wheel is the second way in, and it is throttled rather than scaled — one
 * notch per 90ms however fast the wheel spins, so a flick cannot slam a control
 * end to end. Stepped controls move exactly one position; continuous ones take
 * the raw pixel delta, which lands a typical 100px notch a tenth of the way.
 */
export const WHEEL = { throttleMs: 90, perPixel: 0.0011, step: 1 } as const;

// -------------------------------------------------------------------- rotation

/**
 * Knobs and selectors sweep the 264° an instrument knob physically can, centred
 * on twelve o'clock. The gap at the bottom is what makes a glance readable.
 */
export const KNOB_SWEEP = { start: -132, span: 264 } as const;

/** A valve wheel has no stop, so it turns nearly a full revolution instead. */
export const VALVE_SWEEP = 320;

// ------------------------------------------------------------------- fallbacks

/**
 * What a control is when its call site says nothing. Every real one on the board
 * overrides at least the width — these exist so a control is never zero-sized.
 */
export const CONTROL_SIZE = {
  width: 64,
  diameter: 50,
  faderHeight: 72,
  fontSize: 11,
} as const;

// ------------------------------------------------------------------- the kinds

/**
 * Knob. The face gradient is built at render time from the module's own colour:
 * `radial-gradient(circle at 36% 30%, face, faceDark 72%, rim 100%)` — the
 * off-centre origin is what reads as a light source above and to the left.
 *
 * The pointer bar is sized in percentages so one rule fits every diameter from
 * the 42px selectors to the 56px foundation knobs.
 */
export const KNOB = {
  /** The wear halo sits this far outside the face, all round. */
  wearInset: 6,
  faceOrigin: 'circle at 36% 30%',
  faceStop: 72,
  mark: { top: '5%', width: '8%', height: '32%', marginLeft: '-4%', radius: '40%' },
  /**
   * The grip lines round the edge of the cap (gt#93): a ring from `from` percent
   * of the radius out to the edge, feathered in over `feather`, at this
   * opacity. They are on the dial and turn with it. Faint on purpose — at rest
   * they should read as the texture of a knob's edge, and only as lines when
   * it moves.
   */
  knurl: { from: 80, feather: 4, opacity: 0.7 },
} as const;

/**
 * Fader. The cap travels `height - capHeight` so it never overhangs either end
 * of the rail, and it is positioned from the bottom — up is more, which is the
 * only orientation a volume control can have.
 */
export const FADER = {
  /** The wear bloom fills the lane, pushed this far past it on every side. */
  wearInset: 4,
  lane: 34,
  railWidth: 8,
  railRadius: 4,
  capWidth: 32,
  capHeight: 14,
  capRadius: 2,
  /** The bone line across the cap: inset from each side, this far down. */
  indexInset: 3,
  indexTop: 6,
  indexHeight: 2,
  indexOpacity: 0.75,
} as const;

/**
 * The loudness gauge (gt#90): a column of marks cut into the plate beside a
 * fader, widening as they climb. It is what says *how loud* now that the tape
 * does not.
 *
 * HOW LOUD used to be taped under every source's fader — the same two words,
 * eleven times, the most repeated string on the board by a wide margin. A
 * volume fader does not need naming so much as *orienting*: which way is more.
 * Marks that get wider toward the top say that without a word, and say it the
 * way hardware does. The word itself is still on the control as `data-label`,
 * which is what a hover reads.
 *
 * And the marks answer the fader: the ones at or under the cap are lit, the
 * ones over it are not. So the eleven gauges are also eleven level readings,
 * legible from across the board, which eleven identical tapes never were.
 *
 * - `width` is how far the widest mark reaches from the lane, `gap` the space
 *   between the lane and the marks, `min` the narrowest mark.
 * - `bar` and `block` are how thick a line and a slab are; `dotMin` and
 *   `dotMax` the smallest and largest dot.
 * - `shapes` and `counts` are what a plate's gauge is drawn from. Eleven
 *   modules, scavenged from eleven places, do not share a parts supplier —
 *   which shape, how many marks and which side of the lane are a module's own,
 *   off a seed that is its id. See `gaugeFor` in ./module.
 */
export const GAUGE = {
  width: 10,
  gap: 2,
  min: 3,
  bar: 2,
  block: 4,
  dotMin: 3,
  dotMax: 8,
  shapes: ['bars', 'blocks', 'dots', 'wedge'],
  counts: [5, 6, 7],
  sides: ['right', 'left'],
} as const;

/**
 * Selector. The disc is inset inside its own box so the tick dots have somewhere
 * to sit; one dot is drawn per step, at exactly the angle the disc points when
 * that step is chosen, so the dots are the scale rather than decoration.
 */
export const SELECTOR = {
  /**
   * Wider than a knob's, because a selector's halo has to clear the tick ring
   * outside it: the dots are the scale, and a bone glow rising through them
   * would read as a misprinted one.
   */
  wearInset: 11,
  discInset: 3,
  tickInset: 5,
  tickSize: 3,
  faceOrigin: 'circle at 40% 32%',
  faceStop: 78,
  /** The wedge is a CSS triangle: two transparent borders and a bone one. */
  wedgeHalfWidth: 5,
  wedgeHeight: 10,
  wedgeTop: 1,
} as const;

/**
 * Lever. A throw bar in a slot cut through the plate, and the one piece of board
 * hardware with a sibling the user has already pulled: {@link WAKE.handle}, at a
 * quarter the size. Cut deliberately unlike a fader — a 14px slot against the
 * fader's 8px rail, and a bar as wide as its whole lane rather than a cap inside
 * one — because the point of the kind is that it does not read as a mixer.
 *
 * The bar travels `height - barHeight`, positioned from the bottom, for the same
 * reason the fader's cap is: up is more, and it must not overhang either end.
 */
export const LEVER = {
  /** The scuff runs the length of the slot, this far past it on every side. */
  wearInset: 5,
  /** The seat, which is the bar's width — the slot is narrower and centred in it. */
  lane: 40,
  slotWidth: 14,
  slotRadius: 7,
  barWidth: 40,
  barHeight: 16,
  barRadius: 8,
  /** The ribbed grip, inset from the bar's ends so the rubber has a border. */
  grip: { insetY: 4, insetX: 9, radius: 5 },
  /**
   * A ratchet notch, drawn once per step at the height that step throws to — and
   * on a continuous lever not drawn at all. Same rule as a selector's dots: on a
   * stepped control the scale is cut into the hardware, and on one with no steps
   * there is no scale to cut.
   */
  notchInset: 1,
  notchHeight: 2,
} as const;

/**
 * Toggle bank. A row of bat handles, each one binary, reading together as a
 * stepped value — the cheapest thing on the board and the only kind whose value
 * is spelled out by its own anatomy rather than by a pointer.
 *
 * A stepped bank draws `steps - 1` handles, so all of them down and all of them
 * up are both reachable: a six-position TUNING is five bats, and the value is
 * exactly how many are up. A continuous one falls back to {@link TOGGLES.handles}
 * and rounds, which keeps one formula for both.
 */
export const TOGGLES = {
  /** The haze gathers at the foot of the row, pushed this far past every side. */
  wearInset: 5,
  /** How many bats a continuous bank draws, having no step count to take one from. */
  handles: 4,
  /** Between one well and the next. */
  gap: 4,
  well: { width: 12, height: 22, radius: 2 },
  /**
   * The bat itself, in its well and positioned from the top — `on` is up, which
   * is the smaller number. Travels 8px, the same throw as a module's power nub at
   * two thirds the size.
   */
  bat: { width: 8, height: 10, radius: 2, left: 2, on: 2, off: 10 },
} as const;

/**
 * Valve wheel. Three spokes rather than four — at 60° increments they read as
 * six from any angle, which is what a real hand wheel looks like.
 */
export const VALVE = {
  wearInset: 8,
  rim: 10,
  spokeWidth: 7,
  /** The spokes stop short of the rim at both ends. */
  spokeInset: 8,
  spokeAngles: [0, 60, 120],
  hub: 26,
} as const;

// ---------------------------------------------------------------------- lettering

/** The tape strip under every control. Straight — nothing on this board is tilted. */
export const TAPE = {
  /** Between the control, its tape, and the word under it. */
  gap: 4,
  padX: 7,
  padY: 1,
  lineHeight: 1.35,
} as const;

/** A selector's current step, spelled out. Words only, never numbers. */
export const CAPTION = { fontSize: 10, opacity: 0.75, letterSpacing: 0.5 } as const;

// ---------------------------------------------------------------------- no power

/**
 * A plate with no power, and a box with nothing feeding it (gt#76).
 *
 * Which modules are sounding is the first thing a glance at this board should
 * answer, and the reference's whole answer is an 8px lamp, a nub eleven pixels
 * higher, and a tint behind a plate that is already brown. In a screenshot of
 * the opening board the four live plates and the seven dead ones could not be
 * told apart without hunting for the lamps.
 *
 * So what is not in use goes dark, in three pieces that are all one decision:
 *
 * - `shade` is how hard `plate.unlit` is laid over the plate — over the textures
 *   and under everything a hand uses.
 * - `name` is the alpha the painted name drops to.
 * - `controls` is a filter on what the hand turns: colder and dimmer, and never
 *   as dim as the plate under them.
 *
 * **Unpowered, never disabled.** That is the line all three numbers are held
 * to, and it is the board's first hard rule rather than a taste: no control is
 * ever dead. Touching one on an off module switches the module on. One on an
 * unfed box sets the box's amount and waits for a cable (gt#97) — it is not
 * refused, and it is not answered by the board patching something in behind
 * the hand. A greyed-out knob says *you cannot*; these have to say *nobody has
 * yet*. So nothing here reaches zero —
 * the knobs keep their shape and most of their light, the name stays legible,
 * and the plate is shaded rather than hidden.
 *
 * A source and a box read this from the same table because they are the same
 * statement — *this is not in the sound right now* — and the rack going dark
 * where the patch does not reach is the signal flow drawn for free. What each
 * one keys it off is its own: a module's power, a box's lamp.
 *
 * Nothing moves, so STILLNESS has no opinion, and the fade is a third of a
 * second — the lamp's own, so a plate goes dark with its lamp rather than after.
 */
export const UNLIT = {
  shade: 0.5,
  name: 0.45,
  // Dimmer than it was (gt#76 had .72): on a plate shaded by half, controls at
  // nearly three quarters of their light were the brightest things on a module
  // that was supposed to be off. They still sit above the plate's own share —
  // one less `shade` — which is the line that keeps them reading as something
  // to reach for rather than as part of the dark.
  controls: 'saturate(0.3) brightness(0.56)',
  // The power switch on a module that is off: taken down too, and less far. Left
  // at full light its bone nub was the brightest thing on a dark plate; but it
  // is also the one thing there that turns the plate on, so it stays the
  // brightest thing on it, by a smaller margin.
  switch: 'brightness(0.74)',
  transition: 'opacity 0.3s',
  controlsTransition: 'filter 0.3s',
} as const;

// ------------------------------------------------------------- the source plate

/**
 * One source module's plate — the shell the nine modules are all cut from.
 *
 * The padding is asymmetric on purpose: 9px at the bottom against 7px at the top,
 * because the control row ends in tape labels that need the room and the header
 * row does not.
 */
export const MODULE = {
  padding: '7px 10px 9px',

  /**
   * The ambient tint: a blurred radial glow pushed `outset` past every edge, so
   * the colour reads as bleeding into the board rather than as a halo drawn on
   * it. Off modules sit at zero and take two seconds to arrive either way.
   */
  glow: {
    outset: 26,
    origin: 'closest-side',
    stop: 72,
    blur: 10,
    opacityOn: 0.5,
    transition: 'opacity 2s',
  },

  /**
   * Four corner screws, one per corner, each inset the same from both its edges.
   * The slot is a hairline across the head — the tokens' `plate.screwSlotAngles`
   * gives each of the four a different angle, which is most of why the board
   * reads as assembled by hand rather than printed.
   */
  screw: { size: 8, inset: 4, slotInset: 1, slotTop: 3.5, slotHeight: 1 },

  /**
   * A handful of the thirty-six screws on this board carry a mark cut into the
   * head instead of a slot line (gt#36). One in five, decided per module and
   * corner off the key `screw:<id>:<corner>` — so it is the same seven or eight
   * screws every session, and a person who has used the board for a week could
   * point at them.
   *
   * `odds` is the whole of the restraint. Every screw marked would be a themed
   * board; none would be the issue not done. At an eighth of an inch across,
   * the point of the detail is that it is found rather than shown.
   */
  screwMark: { odds: 0.2, inset: 1, stroke: 0.7, alpha: 0.9, depth: 2 },

  /** Name against power cluster, with the control row below. */
  header: { gap: 8, marginBottom: 5 },

  /** The module name. Painted on: never tilted, never scaled. */
  name: { fontSize: 16, weight: 700, letterSpacing: 1.8 },

  /** Lamp beside the toggle, and the gap between the two. */
  lamp: { size: 8, gap: 6, transition: 'background 0.3s, box-shadow 0.3s' },

  /**
   * The plate taking its own hit (gt#81): a wash of the module's bloom colour,
   * screened over the plate at `peak` on a full-strength strike and let go over
   * `ms`. The bloom is light thrown *off* a plate, on a layer over the whole
   * board; until this, the plate that struck did nothing to admit it.
   *
   * Screened, so it lifts what is there rather than painting over it — the same
   * reason the room's own light is screened. `floor` is how much of the peak a
   * hit at no loudness still gets, on the bloom's own argument: a hit that can
   * be heard should be seen.
   *
   * It is a child laid over the plate and never a property *of* the plate: no
   * transform, no filter, nothing the wire layer's measurements could notice.
   */
  flash: { peak: 0.3, floor: 0.35, ms: 280 },


  /**
   * The power toggle. A nub in a well, travelling 11px — far enough that the
   * state is readable at a glance from across the board.
   */
  toggle: {
    width: 18,
    height: 28,
    radius: 3,
    nub: { width: 12, height: 11, radius: 2, left: 3, on: 3, off: 14 },
    transition: 'top 0.18s',
  },

  /** The control row: wrapping, aligned to the bottom so the tapes line up. */
  row: { gap: 10 },

  /**
   * The socket, pushed to the far end of the row by a flex spacer. It stood over
   * a caption until gt#110; a module has one socket, and one socket needs no word.
   */
  jack: { size: 22 },

  /**
   * What each of a module's three possible controls is cut to. The character
   * control is the dominant one everywhere — bigger than HOW LOUD and HOW OFTEN
   * both — and it shrinks in THE JUNK DRAWER only because four modules share
   * that corner.
   */
  // `throwHeight` is how tall the character control is when a module carries a
  // lever or a fader there instead of something round (gt#51): the knob's own
  // diameter, so a plate's control row is the same height whatever it is cut
  // from.
  char: { diameter: 56, junkDiameter: 50, throwHeight: 56, width: 70, fontSize: 12 },
  charWords: { diameter: 54, width: 78, fontSize: 12 },
  // Taller than the reference's 64 (gt#90). The fader lost its tape to a gauge
  // cut beside the lane, and the fourteen pixels the tape and its gap took went
  // to the throw instead: the column is five shorter than it was and the cap
  // travels a fifth further. The reference's numbers are quoted where the suite
  // holds this departure.
  loud: { height: 78, width: 58, fontSize: 10 },
  // And HOW OFTEN's, on the same rule: a lever there is as tall as the selector
  // is across. A toggle bank is measured out of its own handles and needs none.
  often: { diameter: 42, throwHeight: 42, width: 76, fontSize: 10 },
} as const;

// ------------------------------------------------------------------ the grime

/**
 * The grime pass (gt#118): how hard each of the last clean things is marked.
 * See ./grime for what each one is and why there is exactly one per object.
 *
 * - `spread` is how far a tile can be shifted for a seed, each way. Two
 *   numbers with no common factor, so two things do not land on the same lay
 *   unless both their shifts agree.
 * - `cap` is a knob's or a selector's dial: the scratch tile laid small, so a
 *   cap fifty pixels across has several marks on it and not one.
 * - `name` is a name stencilled on a plate, scratched no harder than the
 *   plate is; `wake` the wake lever's plate.
 * - `wheel` is rust on a valve wheel's rim: laid small for the reason the
 *   guarded button's is, and feathered in by `feather` percent of the radius.
 * - `bezel` is the ring of dirt round a lamp, in pixels.
 */
export const GRIME = {
  spread: { x: 97, y: 89 },
  cap: { size: 96, opacity: 0.6 },
  name: { size: 150, opacity: 0.55 },
  wake: { size: 190, opacity: 0.4 },
  wheel: { size: 150, opacity: 0.9, feather: 5 },
  bezel: 1,
} as const;

// ------------------------------------------------------------------ the hammer

/**
 * SMASH IT (gt#40) — the hammer that replaced SUMMON's verdigris dome, and the
 * only thing on this board that is *swung* rather than turned, dragged or
 * pressed.
 *
 * It lives up here rather than inline in {@link BOARD.fog} because it is the
 * first entry in that table that is not purely a size. A knob's diameter says
 * how big to cut it and nothing else; these numbers decide what a gesture *is* —
 * how long the fall takes, when the state lands, how long the room stays lit. It
 * is still reached through `BOARD.fog.smash`, because that is where the object
 * sits.
 *
 * Four of them are decisions rather than dimensions:
 *
 * - **`swingMs` is when the new board arrives**, not merely when the animation
 *   passes a point. The whole of gt#40's argument is that a re-roll which lands
 *   *before* the hammer does is a dome wearing a different hat — so ./board
 *   holds the callback back to this exact moment and the seam applies it there.
 *   Short enough that nobody waits for it, long enough to be a fall.
 * - **`recoverMs` is much longer than `swingMs`**, which is the whole shape of a
 *   blow: a hammer drops under gravity and is hauled back up. Equal times
 *   would read as a wiper blade.
 * - **`lift` is the fall and `bite` goes past the plate.** A hammer that stops
 *   exactly at the anvil looks placed on it; a pixel past is what makes it
 *   look like it arrived with weight behind it.
 * - **`dents` is a fixed table, like the shake's jitter and for the same
 *   reason.** `Math.random` is reached for in exactly one file in this product
 *   and it is not this one — so where the marks land is written down, quotable
 *   by a suite, and identical on every board with the same count on it. The
 *   offsets are unit fractions of the anvil, scaled at draw time.
 */
export const SMASH_VAR = '--smash';

/**
 * The custom property a control's moving piece takes its travel time from (gt#80).
 *
 * It is unset almost always, and unset means `0s`: a knob follows the hand that
 * is turning it with nothing in between, exactly as it did before this existed.
 * The board writes it on the plate for {@link SMASH.travelMs} after a blow and
 * takes it off again, and every control under the plate inherits it — one write
 * for thirty moving parts, and none of them knows a hammer exists.
 *
 * A window rather than a setting, and that is the whole of why it is safe.
 * MEGADRIFT redraws the board ten times a second; a transition left on would
 * smear every tick into the next. A transition that has already started keeps
 * running when its duration is taken away, so the travel finishes cleanly and
 * everything after it is immediate again.
 */
export const TRAVEL_VAR = '--travel';

/**
 * How each kind of moving piece gets there. A turned thing overshoots a little
 * and comes back, because a knob that has been knocked has a weight on a shaft;
 * a slid thing does not, because the end of its rail is the end of its rail.
 */
export const TRAVEL = {
  turn: 'cubic-bezier(0.2,0.9,0.3,1.18)',
  slide: 'cubic-bezier(0.2,0.8,0.3,1)',
} as const;

export const SMASH = {
  /**
   * The box the hammer stands in. Its height is not written here: it is the
   * anvil on its bed, the ram's fall and what shows of the ram before it
   * falls, and ./board adds them up rather than restating the sum.
   */
  rigWidth: 140,

  /**
   * The hammer, and since gt#115 it is a forging drop hammer: the kind that is
   * the size of a small building and can bend just about anything.
   *
   * It was a helve hammer (gt#111) — a beam on a pivot post with a block on the
   * end — and before that a wooden mallet. Thomas: "a giant steel hammer
   * coming down from above." A thing that fits inside the row it stands in
   * cannot be giant, whatever it is drawn as. So this one does not fit:
   *
   * - Two `column`s stand on the bed and run up *out of the top of the row* —
   *   `overhead` past the rig, to the lip of the well — so what is seen is
   *   the bottom of a frame, not a frame.
   * - The `ram` between them is taller than the whole row. At rest only its
   *   foot shows, `rest` pixels of it, hanging from above. On a press it
   *   comes down `lift` pixels onto the anvil, and what follows the foot into
   *   view is more ram: rivets, a bolted panel, and no top.
   * - Under it the `anvil`, the struck plate with the dents in it, on a sow
   *   `block` painted with the hazard stripe, on the `foot` — the bed.
   *
   * `bite` is how far past the plate the face goes at contact, so it is seen
   * to hit rather than stop.
   *
   * The ram's parts are placed from its *bottom*, which is the end anyone
   * sees: `die` is the polished face that does the hitting, narrower than the
   * body; `chamfer` cuts the body's two bottom corners; `rows` are the lines
   * of rivets, `stripe` the hazard paint, `panel` the bolted plate.
   */
  overhead: 10,
  rest: 31,
  lift: 50,
  bite: 1,
  foot: { height: 8 },
  block: { width: 100, height: 10 },
  anvil: { width: 104, height: 14, radius: 2 },
  column: { width: 13, inset: 4, rivetPitch: 15, shoe: { width: 21, height: 5 } },
  ram: {
    width: 100,
    height: 124,
    chamfer: 8,
    die: { width: 84, height: 11 },
    rows: { height: 6, pitch: 13, inset: 8, up: [6, 31] },
    stripe: { up: 18, height: 8, chips: '-22px -61px' },
    panel: { up: 41, inset: 12, height: 36, bolt: 5, boltInset: 4 },
  },
  /** Where the chipped-paint mask is laid on the sow block's stripe. */
  blockChips: '-3px -37px',

  /** The tape strip under it, cut like the dome's was. */
  gap: 5,
  fontSize: 12,
  padding: '1px 8px',

  /**
   * The fall, and the lift back. The fall is gravity's and is as short as it
   * ever was; the lift is a machine hauling several tons back up its columns,
   * and takes nearly four times as long.
   */
  swingMs: 170,
  recoverMs: 620,

  /**
   * The flare along the struck line at contact (gt#115): how far past each end
   * of the die it reaches, how tall it is, and how long it takes to go out.
   * Small and short on purpose — it is a line of light the width of the
   * hammer for a seventh of a second, not a flash of the screen.
   */
  flare: { over: 26, height: 26, ms: 150 },

  /**
   * The jolt (gt#115): what the *whole plate* does when the hammer lands.
   *
   * Thomas: "the whole screen shakes in addition to the other existing
   * effects." Until this, the room behind the plate jolted and the plate did
   * not — deliberately, see ./atmosphere — because the wire layer captures
   * the plate's rect at the start of a drag and a plate that moves under a
   * drag puts the cable off the cursor. That reason still holds for the
   * room's shake, which runs whenever the board is loud. It does not hold
   * for this, and ./board says why at the place it guards it: a blow is one
   * click, the jolt is over in a quarter of a second, it is stopped dead the
   * moment a socket is pressed and never started while a cable is in a hand.
   *
   * `path` is where the plate is put at each step, in pixels, and `stepMs`
   * how long it stays there: down first, because that is the way it was hit,
   * then back and forth and dying away. A fixed table for the reason the
   * dents are one. No transition between the steps — a jolt is not smooth.
   */
  quake: {
    stepMs: 30,
    path: [
      [0, 9],
      [-5, -6],
      [4, 5],
      [-4, -3],
      [3, 3],
      [-2, -2],
      [1, 2],
      [-1, -1],
    ],
  },

  /**
   * How long the board takes to get where the blow sent it (gt#80).
   *
   * A smash used to be a cut: thirty-odd values and the whole patch somewhere
   * else between two frames, as though the page had reloaded. For this long
   * after contact every control *travels* to its new position instead — knobs
   * turn, faders slide, levers throw — and the cables come back in over the
   * same stretch. See {@link TRAVEL}.
   *
   * Long enough to see that something knocked them, short enough that the hand
   * reaching for a knob afterwards finds it already still. And it is only the
   * drawing: the new board is *heard* from the frame of the hit.
   */
  travelMs: 380,

  /** How long the lamps stay overdriven, and how far. `--smash` is a multiplier. */
  flashMs: 130,
  flash: 2.2,

  /**
   * The shockwave (gt#92): what the *board* shows of a blow, as opposed to the
   * room behind it.
   *
   * A ring leaves the anvil and crosses the whole window, and each plate
   * flashes as the front reaches it — nearest first, hardest nearest. The plate
   * itself is not moved and cannot be (the wire layer measures every jack
   * against it), so this is how a board that is bolted down shows it was hit:
   * the blow is seen to *travel* across it.
   *
   * - `ms` is how long the front takes to reach the farthest corner of the
   *   window, at a constant speed. A wave does not slow down, and a constant
   *   speed is also what lets a plate's flash be timed off its distance alone.
   * - `width` and `alpha` are the ring's line, in the drum's own bloom colour.
   *   `from` is the scale it starts at: a point, not a circle fading in.
   * - `falloff` is how much of a plate's flash is lost by the far corner — the
   *   plate under the anvil takes all of it, the farthest takes four tenths.
   * - `cap` is how many rings may be in flight. The hammer can land six times
   *   a second, and six rings a second is a pattern rather than six blows.
   * - `minGapMs` is the least time between two runs of plate flashes, and it is
   *   a safety number rather than a taste one: eleven plates flashing is most
   *   of the screen, and the hammer swings faster than the three flashes a
   *   second ../ui/rupture's strobe is held under. A blow inside the gap still
   *   lands, still kicks the room and still throws a ring; it does not light
   *   the plates. See {@link RUPTURE.strobe}.
   */
  shock: { ms: 520, width: 4, alpha: 0.6, from: 0.02, slackMs: 80, falloff: 0.6, cap: 3, minGapMs: 340 },

  /**
   * The puff off the struck point: how long it lasts, and the two scales it
   * travels between. It starts *smaller* than the circle it is drawn as, which is
   * what makes it read as coming out of a point rather than fading in over one.
   */
  dustMs: 420,
  dustSize: 44,
  dustStart: 0.35,
  dustSpread: 2.4,

  /** No board carries more than this many marks. Past it, they stop reading. */
  maxDents: 12,

  /**
   * Where each lands, as a fraction of the anvil's own width and height from its
   * centre. Twelve of them, no two in the same place, scattered across both
   * halves of the plate — a column of marks down one side would read as a seam
   * rather than as somebody missing slightly differently every time.
   *
   * They are allowed to overlap, and several do. That is not a tolerance, it is
   * the point: a plate somebody has hit a dozen times is not a plate with twelve
   * tidy circles on it. The marks near the edge run off it and are clipped by the
   * anvil, which is what a chipped corner looks like.
   */
  dentSize: 11,
  dents: [
    [0.04, 0.05],
    [-0.22, -0.12],
    [0.27, -0.08],
    [-0.09, 0.18],
    [0.18, 0.22],
    [-0.34, 0.09],
    [0.37, 0.12],
    [-0.16, -0.24],
    [0.11, -0.26],
    [-0.4, -0.03],
    [0.42, -0.2],
    [-0.03, -0.05],
  ],
} as const;

// ------------------------------------------------------------------ the board

/**
 * The single screen. Everything here is fixed rather than responsive, and that
 * is the design decision the rest of the product rests on: the brief asks
 * spatial memory to do the work a menu would, so a control has to be in the same
 * place every time it is looked for. A narrow window scales the whole board down
 * — see {@link BOARD.width} — rather than rearranging it.
 */
export const BOARD = {
  /**
   * The design width. Below it the board is scaled by `--fit`, which is
   * `min(1, innerWidth / 1440)` — never above 1, because a board blown up past
   * its own resolution reads as a screenshot.
   */
  width: 1440,
  padding: '14px 16px 26px',
  /**
   * The 16 the padding above carries on each side, as a number — {@link CHAIN}
   * subtracts it from the width to know how much rack there is, and a string
   * cannot be subtracted. Asserted against the padding by the suite, so the two
   * cannot drift apart.
   */
  padX: 16,

  /**
   * There is no `height` here, and that is a decision (gt#71, gt#62).
   *
   * There was one — 867, "measured", with a comment saying plainly that nothing
   * read it and nothing enforced it. It was written down so a change that moved
   * the board's height could be seen to have moved it, and by the time anyone
   * looked the board was 925 and the number had not noticed. A height is not
   * something this file can own the way it owns {@link BOARD.width}: the width
   * is what the board is *cut* to, and the height is whatever the lettering
   * comes to once a browser has set it.
   *
   * So the plate measures itself at runtime and is fitted to the window both
   * ways — see `measureNatural` and `fitFor` in ./board. The failure the old
   * number was standing guard over, a board that grows past the window and
   * fails by scrolling, is gone by construction rather than by assertion.
   */

  gap: 10,

  /**
   * The plate itself. Every other layer on the page is placed against this one
   * number: the atmosphere's wash sits under it, its grain, fringes and vignette
   * over it, and the cables, tips and overlay over those.
   */
  zIndex: 10,

  /**
   * Three rows: the fog across the top, the sources under it, THE CHAIN along
   * the bottom.
   *
   * This is a **stated departure from the reference** (gt#48), which lays the
   * board out as `'fog fog' 'src chain'` with the chain in a fixed 238px column
   * on the right. That column holds four boxes and has room for five; gt#41 brings
   * it to seven. The room a column has is `100vh` less the fog and the paddings,
   * which is not a number any constant here owns and not one a suite could ever
   * have quoted — so the overflow would simply have happened, silently, on a
   * board whose whole conceit is being seen at once.
   *
   * Laid along the bottom the budget becomes horizontal, against
   * {@link BOARD.width} — a number this board already declares and already
   * scales the window to. See {@link CHAIN}, where the capacity that follows
   * from it is arithmetic rather than a comment.
   *
   * The forward-only rule survives the move and reads better for it. A box is
   * cut IN-left, OUT-right; stacked, a forward wire left the right edge and came
   * back into the left edge one row down, so *forward is down* rested on the
   * stack order alone. In a rack, OUT sits beside the next box's IN and forward
   * is rightward — the jacks say the rule instead of the order implying it.
   */
  areas: "'fog' 'src' 'chain'",
  columns: 'minmax(0,1fr)',
  /**
   * Every row is as tall as what is in it, and none of them takes up slack.
   *
   * The middle row was `1fr` until gt#71, which handed any spare height to the
   * sources — and they passed it down to THE FOUNDATION, whose two plates grew
   * to fill it. On a window taller than the board, which is every large display
   * the plate does not have to be scaled down for, GUITAR WALL came out three
   * times its own height with two controls in one corner of it. Hardware is cut
   * to a size; a plate that stretches to fit the room is a web page.
   */
  rows: 'auto auto auto',
  /**
   * Where the spare height goes instead: bare plate, above and below. The plate
   * still fills the window — `min-height` sees to that — and the hardware sits
   * in the middle of it at the size it was cut to.
   */
  slack: 'center',

  /**
   * The sources, in a grid of their own. THE JUNK DRAWER spans both rows on the
   * right and is the widest column, because it holds four modules against the
   * others' two and one — and because the messiest corner should be the one the
   * eye lands in.
   */
  src: {
    areas: "'pulse voice junk' 'found found junk'",
    columns: 'minmax(0,0.85fr) minmax(0,1fr) minmax(0,1.15fr)',
    rows: 'auto auto',
    gap: 10,
    /** Which cell each well claims. THE FOUNDATION's area is spelled short. */
    area: { pulse: 'pulse', voice: 'voice', junk: 'junk', foundation: 'found' },
  },

  /**
   * A well is scored into the plate rather than laid on it, so it has no border
   * and no radius — only an inset hairline and a darker fill, both per zone in
   * the tokens.
   *
   * The top padding was 26, three times the bottom: the room a stencilled name
   * sat in. The names went (gt#110), and then the small figure that had stood
   * beside each one (gt#113), and with nothing left to stand in it the header
   * is a lip: a little deeper than the sides, which is the rivet strip's
   * height on the bolted well and a shadow line on the others.
   */
  well: { padding: '12px 8px 8px', padX: 8, gap: 9 },

  /**
   * The seal under the whole plate (gt#36): a large ring with marks inscribed
   * between its two circles, centred, and invisible on a board nobody has run
   * yet.
   *
   * `weather` is the whole of it. The layer's opacity is `--weather × weather`,
   * so a fresh board carries no seal at all and one left running for twenty
   * minutes has a faint one — which gives the weathering clock a second job for
   * free, and puts the symbology on the one timer in this product that already
   * means "this board has been used". Nothing to configure, nothing to press.
   *
   * It is the *first* layer laid on the plate, under the grain, the rust and
   * the scratches, because a mark cut into a board is under the dirt that
   * settled on it afterwards.
   *
   * Since gt#103 it is cut rather than drawn — grooves with a shadowed wall and
   * a lit one, rings scribed in passes, the whole thing worn — and it says
   * something. There is a station for every source module, carrying the figure
   * that is that module's own, and the one that glows while it sounds
   * ({@link BOARD.stations}). At the centre, `figureDepth`
   * generations of the figure that turns over it in light: the coarse arms, at
   * the angle the light rests at.
   *
   * `wear` is {@link Wear}: `tear` pushes the cut a pixel or two off true along
   * a slow `warp`, which is most of what stops a ring reading as a compass
   * circle, and `bite` eats gaps through it at the fineness of `grain`.
   */
  seal: {
    size: 760,
    depth: 2,
    figureDepth: 2,
    stroke: 1.3,
    weather: 0.5,
    wear: { warp: 0.018, tear: 3.4, grain: 0.13, bite: 0.42 },
  },

  /**
   * The custom property the seal's tile is published under (gt#105), on the
   * plate itself.
   *
   * The seal is not only on the plate any more: every module and every chain
   * box carries it too, lined up with the plate's, because a thing cut into a
   * board is cut into whatever metal is there — and a plate bolted on top is
   * metal. That is nineteen surfaces drawing one eleven-kilobyte image, and
   * nineteen copies of it in nineteen inline styles would be the stylesheet
   * the damage tiles were moved into custom properties to avoid.
   */
  sealVar: '--sealTex',

  /**
   * The emblem (gt#102): the part of the symbology that is cast on the board
   * rather than cut into it — the turning figure — in one layer over the plate
   * and everything bolted to it.
   *
   * Plain, with no blend mode (gt#108). It was screened on while the figure was
   * light. A shadow is black at part strength, which laid on plainly darkens
   * whatever is under it in proportion — that *is* a shadow, with no blend
   * needed — and the pool of light it is cast in is a pale wash at a few
   * percent, which on a plate this dark is light and on tape is nothing.
   *
   * Over the modules and under the cables, the room and the tips. A shadow
   * falls on hardware; it does not fall on the thing in front of the hardware.
   * (Three tape buttons in the bottom corner used to sit over it, at 20. They
   * are in the top row since gt#112, and are hardware like the rest of it.)
   *
   * Only the figure is in it now. The marks round the ring were here for one
   * commit and went into the metal (gt#106): see {@link BOARD.stations}.
   */
  emblem: { zIndex: 5 },

  /**
   * The stations (gt#104, gt#106): a source's mark on the seal, glowing while that
   * source is in the sound.
   *
   * They were light — a bright haloed mark laid over the hardware, on top of
   * the mark cut into the plate — and that was neither one thing nor the
   * other: drawn like an etching, placed like a projection. Thomas: "they need
   * to choose." They are etching. The turning figure is the one thing in the
   * symbology that is light; everything else is in the metal, and a lit mark
   * is its own groove with the module's colour in it.
   *
   * So a station follows every rule the seal does. It is inside the etch
   * layer of whatever metal it crosses, under that metal's dirt and under
   * every knob, tape, jack and screw on it. It is worn exactly as its cut is.
   * And it shows as much as the seal shows, which on a board nobody has run
   * is not at all — there is no groove yet to glow.
   *
   * `weight` is how much wider than the cut the glow is drawn, so it fills the
   * groove wall to wall; `halo` is the little it spills over the lip. `on` is
   * a mark whose module is in the sound, on the terms its lamp is lit on.
   * `flash` is where a strike throws it and `ms` how long it takes to come
   * back; `smash` is the whole ring on the hammer. All of these are shares of
   * the etch layer's own strength, not of full.
   *
   * It never labels. Nobody has to know which mark is which module: it lights
   * when that module sounds and jumps when it strikes, and working out which
   * is which from that is a thing for the twentieth look.
   */
  stations: {
    weight: 1.9,
    halo: { width: 2.6, alpha: 0.28 },
    on: 0.62,
    flash: 1,
    smash: 0.9,
    ms: 620,
    fade: '0.7s ease',
  },

  /**
   * The top row: the globals and the hammer, left to right. It had a name
   * stencilled at its near end and two lines of instruction at its far one, and
   * has neither since gt#110 — see `JACK_TIPS` in ./words for where the
   * instruction went.
   */
  fog: {
    padding: '10px 26px 8px',
    gap: 34,
    serious: { diameter: 112, width: 150, fontSize: 15 },
    tuning: { diameter: 70, width: 100, fontSize: 13 },
    /**
     * MEGADRIFT (gt#43): the third global, and a lever because none of the others
     * is one and the kind reads as salvage rather than as a mixer. Cut shorter
     * than SERIOUSNESS is wide so the row still leads with the wheel — this is
     * the setting that matters most when nobody is touching the board, which is
     * exactly when nobody is looking at it either. Its column is wider than
     * TUNING's only because the word on the tape is longer.
     */
    megadrift: { height: 96, width: 118, fontSize: 13, tape: 90 },
    /**
     * PACE (gt#45): cut to TUNING's dimensions exactly, because it is TUNING's
     * kind of thing — a stepped selector over a short list of words, sitting
     * next to it in the row. Two controls that take the same gesture over the
     * same shape of range and are cut to different sizes would be saying there
     * is a difference between them that there is not.
     *
     * Its column is wider than TUNING's by the length of the longest word on it,
     * and by nothing else: WALKING is a character longer than BEDROCK.
     */
    pace: { diameter: 70, width: 106, fontSize: 13 },
    /**
     * The beat lamp (gt#83): one small lamp in the corner of PACE's column that
     * fires on every beat and is dark again well before the next.
     *
     * PACE sets the tempo in words and the tempo then existed only as sound. At
     * FUNERAL a beat is 1.67 seconds, and whether the board was alive between
     * hits was a matter of faith — gt#45 asked for the slow end to "feel
     * deliberate rather than stalled", and nothing on the plate could say which
     * it was. This is the one piece of hardware on a real box that does exactly
     * that job.
     *
     * `holdMs` then `fadeMs` is the whole flash: lit hard on the beat, held for
     * a few frames so it registers as an instant rather than a glow, then let
     * go. Together they are under half the shortest beat the board can play
     * (833ms at WALKING), so the lamp is dark for longer than it is lit at every
     * tempo and a faster PACE reads as faster rather than as brighter. The suite
     * holds that, and holds the rate under the 3Hz every flashing thing on this
     * board is kept to — by a wide margin, since the fastest pulse is 1.2Hz.
     *
     * Cut to a chain box's lamp rather than a module's: it is a status light on
     * a control, not the power lamp of a voice.
     */
    beat: { size: 7, top: 1, right: 8, holdMs: 70, fadeMs: 320 },
    smash: SMASH,
    /**
     * The group at the far end of the row (gt#114): STILLNESS, the guarded
     * button over its own tape, SCRUB THE ALTAR. `gap` is between the three.
     */
    end: { gap: 8 },
    /**
     * The hammer and that group, packed against the right-hand end of the
     * row (gt#115), `gap` apart. The hammer stood after MEGADRIFT, on the
     * station at the top of the seal. Out here it is to the right of the last
     * station the row crosses and to the left of the group, and the suite
     * holds both.
     */
    tail: { gap: 14 },
  },

  /**
   * THE FOUNDATION: the wide guitar wall beside the narrower bass.
   *
   * `runZIndex` lifts the rust runs over the two plates instead of behind them.
   * Behind, the layer was 231px tall with 20 of them visible and the rest hidden
   * under GUITAR WALL and BASS — a fade with no room to land in, which is the
   * same failure that took the runs off the module plates. Over is also simply
   * what happens: rust weeping off a bolt line runs down whatever is below it,
   * and the two things below this one are screwed to the same wall.
   */
  foundation: { columns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 10, rivetHeight: 6, runZIndex: 1 },

  /**
   * THE JUNK DRAWER: two by two, and under them the one plate that lies across
   * both columns (gt#75).
   *
   * The drawer spans both source rows, so it and the two wells beside it have to
   * agree on a height, and whichever is shorter is stretched to match. With the
   * cannon on a row of its own beside an empty cell the drawer was the taller by
   * 43px, and that came out as dead floor under THE PULSE and THE VOICE and as
   * two FOUNDATION plates pulled 22px taller than they are cut. Laid across the
   * drawer it stops wrapping its own jack and loses that height, and as measured
   * the two sides now come to exactly the same 503 — which is arithmetic that
   * happens to land, not a rule anything enforces.
   *
   * So `rows` says where the difference goes on the day it stops landing: the
   * last row takes it, and the cannon's plate runs down to the drawer's floor
   * rather than leaving well with nothing standing on it. Today that is zero
   * pixels, and LASER CANNON finishes level with GUITAR WALL and BASS across
   * the divide.
   *
   * It is three rows because there are three rows, and that is a count rather
   * than a rule: a sixth and seventh module in here would want a fourth. The
   * suite ties this to the definitions, so adding them fails a test instead of
   * quietly handing the slack to the wrong row.
   */
  junk: { columns: 'repeat(2, minmax(0,1fr))', rows: 'auto auto 1fr', wide: '1 / -1', gap: 9 },

  /**
   * SCRUB THE ALTAR: a scrap of tape at the far end of the top row.
   *
   * It was tucked into the bottom-right corner of the plate with the two below
   * it, under everything, where a hand had to go looking. Thomas moved all
   * three up (gt#112). It is cut exactly as it was — the reference's own type
   * and alpha — and only where it is stuck has changed: on the row's bottom
   * line, with every other tape in the row.
   */
  // `width` since gt#114: the three tapes at the end of the row are cut to stated
  // widths rather than to their lettering, so where the group starts is
  // arithmetic the suite can hold against the seal's stations.
  scrub: { fontSize: 11, padding: '1px 8px', width: 118, opacity: 0.75 },

  /**
   * STILLNESS, the tape beside it and the only control on the board that is
   * about the user rather than about the sound.
   *
   * It is cut to SCRUB's numbers and stuck next to it, a gap away so the two
   * read as two pieces of tape rather than one strip — a control that is not
   * part of the instrument should look put on afterwards, and sitting with the
   * other button that undoes something is the closest the board has to a place
   * for it.
   *
   * The one thing it has that SCRUB does not is a held state, because it is a
   * latch: pressed, it comes up to full opacity and sinks into its own shadow.
   * SCRUB is a press and springs back; this stays down until it is pressed
   * again, and at {@link BOARD.scrub.opacity} in both states there would be
   * nothing to tell a stilled board from a moving one.
   */
  still: {
    fontSize: 11,
    padding: '1px 8px',
    width: 78,
    /** Off, then on. The gap is the whole of the readout. */
    opacity: 0.75,
    onOpacity: 1,
  },

  /**
   * COME APART (gt#39), and since gt#112 a big red button under a hinged cover,
   * standing in the top row beside the hammer.
   *
   * It was the third scrap of tape in the bottom corner, latching the way
   * STILLNESS does. It is the one control on the board that only ever makes
   * things worse, and a thing like that is not a bit of tape: it is the button
   * somebody put a guard over. Thomas: "upgraded to a big red button with a
   * cover, located on the top row next to 'smash it'."
   *
   * So it takes two acts, which is the entire point of a guard. The cover is
   * down on a board nobody has armed. Pressing it lifts it. Pressing the
   * button under it arms the board — the button goes down and lights — and
   * pressing it again lets it up. Pressing the lifted cover drops it, and
   * dropping it over an armed button lets the button up, the way a real guard
   * knocks a switch back as it closes.
   *
   * - `seat` is the plate it is bolted to; `ring` the hazard stripe round the
   *   recess, `well` the recess, `button` the dome in it. `pressed` is how far
   *   the dome shrinks when it is down.
   * - `cover` is the guard. It is the size of the seat and hinged along the
   *   seat's top edge; `openDeg` is how far round it swings — past upright, so
   *   it stands over the hinge and leans back — and `perspective` is the eye's
   *   distance, which is what makes the lifted edge the wider one. `ms` is the
   *   swing.
   * - `hinge` is the barrel's thickness, `tab` the lip a finger lifts it by.
   * - `glowMs` is the dome coming on or going out.
   *
   * How much room the lifted cover needs over the seat is not written here.
   * It is these numbers through a projection, and ./board works it out.
   *
   * It is at the far end of the row since gt#114, over the tapes: its own
   * directly under it, STILLNESS and SCRUB THE ALTAR on the same line either
   * side. Beside the hammer it stood on one of the seal's stations. `width`
   * is the column it and its tape stand in.
   *
   * And it is old (gt#114). It was drawn clean, and it is the one thing on the
   * board nobody would ever have cleaned:
   *
   * - `rust` is the board's own rust tile over the seat and the painted ring;
   *   `base` is how much a new board has and `weather` what the clock adds.
   *   `coverRust` is the same along the cover's frame, in from its edges.
   * - `chips` is where the chipped-paint mask is laid on the ring, so the
   *   stripe has bare metal showing through it.
   * - `scuff` is the board's scratches over the dome, which is plastic and
   *   marks easily; `coverScuff` the same over the cover.
   * - `cracks` is how strongly the cover's cracks are drawn.
   */
  apart: {
    gap: 5,
    width: 96,
    fontSize: 12,
    padding: '1px 0',
    seat: { size: 86, radius: 5 },
    ring: 76,
    well: 66,
    button: { size: 56, pressed: 0.93 },
    cover: { radius: 7, openDeg: 103, perspective: 420, ms: 190 },
    hinge: 8,
    tab: { width: 26, height: 7 },
    glowMs: 140,
    // Each layer is `[size, x, y]`: the tile laid at that size and shifted
    // that far. The board's rust tile is fifteen patches in 420px, cut for
    // plates half a thousand pixels wide; on a seat of 86 one lay of it puts
    // a patch on the metal or does not. Laid small and several times over it
    // is the same rust at the scale of the thing, and the shifts are chosen
    // so the patches land on the frame rather than under the dome.
    rust: {
      layers: [
        [120, -60, -10],
        [165, -20, -110],
        [215, -100, -40],
        [140, -14, -30],
      ],
      base: 0.75,
      weather: 0.25,
    },
    coverRust: {
      layers: [
        [150, -40, -90],
        [200, -120, -30],
      ],
      opacity: 0.7,
    },
    chips: { at: '-9px -14px' },
    scuff: {
      layers: [
        [110, -31, -64],
        [150, -80, -20],
      ],
      opacity: 1,
    },
    coverScuff: {
      layers: [
        [150, -70, -20],
        [105, -12, -48],
      ],
      opacity: 0.7,
    },
    cracks: { opacity: 0.95 },
  },
} as const;

// ------------------------------------------------------------- the wake screen

/**
 * The lever the page opens on. One gesture, and it exists for a technical reason
 * — a browser will not let audio start without a user gesture — which is why it
 * is the most physical thing in the product rather than a dialog with a button:
 * the constraint is spent on the first impression instead of apologised for.
 *
 * The three timings are the whole sequence and they are not independent. The
 * handle takes {@link WAKE.pull} to bottom out; the engine is built at exactly
 * that moment and the fade starts with it; `startMs + fadeMs` is `doneMs`, so
 * the overlay is removed on the frame its opacity reaches zero and never sits
 * there invisible eating clicks.
 */
export const WAKE = {
  /** The assembly: plate over tape, centred, and clickable as one piece. */
  column: { gap: 28 },

  /** The slab. Bigger than anything on the board, because it is the only thing on screen. */
  plate: { width: 210, height: 330, radius: 8 },

  /**
   * Four corner screws, a notch larger than a module's and slotless — this plate
   * is seen close up, and a hairline slot at this size reads as dirt.
   */
  screw: { size: 10, inset: 8 },

  /** The slot the handle travels in, cut down the centre between two insets. */
  slot: { width: 16, inset: 38, radius: 8 },

  /**
   * The handle, and the one number that carries the whole gesture: it starts near
   * the top of the slot and is thrown to the bottom of it.
   */
  handle: {
    width: 150,
    height: 42,
    radius: 21,
    top: 40,
    pulled: 240,
    pull: '0.3s cubic-bezier(0.5,0,0.3,1.3)',
    /** The ribbed grip, inset from the handle's ends so the rubber has a border. */
    grip: { insetY: 8, insetX: 34, radius: 12 },
  },

  /**
   * The lever as something that is pulled (gt#88), rather than a picture of one
   * that is clicked.
   *
   * - `slop` is how far a press may wander and still be a click. Under it the
   *   handle has not been taken hold of.
   * - `commit` is how far down the slot the handle has to be dragged, as a share
   *   of its throw, before it leaves the hand and drops the rest of the way
   *   under its own weight. Past half, so it is a decision; not near the bottom,
   *   so nobody has to drag the full length of the slot to wake the board.
   * - `spring` is how it goes back when it is let go short of that: quick, and
   *   past its stop before settling, the same overshoot the pull has. A lever
   *   let go half way is not an error and the board does not treat it as one.
   */
  drag: { slop: 4, commit: 0.55, spring: '0.26s cubic-bezier(0.3,1.6,0.5,1)' },

  /** The tape the one word is painted on. The word itself is in ./words. */
  tape: { fontSize: 30, padding: '4px 22px' },

  /**
   * The warning line under the tape (gt#44), cut to the board's micro-hint
   * register exactly — 10px Public Sans at the hint alpha, the same size and
   * weight as the two lines at the far end of THE FOG. Being *quiet* is the
   * point: a warning set in anything louder would read as a dialog the screen
   * spent its whole design avoiding.
   *
   * `gap` is the distance under the tape rather than a column gap, because the
   * line is not part of the assembly — see ./wake for why the thing you read is
   * deliberately not the thing you click.
   */
  warning: { fontSize: 10, tracking: 1, lineHeight: 1.5, gap: 22 },

  /**
   * The line a narrow screen gets as well (gt#37), in the warning's lettering.
   *
   * `below` is the window width under which it shows. The board is
   * {@link BOARD.width} wide and scales to fit, so under 720 it is drawn at less
   * than half size and a 22px socket is under 11: past the point where it can
   * be used with a finger, which is the thing the line is there to say. A
   * tablet held either way is wider than that and never sees it.
   *
   * It is pinned to the foot of the screen, `inset` up from the edge and in
   * from the sides, rather than laid out under the warning: it is the last
   * thing on the screen and the least important, and pinned there it cannot
   * move the lever or the warning by arriving.
   */
  narrow: { below: 720, inset: 18 },

  /** The engine is built here, and the fade begins on the same tick. */
  startMs: 300,
  fade: 'opacity 0.8s',
  fadeMs: 800,
  /** Overlay removed, board woke. `startMs + fadeMs`. */
  doneMs: 1100,
} as const;

/**
 * The board powering up (gt#88): what happens between the lever bottoming out and
 * the board being simply on.
 *
 * It used to be nothing. The overlay cross-faded away and the board was there,
 * every lamp already lit, with the sound climbing underneath for four seconds.
 * A curtain lifting off a machine that was running all along — for a toy whose
 * pitch is a scavenged machine being *woken*.
 *
 * So the board is built cold, and the modules that open on come up one at a
 * time: lamp, plate and cables, well by well in `order`, each with a flash of
 * its own plate. THE FOUNDATION first, because it is what everything else
 * stands on. A box of THE CHAIN lights when the first thing feeding it does,
 * which is the signal flow drawn for free a second time.
 *
 * - `firstMs` is how long after the lever bottoms out the first module comes
 *   up: while the overlay is still lifting, so the first thing seen through it
 *   is something switching on.
 * - `afterDoneMs` is the pause after the overlay is gone before the second.
 *   That gap is deliberate and it is not taste: the engine does the work it
 *   put off (gt#21) at the moment the overlay goes, a frame that runs long, and
 *   nothing of this sequence is in flight across it.
 * - `spanMs` is how long the rest take between them, shared out evenly, with
 *   each step held between `minStepMs` and `maxStepMs` — so four modules do not
 *   dawdle and eleven do not blur.
 * - `flash` is how hard each plate flashes as it comes up, on the 0–1 scale a
 *   strike uses.
 *
 * It is only the picture. The sound starts all at once and climbs on
 * `SOFT_START` exactly as it did; nothing here reaches the engine. A hand on
 * the board ends it at once — whatever has not come up yet comes up together —
 * and so does STILLNESS, on which it never runs at all.
 */
export const BOOT = {
  order: ['foundation', 'pulse', 'voice', 'junk'],
  firstMs: 100,
  afterDoneMs: 80,
  spanMs: 1650,
  minStepMs: 160,
  maxStepMs: 550,
  flash: 0.7,
} as const;

// ----------------------------------------------------------- the modifier box

/**
 * One box of THE CHAIN. The same plate shell as a source module turned on its
 * side: three columns, IN jack | centre | OUT jack, rather than a header over a
 * control row.
 *
 * Two differences from {@link MODULE} are worth stating, because they are what a
 * reader coming from that constant will look for and not find. A box has **no
 * screws** and **no ambient tint**: the reference lays grain and rust over it and
 * nothing else, and a box has no power of its own to glow with. Its lamp answers
 * the patch, not a switch — see ./modifier.
 */
export const BOX = {
  padding: '8px 8px',

  /**
   * The same 8 the padding above carries, and the same 1 the plate's border is,
   * as numbers — because {@link CHAIN} has to add a box up to know how many fit
   * in the rack, and a CSS string cannot be added up. Neither is a second
   * decision: the suite asserts each agrees with the thing it restates, so a
   * changed padding fails a test rather than quietly widening the capacity.
   */
  padX: 8,
  borderWidth: 1,

  /** Between the three columns. */
  gap: 7,

  /** Both jack columns. The module's socket, with a caption per end under it. */
  jack: { size: 22, gap: 2, captionSize: 8, captionTracking: 1.2 },

  /** Lamp beside the name, a pixel smaller than a module's. */
  lamp: { size: 7, gap: 6, transition: 'background 0.3s, box-shadow 0.3s' },

  /** The centre column: lamp row over the one control. */
  centre: { gap: 1 },

  /**
   * The air under the lamp row, between the box's name and its control (gt#63).
   *
   * The reference sets the two a single pixel apart, which was survivable while
   * a tape under the control gave the eye a second place to read the word: the
   * name could sit jammed against the top of a knob because nobody was reading
   * it. With the tape gone the name is the only word in the box and it has to be
   * legible, so it gets room — out of the 22px the tape gave back, which still
   * leaves the rack shorter than it was.
   */
  header: { below: 6 },

  /** The box name. A point smaller than a module's, on the same tracking. */
  name: { fontSize: 15, weight: 700, letterSpacing: 1.8 },

  /** Every box's control is cut to one width, whichever of the three kinds it is. */
  control: { width: 84, fontSize: 12 },
} as const;

// ------------------------------------------------------------------ the rack

/**
 * THE CHAIN as a whole, and the one thing on this board that knows how many of
 * something it can hold (gt#48).
 *
 * Every other well is sized by what is in it. The chain is the opposite: the
 * boxes are a list that grows — gt#41 alone takes it from four to seven — and
 * until this existed nothing anywhere knew the well had run out of room.
 * `MODIFIER_SPECS` made adding a box a compile-checked edit in six places and
 * an unchecked one here, so a seventh box would have been built, painted and
 * overflowed.
 *
 * So the capacity is arithmetic rather than a comment, in the same bargain
 * {@link RUPTURE.strobe.maxHz} makes: a number a suite divides out and fails on
 * beats a sentence that can rot. Three pieces, none of them a fresh decision:
 *
 * - **`minBoxWidth` is a box added up**, not a taste — two jacks, two column
 *   gaps, the one control, the padding and the border. It is the narrowest a
 *   box can be cut and still be a box, so it is the width capacity must be
 *   measured in.
 * - **`room` is the plate's own width** less its padding and the well's. It
 *   comes off {@link BOARD.width}, which is the whole reason the rack is along
 *   the bottom: a column's room is `100vh` less the fog, a quantity no constant
 *   here owns, and a budget nothing can quote is a budget nothing can enforce.
 * - **`capacity` is what fits**, at the well's own gap. Eight, against the
 *   seven gt#41 needs — the spare is not a target, it is the margin that says
 *   this answer was not cut to exactly the boxes that happened to be asked for.
 *
 * Boxes are laid at `flex:1` rather than at `minBoxWidth`, so seven share the
 * rack at 191px each and four share it at 340px. The minimum is the floor the
 * arithmetic stands on, not the width anything is drawn at.
 */
const BOX_WIDTH = 2 * BOX.jack.size + 2 * BOX.gap + BOX.control.width + 2 * (BOX.padX + BOX.borderWidth);
const RACK_ROOM = BOARD.width - 2 * BOARD.padX - 2 * BOARD.well.padX;

export const CHAIN = {
  /** 22 + 7 + 84 + 7 + 22, in 8px padding inside a 1px border. */
  minBoxWidth: BOX_WIDTH,
  /** Between one box and the next. The well's own gap — a rack is still a well. */
  gap: BOARD.well.gap,
  /** The plate less its side padding and the well's. */
  room: RACK_ROOM,
  /** How many boxes fit, gaps included. Seven must be at or under it. */
  capacity: Math.floor((RACK_ROOM + BOARD.well.gap) / (BOX_WIDTH + BOARD.well.gap)),
} as const;

// ---------------------------------------------------------------- the tip layer

/**
 * The floating paper tag, and the one calm legible thing on the board.
 *
 * It is measured in viewport space rather than board space, which is why none of
 * these numbers is divided by `--fit` anywhere: the tag is mounted on the page
 * shell rather than on the plate, so the zoom the board is drawn at never
 * reaches it. See ./tips.
 *
 * The two insets are the whole of the clamping. 130px from either edge is half
 * the tag's widest possible width plus a margin, so a tag under a control at the
 * far edge of the board is pushed inward rather than cut off; 70px from the
 * bottom is the room a two-line tag needs to sit above the fold.
 */
export const TIP = {
  /** Over the wire layer, under the wake overlay. */
  zIndex: 90,

  /** Below the control's own bottom edge. */
  drop: 10,

  /** Never nearer than this to the left or right edge of the window. */
  edgeInset: 130,
  /** Never lower than this above the bottom of it. */
  bottomInset: 70,

  fontSize: 13,
  lineHeight: 1.45,
  padding: '7px 12px',
  radius: 2,
  maxWidth: 240,
} as const;

// ------------------------------------------------------------- the patch cables

/**
 * The wire layer. Every number a cable is drawn and caught with.
 *
 * The sag is the whole look of it: a cable is not an arc between two jacks, it is
 * a length of cable that is longer than the distance it spans, so it hangs. A
 * fixed 34px drop plus a tenth of the horizontal run means a wire across the
 * board hangs further than one between neighbouring boxes, which is what the
 * extra cable would actually do.
 *
 * The three widths are one cable, not three: the 6px near-black is the shadow it
 * casts on the plate, the 3px is the cable, and the 1px highlight is the light
 * along its top. The fourth stroke is not drawn at all — see `hitWidth`.
 */
export const WIRE = {
  /** Over the plate and every plate on it, under the tip layer. */
  zIndex: 60,

  /** Sag `34 + 0.1 × horizontal distance`, in pixels. */
  sagBase: 34,
  sagPerPx: 0.1,

  /** Shadow, cable, highlight — painted in that order, widest first. */
  strokes: [6, 3, 1],
  /** The shadow alone is laid on at less than full opacity. */
  shadowOpacity: 0.9,

  /**
   * How wide a band a cable can be pulled by, in **screen** pixels: half of it
   * either side of the curve. A 3px cable is not something a hand can reliably
   * hit, so the reach is several times its width.
   *
   * It was the width of an invisible stroke laid over each cable until gt#72, and
   * that stroke was the problem — it took the click meant for whatever the cable
   * hung across. The number survived and the element did not: the band is
   * arithmetic now, asked only of a press on bare plate. Screen pixels rather
   * than board ones, for the reason {@link DRAG} gives: a hand is no more
   * precise on a plate that was scaled down to fit a small window.
   */
  hitWidth: 14,

  /**
   * How many straight pieces a cable is walked as when a press is measured
   * against it. The longest cable this board can hang is about 1300px with a
   * sag of about 165; at 24 pieces the pieces stray from the true curve by a
   * fraction of a pixel, against a reach of seven.
   */
  samples: 24,

  /**
   * How far a pointer may travel between going down and coming up and still be a
   * click on a cable, in screen pixels. Anything further is a drag that happened
   * to cross one.
   */
  slop: 4,

  /**
   * How long the cables take to come back after the patch has been knocked
   * loose (gt#80), in milliseconds — the board's travel time, so the cables and
   * the controls arrive together.
   */
  settleMs: 380,

  /**
   * A cable with nothing coming down it (gt#85): out of a module that is off, or
   * a box nothing live reaches. The copper drops to `core` of itself and the
   * shine along its top edge to `shine`, which is none — a dead cable is one
   * the light is not catching.
   *
   * It is the same statement gt#76 makes about a plate, said about the thing that
   * joins two of them. A patch of eight cables used to be eight identical
   * curves whether two sources were playing or eleven; now the ones carrying
   * something are the ones that can be seen at a glance.
   */
  dead: { core: 0.42, shine: 0 },

  /**
   * The pulse a strike sends down its cable (gt#85): a bright dash `dash` long and
   * `width` wide, crossing any one cable in `ms`.
   *
   * `ms` is per cable, not per pixel, so a pulse reaches every box its source
   * feeds at the same moment however far away each is — it is the hit arriving,
   * and the hit does arrive everywhere at once. Each further leg down the chain
   * takes the same again, which is slow enough to watch a hit walk GRIT to
   * CAVERN and fast enough to be over well inside a beat at any PACE: three
   * legs is under half a second against a shortest beat of 833ms.
   *
   * `cap` is the defensive number, as it is for blooms. Over it a pulse is
   * simply not drawn.
   */
  pulse: { dash: 26, width: 3, ms: 150, opacity: 0.9, cap: 14 },

  /** The wire being dragged: dashed, and the one bright thing on the board. */
  tempWidth: 3,
  tempDash: '6 5',

  /**
   * The tape wound round a cable a little way back from where it lands (gt#107),
   * and how it is shaded. How it is *wound* — how many turns, how wide, how
   * far askew, how far up the cable — is `TAPE_WRAP` in ../tokens/repairs, off
   * a seed that is the source at the other end.
   *
   * It replaced the figure gt#36 drew there, which at twelve pixels was a cross
   * beside a wire. It still does that figure's one job: two cables into the
   * same box come from different sources, so they are wound differently and
   * taped at different heights, and a hand can tell them apart without
   * reading anything.
   *
   * `edge` is the line where one turn ends on top of the next, in the tape's
   * own ink. `shine` and `shade` are what make a flat strip a thing wrapped
   * round something round: the light along its top and the dark along its
   * underside, each a stroke this far in from the edge.
   *
   * The temp wire gets none. A cable being dragged is not a cable somebody
   * has had to mend.
   */
  tape: { edge: 0.55, edgeAlpha: 0.6, shine: 1, shade: 1.3, shadeAlpha: 0.42, inset: 0.9 },
} as const;

// ------------------------------------------------------------ the visual system

/**
 * What a frame is, for everything on the board that moves a share of the way
 * per frame (gt#120). See ./frame for the arithmetic.
 *
 * Every follower and decay below was tuned by eye on a 60Hz display and written
 * as "this much per frame". Counted that way, a 144Hz monitor runs the room 2.4
 * times too fast and a device holding 30 runs it at half speed. So a frame is a
 * length of time, `ms`, and a loop that gets a longer or shorter one takes a
 * correspondingly larger or smaller share.
 *
 * - `snap`: a gap within this share of `ms` counts as exactly one frame. A 60Hz
 *   display delivers 16.6 to 16.7ms, never the same twice, and without the snap
 *   the room would be very slightly different on every frame for no reason
 *   anyone could see. With it, 60Hz is what it has always been, to the digit.
 * - `longestMs`: the longest gap one frame may stand for. A tab left in the
 *   background does not lurch on return.
 */
export const FRAME = { ms: 1000 / 60, snap: 0.05, longestMs: 50 } as const;

/**
 * The atmosphere: five fixed layers and the numbers that move them. See
 * ./atmosphere for what reads them.
 *
 * Everything here is deliberately undersized. The brief asks for atmosphere
 * rather than a music visualizer, and these are the coefficients that keep it
 * one: a 3.5% scale on a wash with no edge in view, a 28% brightness swing
 * around a base that already sits under 1, and a lerp that spends about a fifth
 * of a second catching up. Nothing here is meant to be watched directly — it is
 * meant to be noticed only when it stops.
 *
 * The two inverses are the whole idea. Brightness rises with the low band and
 * the vignette *falls* with it, so a heavy passage opens the room out and a
 * quiet one closes it back in around the board.
 */
export const ATMOSPHERE = {
  /**
   * How far the tracked low band moves toward its target each frame — a frame
   * being a sixtieth of a second, whatever the display runs at (see FRAME). The three
   * lerped variables share it, so they arrive together rather than in sequence.
   */
  lerp: 0.1,

  /** `--breathe`: scale on the wash. A hair over 1 at its loudest. */
  breathe: { base: 1, scale: 0.035, digits: 4 },
  /** `--brite`: brightness on the wash. Under 1 at rest — the room is dim. */
  brite: { base: 0.94, scale: 0.28, digits: 3 },
  /** `--vig`: vignette opacity, which *falls* as the low band rises. */
  vig: { base: 0.62, scale: -0.4, digits: 3 },

  /** `--grit`, straight off the GRIT box. Drives the grain and both edges. */
  grit: { digits: 3 },

  /**
   * `--shake`: the one thing here that is *not* undersized, and the only level at
   * which the board admits it is loud.
   *
   * Every number above is chosen to keep the room from reading as a meter. These
   * are chosen to break that at one end and only at one end:
   *
   * - **`follow` against the lerp.** The three lerped variables spend about a
   *   fifth of a second catching up, which is what makes them atmosphere. A jolt
   *   that arrived a fifth of a second after the hit would be a different effect
   *   entirely, so the shake runs its own follower at five times the rate — the
   *   band it tracks is the same reading, taken faster.
   * - **`floor` is the whole design.** Below it there is no shake at all — not a
   *   small one, none — so a board at its resting low band is exactly as still as
   *   it was before this existed. The rest of the atmosphere moves continuously
   *   because it is meant to go unnoticed; this is meant to be noticed, which
   *   means it has to be absent almost all of the time.
   * - **`maxPx` is small on purpose.** Five pixels of the room jumping is
   *   plenty at this scale, and the layers it moves are a soft gradient and a
   *   grain tile — enough to feel struck, not enough to read anything by.
   *
   * The jitter is a fixed table rather than a random draw, stepped one entry per
   * frame. Two reasons, and the second is the one that matters: a table can be
   * quoted back by a suite, and a table cannot accidentally produce the smooth
   * drift a random walk sometimes does. Unit offsets, scaled by the amplitude at
   * the time — the sequence is the shape of the shake and the amplitude is its
   * size, and keeping the two apart is what lets either be checked alone.
   */
  shake: {
    /** Toward the reading per frame (a sixtieth of a second: see FRAME). Five times the lerp above. */
    follow: 0.5,
    /**
     * How hard a hammer blow kicks the room (gt#40, gt#74, gt#92), as a share of the
     * shake's reach — and it is the one thing on the board allowed past it. A
     * hit is not the room being loud, it is the room being *struck*, and the
     * hammer is the heaviest thing that can happen to this board.
     *
     * It was exactly the reach until gt#92: the same five pixels a SLOW HIT at
     * full WEIGHT throws, for the same third of a second. Measured, it fired.
     * Watched, nobody saw it — the room moves *behind* a plate that stays bolted
     * down, and at the moment the hammer lands every knob on that plate is
     * travelling and every cable is coming back in. Five pixels of background
     * under all that is not an event. At 2.6 it is thirteen, and because the
     * kick decays by a share of itself it also lasts longer for starting higher:
     * twenty-seven frames, a little under half a second, against a drum's
     * twenty. The blow is now bigger than anything a module can do, which is
     * the sentence above and was not true while the two were the same number.
     *
     * It used to be 1.9 and a different kind of number: a value the level's own
     * fast follower was shoved to, left to decay at `follow`. That was chosen so
     * the impulse needed "no clock, no release and no second variable", and what
     * it bought was an effect with no duration — two frames over the floor, a
     * thirtieth of a second, on the one gesture in the product built around an
     * impact. See {@link ATMOSPHERE.shake.kick}, which is the second variable.
     */
    smash: 2.6,
    /**
     * The kick (gt#74): what a *hit* does to the room, as opposed to what a level
     * does to it.
     *
     * The band above cannot tell a hit from a drone, and gt#74 has the numbers:
     * after the compressor, the rise SLOW HIT causes on the low tap is between
     * .03 and .17, and the bass beating against the guitar reaches .10 with
     * nothing struck at all. So the room is *told* — by the same one-way strike
     * callback the blooms already read — and this is the envelope it is told
     * with: set to an amount on the hit, multiplied by `decay` every frame,
     * dropped to nothing under `floor`. What is drawn is the larger of the kick
     * and the band's own amount, so a hit in the middle of a loud passage still
     * shows over it.
     *
     * `decay` is the whole of the shape. At .86 a full kick is under a twentieth
     * of itself in twenty frames — a third of a second, falling by half about
     * every five frames. Long enough to be seen as the room taking a blow and
     * short enough to be over before SLOW HIT's own tail is.
     */
    kick: { decay: 0.86, floor: 0.05 },
    /**
     * Which strikes kick the room, and by how much — a share of the whole reach
     * at full loudness, as `base` plus `char` times the module's character
     * control. A module with no row here does not move the room at all, which is
     * most of them and is the point: MARACAS firing ten times in a trigger is a
     * rattle, not ten blows.
     *
     * - **SLOW HIT** is the reason this table exists. WEIGHT's hover line has
     *   always read "How much the room shakes", and until gt#74 the answer was
     *   that it did not. At no WEIGHT it is a tap; at full WEIGHT and full
     *   loudness it is the whole reach — which is as far as anything but the
     *   hammer can throw the room (gt#92).
     * - **LASER CANNON** is a shot, and past the discharge point it has a
     *   sub-octave under it. Smaller than the drum at every setting: it is the
     *   longest event on the board and must not also be the heaviest.
     */
    strikes: {
      slowhit: { base: 0.35, char: 0.65 },
      laser: { base: 0.2, char: 0.4 },
    } as Readonly<Record<string, { readonly base: number; readonly char: number }>>,
    /**
     * Below this band there is no shake at all.
     *
     * It was .55 against a reading that, as gt#70 found, never left 1 — so the
     * floor was a number nothing ever went under, and the one effect designed to
     * be absent almost all of the time was present on every frame. The reading
     * was re-cut (`LEVEL_SCALE` in ../engine/constants) and this was re-seated
     * against where the board actually lands on it:
     *
     * - a held drone reads .56 to .78 at its median, whatever is playing, and
     *   BASS on its own never gets past .80 — all of it under the floor;
     * - the opening board's heaviest moments reach .87 to .92. Fourteen seconds
     *   of its low tap replayed through this file's own arithmetic at sixty
     *   frames a second put the room over the floor on 15% of them, by three
     *   pixels at most — where the old pair had it shaking on every frame, at
     *   the full five.
     *
     * So the room trembles when the bottom of the sound surges and is otherwise
     * still, which is the sentence this variable was written to make true. It
     * is still a floor against a *size*, on a signal a compressor has flattened;
     * what the shake really wants to answer is a hit, and a reading of change
     * rather than level is the better instrument for that.
     */
    floor: 0.86,
    /** How far the room jumps at a band of 1, in pixels. */
    maxPx: 5,
    /** `--shake` is written to this many decimals. */
    digits: 2,
    /**
     * The jitter, one unit pair per frame (a sixtieth of a second: see FRAME)
     * and round again. Eight entries rather
     * than a rounder number so it never lines up with a beat, and three
     * properties that are checked rather than hoped for — each one a way the
     * table could otherwise stop reading as a room being hit:
     *
     * - **`x` flips sign every single step**, wrap included. A table that ever
     *   took two steps the same way would read as the room *sliding*.
     * - **No two consecutive entries share a quadrant**, and all four are used.
     *   Alternating `x` alone would leave the shake oscillating along one
     *   diagonal, which is a wobble rather than a jolt.
     * - **Both axes sum to zero over the cycle**, so the room comes back to
     *   where it started instead of walking off centre while a loud passage
     *   holds.
     */
    jitter: [
      [1, -0.6],
      [-0.7, 0.9],
      [0.4, 1],
      [-1, -0.3],
      [0.8, 0.5],
      [-0.5, -1],
      [0.9, -0.8],
      [-0.9, 0.3],
    ],
  },

  /**
   * The figure behind the wash (gt#36), and the biggest of the symbology's six
   * landings by an order of magnitude — the only one that moves.
   *
   * Two things drive it and neither is a new reading of the engine:
   *
   * - **Depth follows SERIOUSNESS**, on the gesture, like `--hue` and `--grit`
   *   and unlike anything in the frame loop. A generation is a rebuild of the
   *   figure, which is not something to do sixty times a second, and it is not
   *   something a hand moving a wheel can outrun either: there are four depths
   *   in the whole range, so a drag end to end costs at most four.
   *   {@link SIGIL.maxStrokes} may refuse the last of them on a figure with
   *   five arms, and that is the budget doing its job rather than a bug — the
   *   wheel simply stops buying detail before it stops turning.
   * - **Rotation follows the low band**, off the *same* lerped follower the
   *   wash breathes on. Not a second reading and not a second follower: this is
   *   atmosphere, and it arrives when the rest of the room does.
   *
   * Tracked rather than accumulated, which is the decision that keeps STILLNESS
   * honest. A figure whose rotation *rate* followed the band would have to be
   * frozen mid-turn when the room is pinned, and a stilled board would look
   * paused rather than at rest. Tracked, a band of zero is zero degrees, and a
   * stilled board is provably identical to a silent one — the same property
   * {@link washAt}(0) has.
   *
   * gt#102 seated it on the seal: drawn in the board's own coordinates, hub on
   * the seal's centre, `fill` of the way out to the seal's inner ring. For a
   * few commits it was light — a brass hairline, screened on.
   *
   * Since gt#108 it is a **shadow**, and it has a body. Thomas: softer, more
   * shadowy, more movement; "the 'shadow' of an eldritch entity far above
   * being cast on the board". So:
   *
   * - **It darkens.** `stroke` is how wide a limb is where it leaves the hub
   *   (it tapers from there by the figure's own rule), `blur` how far its edge
   *   is feathered, `shade` how dark the whole of it is. A shadow has no colour
   *   and one strength, so the parts are composed and then laid on together.
   * - **It is cast in a light.** `glow` is how bright the pool of overhead
   *   light under it is: `rest` on a silent room, plus `band` at a low band of
   *   1, plus `kick` on the frame something hits. On a plate this dark a
   *   shadow needs something to be darker than.
   * - **It is jointed.** A trunk, a limb at each arm tip and fingers at each
   *   limb tip. `sway.limb` and `sway.finger` are how far each turns about its
   *   base either way, in degrees — `rest` on a silent room, plus `band` at a
   *   low band of 1 — and how long one swing there and back takes. `hurry` is
   *   how much quicker both go at a band of 1. Neighbouring parts are out of
   *   step, so it undulates rather than wags.
   * - **It breathes.** `swell` is how much bigger than its own size it gets:
   *   `band` at a low band of 1, off the follower the wash breathes on, plus
   *   `kick` on a blow.
   *
   * Everything here is zero at rest except the pool's dim `rest` and the
   * sway's small one. Stilled, the sway is zero too, and the shadow lies
   * exactly on the arms cut into the plate under it.
   */
  sigil: {
    /** What the figure is seeded by. The seal cuts the same one into the plate (gt#103). */
    key: 'wash',
    /** Generations at SERIOUSNESS 0 and at 1. */
    minDepth: 2,
    maxDepth: 5,
    stroke: 11,
    blur: 2.8,
    shade: 0.62,
    /** How far the figure turns at a band of 1, in degrees, and to what precision. */
    maxDeg: 26,
    digits: 2,
    /** How far out toward the seal's inner ring its furthest stroke reaches. */
    fill: 0.93,
    glow: { rest: 0.25, band: 0.4, kick: 0.45, max: 1, digits: 3 },
    swell: { band: 0.06, kick: 0.05, digits: 4 },
    sway: {
      limb: { rest: 3.5, band: 6, ms: 11000 },
      finger: { rest: 6, band: 10, ms: 6300 },
      hurry: 0.8,
      digits: 2,
    },
  },

  /**
   * `--hue`: hue-rotate on the wash, one per TUNING position. The wash cools and
   * greens as the board sinks — the same six words, said in colour.
   */
  hues: [0, -12, -26, -42, -60, -80],

  /**
   * The wash and the grain are pushed this far past every edge of the window, so
   * that scaling one and translating the other can never expose a corner.
   */
  outset: 50,

  /** Both fringes are laid on at nine tenths of GRIT, never at the full amount. */
  edgeOpacity: 0.9,

  /**
   * Over the board and its cables, under the blooms, the tips and the overlay.
   * Every layer here is above {@link BOARD.zIndex}, and gt#53 is the whole reason
   * that is now a rule rather than an accident.
   *
   * **There is no behind.** The board's plate is an opaque gradient at
   * {@link BOARD.zIndex} and it covers the entire viewport — `width:1440px`
   * scaled by `--fit`, with `min-height:calc(100vh / var(--fit))`. Below 1440px
   * `--fit` scales that design to exactly the window width, so there are no side
   * margins and nothing behind the plate is visible anywhere, at any opacity.
   * gt#36 discovered this by mounting the figure under the plate and finding it
   * invisible at opacity 1; gt#53 is the same discovery made about the wash, which
   * had been there since the beginning and was carrying three of this file's
   * variables — `--breathe`, `--brite` and `--hue` — into a place no display
   * narrower than the design could see them.
   *
   * So the wash joins the stack it was always outside of, at the bottom of it,
   * and the thing that makes that survivable is `mix-blend-mode:screen` rather
   * than a z-index: screened, near-black contributes nothing, so what lands on
   * the hardware is the two pools of light and not the ground they used to come
   * with. The ground is painted on the page shell instead, as
   * `surfaces.pageDeep`. See ./atmosphere.
   *
   * The figure is not in this stack any more (gt#102). It is seated in the
   * board's emblem layer, in the plate's own coordinates and inside the plate's
   * own stacking context — see {@link BOARD.emblem} — which puts it under the
   * wash and everything else here.
   */
  zIndex: { wash: 15, film: 30, edges: 35, vignette: 40 },
} as const;

// ------------------------------------------------------- the advanced-effects shelf

/**
 * The shelf that lets the board come apart (gt#39). Six effects, none of them on
 * unless a hand has armed them, and all six dead the moment STILLNESS is pressed.
 *
 * {@link ATMOSPHERE} above is undersized on purpose, because the room is meant to
 * go unnoticed. Everything here is the opposite and is allowed to be, for one
 * reason: **it does not exist until someone asks for it.** COME APART is off on
 * every board that has never been armed, so the restrained board is still the
 * first impression and still the resting state — see ../ui/rupture, which is
 * where that rule is enforced rather than described.
 *
 * Three properties hold across every number below, and they are the shelf's whole
 * contract:
 *
 * - **Nothing is randomised at runtime.** Every slice, offset and height comes
 *   off a fixed table, for the reason {@link ATMOSPHERE.shake.jitter} does: a
 *   table can be quoted back by a suite.
 * - **Nothing costs a frame at rest, and nothing adds a frame loop at all.** The
 *   roll and the strobe are CSS keyframes — the idiom the film grain already
 *   uses — the slices are events with timers like the blooms, and the other three
 *   are custom properties written when a hand moves a box. gt#39 asks for a profile
 *   before shipping any of this; the honest version of that is to add no
 *   per-frame work to profile.
 * - **Nothing moves the plate.** gt#33's rule holds unchanged: the wire layer
 *   measures jack rects off the plate, and a transform on it makes every captured
 *   rect stale. The aberration is a `filter`, which moves pixels and not layout
 *   boxes, so `getBoundingClientRect` is identical with it on — and every other
 *   effect here is a fixed layer over the board carrying no jacks at all.
 */
export const RUPTURE = {
  /**
   * Below this GRIT nothing on the shelf happens, armed or not — and the ramp
   * runs from here to 1 rather than from 0, so arming the shelf on a board
   * sitting at its opening GRIT of 0.55 gives a third of the effect rather than
   * half of it. The floor is the same idea as {@link ATMOSPHERE.shake.floor}:
   * the absence is the design, not a rounding of it.
   */
  floor: 0.35,

  /** `--apart` and everything derived from it, to this many decimals. */
  digits: 3,

  /**
   * Chromatic aberration on the board itself: the red channel offset one way and
   * the green and blue the other, through an SVG filter on the plate.
   *
   * The filter is *removed from the element entirely* below the floor rather than
   * set to a zero offset. An identity filter is still a filter — the browser
   * would keep a render surface for the whole 1440px plate to composite through —
   * and a board nobody armed must pay nothing at all.
   */
  aberration: {
    maxPx: 3.2,
    id: 'ruptureSplit',
    digits: 2,
    /**
     * How much of the split is there between hits, as a share of `maxPx` (gt#82).
     *
     * It used to be all of it, all of the time: red 3.2px one way and cyan the
     * other, across the whole plate, held. A static red/cyan split is exactly
     * what an anaglyph 3D image looks like, and that is how it read — a board to
     * be viewed through paper glasses, not one coming apart. So the split rests
     * at a fringe and is *thrown* to its full reach on a strike, falling back by
     * `decay` a frame (a sixtieth of a second: see FRAME) until it is within
     * `floor` of rest. At .8 that is about a
     * quarter of a second: the channels knocked apart by the hit and settling.
     *
     * The burst moves colour and never brightness, which is the line between it
     * and the strobe. It has no rate of its own to cap — it happens when a hit
     * does — but it is not a flash and must not become one.
     */
    rest: 0.22,
    decay: 0.8,
    floor: 0.04,
  },

  /**
   * Glitch displacement, fired on strikes rather than continuously — the seam
   * SLOW HIT's bloom already runs on.
   *
   * All four tables are the same length and are walked together, one entry per
   * strike, so the eighth strike is where the first one was. Eight again for the
   * reason the shake's jitter is eight: it never lines up with a beat.
   *
   * `offsets` alternates sign every step and sums to zero across the cycle, so a
   * held rattle tears both ways rather than dragging the board off to one side.
   */
  slice: {
    /** Where each band sits, in vh. */
    tops: [12, 47, 31, 69, 24, 81, 58, 39],
    /** How tall each is at full amount, in px. */
    heights: [26, 12, 34, 9, 19, 30, 14, 22],
    /** How far each is thrown, in units of {@link RUPTURE.slice.maxPx}. */
    offsets: [1, -0.8, 0.55, -1, 0.85, -0.45, 0.7, -0.85],
    /** How far a band at full amount is thrown, in px. */
    maxPx: 26,
    /** How far a band is inset from both edges, so its throw has somewhere to go. */
    insetPx: 40,
    /** A band is on screen for this long and then gone. Under two frames at 60Hz. */
    holdMs: 150,
    /**
     * Never more bands at once than this. The same defensive number
     * {@link BLOOM.cap} is, for the same reason and against the same case:
     * MARACAS at full FRENZY fires ten hits inside one trigger.
     */
    cap: 6,
    digits: 2,
  },

  /**
   * The strobe, and the only number on this board that is a safety limit rather
   * than a taste one.
   *
   * Three gates, all of which must pass: STILLNESS is off, COME APART is armed,
   * and GRIT is at or above `gritArm`. The third exists so that arming the shelf
   * is not on its own enough to produce a full-screen flash — it takes a second,
   * deliberate move, and the wake screen's warning (gt#44) has already said the
   * board flashes before either of them is reachable.
   *
   * `maxHz` is a **cap, not a taper**: the rate does not rise with anything. The
   * period is fixed and the suite asserts `1000 / periodMs <= maxHz`, so the
   * limit is arithmetic that fails a test rather than a comment that can rot.
   * Three per second is the accepted ceiling for photosensitive safety, and the
   * period below sits under it rather than on it.
   */
  strobe: {
    /** Armed only at or above this GRIT. Below it there is no flash, ever. */
    gritArm: 0.9,
    /** The ceiling, in flashes per second. Nothing may exceed it. */
    maxHz: 3,
    /**
     * One flash per this many ms — 2.78Hz, deliberately under the cap.
     *
     * 360 rather than the 340 it was, and the twenty milliseconds are the
     * margin the cap needs to be true of a strobe that is being switched on
     * and off (see `strobeDelay` in ./rupture). A strobe let through its gate
     * part-way into a lit stretch shows the tail of that flash, so four
     * flashes can begin inside three periods less one lit stretch. At 340
     * that is 983ms — four in a second, by a hair. At 360 it is 1040ms, with
     * room for a frame of lateness at each end.
     */
    periodMs: 360,
    /** How much of each period is lit, in percent. Short: a flash, not a pulse. */
    litPct: 11,
    /** And how bright it gets. Well under 1 — a white-out is not more frightening. */
    peak: 0.42,
  },

  /**
   * Signal loss: the board rolling like a lost vertical hold, at extreme GRIT
   * only. A band brightening what it passes over with a tear line at its head,
   * drifting down the window and round again.
   *
   * The floor is high and separate from the shelf's own, because this is the
   * effect that makes the board briefly hard to read, and a hand that has driven
   * GRIT past 0.82 has asked for that.
   */
  roll: {
    gritFloor: 0.82,
    periodMs: 2400,
    /** How tall the band is, in vh, and how thick the tear at its head is, in px. */
    bandVh: 26,
    tearPx: 2,
  },

  /**
   * The amber lamps overdriving. One multiplier through `filter:brightness`, on
   * lit lamps only — an unlit lamp brightened is a lamp that looks on, which
   * would make the shelf lie about what the board is doing.
   */
  lamp: { maxBoost: 1.9 },

  /**
   * Bleeding and melting, off MURK rather than GRIT — the one effect on the shelf
   * driven by a different box, because gt#39 asks for it at high MURK and MURK is
   * already the board's word for *how far under water is this*.
   *
   * `maxTiltDeg` is a deliberate, stated exception to the board's own rule that
   * nothing on it is ever tilted (see {@link TAPE} and {@link MODULE.name}). The
   * rule exists so a glance stays readable; peeling the tape is the shelf saying
   * the board has stopped being readable, and it is reachable only by arming a
   * switch and turning MURK past two thirds. The module names sag but are
   * never tilted — a tilted name reads as a broken layout, which is the same
   * thing that kept rotation out of {@link ATMOSPHERE.shake}.
   *
   * `maxBlurPx` is the whole plate's (gt#109), not the names': one blur over
   * every name, tape, control and cable, because a board going under goes
   * under all at once. It was on the names alone, and read as a fault.
   */
  melt: {
    murkFloor: 0.6,
    maxBlurPx: 1.5,
    maxDropPx: 5,
    maxTiltDeg: 3.5,
    digits: 3,
  },

  /**
   * Over the wires, so a tear cuts the cables too — a glitch that left the patch
   * pristine would read as an overlay rather than as the board failing. Under the
   * tip tag at {@link TIP.zIndex}, which stays legible through all of it, and the
   * strobe alone sits over that: it is the whole screen or it is nothing.
   * Everything here is under the wake overlay at 100.
   */
  zIndex: { roll: 64, slices: 65, strobe: 95 },
} as const;

// ------------------------------------------------------------- the strike blooms

/**
 * The flash on a hit. The one thing on this board that answers a single moment
 * rather than a held state — everything else here moves because a hand moved it
 * or because the low band drifted, and a bloom exists for a second and is gone.
 *
 * Two numbers carry the whole effect and neither is arbitrary. The scale starts
 * at **less than half** the node's size and ends **past** it, so the flash reads
 * as light arriving rather than as a circle growing; and the gradient is
 * transparent by 70% of the radius, so it has no edge to be seen. A bloom drawn
 * from 1 to 1.4 with a hard rim would be a shape on the screen instead of a
 * glow behind the plate.
 *
 * {@link BLOOM.cap} is the only defensive number in this file. MARACAS at full
 * FRENZY fires up to ten hits inside one trigger, so a layer that queued rather
 * than refused would spend the frames after a rattle catching up on light nobody
 * is still looking for. Over the cap the hit is simply not drawn — the sound
 * already happened, and it is the sound that matters.
 *
 * The sizes, the colours and both alphas live in src/tokens with the rest of the
 * appearance; what is here is the geometry and the timing.
 */
export const BLOOM = {
  /** Over the vignette, under the tips. The atmosphere ends at 40. */
  zIndex: 50,

  /**
   * Never more than this many at once. Over it, a strike blooms not at all.
   *
   * Twelve, where the handoff asks for ten (gt#68): two beats' worth of all six
   * strikes. A glow is on the page for {@link BLOOM.removeMs}, 1.2 seconds,
   * and from 60 BPM up a beat is shorter than that, so the last beat's glows
   * are still there when the next ones arrive. At ten, a board with all six
   * strikes on *constantly* had room for four of the six and the last two
   * struck with no light, every beat. Ten was sized when there were five.
   */
  cap: 12,

  /** The gradient reaches full transparency this far out, in percent. */
  stop: 70,

  /** Spawned at `from`, flipped to `to` on the frame after next. */
  scale: { from: 0.45, to: 1.4 },

  /**
   * One second, easing out, on both properties at once — the light spreads and
   * fades as one movement rather than growing and then dimming.
   */
  transition: 'opacity 1s ease-out, transform 1s ease-out',

  /**
   * The node is taken off the page here: a fifth of a second after the
   * transition ends, which is late enough that nothing is ever cut short.
   */
  removeMs: 1200,

  /**
   * How far a quiet hit falls short of a loud one (gt#81), as the floor each of
   * the bloom's two measures drops to at a strength of nothing. A SLOW HIT with
   * HOW LOUD nearly off used to bloom exactly like one at full; the light now
   * answers the control the hand is on.
   *
   * Floors rather than a straight scale, and not low ones: a hit that can be
   * heard should be seen, and the size moves less than the brightness because a
   * flash that shrank to a dot would stop reading as coming from the plate.
   */
  strength: { size: 0.7, opacity: 0.4 },

  /**
   * The front of a hit (gt#81): a ring `width` thick, grown from `from` of its
   * size to `to` in `ms`, fading as it goes. SLOW HIT's is larger, as its glow
   * is. `alpha` is the edge at its brightest, on a full-strength hit.
   *
   * Under half a second and well under the glow's whole second, so it has left
   * before the glow has finished spreading. `slackMs` is how long after that
   * the node is taken off the page.
   */
  ring: { size: 150, bigSize: 270, width: 2, alpha: 0.55, from: 0.2, to: 1.15, ms: 420, slackMs: 80 },
} as const;
