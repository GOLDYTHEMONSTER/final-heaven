// Drop 01 in one place: which products it is, how the full set is put
// together, and the images the reel streams. The set is one product whose
// "colour" options are the customer's picks (see setOption), so checkout
// validates and records them like any other option.

export const DROP_01 = {
  setId: 'p1792716318708',
  /** The three tees in every full set. The Gothic Angel Tee comes in black. */
  tees: ['p1792678401431', 'p1792678401432', 'p1779109863726'],
  /** The customer picks one. The Gothic Angel Hoodie comes in black. */
  hoodies: [
    { id: 'p1792678401434', pick: 'Varsity 07 hoodie' },
    { id: 'p1792678401433', pick: 'Move in Faith hoodie' },
    { id: 'p1778969625006', pick: 'Gothic Angel hoodie' },
  ],
  /** More Drop 01 tees, sold on their own (not part of the full set). */
  moreTees: ['p1792717233095', 'p1792717233096', 'p1792717233097', 'p1792717233098', 'p1792717233099'],
  /** One cap product in three colours; the customer picks one. */
  cap: {
    id: 'p1792716318709',
    colours: [
      { colour: 'grey', pick: 'Grey cap' },
      { colour: 'red', pick: 'Red cap' },
      { colour: 'green', pick: 'Green cap' },
    ],
  },
}

/** The set's option for a hoodie and cap pick, e.g. "Varsity 07 hoodie + Grey cap". Must match the set product's colours. */
export const setOption = (hoodie: string, cap: string) => `${hoodie} + ${cap}`

/** Every piece in the drop that is also sold on its own. */
export const DROP_01_PIECES = [...DROP_01.tees, ...DROP_01.moreTees, ...DROP_01.hoodies.map((h) => h.id), DROP_01.cap.id]

const reel = (file: string, alt: string) => ({ src: `/drops/drop-01/${file}`, alt })

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
