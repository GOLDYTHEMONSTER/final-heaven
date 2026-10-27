// The browsing clips: what each one does on the live store, second by second.
// `frame` runs in the page before every screenshot with `t` (seconds) in scope; it sets the
// scroll and swipe positions, so the motion is smooth and identical on every capture.
// Taps are real; `swipes` is only drawn (the finger) by the edit. Positions are fractions of the frame.
const lib = `
  const seg = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const ease = (p) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const top = (el) => el ? el.getBoundingClientRect().top + window.scrollY : 0;
  const heading = (re) => [...document.querySelectorAll('h1,h2,h3')].find((h) => re.test(h.textContent));
  const button = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
`

export default {
  // The homepage: the hero, then Shop by mood, then the feed.
  home: {
    url: '/',
    seconds: 6,
    playbackRate: 0.35,
    frame: `${lib}
      const mood = top(heading(/shop by mood/i)) - 70, feed = top(heading(/for you/i)) - 70;
      const y = t < 2.6 ? mood * ease(seg(1.0, 2.6)) : mood + (feed + 700 - mood) * ease(seg(3.3, 6.0));
      window.scrollTo(0, y);`,
  },

  // Shop by mood: tap The Rose Line, then scroll its pieces.
  mood: {
    url: '/collections',
    seconds: 6.5,
    frame: `${lib}
      if (location.pathname === '/collections') window.scrollTo(0, 0);
      else window.scrollTo(0, 720 * ease(seg(2.2, 6.3)));`,
    taps: [{ at: 1.3, find: `[...document.querySelectorAll('a')].find((a) => /rose line/i.test(a.textContent))`, settle: 2000 }],
  },

  // A product page: swipe to the black set and the colour follows; scroll down to it, the price and Add to cart.
  swipe: {
    url: '/product/p1793045689436',
    seconds: 6.5,
    frame: `${lib}
      const track = document.querySelector('[aria-roledescription="carousel"]');
      if (track && t >= 0.8 && t <= 1.6) {
        track.style.scrollSnapType = t < 1.6 ? 'none' : '';
        track.scrollLeft = track.clientWidth * ease(seg(0.8, 1.5));
      }
      const buy = button(/add to cart/i);
      window.scrollTo(0, Math.max(0, top(buy) - 520) * ease(seg(3.0, 5.6)));`,
    swipes: [{ at: 0.8, dur: 0.7, from: [0.82, 0.36], to: [0.18, 0.36] }],
  },

  // Pick a size, add the Long-Stem Rose Tank to the cart, open the cart: ₦17,000, checkout opens 13 November.
  cart: {
    url: '/product/p1792844704816',
    seconds: 7,
    frame: `${lib}
      if (location.pathname.startsWith('/product')) {
        const size = heading(/^size$/i);
        window.scrollTo(0, Math.max(0, top(size) - 260) * ease(seg(0.6, 1.6)));
      } else window.scrollTo(0, 0);`,
    taps: [
      { at: 2.0, find: `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'M')` },
      { at: 2.6, find: `[...document.querySelectorAll('button')].find((b) => /^black$/i.test(b.textContent.trim()))` },
      { at: 3.3, find: `[...document.querySelectorAll('button')].find((b) => /add to cart/i.test(b.textContent))`, settle: 900 },
      { at: 4.3, find: `document.querySelector('a[href="/cart"]')`, settle: 1500 },
    ],
  },
}
