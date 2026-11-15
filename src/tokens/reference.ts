// Every visual constant in the design handoff, and the only place any of them is
// written down. Values are copied verbatim from the original design, whose files
// are not in the repository — tests/tokens.test.ts holds each one to the list of
// strings that design wrote, so a typo here fails the suite rather than the eye.
//
// Nothing on the board imports this file by name. ./index re-exports all of it
// and lays the grade (gt#101) over the tables that are material — so a colour
// here is the reference's, and the colour on screen may be that one, darkened.
// To change how dark, turn `GRADE` in ./grade; to change a colour, change it
// here, and it will have to be the bundle's or a written-down departure.
//
// Behavioural per-module fields (zone, type, charLabel, maxGain) deliberately live
// elsewhere; this module owns appearance only.
//
// It does not, however, get to have its own opinion about *which* modules and
// boxes exist. The two id types below are the engine's, imported rather than
// derived from the tables here — see {@link sourcePlates}.

// A type-only import, and the only thing this module takes from anywhere.
// ../engine/constants imports nothing at all, so this direction cannot cycle,
// and nothing about it survives to runtime.
import type { ModifierId, SourceId } from '../engine/constants';

// The damage layer, which is generated rather than transcribed — see ./damage
// for why that is allowed, and tests/tokens.test.ts for how the transcription
// check is told about it.
import { breakage, damage, placement, runTile } from './damage';

/** Re-exported so a consumer holding a token can name what it is keyed by. */
export type { ModifierId, SourceId };

export * from './damage';
export * from './impact';
// The symbology (gt#36), generated on the same terms as the damage layer and held
// by the same exemption. Note the direction: this file re-exports ./sigils, so
// ./sigils may not import this one — which is why its marks are generators keyed
// by a string rather than a table keyed by {@link ZoneId}.
//
// ./geometry, which both of them draw from, is deliberately *not* re-exported.
// Its four helpers are named for what they do inside a generator — `n`, `uri`,
// `tile` — and nothing outside this directory has any business calling them.
export * from './sigils';
// And the repairs (gt#107): what somebody did about the damage. Numbers only —
// it draws in colours its caller already holds — so it brings no string here
// for the transcription check to ask about.
export * from './repairs';

// ---------------------------------------------------------------- base surfaces

export const surfaces = {
  /** Page background. Also inlined in index.html so the first paint is not white. */
  page: '#121009',

  /**
   * The ground the whole page sits on, and the *static* half of what used to be
   * one backdrop (gt#53).
   *
   * The reference paints its room as one string: two coloured pools over a dark
   * elliptical ground. Those are two different jobs, and gt#53 is what happens when
   * one layer does both — the ground has to sit behind everything, and the pools
   * have to be somewhere they can be seen. So the ground stays put, painted on
   * the page shell where {@link surfaces.page} already is, and the pools go over
   * the plate as {@link surfaces.backdrop}.
   *
   * Both halves are still verbatim: the split is where they are *painted*, and
   * not one digit of either moved.
   */
  pageDeep: 'radial-gradient(ellipse at 50% 55%, #1a1610 0%, #0d0b07 78%)',

  /** The one big plate the whole board sits on. */
  boardPlate: 'linear-gradient(170deg,#1f1c16,#131110)',
  boardShadow: 'inset 0 0 90px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',

  /**
   * The moving half: two pools of light, warm from one corner and cold from the
   * other, screen-blended *over* the board and scaled, brightened and
   * hue-rotated by the visual system. The ground they used to carry is
   * {@link surfaces.pageDeep}. See ../ui/atmosphere.
   */
  backdrop:
    'radial-gradient(1000px 650px at 15% 5%, rgba(120,66,32,0.12), rgba(0,0,0,0) 60%), radial-gradient(900px 700px at 88% 95%, rgba(70,105,88,0.1), rgba(0,0,0,0) 60%)',
  vignette: 'radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 42%, rgba(5,4,2,0.9) 100%)',

  /**
   * The two colour fringes GRIT throws round the frame (gt#96), in the reference's
   * own two colours.
   *
   * Each is one ellipse over the whole window: clear across the middle, colour
   * only toward the frame, and heaviest in the corners — which is where a lens
   * actually splits light. The warm one is centred a little down and to the
   * right, so its colour gathers along the top and the left; the cold one is
   * its mirror, and gathers along the bottom and the right. Every corner gets
   * some of both.
   *
   * They were two straight bars, one down each side: `linear-gradient(90deg,
   * rgba(255,70,30,0.14), …)` and its opposite, seventy pixels wide, stopping
   * dead at the top and bottom of the window. A warm stripe and a cold stripe
   * are page decoration. A fringe that follows the frame is a fault in the
   * picture, which is what GRIT is.
   *
   * Along the middle of an edge each lays about what its bar did (.12 against
   * .14). The corners are three times that on paper and much less on screen:
   * the vignette sits over both and is at its darkest exactly there, which is
   * why a corner-heavy fringe needs numbers this size to be seen at all.
   */
  gritEdgeWarm:
    'radial-gradient(ellipse 78% 78% at 56% 55%, rgba(255,70,30,0) 58%, rgba(255,70,30,0.14) 74%, rgba(255,70,30,0.42) 100%)',
  gritEdgeCold:
    'radial-gradient(ellipse 78% 78% at 44% 45%, rgba(60,200,220,0) 58%, rgba(60,200,220,0.11) 74%, rgba(60,200,220,0.34) 100%)',

  /** Full-viewport wake overlay. */
  wakeOverlay: '#0b0806',
} as const;

/** Sections are scored wells in the board, not separate cards. Keyed by zone. */
export const wells = {
  fog: { fill: 'rgba(0,0,0,0.22)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -12px 24px rgba(0,0,0,0.35)' },
  pulse: { fill: 'rgba(0,0,0,0.16)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.02)' },
  voice: { fill: 'rgba(0,0,0,0.16)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.02)' },
  junk: { fill: 'rgba(0,0,0,0.2)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.02)' },
  foundation: { fill: 'rgba(0,0,0,0.28)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.03), inset 0 -14px 26px rgba(0,0,0,0.4)' },
  chain: { fill: 'rgba(0,0,0,0.3)', shadow: 'inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -14px 26px rgba(0,0,0,0.4)' },
} as const;

export type ZoneId = keyof typeof wells;

// ------------------------------------------------------------- plate hardware

/** Shared plate treatment for source modules and modifier boxes. */
export const plate = {
  border: '1px solid rgba(5,3,2,0.9)',
  radius: '3px',
  /** Source modules. */
  shadow: '0 5px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 18px rgba(0,0,0,0.4)',
  /** Modifier boxes sit shallower. */
  boxShadow: '0 5px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 16px rgba(0,0,0,0.4)',

  /** Outer stop of a module's ambient tint glow — the tint fading to nothing. */
  glowFade: 'rgba(0,0,0,0)',

  /**
   * What lies over a plate that has no power (gt#76): a near-black with the
   * board's own warmth left in it, laid on at part strength by the component.
   * Not grey and not transparent black — an unlit plate on this board is one
   * the lamps are not reaching, and the dark here is brown.
   */
  unlit: '#070504',

  screw: 'radial-gradient(circle at 35% 30%, #7d7666, #322e26 75%)',
  screwShadow: '0 1px 2px rgba(0,0,0,0.7)',
  screwSlot: 'rgba(15,10,6,0.85)',
  /** Each corner screw's slot sits at a different angle, in degrees, clockwise from TL. */
  screwSlotAngles: [38, -21, 64, 8],

  /** Bolted look along the top edge of THE FOUNDATION. */
  rivetStrip:
    'repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 24px, rgba(125,118,102,0.3) 24px 29px, rgba(0,0,0,0) 29px 52px)',

  /**
   * Wake-screen plate: metal slab, inset slot, ribbed lever handle. Its edge is
   * darker and flatter than the board's hardware — the one plate held at arm's
   * length rather than seen across a room — so the border is its own value.
   */
  wakePlate: 'linear-gradient(165deg,#252019,#14100c)',
  wakeBorder: '1px solid rgba(0,0,0,0.85)',
  wakePlateShadow: '0 18px 50px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
  wakeSlot: '#070503',
  wakeSlotShadow: 'inset 0 3px 8px rgba(0,0,0,1), inset 0 0 0 1px rgba(255,255,255,0.04)',
  wakeLever: 'linear-gradient(#7d7460,#443d2f)',
  wakeLeverShadow: '0 6px 14px rgba(0,0,0,0.75), inset 0 2px 3px rgba(255,255,255,0.28)',
  wakeLeverGrip: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 4px, rgba(0,0,0,0) 4px 9px)',
} as const;

/** Patch jacks — identical for source OUT, modifier IN and modifier OUT. */
export const jack = {
  face: 'radial-gradient(circle at 50% 45%, #070503 38%, #262219 46%, #453f33 56%, #1c1913 64%)',
  shadow: '0 1px 0 rgba(255,255,255,0.07), inset 0 2px 5px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,0,0,0.6)',
  /**
   * An IN socket that would take the cable being carried (gt#77): a ring of the
   * lamp's own amber round it, laid on over the socket's shadow. The lamp's
   * colour because it is the same statement a lamp makes — *this is live* — said
   * a second earlier, about a box that is about to be.
   */
  open: '0 0 0 2px rgba(255,179,82,0.55), 0 0 12px 2px rgba(255,150,50,0.4)',
  /** The one of those the cable is over: the same ring, closed and brighter. */
  aim: '0 0 0 2px rgba(255,196,120,0.95), 0 0 18px 5px rgba(255,160,60,0.75)',
} as const;

/** Power toggle beside each module name. */
export const toggle = {
  well: '#100d09',
  wellShadow: 'inset 0 2px 5px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.05)',
  nub: 'linear-gradient(#8a8270,#4e4738)',
  nubShadow: '0 1px 2px rgba(0,0,0,0.6)',
} as const;

// --------------------------------------------------------------- ink & signals

export const ink = {
  /** Module names — painted on, never tilted. */
  bone: 'rgba(216,208,182,0.82)',
  boneShadow: '0 1px 0 rgba(0,0,0,0.7)',

  /** Stencilled lettering, by the job it does rather than by its alpha. */
  stencilZone: 'rgba(206,196,168,0.3)',
  stencilFog: 'rgba(206,196,168,0.35)',
  stencilHint: 'rgba(206,196,168,0.28)',
  stencilTick: 'rgba(206,196,168,0.4)',
  stencilJack: 'rgba(206,196,168,0.5)',

  /** Selector word captions under a label. */
  caption: '#c4baa0',

  /** Tape labels: one word, read after the act. */
  tape: '#b8ab86',
  tapeScrap: '#a89a75',
  tapeInk: '#1e1810',
  tapeShadow: '0 2px 4px rgba(0,0,0,0.55)',
  /**
   * Dirt on a strip of tape (gt#118): thumbed-down ends, darkest at the left
   * where it was pressed on first, and clean across the middle where the word
   * is. Laid over whatever colour the tape is.
   */
  tapeGrime:
    'linear-gradient(98deg, rgba(58,42,22,0.36) 0%, rgba(58,42,22,0) 20%, rgba(58,42,22,0) 72%, rgba(58,42,22,0.26) 100%)',
  /**
   * The board's tape *buttons* sit a hair shallower than a control's tape strip.
   * The reference is consistent about the difference, so it is transcribed rather
   * than rounded together. It drew two of them — SUMMON and SCRUB THE ALTAR — and
   * the board now has four, the later three cut to the same strip.
   */
  buttonShadow: '0 2px 4px rgba(0,0,0,0.5)',
  /**
   * STILLNESS held down — the one latching button on the board, and so the one
   * that needs a second state to be in. The drop shadow is replaced by an inset
   * one rather than being removed: a button that only loses its shadow reads as
   * unstuck, and this one is pressed *into* the plate.
   */
  buttonPressedShadow: 'inset 0 2px 5px rgba(0,0,0,0.55)',
  /** The blank scrap in THE JUNK DRAWER's corner: no ink, barely stuck down. */
  scrapShadow: '0 1px 3px rgba(0,0,0,0.4)',
  /**
   * WAKE IT's tape, the one strip on a plate rather than on a board. It sits
   * deeper than either of the board's two tape buttons, which is what keeps a
   * 30px word from reading as flat against a full-screen dark.
   */
  wakeTapeShadow: '0 3px 8px rgba(0,0,0,0.6)',

  /** Hover tips — the only place plain-language explanation appears. */
  tipPaper: '#ddd3b8',
  tipInk: '#221c12',
  tipShadow: '0 4px 14px rgba(0,0,0,0.55)',
  /** A stain in the corner of the paper tag (gt#118). Away from the corner the tag starts reading at. */
  tipGrime: 'radial-gradient(ellipse at 100% 100%, rgba(122,86,42,0.3) 0%, rgba(122,86,42,0.1) 38%, rgba(122,86,42,0) 64%)',
} as const;

export const signals = {
  lampOn: '#ffb352',
  lampOff: '#33281c',
  lampGlowOn: '0 0 8px rgba(255,168,70,0.9)',
  lampGlowOff: 'inset 0 1px 2px rgba(0,0,0,0.9)',
  /**
   * A second, wider ring of light round a lit lamp (gt#76), laid on after the
   * reference's own. The reference's glow is 8px round an 8px lamp, which is a
   * lamp that is on; this is a lamp that lights the corner of the plate it is
   * in, and it is most of what lets a live module be found from across the room.
   */
  lampHalo: '0 0 22px 4px rgba(255,150,50,0.38)',
  /** The ring of dirt round a lamp (gt#118), lit or not. */
  lampBezel: 'rgba(22,15,8,0.75)',

  /**
   * The hammer that replaced the verdigris dome (gt#40), and the anvil it lands on.
   *
   * The dome was the reference's, transcribed. None of this is: the bundle has no
   * hammer in it and never will, so every value here is registered as a departure
   * in tests/tokens.test.ts rather than pretending to be a transcription. What
   * they are cut from instead is the rest of the board — the head is the same
   * cold iron as a control's dark face read in a different light.
   *
   * It is all metal since gt#111. The haft was wood, the one piece of it on the
   * plate, on the reasoning that wood reads as the part a hand goes to — and
   * it did, which was the trouble: it made the thing a mallet. Nobody holds
   * this. Since gt#115 it is a drop hammer the size of a building: two columns
   * that run up out of the row, a ram between them far taller than the row
   * is, and an anvil block under it. The only colour on it is hazard paint
   * somebody put on once and never touched up, and the only light is what
   * comes off the anvil when it lands.
   *
   * The verdigris did not survive the swap and that is deliberate. Green on this
   * board means *left alone long enough to corrode*, which is the opposite of a
   * tool somebody picks up — ../tokens/damage keeps the dome's own green for the
   * one thing still entitled to it.
   */
  hammerFace: 'linear-gradient(180deg, #5f584d 0%, #c2b9a8 42%, #8d8476 100%)',
  hammerShadow: '0 4px 10px rgba(0,0,0,0.7), inset 0 1px 2px rgba(255,255,255,0.16)',
  hammerBand: 'linear-gradient(180deg, #100e0c 0%, #3a352e 22%, #262320 60%, #0d0b09 100%)',
  hammerBolt: 'radial-gradient(circle at 36% 30%, #d2c9b7 0%, #7e7668 40%, #24201c 100%)',
  hammerHazard: 'repeating-linear-gradient(-58deg, #a87e1c 0 5px, #14110e 5px 10px)',
  hammerPost: 'linear-gradient(90deg, #14110e 0%, #534d43 34%, #2f2b25 68%, #0f0d0b 100%)',
  hammerRivets: 'radial-gradient(circle, #a59d8e 0 1.2px, #17140f 1.9px, rgba(0,0,0,0) 2.4px)',
  hammerRam: 'linear-gradient(90deg, #26221e 0%, #6d665a 16%, #4c463d 50%, #2e2a25 84%, #141110 100%)',

  /**
   * What comes off the anvil (gt#115): a spark, the glow round it, and the flare
   * along the struck line. Light, like the lamps, and not graded with the
   * metal — for the fifth of a second they last they are the brightest things
   * on the plate.
   */
  spark: 'linear-gradient(180deg, #fff6d6 0%, #ffc45e 45%, #ff6a1e 100%)',
  sparkGlow: '0 0 6px 1px rgba(255,160,60,0.75)',
  strikeFlare:
    'radial-gradient(ellipse at center, rgba(255,236,190,0.95) 0%, rgba(255,150,50,0.55) 38%, rgba(255,90,20,0) 72%)',

  /**
   * The struck plate. Lighter than the board around it because it is the one
   * square inch of this thing that gets hit often enough to stay polished — and
   * that is also what makes a dent read: a mark needs a clean surface to be a
   * mark on.
   */
  anvilFace: 'linear-gradient(180deg, #585044 0%, #322c25 55%, #1b1712 100%)',
  anvilShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), 0 2px 5px rgba(0,0,0,0.5)',
  anvilFoot: 'linear-gradient(180deg, #2c2822 0%, #110f0d 100%)',

  /**
   * COME APART's guarded button (gt#112): the plate it is bolted to, the recess,
   * the dome up and dark, the dome down and lit, the cover and its hinge.
   *
   * None of it is the bundle's, which has no such control, so every value is a
   * registered departure. The red is the board's one use of a colour that
   * means *do not*, and it is kept to this object.
   *
   * It is old (gt#114). The dome is red plastic that has sat under a lamp for
   * years: bleached toward pink, chalky at the rim, and when the lamp behind
   * it is on the light comes *through* it rather than off it — a soft warm
   * red with no white-hot middle and a short glow. It was a clean bright
   * dome, and Thomas: "the red light needs to be faded with weathered red
   * plastic that softens it." The cover is smoked and red-tinted so the dome
   * is seen through it and seen to be out of reach.
   */
  apartSeat: 'linear-gradient(160deg, #4d473e 0%, #2b2722 52%, #161310 100%)',
  apartWell: 'radial-gradient(circle, #040303 0%, #120f0d 60%, #2f2a25 100%)',
  apartWellShadow: 'inset 0 3px 6px rgba(0,0,0,0.85)',
  apartDome: 'radial-gradient(circle at 38% 32%, #b3857c 0%, #8e4a41 36%, #5f2620 74%, #301311 100%)',
  apartDomeShadow:
    '0 4px 8px rgba(0,0,0,0.75), inset 0 -4px 8px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,214,200,0.2)',
  apartDomeLit: 'radial-gradient(circle at 47% 45%, #eeb39c 0%, #d8694c 32%, #ab3423 68%, #591510 100%)',
  apartDomeGlow:
    '0 0 18px 4px rgba(224,74,46,0.34), inset 0 3px 8px rgba(70,0,0,0.5)',
  apartCover:
    'linear-gradient(150deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.05) 24%, rgba(150,26,18,0.26) 58%, rgba(70,10,8,0.44) 100%)',
  apartCoverFrame:
    'inset 0 0 0 2px rgba(176,166,146,0.6), inset 0 0 14px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.6)',
  apartHinge: 'linear-gradient(180deg, #8a8275 0%, #3f3a33 45%, #14110e 100%)',

  /**
   * One dent, and the dust a hit throws off the point it landed on.
   *
   * A dent is a hole, so it is drawn as a dark centre with a bright lower lip —
   * light falling into a pit and catching the far wall of it. Reversing those two
   * is what makes the difference between a dent and a rivet, which is the whole
   * of why both stops are written here rather than one.
   */
  dent: 'radial-gradient(circle at 45% 38%, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 48%, rgba(214,203,178,0.22) 74%, rgba(0,0,0,0) 100%)',
  dust: 'radial-gradient(circle, rgba(206,196,168,0.5) 0%, rgba(206,196,168,0.18) 45%, rgba(206,196,168,0) 100%)',

  /**
   * Wires are three stacked strokes. There was a fourth — an invisible band over
   * each cable to catch the click — and it caught the click meant for whatever
   * the cable hung across, so it is gone (gt#72). `wireTemp` does a second job
   * since: it is the colour a loose cable is dragged in, and so the colour the
   * cable under the pointer is lit in, because that one is about to come loose.
   */
  wireShadow: '#0a0806',
  wireCore: '#453729',
  wireHighlight: 'rgba(216,205,180,0.22)',
  wireTemp: '#b8ab86',

  link: '#9c6132',
  linkHover: '#c2823f',
} as const;

// -------------------------------------------------------------------- controls

/** Shared anatomy of the six control kinds. Per-module face colours live below. */
export const controls = {
  faceDark: '#2b2318',
  /** Pointer bar on a knob, wedge on a selector. */
  mark: '#d5cbb0',

  /** Lifts the pointer bar off the face it is painted on. */
  markShadow: '0 0 3px rgba(0,0,0,0.8)',

  knobRim: '#0b0906',
  /**
   * The grip lines cut round a knob's edge (gt#93): thirty of them, a dark groove
   * and the thin lit edge beside it. Painted on the dial, so they turn.
   */
  knurl: 'repeating-conic-gradient(rgba(0,0,0,0.42) 0deg 3deg, rgba(255,255,255,0.07) 3deg 5deg, rgba(0,0,0,0) 5deg 12deg)',
  knobShadow: '0 4px 8px rgba(0,0,0,0.7), inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.55)',
  /** Bone halo that emerges behind a knob as it is used. */
  wearRing: 'radial-gradient(circle, rgba(0,0,0,0) 52%, rgba(200,188,152,0.45) 66%, rgba(0,0,0,0) 78%)',
  wheelWearRing: 'radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(200,188,152,0.4) 68%, rgba(0,0,0,0) 80%)',
  /**
   * The same halo where the control is a lane rather than a circle: a bone bloom
   * filling the fader's travel, since a thumb rubs the whole of it rather than
   * sweeping a ring. Soft on all four sides — a band with an edge would read as
   * a second rail. The reference has no fader tell at all; see ./ui/control.
   */
  faderWearGlow:
    'radial-gradient(ellipse at 50% 50%, rgba(200,188,152,0.42) 0%, rgba(200,188,152,0.18) 45%, rgba(0,0,0,0) 72%)',

  faderRail: '#0b0906',
  faderRailShadow: 'inset 0 2px 5px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.05)',
  faderCap: 'linear-gradient(#655e50 0%, #3d382e 45%, #262219 55%, #454034 100%)',
  faderCapShadow: '0 3px 6px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.22)',
  faderIndex: '#cfc4a8',
  /**
   * The loudness gauge beside a fader (gt#90): a mark at or under the cap, and a
   * mark over it. The stencil's own bone at two strengths, so a gauge reads as
   * cut into the plate with the rest of the board's scales.
   */
  gaugeLit: 'rgba(206,196,168,0.82)',
  gaugeDim: 'rgba(206,196,168,0.2)',

  selectorShadow: '0 3px 7px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.16), inset 0 -2px 5px rgba(0,0,0,0.55)',

  /**
   * Lever: a slot cut through the plate and a ribbed bar thrown along it. The
   * shapes echo the wake screen's handle, the values deliberately do not — that
   * plate is held at arm's length and lit for it (see `plate.wakeLever`), and the
   * same brightness on a 16px bar seen across a room reads as chrome.
   */
  leverSlot: '#080604',
  leverSlotShadow: 'inset 0 3px 7px rgba(0,0,0,1), inset 0 0 0 1px rgba(255,255,255,0.04)',
  leverBar: 'linear-gradient(#6b6353 0%, #443e31 55%, #2a251c 100%)',
  leverBarShadow: '0 4px 9px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.24)',
  leverGrip: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.4) 0 2px, rgba(0,0,0,0) 2px 5px)',
  /** A ratchet detent. Cut into the plate, so it is a shadow rather than a mark. */
  leverNotch: 'rgba(8,6,4,0.75)',
  /**
   * The lever's tell, and the third shape the bone takes. A thrown bar polishes a
   * *line* — the hand grips one place and sweeps it end to end — so this is a
   * smear along the slot rather than the fader's rubbed pool or a knob's ring. It
   * is brightest at the middle of the travel, where every throw passes however
   * short it was.
   */
  leverWearScuff:
    'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(200,188,152,0.3) 28%, rgba(200,188,152,0.4) 50%, rgba(200,188,152,0.3) 72%, rgba(0,0,0,0) 100%)',

  /**
   * The toggle bank's tell, and the fourth. A bank is flicked at its feet, one
   * fingertip at a time, so the bone gathers along the *base* of the row and
   * fades upward — the wells themselves stay clean, because nothing rubs them.
   */
  toggleWearHaze:
    'linear-gradient(0deg, rgba(200,188,152,0.42) 0%, rgba(200,188,152,0.16) 40%, rgba(0,0,0,0) 78%)',

  /**
   * A dull patch on a piece of bare metal or plastic that fingers go to
   * (gt#118): a fader's cap, a lever's bar, a switch's nub, a socket. Dark and
   * warm, off to one side, fading to nothing before the far edge.
   */
  tarnish: 'radial-gradient(ellipse at 26% 64%, rgba(26,17,8,0.6) 0%, rgba(26,17,8,0.26) 44%, rgba(26,17,8,0) 72%)',

  wheelRim: '#4e4736',
  wheelWell: 'rgba(12,9,6,0.4)',
  wheelSpoke: 'linear-gradient(90deg,#5c5443,#332d22)',
  wheelSpokeShadow: '0 0 3px rgba(0,0,0,0.6)',
  wheelHub: 'radial-gradient(circle at 38% 32%, #6d6552, #2e2a20 80%)',
  wheelHubShadow: '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)',
  wheelShadow: '0 6px 14px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,255,255,0.12), 0 0 0 1px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(0,0,0,0.6)',
} as const;

/** Wear ring opacity is min(maxOpacity, completed drags / turnsToFull). */
export const wear = {
  maxOpacity: 0.9,
  turnsToFull: 45,
} as const;

// ------------------------------------------------------------------ per-module

export interface SourcePlate {
  /** Plate gradient. Angles vary 145–165deg by module; they are not uniform. */
  readonly plate: string;
  /** Blurred ambient glow behind the plate when the module is on. */
  readonly tint: string;
  /** Control face colour for this module's knobs and selectors. */
  readonly face: string;
  /** Rust ceiling: plate rust opacity is rustBase + weather × rustMax. */
  readonly rustMax: number;
  /** Strike modules only — `r,g,b` for the bloom that spawns on each hit. */
  readonly bloom?: string;
}

/**
 * Every module's skin, keyed by id — and checked against the engine's
 * {@link SourceId} rather than against `string`.
 *
 * That check is the point of the row rather than a tidiness. This table used to
 * define its own id type as `keyof typeof sourcePlates`, which made it true by
 * construction and therefore unable to be wrong: a tenth module added to the
 * engine needed no entry here, and ../ui/blooms cast its way past the gap and
 * fell back to the neutral colour. A new strike would have bloomed in the wrong
 * colour with nothing to say so (gt#24). Now the omission is a compile error at
 * this table, which is where it can actually be fixed.
 */
export const sourcePlates = {
  guitar: { plate: 'linear-gradient(165deg,#262319,#191612)', tint: 'rgba(150,80,40,0.4)', face: '#6f6858', rustMax: 0.45 },
  bass: { plate: 'linear-gradient(150deg,#232019,#161310)', tint: 'rgba(110,60,38,0.4)', face: '#635c4d', rustMax: 0.4 },
  slowhit: { plate: 'linear-gradient(160deg,#26221a,#181510)', tint: 'rgba(180,125,55,0.35)', face: '#7d7259', rustMax: 0.55, bloom: '255,180,100' },
  cymbal: { plate: 'linear-gradient(145deg,#25251e,#171712)', tint: 'rgba(200,192,168,0.3)', face: '#8d8570', rustMax: 0.5, bloom: '230,225,200' },
  voice: { plate: 'linear-gradient(160deg,#2a251b,#1b1712)', tint: 'rgba(185,165,120,0.35)', face: '#96793f', rustMax: 0.55, bloom: '220,190,140' },
  chainsaw: { plate: 'linear-gradient(155deg,#33241b,#1f1610)', tint: 'rgba(180,90,40,0.45)', face: '#9c6132', rustMax: 0.85 },
  sax: { plate: 'linear-gradient(150deg,#2f2817,#1d1810)', tint: 'rgba(160,130,72,0.45)', face: '#96793f', rustMax: 0.75 },
  maracas: { plate: 'linear-gradient(160deg,#2a2720,#1a1812)', tint: 'rgba(200,190,158,0.32)', face: '#7d7259', rustMax: 0.65, bloom: '230,215,180' },
  cow: { plate: 'linear-gradient(150deg,#222b25,#151b17)', tint: 'rgba(88,128,108,0.45)', face: '#567c6a', rustMax: 0.8, bloom: '140,200,170' },
  // THROAT sits beside THE VOICE and is cut from the same bone and ochre, a
  // shade warmer — two plates in one well should look like they came off the
  // same machine, which is the opposite of the rule THE JUNK DRAWER lives by.
  throat: { plate: 'linear-gradient(158deg,#2b2620,#1a1714)', tint: 'rgba(196,158,96,0.4)', face: '#8a7a55', rustMax: 0.5 },
  // And the cannon is the coldest thing on the board on purpose. COW's green is
  // the only other colour out of the rust range, and it is a long way from this:
  // everything here is scavenged and brown except the one module that is clearly
  // not from around here.
  laser: { plate: 'linear-gradient(152deg,#1e2a33,#12181d)', tint: 'rgba(86,178,220,0.5)', face: '#4f92ad', rustMax: 0.7, bloom: '150,220,255' },
} as const satisfies Record<SourceId, SourcePlate>;

export interface ModifierPlate {
  readonly plate: string;
  readonly face: string;
}

/**
 * Every box's skin, checked against the engine's {@link ModifierId} — see
 * {@link sourcePlates}.
 *
 * The first four are scorched rust, swamp green, cold steel-blue and dark stone.
 * The three gt#41 added are pulled away from all four rather than filled in around
 * them, because seven boxes now sit in one row along the bottom and a palette
 * that reads as four colours and three near-misses is worse than four: on a rack
 * the plates are side by side, so a box is told apart from its neighbour by
 * colour before anything else is read.
 *
 * - **DOPPLER** — bruised violet. The one hue nothing else on the board carries,
 *   for the one box that is about something passing rather than about something
 *   sitting there.
 * - **MAGNETS** — iron oxide. Redder and duller than GRIT's scorched orange,
 *   which is the difference between a thing that was burnt and a thing that has
 *   been rusting in a damp shed. They are the two warm plates and they are meant
 *   to be told apart at a glance.
 * - **OFFSET** — deep indigo. Clearly *blue*, where WOBBLE's steel is a neutral
 *   grey that only leans that way; the two are next to each other in id order and
 *   this is what keeps them from reading as one plate cut in half.
 */
export const modifierPlates = {
  grit: { plate: 'linear-gradient(160deg,#3a2317,#241510)', face: '#9c6132' },
  murk: { plate: 'linear-gradient(160deg,#1f2822,#131a16)', face: '#567c6a' },
  wobble: { plate: 'linear-gradient(160deg,#262833,#15161d)', face: '#6f7382' },
  cavern: { plate: 'linear-gradient(160deg,#25242b,#141318)', face: '#6d6552' },
  doppler: { plate: 'linear-gradient(160deg,#2b2233,#18131d)', face: '#8a6f9c' },
  magnets: { plate: 'linear-gradient(160deg,#331c1c,#1d1011)', face: '#a85c50' },
  offset: { plate: 'linear-gradient(160deg,#1c2436,#10141f)', face: '#6d84ab' },
} as const satisfies Record<ModifierId, ModifierPlate>;

/**
 * Blooms: 440px for SLOW HIT, 230px otherwise; this colour covers anything unlisted.
 *
 * Each pair is one strength of the same flash. `inner` is the alpha at the centre
 * of the gradient and `opacity` the alpha of the whole node — SLOW HIT is brighter
 * on both counts as well as larger, which is what makes it read as the heaviest
 * thing on the board rather than merely the biggest.
 */
export const bloom = {
  fallback: '230,200,150',
  bigSize: 440,
  size: 230,
  bigOpacity: 0.8,
  opacity: 0.5,
  bigInner: 0.4,
  inner: 0.25,
} as const;

// ------------------------------------------------------------------ typography

/**
 * Four families, fetched by ../fonts — which is where the request, and the rule
 * that it may never hold the board up, are written down (gt#69).
 *
 * Each stack is the face and then what the board is drawn in **without** it, and
 * the second half is not a formality: the faces arrive after first paint, and on
 * a pulled network they never arrive at all. So every fallback is chosen for the
 * job the face was doing, and none of them ends in `cursive` — the generic that
 * resolves to Comic Sans on Windows, and the reason every tape on this board was
 * set in it until the faces were actually loaded.
 *
 * - **name**: a condensed grotesque is a condensed grotesque; Arial Narrow keeps
 *   the plate's proportions where it exists.
 * - **tape**: a marker has no system analogue worth the name. Marker Felt is the
 *   honest one on Apple, Segoe Print the nearest hand on Windows, and a plain
 *   sans is better than a joke after that.
 * - **stencil**: Stencil where an office suite left one, then a serif — Stardos
 *   is a slab cut into bridges, and wide-tracked serif capitals at 12px read as
 *   lettering on a plate where a sans reads as a caption.
 * - **body**: whatever the system sets its own interface in.
 *
 * Named `fonts` rather than `type`, which cannot be imported by name without
 * colliding with the `import { type X }` syntax.
 */
export const fonts = {
  /** Module and modifier names. 700, letter-spacing 1.8px. */
  name: "'Saira Condensed','Arial Narrow',sans-serif",
  /** Tape labels. */
  tape: "'Permanent Marker','Marker Felt','Segoe Print',sans-serif",
  /** Zone names. */
  stencil: "'Stardos Stencil','Stencil',Georgia,serif",
  /** Hover tips, captions, micro-hints. 400 and 600. */
  body: "'Public Sans',system-ui,sans-serif",
} as const;

/**
 * Which weights of each family the board actually draws, and so which are
 * carried. ../fonts declares one face for each row of this list, from a file in
 * ../fonts/ (gt#94).
 *
 * Beside {@link fonts} rather than beside the request because the two have to
 * agree: a family in a stack above with no row here is named and never fetched,
 * which is exactly how the board spent its first three months in Comic Sans. The
 * suite holds every stack's first family to a row in this table.
 */
export const typefaces = [
  { family: 'Permanent Marker', weights: [400] },
  { family: 'Public Sans', weights: [400, 600] },
  { family: 'Saira Condensed', weights: [600, 700] },
  { family: 'Stardos Stencil', weights: [400, 700] },
] as const;

// -------------------------------------------------------------------- textures

/**
 * The one inline-SVG feTurbulence tile left, as a ready-to-use CSS url() value.
 * Fixed seed — nothing about this board is randomised at runtime.
 *
 * There used to be three. The other two claimed to be rust and scratches and
 * were in fact the same cloud generator at two settings, which is why gt#35
 * replaced them with drawn geometry in ./damage. Grain stayed: grain genuinely
 * *is* noise, so a noise filter is the honest tool for it, and it is the one
 * layer here still transcribed verbatim from the reference.
 */
export const textures = {
  /** 140px tile, fractalNoise 0.9, 2 octaves, seed 7. */
  grain:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\' seed=\'7\'/%3E%3CfeColorMatrix type=\'matrix\' values=\'0 0 0 0 0.48 0 0 0 0 0.44 0 0 0 0 0.38 0 0 0 0.95 0\'/%3E%3C/filter%3E%3Crect width=\'140\' height=\'140\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
} as const;

/**
 * How hard each layer is laid on, and the tile size it is laid on at.
 *
 * Rust now carries a `rustMask` as well as an opacity, and that is the load-
 * bearing change of gt#35: the tile is only the material, and the mask is what
 * decides that a plate corrodes at its edges and around its screws rather than
 * evenly all over.
 *
 * `runWeather` is the layer that only exists on an old board — a fresh one does
 * not weep, which is most of what SCRUB THE ALTAR now undoes. Only the board
 * carries it: it needs a seam to hang from and room for the streaks to dry up
 * in, and a module plate has neither. See ../ui/module.
 */
export const textureLayers = {
  // `scratchesBack` is the board's scratch tile laid a second time, turned over
  // (gt#89): every mark on the tile leans the same way, and across the bare plate
  // round the wells — most of a tall window — that read as rain. The first pass
  // gave up some of its strength to the second so the plate is no more
  // scratched than it was, only scratched from more than one direction.
  board: { grain: 0.3, rustBase: 0.18, rustWeather: 0.4, rustSize: '620px', rustMask: placement.board, verdigris: 0.16, verdigrisSize: '380px', verdigrisPosition: '140px 90px', scratches: 0.22, scratchSize: '220px', scratchesBack: 0.16, scratchBackSize: '287px', scratchBackPosition: '113px 71px', runWeather: 0.5, runSize: runTile },
  module: { grain: 0.35, scratches: 0.34, scratchSize: '180px', rustBase: 0.22, rustSize: '420px', rustMask: placement.plate },
  modifier: { grain: 0.35, rustBase: 0.24, rustWeather: 0.5, rustSize: '365px', rustMask: placement.box },
  // 400px on the wake screen blew the blooms up until each blob-and-run
  // silhouette read as a shape in its own right — little mushrooms, repeating.
  // Held at the scale a plate wears it at, the tile goes back to being a
  // material.
  //
  // And two things stop it reading as wallpaper (gt#89). `rustPools` breaks the
  // even band round the frame into patches. `rustOver` is the same tile laid a
  // second time, turned over, at a size that shares no factor with the first's
  // and started somewhere else — so where the two overlap inside a patch, the
  // blots do not line up with themselves, and the pair does not repeat inside
  // any window anybody owns. One tile still, drawn twice on the one screen
  // that is thrown away the moment the lever is pulled.
  wake: {
    grain: 0.2,
    // Up from .16 and .13 (gt#100). The redrawn tile is patches and freckles
    // with bare metal between them, where the old one was nine blots to a
    // square, and through two masks at the old strengths almost none of it
    // reached the screen.
    rust: 0.34,
    rustSize: '437px',
    rustMask: placement.wake,
    rustPools: placement.wakePools,
    rustOver: 0.27,
    rustOverSize: '709px',
    rustOverPosition: '97px 61px',
  },
  /**
   * Film grain over everything, jittering on a 0.9s steps(1) loop. The stepped
   * timing is the point: the tile jumps five times a second and holds, the way
   * projected grain does, rather than sliding — a smooth drift would read as a
   * moving texture instead of as film.
   *
   * The keyframes themselves are declared in index.html, since a `@keyframes`
   * rule cannot be written as an inline style. tests/tokens.test.ts holds the
   * two in step.
   */
  film: { base: 0.08, grit: 0.22, size: '140px', animation: 'grainShift 0.9s steps(1) infinite' },
} as const;

// ------------------------------------------------------------ the shelf (gt#39)

/**
 * What the advanced-effects shelf is painted in. Its *numbers* — every threshold,
 * every table, the strobe's hard rate cap — live in ../ui/constants with the rest
 * of the geometry; what is here is colour, exactly as it is for every other layer.
 *
 * Two of the three keyframe names below are declared in index.html for the reason
 * {@link textureLayers.film}'s is: a `@keyframes` rule cannot be written as an
 * inline style and the whole board is built in code. tests/tokens.test.ts holds
 * the two files in step. The *durations* are deliberately not here — the strobe's
 * is a safety number and is composed from {@link RUPTURE} at the point of use, so
 * that a suite can check the rate rather than read a string back.
 */
export const rupture = {
  /**
   * A torn slice, and the whole of the compromise in it: the band recolours the
   * board *behind* it rather than displacing a copy of it. gt#39 asked for slices
   * of the board jumping, and duplicating the plate to get that would duplicate
   * every jack the wire layer measures — the issue says so itself. An offset,
   * recoloured band with a bright leading edge reads as the tear without owning
   * a second copy of anything.
   */
  sliceFilter: 'hue-rotate(-40deg) saturate(2.6) brightness(1.4) contrast(1.2)',
  /** …and what it paints instead where `backdrop-filter` is not supported. */
  sliceTint: 'rgba(255,72,30,0.18)',
  /** The hairline down the leading edge, which is what sells it as a cut. */
  sliceEdge: 'rgba(205,245,255,0.55)',

  /** The rolling band of a lost vertical hold, and the tear at its head. */
  rollFilter: 'brightness(1.3) contrast(0.8) saturate(0.65)',
  rollTint: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0) 72%)',
  rollTear: 'rgba(235,250,255,0.6)',
  rollAnimationName: 'signalRoll',

  /**
   * The strobe. White with the barest warmth in it and nothing else — a flash
   * with a colour reads as a lighting effect, and this one is meant to read as
   * the screen itself failing.
   */
  strobe: '#fff6e8',
  strobeAnimationName: 'strobeFlash',
} as const;

// ---------------------------------------------------------- CSS custom properties

/**
 * The tokens that CSS needs by name rather than by import.
 *
 * Custom properties rather than inline values because these are the four
 * biggest strings in the product — a drawn scratch field is several kilobytes
 * where a turbulence filter was a couple of hundred bytes — and every plate,
 * box and overlay on the board would otherwise carry its own copy.
 */
export const cssVars = {
  '--page': surfaces.page,
  '--grainTex': textures.grain,
  '--rustTex': damage.rust,
  '--verdiTex': damage.verdigris,
  '--scratchTex': damage.scratches,
  '--runTex': damage.runs,
  '--chipTex': breakage.chips,
  '--crackTex': breakage.cracks,
} as const;

/** Publish {@link cssVars} so stylesheets and inline styles can reach them. */
export function installTokenVars(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(cssVars)) {
    root.style.setProperty(name, value);
  }
}
