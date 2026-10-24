// Drop 01 in one place: which products it is, how the full set is put
// together, and the images the reel streams. The set is one product whose
// options are groups of picks (see lib/sets): any 3 tees, 1 hoodie, 1 cap.

import { setColors, type SetGroup } from '@/lib/sets'
import { sized } from '@/lib/images'

type Pick = { id: string; pick: string }

export const DROP_01 = {
  setId: 'p1792716318708',
  /** The customer picks any three for the set. The Gothic Angel Tee comes in black. */
  tees: [
    { id: 'p1792678401431', pick: 'Big Mark' },
    { id: 'p1792678401432', pick: 'Angel Wings' },
    { id: 'p1779109863726', pick: 'Gothic Angel' },
    { id: 'p1792717233095', pick: 'Spray Mark' },
    { id: 'p1792717233096', pick: 'Sculpted' },
    { id: 'p1792717233097', pick: 'See You in Heaven' },
    { id: 'p1792717233098', pick: 'Ascend' },
    { id: 'p1792717233099', pick: 'Heaven Smoke' },
  ] as Pick[],
  teeCount: 3,
  /** The customer picks one. The Gothic Angel Hoodie comes in black. */
  hoodies: [
    { id: 'p1792678401434', pick: 'Varsity 07' },
    { id: 'p1792678401433', pick: 'Move in Faith' },
    { id: 'p1778969625006', pick: 'Gothic Angel' },
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
