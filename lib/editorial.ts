// Campaign tiles the discovery feed mixes in between products. Only images we
// already have (Drop 01 posts and close-ups), in three
// shapes so the feed has rhythm. Each links somewhere real; captions state
// facts only. Add or reorder entries here.

export type EditorialTile = {
  key: string
  src: string
  /** Width / height of the image file. */
  ratio: number
  alt: string
  /** Short label above the title. */
  kicker: string
  title: string
  href: string
}

export const EDITORIAL: EditorialTile[] = [
  { key: 'mark-wide', src: '/drops/drop-01/reel-05-the-mark-close.jpg', ratio: 16 / 9, href: '/drop-01',
    alt: 'The three-star mark printed on the chest of a black hoodie', kicker: 'The mark', title: 'On the front of every piece' },
  { key: 'faith-square', src: '/editorial/square-move-in-faith.jpg', ratio: 1, href: '/product/p1792678401433',
    alt: 'Close-up of cracked red FAITH with not fear written across it', kicker: 'Close-up', title: 'Move in Faith Hoodie' },
  { key: 'artwork', src: '/editorial/post-07-the-artwork.jpg', ratio: 4 / 5, href: '/drop-01',
    alt: 'The four Drop 01 back prints laid out flat with their print sizes', kicker: 'Drop 01', title: 'The artwork, flat' },
  { key: 'big-mark-square', src: '/editorial/square-big-mark.jpg', ratio: 1, href: '/product/p1792678401431',
    alt: 'Close-up of the distressed black mark and ember flame on the cream Big Mark Tee', kicker: 'Close-up', title: 'Big Mark Tee' },
  { key: 'cap-wide', src: '/drops/drop-01/reel-12-cap-green.jpg', ratio: 16 / 9, href: '/product/p1792716318709',
    alt: 'Green trucker cap with the three-star mark', kicker: 'Caps', title: 'Trucker cap in grey, red or green' },
  { key: 'varsity-post', src: '/editorial/post-05-final-07-heaven.jpg', ratio: 4 / 5, href: '/product/p1792678401434',
    alt: 'Close-up of the ember-trimmed 07 on the Final Heaven 07 Varsity Hoodie', kicker: 'Close-up', title: 'Final Heaven 07 Varsity Hoodie' },
  { key: 'wings-square', src: '/editorial/square-angel-wings.jpg', ratio: 1, href: '/product/p1792678401432',
    alt: 'Close-up of FINAL HEAVEN between the wings on the navy Angel Wings Tee', kicker: 'Close-up', title: 'Angel Wings Tee' },
  { key: 'mark-post', src: '/editorial/post-06-the-mark.jpg', ratio: 4 / 5, href: '/drop-01',
    alt: 'The three-star mark: three stars, one cross', kicker: 'The mark', title: 'Three stars. One cross.' },
]

/** One editorial tile after every this many products. */
export const EDITORIAL_EVERY = 3
