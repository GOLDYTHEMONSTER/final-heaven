// Campaign tiles the discovery feed mixes in between products, in order. Only
// images we already have (the Instagram posts in brand/social and crops of the
// shoot-02 photos, then the Drop 01 posts and close-ups), in three shapes so the
// feed has rhythm. Each links somewhere real; captions state facts only. Add or
// reorder entries here.

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
  { key: 'rose-line-post', src: '/editorial/post-rose-line-cover.jpg', ratio: 4 / 5, href: '/shop?category=Ladies',
    alt: 'Six women each wearing a piece from the Rose Line', kicker: 'New · Ladies', title: 'The Rose Line' },
  { key: 'heaven-sent-square', src: '/editorial/square-heaven-sent-crop.jpg', ratio: 1, href: '/product/p1792844704817',
    alt: 'A woman in the white Heaven Sent Crop Top in front of a stall of red roses', kicker: 'Ladies', title: 'Heaven Sent Crop Top' },
  { key: 'waffle-wide', src: '/editorial/wide-rose-waffle-tank.jpg', ratio: 16 / 9, href: '/product/p1792844704815',
    alt: 'A woman in the navy Rose Waffle Tank on a Lagos rooftop at sunset', kicker: 'Ladies', title: 'Rose Waffle Tank' },
  { key: 'tees-17k-post', src: '/editorial/post-17k-tees-cover.jpg', ratio: 4 / 5, href: '/shop?category=T-Shirts',
    alt: 'The eight back-print tees laid out in a grid', kicker: 'Back prints', title: 'Eight tees, ₦17,000 each' },
  { key: 'rose-trio-square', src: '/editorial/square-rose-trio-tee.jpg', ratio: 1, href: '/product/p1792844704818',
    alt: 'A woman laughing on concrete steps in the dusty-pink Rose Trio Ringer Tee', kicker: 'Ladies', title: 'Rose Trio Ringer Tee' },
  { key: 'double-star-wide', src: '/editorial/wide-double-star-tracksuit.jpg', ratio: 16 / 9, href: '/product/p1792844704821',
    alt: 'A man in the black Double Star Tracksuit leaning on a motorbike at night', kicker: 'Tracksuits', title: 'Double Star Tracksuit' },
  { key: 'rose-price-post', src: '/editorial/post-rose-line-price.jpg', ratio: 4 / 5, href: '/shop?category=Ladies',
    alt: 'Price card: ₦45,000 struck through, ₦17,000', kicker: 'The Rose Line', title: 'Every piece ₦17,000' },
  { key: 'holy-ground-square', src: '/editorial/square-holy-ground-tee.jpg', ratio: 1, href: '/product/p1792829988610',
    alt: 'The red stained-glass back print of the Holy Ground Tee, worn on a rooftop at dusk', kicker: 'Back print', title: 'Holy Ground Tee' },
  { key: 'mark-wide', src: '/drops/drop-01/reel-05-the-mark-close.jpg', ratio: 16 / 9, href: '/drop-01',
    alt: 'The three-star mark printed on the chest of a black hoodie', kicker: 'The mark', title: 'On the front of every piece' },
  { key: 'broken-star-post', src: '/editorial/post-broken-star-tracksuit.jpg', ratio: 4 / 5, href: '/product/p1792844704822',
    alt: 'A man in the cream and brown Broken Star Tracksuit on concrete stairs', kicker: 'Tracksuits', title: 'Broken Star Tracksuit' },
  { key: 'rose-ringer-square', src: '/editorial/square-rose-ringer-tee.jpg', ratio: 1, href: '/product/p1792844704814',
    alt: 'A woman in the cream Rose Ringer Baby Tee leaning on a pink wall', kicker: 'Ladies', title: 'Rose Ringer Baby Tee' },
  { key: 'faith-square', src: '/editorial/square-move-in-faith.jpg', ratio: 1, href: '/product/p1792678401433',
    alt: 'Close-up of cracked red FAITH with not fear written across it', kicker: 'Close-up', title: 'Move in Faith Hoodie' },
  { key: 'artwork', src: '/editorial/post-07-the-artwork.jpg', ratio: 4 / 5, href: '/drop-01',
    alt: 'The four Drop 01 back prints laid out flat with their print sizes', kicker: 'Drop 01', title: 'The artwork, flat' },
  { key: 'big-mark-square', src: '/editorial/square-big-mark.jpg', ratio: 1, href: '/product/p1792678401431',
    alt: 'Close-up of the distressed black mark and ember flame on the cream Big Mark Tee', kicker: 'Close-up', title: 'Big Mark Tee' },
  { key: 'cap-wide', src: '/drops/drop-01/reel-12-cap-green.jpg', ratio: 16 / 9, href: '/product/p1792716318709',
    alt: 'Green trucker cap with the three-star mark', kicker: 'Caps', title: 'Trucker cap in grey, red or green' },
  { key: 'long-stem-post', src: '/editorial/post-long-stem-rose-tank.jpg', ratio: 4 / 5, href: '/product/p1792844704816',
    alt: 'A woman holding a red rose, wearing the black Long-Stem Rose Tank', kicker: 'Ladies', title: 'Long-Stem Rose Tank' },
  { key: 'heaven-outline-square', src: '/editorial/square-heaven-outline-tee.jpg', ratio: 1, href: '/product/p1792829988615',
    alt: 'A woman looking back over her shoulder, showing the HEAVEN back print of the Heaven Outline Tee', kicker: 'Back print', title: 'Heaven Outline Tee' },
  { key: 'ice-post', src: '/editorial/post-ice-cover.jpg', ratio: 4 / 5, href: '/shop?category=Grillz',
    alt: 'Six grillz sets on a light background', kicker: 'New · Ice', title: 'Grillz, ₦10,000 a set' },
  { key: 'football-post', src: '/editorial/post-football-track-jacket.jpg', ratio: 4 / 5, href: '/product/p1792844704820',
    alt: 'A man in the red Football Track Jacket in a fenced football pitch at dusk', kicker: 'Jackets', title: 'Football Track Jacket' },
  { key: 'varsity-post', src: '/editorial/post-05-final-07-heaven.jpg', ratio: 4 / 5, href: '/product/p1792678401434',
    alt: 'Close-up of the ember-trimmed 07 on the Final Heaven 07 Varsity Hoodie', kicker: 'Close-up', title: 'Final Heaven 07 Varsity Hoodie' },
  { key: 'wings-square', src: '/editorial/square-angel-wings.jpg', ratio: 1, href: '/product/p1792678401432',
    alt: 'Close-up of FINAL HEAVEN between the wings on the navy Angel Wings Tee', kicker: 'Close-up', title: 'Angel Wings Tee' },
  { key: 'mark-post', src: '/editorial/post-06-the-mark.jpg', ratio: 4 / 5, href: '/drop-01',
    alt: 'The three-star mark: three stars, one cross', kicker: 'The mark', title: 'Three stars. One cross.' },
]

/** One editorial tile after every this many products. */
export const EDITORIAL_EVERY = 3
