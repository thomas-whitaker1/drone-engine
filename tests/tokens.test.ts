import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The transcription, not what the board is painted in: ../src/tokens lays a
// grade over these (gt#101), and tests/grade.test.ts holds every graded value to
// being exactly the grade of the one here.
import * as tokens from '../src/tokens/reference';
import * as damageTokens from '../src/tokens/damage';
import * as sigilTokens from '../src/tokens/sigils';
import {
  controls,
  fonts,
  jack,
  modifierPlates,
  plate,
  rupture as ruptureTokens,
  signals,
  sourcePlates,
  surfaces,
  textureLayers,
  textures,
} from '../src/tokens/reference';
import { STRIKE_IDS } from '../src/engine/constants';
// Every token string the original design wrote — the authority these tokens are
// copied from, pinned as a list now that the design files are not in the repo.
import { ORIGINAL_TOKENS } from './support/original-design';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Every string reachable from the module's exports, deduped. Functions are skipped. */
function collectStrings(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

/**
 * The values that are this board's rather than the reference's, each against the
 * reason it departs. Everything not named here must still be a verbatim
 * transcription: the point of the check below is that a departure is a decision
 * someone wrote down, never a digit that drifted.
 */
const departures: Record<string, string> = {
  [controls.faderWearGlow]:
    'The reference halos knobs and valve wheels alone, which leaves the wear ' +
    'tell silent on HOW LOUD and HOW OFTEN — a fader on all nine modules and a ' +
    'selector on five. A lane takes a bloom rather than a ring. See gt#18.',
  // The lever's anatomy. gt#34 grew the board past the four kinds the reference
  // draws, on the grounds that a scavenged half-broken board built entirely from
  // round knobs and neat faders reads as a synth plugin — so a bar in a slot has
  // nothing in the bundle to be transcribed from. The shapes echo the wake
  // screen's handle, which the bundle *does* draw; the values deliberately do
  // not, because that plate is held at arm's length and lit for it.
  [controls.leverSlot]: 'A slot cut through the plate, darker than the wake screen’s. See gt#34.',
  [controls.leverSlotShadow]: 'The slot read as cut rather than drawn on. See gt#34.',
  [controls.leverBar]: 'The throw bar, flatter than the wake lever it is a sibling to. See gt#34.',
  [controls.leverBarShadow]: 'The bar lifted off its slot at board scale. See gt#34.',
  [controls.leverGrip]:
    'The ribbed grip at 2px ribs rather than the wake handle’s 4px — the same ' +
    'rubber on a bar a quarter the size. See gt#34.',
  [controls.leverNotch]: 'A ratchet detent, which the reference has no stepped bar to need. See gt#34.',
  [controls.leverWearScuff]:
    'The third shape the wear tell takes, after the ring and the fader bloom. A ' +
    'thrown bar polishes a line down its slot rather than a pool or a ring, and ' +
    'the reference has no tell on anything but the round kinds. See gt#18 and gt#34.',
  [controls.toggleWearHaze]:
    'The fourth. A bank of bat handles is flicked at its feet one fingertip at a ' +
    'time, so the bone gathers along the base of the row and fades upward — the ' +
    'wells stay clean because nothing rubs them. See gt#18 and gt#34.',
  [tokens.ink.buttonPressedShadow]:
    'The reference has no latching button to draw, because every button on it ' +
    'is a press that springs back. STILLNESS stays down until it is pressed ' +
    'again, so it needs a held state the bundle never had to describe — an ' +
    'inset of the shadow it drops, rather than a new depth invented for it. ' +
    'See gt#33.',

  // The advanced-effects shelf (gt#39). Nine values, one reason: the handoff
  // describes a board in one piece. Every one of these paints the board coming
  // apart — a torn slice, a lost vertical hold, a full-screen flash — and there
  // is nothing in the bundle they could be a transcription *of*. They depart as
  // a set rather than one at a time, which is why the reason is written once.
  //
  // They are also the only tokens here that nothing draws unless a hand has
  // armed them. See ../src/ui/rupture, and ../src/apart for the arm.
  [ruptureTokens.sliceFilter]: 'The recolouring a torn slice does to the board behind it.',
  [ruptureTokens.sliceTint]: 'What a slice paints where `backdrop-filter` is not supported.',
  [ruptureTokens.sliceEdge]: 'The bright leading edge that reads as a cut rather than a tint.',
  [ruptureTokens.rollFilter]: 'What the rolling band does to what it passes over.',
  [ruptureTokens.rollTint]: 'And what it paints instead, on the same fallback terms as the slice.',
  [ruptureTokens.rollTear]: 'The tear line at the head of the roll.',
  [ruptureTokens.rollAnimationName]:
    'A @keyframes name, which is not appearance the bundle could hold — it is ' +
    'declared in index.html for the reason `grainShift` is, and held in step ' +
    'with this file by the check below.',
  [ruptureTokens.strobe]:
    'The flash. White with the barest warmth: a flash with a colour reads as a ' +
    'lighting effect, and this one is the screen failing.',
  [ruptureTokens.strobeAnimationName]: 'The second @keyframes name, on the same terms as the first.',

  // The hammer (gt#40, rebuilt in metal by gt#111 and as a drop hammer by gt#115).
  // Sixteen values, one reason, and it is a different reason from
  // the shelf's: those paint something the bundle never imagined, and these paint
  // something it drew and this board threw away. SUMMON's 58px verdigris dome was
  // transcribed exactly, from a design that drew one and said so —
  // what departs here is not a digit, it is the object.
  //
  // Which is why the dome's own two values are gone from ../src/tokens rather
  // than kept beside these under some "unused" heading. A transcription of a thing
  // the board does not have is not a transcription of anything.
  [signals.hammerRam]:
    'The ram: a block of steel taller than the row it hangs in, lit down its ' +
    'left side so it reads as a mass and not a hole (gt#115).',
  [signals.hammerRivets]:
    'A line of rivets, on the ram and up the columns. Small and many: it is the ' +
    'size of a rivet that says how big the thing it is in must be.',
  [signals.spark]: 'A spark off the anvil: white-hot at the head, orange at the tail. Light, and not graded.',
  [signals.sparkGlow]: 'What a spark lights round itself, for as long as it lasts.',
  [signals.strikeFlare]:
    'The flare along the struck line at contact. A line of light the width of ' +
    'the hammer for a seventh of a second, not a flash of the screen.',
  [signals.hammerFace]:
    'The striking face: bright across the middle, the one surface here that is ' +
    'kept polished by use.',
  [signals.hammerShadow]: 'A raised thing, off the plate it stands on. The guarded button’s seat wears it.',
  [signals.hammerBand]:
    'Dark steel for the parts that are a second piece: the plate bolted to the ' +
    'ram, the strip the hazard paint is on, the sow block, the columns’ shoes.',
  [signals.hammerBolt]:
    'A bolt head, in the corners of the plate on the ram. Lit from the upper ' +
    'left like every raised thing on the board.',
  [signals.hammerHazard]:
    'Hazard paint, on the ram, the sow block and round the guarded button: ' +
    'ochre and black, graded down with the metal. The one colour on the machine.',
  [signals.hammerPost]: 'A column of the frame. A round bar, so it is lit down its length rather than across.',
  [signals.anvilFace]: 'The struck plate. Lighter than the board, because a mark needs somewhere clean to be.',
  [signals.anvilShadow]: 'The plate set *into* the board rather than laid on it — a thing you can hit.',
  [signals.anvilFoot]: 'The bed the whole machine stands on. Unpolished, and nearly as dark as the board.',

  // The grime pass (gt#118). Four values, and the reason is the opposite of a
  // transcription: the bundle draws all of these things clean. Each is the one
  // mark of age given to a kind of object that had none.
  [tokens.ink.tapeGrime]: 'Dirt on a strip of tape: thumbed-down ends, clean across the middle where the word is.',
  [tokens.ink.tipGrime]: 'A stain in the far corner of the paper tag, away from where it starts being read.',
  [controls.tarnish]:
    'A dull patch on bare metal or plastic that fingers go to: a fader cap, a ' +
    'lever bar, a switch, a socket. Dark, warm, and off to one side.',
  [signals.lampBezel]: 'The ring of dirt round a lamp. An outline, so the lamp’s own glow is untouched.',

  // COME APART's guarded button (gt#112). Ten values and the hammer's reason: the
  // bundle has no such control. It was a scrap of tape in the bottom corner and
  // Thomas asked for a big red button under a cover, beside the hammer.
  [signals.apartSeat]: 'The plate the button is bolted to. The hammer’s steel, flat.',
  [signals.apartWell]: 'The recess the dome sits in: black in the middle, catching a little light at the rim.',
  [signals.apartWellShadow]: 'The recess is cut in, so the light falls into it from above.',
  [signals.apartDome]:
    'The button, up and dark: red plastic bleached toward pink by years under ' +
    'a lamp (gt#114). The one red on the board, because it is the one thing that only makes it worse.',
  [signals.apartDomeShadow]: 'A dome standing proud of its recess, with its own underside in shadow.',
  [signals.apartDomeLit]:
    'The button, down and lit: a lamp seen through old plastic, so a soft warm ' +
    'red with no white-hot middle (gt#114). It was a clean bright dome, and too clean.',
  [signals.apartDomeGlow]:
    'What a lit dome throws on the seat round it — short and under half ' +
    'strength, because the plastic takes most of it — and the shadow of having been pushed in.',
  [signals.apartCover]:
    'The guard: smoked, red-tinted and glossy across one corner, so the dome ' +
    'is seen through it and seen to be out of reach.',
  [signals.apartCoverFrame]: 'The guard’s steel edge, the dark of its own thickness, and its shadow on the seat.',
  [signals.apartHinge]: 'The hinge barrel and the lip a finger lifts the cover by. A round steel bar, lit from above.',
  [signals.dent]:
    'One mark: a dark pit with a bright lower lip, which is light falling in and ' +
    'catching the far wall. Reversing those two stops is the difference between ' +
    'a dent and a rivet.',
  [signals.dust]: 'What comes off the struck point. Bone, like every other bit of debris on this board.',

  // The three chain boxes gt#41 added. A third kind of reason again: the hammer
  // paints something the bundle drew and this board threw away, the shelf paints
  // something it never imagined, and these paint three more of a thing it drew
  // four of. So each entry says what the plate is *against the four that were
  // already there* — a seventh box on a single-row rack is told apart from its
  // neighbour by colour before anything else is read, which makes "not any of the
  // existing four" the actual specification rather than a nicety.
  [modifierPlates.doppler.plate]:
    'Bruised violet, and the one hue nothing else on this board carries — for ' +
    'the one box that is about something passing rather than about something ' +
    'sitting where it is.',
  [modifierPlates.doppler.face]: 'Its face, lifted far enough off the plate to read at a glance across a full rack.',
  [modifierPlates.magnets.plate]:
    'Iron oxide: redder and duller than GRIT’s scorched orange, which is the ' +
    'difference between a thing that was burnt and a thing that has been rusting ' +
    'in a damp shed. They are the two warm plates and they have to be told apart.',
  [modifierPlates.magnets.face]: 'A ferrous face rather than GRIT’s ember one, on the same argument.',
  [modifierPlates.offset.plate]:
    'Deep indigo. Clearly blue, where WOBBLE’s steel is a neutral grey that only ' +
    'leans that way — the two sit next to each other in chain order and this is ' +
    'what stops them reading as one plate cut in half.',
  [modifierPlates.offset.face]: 'Ice against WOBBLE’s grey, for the same reason and by the same distance.',

  // The two modules gt#42 added. The same kind of reason as the three boxes above
  // — more of a thing the bundle drew nine of — but the two plates depart in
  // opposite directions, and that is the decision rather than an accident of
  // palette. THROAT is made to match its neighbour and the cannon is made to
  // match nothing, because one of them belongs in the well it sits in and the
  // other is the one object on this board that is not from around here.
  [sourcePlates.throat.plate]:
    'Bone and ochre, a shade warmer than THE VOICE beside it. Two plates sharing ' +
    'one well should look like they came off the same machine — which is the ' +
    'exact opposite of the rule THE JUNK DRAWER is painted by.',
  [sourcePlates.throat.tint]: 'A warm lamp, so the well glows as one thing when both modules are on.',
  [sourcePlates.throat.face]: 'Its knob face, pulled off THE VOICE’s by just enough to tell the two apart.',
  [sourcePlates.laser.plate]:
    'The coldest plate on the board, and the only one that is properly blue. ' +
    'Everything here is scavenged and brown except COW’s green — so a hue this ' +
    'far outside the rust range is what says this module was not found in the ' +
    'same canal as the rest of them.',
  [sourcePlates.laser.tint]: 'And it bleeds that colour over the drawer, which no other junk module does.',
  [sourcePlates.laser.face]: 'A steel-blue face, on the same argument as the plate.',
  [sourcePlates.laser.bloom]:
    'What it flashes when it fires. Near-white with the blue left in it — every ' +
    'other bloom on this board is some shade of ember or bone, and a discharge ' +
    'should not look like a drum being hit.',
  // The four stacks (gt#69). The family each one leads with is the reference's,
  // and tests/fonts.test.ts holds every one of them to a row that is actually
  // fetched. What departs is everything after the first comma: the reference
  // ends two of its stacks in `cursive` and gives none of them a fallback worth
  // the name, because it never had to render without its faces. This board does
  // — before they land on every visit, and for good on a pulled network (gt#47).
  [fonts.name]:
    'Arial Narrow before the generic: a condensed grotesque is what holds the ' +
    'plate’s proportions, and plain Arial sets every module name visibly wider.',
  [fonts.tape]:
    'The reference ends this in `cursive`, which is Comic Sans on Windows — and ' +
    'with no face loaded, that is what every tape on the board was set in. ' +
    'Marker Felt and Segoe Print are the nearest hands the two big platforms ' +
    'ship, and a plain sans after them is better than a joke.',
  [fonts.stencil]:
    '`cursive` again in the reference, for a stencilled slab. Stencil where an ' +
    'office suite left one, then a serif: wide-tracked serif capitals read as ' +
    'lettering on a plate where a sans reads as a caption.',
  [fonts.body]: 'Whatever the system sets its own interface in, before the generic.',
  // No power (gt#76). The reference tells an off module from an on one by an 8px
  // lamp and a tint behind a brown plate, and has no word for a box nothing is
  // feeding beyond a dark lamp of its own.
  [plate.unlit]:
    'What is laid over a plate that is not in the sound. A near-black with the ' +
    'board’s own warmth left in it rather than a neutral one: an unlit plate ' +
    'here is one the lamps are not reaching, and the dark on this board is brown.',
  // Where a carried cable may land (gt#77). The reference draws a dashed wire to
  // the cursor and gives the board nothing to say back.
  [jack.open]:
    'A ring round an IN socket that would take the cable in the hand, in the ' +
    'lamp’s own amber: the statement a lamp makes — this is live — said a ' +
    'second early, about a box that is about to be.',
  [jack.aim]:
    'The same ring on the one socket the cable is over, closed and brighter, so ' +
    'the release has a visible target.',
  [textureLayers.wake.rustOverSize]:
    'The wake screen’s rust tile laid a second time (gt#89), at a size with no ' +
    'factor in common with the first pass’s, so the pair does not repeat inside ' +
    'any window. The reference lays it once, and it read as wallpaper.',
  // The rust and verdigris tiles are nearly twice the width they were (gt#100),
  // so a plate's edge shows the tile once instead of twice. Each surface lays
  // them at the scale it always did, which is a bigger number of a bigger tile.
  [textureLayers.board.rustSize]: 'The board lays the wider rust tile (gt#100) at the scale it laid the old one: 340px of 230 was 1.48 times, and so is this.',
  [textureLayers.board.verdigrisSize]: 'The verdigris tile at its own, wider size (gt#100), as it was laid before.',
  [textureLayers.module.rustSize]: 'The rust tile at its own size, as a plate has always worn it; the tile is wider now (gt#100).',
  [textureLayers.modifier.rustSize]: 'A box lays the wider rust tile (gt#100) at the .87 scale it laid the old one: 200px of 230.',
  [textureLayers.wake.rustSize]:
    'The wake screen lays the wider rust tile (gt#100) at about the scale it laid ' +
    'the old one, moved a few pixels off the round number so it shares no factor ' +
    'with the second pass over it.',
  [textureLayers.wake.rustOverPosition]: 'Where that second pass starts, so it does not sit on the first. See gt#89.',
  [textureLayers.board.scratchBackSize]:
    'The board’s scratch tile laid a second time, turned over (gt#89): every mark ' +
    'on the tile leans one way, and across the bare plate that read as rain.',
  [textureLayers.board.scratchBackPosition]: 'Where that second pass starts. See gt#89.',
  [surfaces.gritEdgeWarm]:
    'The reference lays GRIT’s fringe as a straight bar down the left of the ' +
    'window, linear-gradient(90deg, rgba(255,70,30,0.14), …), seventy pixels ' +
    'wide. gt#96 keeps the colour and bends it round the frame: one ellipse, clear ' +
    'in the middle and heaviest toward the top-left corner.',
  [surfaces.gritEdgeCold]:
    'The same fringe’s cold half, which was the mirror bar down the right. The ' +
    'reference’s colour, gathered toward the bottom-right corner. See gt#96.',
  [controls.gaugeLit]:
    'The reference tapes HOW LOUD under every fader, eleven times. gt#90 replaced ' +
    'the tape with a gauge cut beside the lane; this is a mark at or under the ' +
    'cap, in the stencil’s bone.',
  [controls.gaugeDim]: 'The same gauge, a mark above the cap. See gt#90.',
  [controls.knurl]:
    'The reference shades a knob and turns the whole shaded disc, so its shadow ' +
    'and highlight swing round with the pointer. gt#93 split the lit body from the ' +
    'dial that turns, which left the pointer as the only thing on a knob that ' +
    'shows it moving; the grip lines are what the dial carries besides.',
  [signals.lampHalo]:
    'A second, wider ring round a lit lamp, over the reference’s own. Eight ' +
    'pixels of glow round an 8px lamp is a lamp that is on; this is a lamp that ' +
    'lights the corner of the plate it is in, which is what lets a live module ' +
    'be found from across the room.',
};

/**
 * The two generated layers, which are not transcribed and so cannot be asked
 * about the bundle — a drawn scratch field has never appeared in a design file
 * and never will, and neither has a recursive stroke figure.
 *
 * This is a different kind of exemption from {@link departures}, which is a list
 * of individual values someone decided to change. Nothing here was decided
 * value-by-value: ../src/tokens/damage draws the whole layer from a seed, and
 * moving one number in its recipe moves every string it produces. So the
 * exemption is the module, and tests/damage.test.ts is what holds it — to
 * determinism and to being geometry rather than cloud, which is the standard
 * that actually applies to it. The handoff's own README licenses the swap: of
 * the three turbulence tiles it says "reproduce or swap for equivalent assets".
 *
 * ../src/tokens/sigils joins it on the same terms (gt#36), held by
 * tests/sigils.test.ts to determinism and to being geometry rather than a
 * typeface. What it contributes here is only its pigment table: every mark
 * itself is a *function* of a key, which `collectStrings` skips — so the marks
 * are covered by their own suite and never reach this one at all.
 */
const generated = new Set([
  ...collectStrings(damageTokens),
  ...collectStrings(sigilTokens),
]);

describe('design tokens', () => {
  it('transcribes every value verbatim from the design bundle', () => {
    const missing = [...collectStrings(tokens)]
      .filter((value) => !ORIGINAL_TOKENS.has(value))
      .filter((value) => !(value in departures))
      .filter((value) => !generated.has(value));
    expect(missing).toEqual([]);
  });

  it('never lets the generated exemption cover a value the bundle does have', () => {
    // The same guard the departures list gets, for the same reason. If a string
    // is in the reference, the check above is entitled to hold it to the
    // reference — and an exemption that quietly swallowed one would turn a
    // transcription error into a value nobody was checking at all.
    expect(generated.size).toBeGreaterThan(0);
    for (const value of generated) {
      expect(ORIGINAL_TOKENS.has(value), `${value.slice(0, 60)} is in the bundle`).toBe(false);
    }
  });

  it('pins nothing the board has stopped using, so the list cannot rot', () => {
    // The other end of the first check. A token deleted from ../src/tokens has
    // to come out of the pinned list in the same commit, or the list grows into
    // a record of things that used to be true.
    const strings = collectStrings(tokens);
    const stale = [...ORIGINAL_TOKENS].filter((value) => !strings.has(value));
    expect(stale).toEqual([]);
  });

  it('keeps every departure from the bundle one that is still a departure', () => {
    // A value transcribed into the bundle since, or deleted from the tokens,
    // should stop claiming to be a decision — otherwise this list becomes the
    // place drifted digits go to hide.
    const strings = collectStrings(tokens);
    for (const [value, reason] of Object.entries(departures)) {
      expect(strings.has(value), `${value} is no longer a token`).toBe(true);
      expect(ORIGINAL_TOKENS.has(value), `${value} is in the bundle now`).toBe(false);
      expect(reason.length, `${value} has no reason`).toBeGreaterThan(0);
    }
  });

  it('covers all eleven sources and all seven modifiers', () => {
    expect(Object.keys(sourcePlates)).toEqual([
      'guitar',
      'bass',
      'slowhit',
      'cymbal',
      'voice',
      'chainsaw',
      'sax',
      'maracas',
      'cow',
      'throat',
      'laser',
    ]);
    expect(Object.keys(modifierPlates)).toEqual([
      'grit',
      'murk',
      'wobble',
      'cavern',
      'doppler',
      'magnets',
      'offset',
    ]);
  });

  it('gives every source a plate gradient, a tint, a face and a rust ceiling', () => {
    for (const [id, entry] of Object.entries(sourcePlates)) {
      expect(entry.plate, id).toMatch(/^linear-gradient\(1[0-9]{2}deg,#[0-9a-f]{6},#[0-9a-f]{6}\)$/);
      expect(entry.tint, id).toMatch(/^rgba\(/);
      expect(entry.face, id).toMatch(/^#[0-9a-f]{6}$/);
      expect(entry.rustMax, id).toBeGreaterThan(0);
      expect(entry.rustMax, id).toBeLessThanOrEqual(1);
    }
  });

  it('gives a bloom colour to exactly the strike modules', () => {
    // Against STRIKE_IDS rather than a literal, because the bloom is the one
    // per-module token with no visible absence: a strike with no colour here does
    // not look wrong, it flashes in the neutral fallback (gt#24). Sorted, since the
    // plates are ordered by where they sit on the board and not by archetype.
    const blooming = Object.entries(sourcePlates)
      .filter(([, entry]) => 'bloom' in entry)
      .map(([id]) => id);
    expect(blooming.sort()).toEqual([...STRIKE_IDS].sort());
  });

  it('keeps the one remaining turbulence tile deterministic', () => {
    // Grain is the last of the three, and the only one a noise filter was ever
    // the right tool for — it is the layer that moves without being asked to,
    // not a layer claiming to be an injury. The other two are drawn now; their
    // determinism is tests/damage.test.ts's problem, and a harder one.
    expect(textures.grain.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(textures.grain).toContain("baseFrequency='0.9'");
    expect(textures.grain).toContain("seed='7'");
    expect(Object.keys(textures)).toEqual(['grain']);
  });

  it('agrees with the page background index.html paints before scripts run', () => {
    expect(readFileSync(root + 'index.html', 'utf8')).toContain(`background: ${surfaces.page};`);
  });

  it('finds the film grain’s keyframes declared in index.html', () => {
    // The one piece of the board's appearance that cannot be an inline style, so
    // the token names an animation that lives in the shell. If the two ever part
    // company the grain simply stops moving, which is not a thing an eye catches.
    const shell = readFileSync(root + 'index.html', 'utf8');
    const [name] = textureLayers.film.animation.split(' ');

    expect(shell).toContain(`@keyframes ${name}{`);
    // And the keyframes themselves are the reference's, verbatim.
    expect(shell).toContain(
      '@keyframes grainShift{0%{transform:translate(0,0)}20%{transform:translate(-28px,14px)}' +
        '40%{transform:translate(16px,-22px)}60%{transform:translate(-10px,-8px)}' +
        '80%{transform:translate(22px,18px)}100%{transform:translate(0,0)}}',
    );
  });

  it('finds the shelf’s two keyframes declared there too, and answering nothing', () => {
    // Same failure mode as the grain's and the same guard against it (gt#39): a
    // name that parts company with the shell is an effect that silently stops.
    // These two are not checked against the bundle, because the bundle has no
    // board coming apart in it — see the departures above.
    const shell = readFileSync(root + 'index.html', 'utf8');
    for (const name of [ruptureTokens.rollAnimationName, ruptureTokens.strobeAnimationName]) {
      expect(shell, name).toContain(`@keyframes ${name}{`);
    }
  });
});
