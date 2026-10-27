# Hype, phase 1: anonymous community scores

Migration: `supabase/migrations/20261028100000_product_hype.sql`. Code: the rules `lib/hype.ts` (pure), the server side `lib/hype-server.ts`, the endpoints `app/api/hype` (public) and `app/api/admin/hype` (the switch), the browser hook `lib/useHype.ts`, the components `components/hype/Hype.tsx` and `components/admin/HypeSwitch.tsx`, and the styles `app/hype.css`. Design draft: `brand/hype/draft.html` (`?board=ranks` or `?board=frames`; renderable with `brand/social/video/_build/render.mjs`). Tests: `tests/unit/hype.test.ts`, `tests/db/hype.test.ts`.

This is phase 1 of the Hype Culture concept: the Hype button, the score and the ranks. The anonymous interest profile (phase 2) already exists in the browser (`lib/stores/interestStore.ts`, `lib/discovery.ts`); a hype now also counts as interest in its category. Discovery Frames are drafted in `app/hype.css` and the draft, but are not earned yet (phase 4).

## How it works

- **Off until switched on** in Admin → Store → Hype. While it's off, the store shows nothing and `/api/hype` answers `{ enabled: false }` from the CDN.
- **No account.** The first tap sets one first-party cookie (`fh_hv`) holding a random id. The database stores only a keyed hash of it, so a hype counts once per browser per product. There's no fingerprinting, and no IP is stored (it's used, hashed, for the rate limit only).
- **Refusals:**
  - other sites' pages (Origin check);
  - bots;
  - more than 30 hypes in 10 minutes from one address;
  - drafts and products of other stores.
  
  The page shows a hype as counted only when the server says it was.
- **Score (0–100)** comes from the signals that exist today, engagement (all hypes) and momentum (hypes in the last 7 days), weighted equally. Both saturate, so the first hypes count most and no product runs away. Reviews and sentiment join when reviews exist. The daily job re-scores every hyped product, so momentum fades.
- **Ranks:** Unseen 0, Emerging 10, Buzzing 25, Trending 40, Elite 60, Iconic 75, Legendary 90.
  - Each rank also needs evidence (1, 5, 15, 40, 80 and 150 hypes). A high score without it shows the lower rank, marked **Early**.
  - A rank only drops once the score is 3 points under its floor, so it doesn't flicker.
  - Legendary needs Iconic held for 7 days.
- **Honest wording:** "Community hype, not a rating". No invented counts; peak score and rank are kept for later "formerly Legendary" moments.

Every number is a named constant in `lib/hype.ts` (`RANKS`, `HYPE_RULES`), to tune once there's real traffic.

## Before switching it on

1. Apply the migration (dry-run first; see CLAUDE.md).
2. Decide when: scores start at zero. The suggestion is after the November launch, once there are visitors.
3. Switch it on in Admin → Store. The top ten hyped products show there.
