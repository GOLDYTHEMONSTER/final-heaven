import type { TunnelImage } from '@/components/ui/PerspectiveTunnelHero'

/**
 * The tunnel's photos on event pages until an event has its own: real
 * photographs of abandoned places and graffiti from Unsplash (free under the
 * Unsplash License, no credit required), cropped to 540×675 webp in
 * public/events/scenes. No AI images and no people: the owner asked for no AI
 * models on event pages (2 Nov 2026).
 *
 * Sources (unsplash.com/photos/…):
 *   tunnel-mouth  PZ1U2D8OF9w  Matthew              arch      umee2j6d9Yo  Alpha Perspective
 *   underpass     4X7PM6BqKoE  Koen Meyssen         corridor  _XBWLGlh1l4  Michael Kohlegger
 *   car-park      OKAMz5Tl22Y  Marc Rentschler      subway    J9Rec7bY2n8  Ivan Stepanov
 *   dark-room     adztd1fvYsE  Tyler Casey          warehouse _Z8laC3lpnk  Jouni Rajala
 *   the-wall      LWYHvJxev8o  Tammy Chan           backdrop  scXW6n2nQY8  Ivan Stepanov
 */
export const LAUNCH_SCENES: TunnelImage[] = [
  { src: '/events/scenes/corridor.webp', title: 'Corridor' },
  { src: '/events/scenes/arch.webp', title: 'The arch' },
  { src: '/events/scenes/the-wall.webp', title: 'The wall' },
  { src: '/events/scenes/underpass.webp', title: 'Underpass' },
  { src: '/events/scenes/dark-room.webp', title: 'Dark room' },
  { src: '/events/scenes/car-park.webp', title: 'Car park' },
  { src: '/events/scenes/tunnel-mouth.webp', title: 'Tunnel mouth' },
  { src: '/events/scenes/subway.webp', title: 'Subway' },
  { src: '/events/scenes/warehouse.webp', title: 'Warehouse' },
]

/** A graffiti tunnel, behind it all. */
export const LAUNCH_BACKDROP = '/events/scenes/backdrop.webp'
