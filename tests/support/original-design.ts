// What the suites know about the original design, now that its files are not
// in the repository.
//
// The board was built from a design handoff: a brief, a reference engine and a
// reference board. The suites used to read those files and quote them. They do
// not any more — every number the port took from the design is pinned where it
// is tested, as a literal, so a slipped digit still fails and nothing outside
// tests/ has to exist for it to.
//
// What is left to share is the one question several suites ask: which modules
// did the original design draw, and which came after it.

import { POST_HANDOFF_SOURCES, type SourceId } from '../../src/engine/constants';

/**
 * An id list with the modules the original design never drew taken out, so a
 * pin can name the design's own list without asking about modules that
 * postdate it. `POST_HANDOFF_SOURCES` is the single place that says which.
 */
export const transcribed = <T extends SourceId>(ids: readonly T[]): T[] =>
  ids.filter((id) => !POST_HANDOFF_SOURCES.includes(id));

/**
 * Every token string the original design wrote, exactly as it wrote it.
 *
 * tests/tokens.test.ts holds ../../src/tokens to this list: a token is one of
 * these, or a departure with a written reason, or generated. A value that is
 * none of the three fails, which is how a slipped digit in a colour is caught.
 * The list is not edited to make a test pass. A token changed on purpose goes
 * in that suite's `departures` with its reason; a token removed comes out of
 * here in the same commit.
 */
export const ORIGINAL_TOKENS: ReadonlySet<string> = new Set([
  '#121009',
  'radial-gradient(ellipse at 50% 55%, #1a1610 0%, #0d0b07 78%)',
  'linear-gradient(170deg,#1f1c16,#131110)',
  'inset 0 0 90px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
  'radial-gradient(1000px 650px at 15% 5%, rgba(120,66,32,0.12), rgba(0,0,0,0) 60%), radial-gradient(900px 700px at 88% 95%, rgba(70,105,88,0.1), rgba(0,0,0,0) 60%)',
  'radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 42%, rgba(5,4,2,0.9) 100%)',
  '#0b0806',
  'rgba(0,0,0,0.22)',
  'inset 0 0 0 1px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -12px 24px rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.16)',
  'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.02)',
  'rgba(0,0,0,0.2)',
  'rgba(0,0,0,0.28)',
  'inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.03), inset 0 -14px 26px rgba(0,0,0,0.4)',
  'rgba(0,0,0,0.3)',
  'inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -14px 26px rgba(0,0,0,0.4)',
  '1px solid rgba(5,3,2,0.9)',
  '3px',
  '0 5px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 18px rgba(0,0,0,0.4)',
  '0 5px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -8px 16px rgba(0,0,0,0.4)',
  'rgba(0,0,0,0)',
  'radial-gradient(circle at 35% 30%, #7d7666, #322e26 75%)',
  '0 1px 2px rgba(0,0,0,0.7)',
  'rgba(15,10,6,0.85)',
  'repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 24px, rgba(125,118,102,0.3) 24px 29px, rgba(0,0,0,0) 29px 52px)',
  'linear-gradient(165deg,#252019,#14100c)',
  '1px solid rgba(0,0,0,0.85)',
  '0 18px 50px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
  '#070503',
  'inset 0 3px 8px rgba(0,0,0,1), inset 0 0 0 1px rgba(255,255,255,0.04)',
  'linear-gradient(#7d7460,#443d2f)',
  '0 6px 14px rgba(0,0,0,0.75), inset 0 2px 3px rgba(255,255,255,0.28)',
  'repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 4px, rgba(0,0,0,0) 4px 9px)',
  'radial-gradient(circle at 50% 45%, #070503 38%, #262219 46%, #453f33 56%, #1c1913 64%)',
  '0 1px 0 rgba(255,255,255,0.07), inset 0 2px 5px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,0,0,0.6)',
  '#100d09',
  'inset 0 2px 5px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.05)',
  'linear-gradient(#8a8270,#4e4738)',
  '0 1px 2px rgba(0,0,0,0.6)',
  'rgba(216,208,182,0.82)',
  '0 1px 0 rgba(0,0,0,0.7)',
  'rgba(206,196,168,0.3)',
  'rgba(206,196,168,0.35)',
  'rgba(206,196,168,0.28)',
  'rgba(206,196,168,0.4)',
  'rgba(206,196,168,0.5)',
  '#c4baa0',
  '#b8ab86',
  '#a89a75',
  '#1e1810',
  '0 2px 4px rgba(0,0,0,0.55)',
  '0 2px 4px rgba(0,0,0,0.5)',
  '0 1px 3px rgba(0,0,0,0.4)',
  '0 3px 8px rgba(0,0,0,0.6)',
  '#ddd3b8',
  '#221c12',
  '0 4px 14px rgba(0,0,0,0.55)',
  '#ffb352',
  '#33281c',
  '0 0 8px rgba(255,168,70,0.9)',
  'inset 0 1px 2px rgba(0,0,0,0.9)',
  '#0a0806',
  '#453729',
  'rgba(216,205,180,0.22)',
  '#9c6132',
  '#c2823f',
  '#2b2318',
  '#d5cbb0',
  '0 0 3px rgba(0,0,0,0.8)',
  '#0b0906',
  '0 4px 8px rgba(0,0,0,0.7), inset 0 1px 2px rgba(255,255,255,0.18), inset 0 -3px 6px rgba(0,0,0,0.55)',
  'radial-gradient(circle, rgba(0,0,0,0) 52%, rgba(200,188,152,0.45) 66%, rgba(0,0,0,0) 78%)',
  'radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(200,188,152,0.4) 68%, rgba(0,0,0,0) 80%)',
  'inset 0 2px 5px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.05)',
  'linear-gradient(#655e50 0%, #3d382e 45%, #262219 55%, #454034 100%)',
  '0 3px 6px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.22)',
  '#cfc4a8',
  '0 3px 7px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.16), inset 0 -2px 5px rgba(0,0,0,0.55)',
  '#4e4736',
  'rgba(12,9,6,0.4)',
  'linear-gradient(90deg,#5c5443,#332d22)',
  '0 0 3px rgba(0,0,0,0.6)',
  'radial-gradient(circle at 38% 32%, #6d6552, #2e2a20 80%)',
  '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)',
  '0 6px 14px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,255,255,0.12), 0 0 0 1px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(0,0,0,0.6)',
  'linear-gradient(165deg,#262319,#191612)',
  'rgba(150,80,40,0.4)',
  '#6f6858',
  'linear-gradient(150deg,#232019,#161310)',
  'rgba(110,60,38,0.4)',
  '#635c4d',
  'linear-gradient(160deg,#26221a,#181510)',
  'rgba(180,125,55,0.35)',
  '#7d7259',
  '255,180,100',
  'linear-gradient(145deg,#25251e,#171712)',
  'rgba(200,192,168,0.3)',
  '#8d8570',
  '230,225,200',
  'linear-gradient(160deg,#2a251b,#1b1712)',
  'rgba(185,165,120,0.35)',
  '#96793f',
  '220,190,140',
  'linear-gradient(155deg,#33241b,#1f1610)',
  'rgba(180,90,40,0.45)',
  'linear-gradient(150deg,#2f2817,#1d1810)',
  'rgba(160,130,72,0.45)',
  'linear-gradient(160deg,#2a2720,#1a1812)',
  'rgba(200,190,158,0.32)',
  '230,215,180',
  'linear-gradient(150deg,#222b25,#151b17)',
  'rgba(88,128,108,0.45)',
  '#567c6a',
  '140,200,170',
  'linear-gradient(160deg,#3a2317,#241510)',
  'linear-gradient(160deg,#1f2822,#131a16)',
  'linear-gradient(160deg,#262833,#15161d)',
  '#6f7382',
  'linear-gradient(160deg,#25242b,#141318)',
  '#6d6552',
  '230,200,150',
  'Permanent Marker',
  'Public Sans',
  'Saira Condensed',
  'Stardos Stencil',
  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\' seed=\'7\'/%3E%3CfeColorMatrix type=\'matrix\' values=\'0 0 0 0 0.48 0 0 0 0 0.44 0 0 0 0 0.38 0 0 0 0.95 0\'/%3E%3C/filter%3E%3Crect width=\'140\' height=\'140\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
  '140px 90px',
  '220px',
  '180px',
  '140px',
  'grainShift 0.9s steps(1) infinite',
]);
