// Drop 01 in one place: which products it is, how the full set is put
// together, and the images the reel streams. The set is one product whose
// options are groups of picks (see lib/sets): any 3 tops, 1 hoodie, 1 cap.
// New picks must be added to the set product's `colors` in the store before
// this file deploys, or checkout refuses them.

import { setColors, type SetGroup } from '@/lib/sets'
import { sized } from '@/lib/images'

type Pick = { id: string; pick: string }

/** The tabs of the tops step. Ladies tops come in XS–L, so a set with one stops at L. */
export const TOP_LINES = ['Drop tees', 'Acid fade', 'Print line', 'Ladies'] as const
export type TopLine = (typeof TOP_LINES)[number]

export const DROP_01 = {
  setId: 'p1792716318708',
  /** The customer picks any three for the set. The Gothic Angel Tee comes in black. */
  tees: [
    { id: 'p1792678401431', pick: 'Big Mark', line: 'Drop tees' },
    { id: 'p1792678401432', pick: 'Angel Wings', line: 'Drop tees' },
    { id: 'p1779109863726', pick: 'Gothic Angel', line: 'Drop tees' },
    { id: 'p1792717233095', pick: 'Spray Mark', line: 'Drop tees' },
    { id: 'p1792717233096', pick: 'Sculpted', line: 'Drop tees' },
    { id: 'p1792717233097', pick: 'See You in Heaven', line: 'Drop tees' },
    { id: 'p1792717233098', pick: 'Ascend', line: 'Drop tees' },
    { id: 'p1792717233099', pick: 'Heaven Smoke', line: 'Drop tees' },
    { id: 'p1793872547837', pick: 'Retro Sun', line: 'Acid fade' },
    { id: 'p1793872558568', pick: 'Tiger', line: 'Acid fade' },
    { id: 'p1793872555073', pick: 'Orange Grove', line: 'Acid fade' },
    { id: 'p1793872535713', pick: 'Main Character', line: 'Acid fade' },
    { id: 'p1793872539405', pick: 'Race 07', line: 'Acid fade' },
    { id: 'p1793872544099', pick: 'Grain Profile', line: 'Acid fade' },
    { id: 'p1792829988609', pick: 'Awaken', line: 'Print line' },
    { id: 'p1792829988610', pick: 'Holy Ground', line: 'Print line' },
    { id: 'p1792829988611', pick: 'Seraph Helm', line: 'Print line' },
    { id: 'p1792829988612', pick: 'Celestial Glyphs', line: 'Print line' },
    { id: 'p1792829988613', pick: 'Heaven Blade', line: 'Print line' },
    { id: 'p1792829988614', pick: 'Chrome Flames 07', line: 'Print line' },
    { id: 'p1792829988615', pick: 'Heaven Outline', line: 'Print line' },
    { id: 'p1792829988616', pick: 'Seraph 07 Spec', line: 'Print line' },
    { id: 'p1792844704814', pick: 'Rose Ringer', line: 'Ladies' },
    { id: 'p1792844704815', pick: 'Rose Waffle Tank', line: 'Ladies' },
    { id: 'p1792844704816', pick: 'Long-Stem Rose Tank', line: 'Ladies' },
    { id: 'p1792844704817', pick: 'Heaven Sent Crop', line: 'Ladies' },
    { id: 'p1792844704818', pick: 'Rose Trio Ringer', line: 'Ladies' },
    { id: 'p1792844704819', pick: 'Red Rose Tank', line: 'Ladies' },
  ] as (Pick & { line: TopLine })[],
  teeCount: 3,
  /** The customer picks one. The Gothic Angel Hoodie comes in black. */
  hoodies: [
    { id: 'p1792678401434', pick: 'Varsity 07' },
    { id: 'p1792678401433', pick: 'Move in Faith' },
    { id: 'p1778969625006', pick: 'Gothic Angel' },
    { id: 'p1794119984895', pick: 'Koi' },
    { id: 'p1794119989099', pick: 'Eagle' },
    { id: 'p1794119992899', pick: 'Astronaut' },
    { id: 'p1794119996591', pick: 'Skate Sun' },
    { id: 'p1794120001932', pick: 'Motocross' },
    { id: 'p1794120005860', pick: 'Grain Boxer' },
  ] as Pick[],
  /** One cap product in three colours; the customer picks one. */
  cap: {
    id: 'p1792716318709',
    colours: [
      { colour: 'grey', pick: 'Grey' },
      { colour: 'red', pick: 'Red' },
      { colour: 'green', pick: 'Green' },
    ],
  },
}

/** The full set's option groups. The set product's colors must equal DROP_01_SET_COLORS. */
export const DROP_01_SET: SetGroup[] = [
  { name: 'Tees', count: DROP_01.teeCount, choices: DROP_01.tees.map((t) => t.pick) },
  { name: 'Hoodie', count: 1, choices: DROP_01.hoodies.map((h) => h.pick) },
  { name: 'Cap', count: 1, choices: DROP_01.cap.colours.map((c) => c.pick) },
]
export const DROP_01_SET_COLORS = setColors(DROP_01_SET)

/** Every piece in the drop that is also sold on its own. */
export const DROP_01_PIECES = [...DROP_01.tees.map((t) => t.id), ...DROP_01.hoodies.map((h) => h.id), DROP_01.cap.id]

const reel = (file: string, alt: string) => ({ src: sized(`/drops/drop-01/${file}`, 640), alt })

// Close-ups alternate with flat-lays and caps so each piece shows its print and its shape.
export const DROP_01_REEL = [
  reel('reel-01-big-mark-close.jpg', 'Close-up of the distressed black mark and ember flame on the Big Mark Tee'),
  reel('reel-02-varsity-flatlay.jpg', 'Final Heaven 07 Varsity Hoodie laid flat, back print showing'),
  reel('reel-10-cap-red.jpg', 'Red trucker cap with the three-star mark'),
  reel('reel-03-angel-wings-close.jpg', 'Close-up of FINAL HEAVEN between the wings on the navy Angel Wings Tee'),
  reel('reel-11-gothic-angel-tee.jpg', 'Gothic Angel Print Tee in black, back print showing'),
  reel('reel-04-move-in-faith-flatlay.jpg', 'Move in Faith Hoodie laid flat, back print showing'),
  reel('reel-12-cap-green.jpg', 'Green trucker cap with the three-star mark'),
  reel('reel-05-the-mark-close.jpg', 'The three-star mark printed on the chest of a black hoodie'),
  reel('reel-06-big-mark-flatlay.jpg', 'Big Mark Tee in cream laid flat, back print showing'),
  reel('reel-13-gothic-angel-hoodie.jpg', 'Gothic Angel Print Hoodie in black, back print showing'),
  reel('reel-07-move-in-faith-close.jpg', 'Close-up of cracked red FAITH with not fear written across it'),
  reel('reel-14-cap-grey.jpg', 'Grey trucker cap with the three-star mark'),
  reel('reel-08-angel-wings-flatlay.jpg', 'Angel Wings Tee in navy laid flat, back print showing'),
  reel('reel-09-varsity-close.jpg', 'Close-up of the ember-trimmed 07 on the Varsity Hoodie'),
  reel('reel-15-spray-mark.jpg', 'Spray Mark Tee in white, the sprayed three-star mark on the back'),
  reel('reel-16-sculpted.jpg', 'Sculpted Tee in black, a marble angel cut into strips on the back'),
  reel('reel-17-see-you-in-heaven.jpg', 'See You in Heaven Tee in black, three stacked marble studies on the back'),
  reel('reel-18-ascend.jpg', 'Ascend Tee in sage, sun through cloud panels on the back'),
  reel('reel-19-heaven-smoke.jpg', 'Heaven Smoke Tee in brown, HEAVEN stacked with a smoke cherub on the back'),
]
