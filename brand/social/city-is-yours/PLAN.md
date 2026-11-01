# THE CITY IS YOURS: production bible

## The story in one breath

The world is full of things worth finding: the sneakers, the chain, the gadget you saw online. But not everything is within reach, especially from Nigeria. **Final Heaven closes that gap.**

The streets, tunnels and night are the visual language (where finds happen), not the product. We sell discovery: a sneaker person, a jewellery person, a gadget person and a fashion person should all see themselves.

It has two voices:
- **The Campaign** (teasers, hero film): dark, slow, mysterious. It makes people stop scrolling.
- **The Culture** (shorts): playful, confident, nonchalant, looking straight at the camera. It makes people want in.

The look is premium underground: global street culture with a Lagos heartbeat. The colours are obsidian, concrete grey, dirty white and faded silver, with deep red used rarely. The tagline is: You've seen it. Now it's closer.

## Fixed choices (no test round)

| Choice | Decision | Why |
|---|---|---|
| Stills | GPT Image 2.5, 2k, medium quality, **1 credit** | Proven on our products; it keeps prints and details accurate |
| Video | Cinematic Studio Video V2, 5 s, sound off, **5 credits** | Used before, known cost and quality |
| Clip shape | Each clip copies the shape of its start still, so clip stills are made at **9:16** and feed stills at **4:5** | Avoids re-cropping later |
| Products | Every product in a shot is given to the model as its real store photo | No invented products |
| Text, logo, sound | **Never generated.** The mark (`brand/logo/`) is composited in the edit; text is typeset; sound comes from free libraries | No retakes for garbled text |

Every clip is made as **a still first (1 credit) that you approve**, and only then animated (5 credits). A wrong frame costs 1 credit, not 6.

## Style line (in every prompt)

> 35 mm night street editorial, direct on-camera flash or a single hard practical light, deep blacks, fine grain, concrete and graffiti textures, Lagos city at night with global street culture, palette obsidian black, concrete grey, dirty white, faded silver, deep red only where stated. No text, no letters, no logos, no watermarks, no brand marks. Natural hands with five fingers.

## Never in any frame

Third-party logos (swooshes, stripes, monograms). Readable writing on walls (graffiti is shapes and colour only). Products the store doesn't sell, shown as for sale. Skate tricks shown in full. A held close-up of fingers, grills or chain links.

---

## 1. Cast and places (10 credits, done 1 Nov 2026)

No jackets (owner, 1 Nov 2026): the Satin Bomber and the Puffer Gilet are out. The sheets are in `bible/`. Use the `-ref.png` crops as references, because they leave out the faulty panels:
- **C2:** the tee's back text came out garbled. When the back shows, also pass the real Sculpted Tee photo.
- **C4:** the profile panel had letters in the sleeve tape.
- **C5:** the AI drew three-stripe sneakers. Keep her feet out of frame.

One reference sheet each (front, three-quarter and profile, plus full body). Every later shot uses these as references.

| ID | Character | Who | Wardrobe (real products) |
|---|---|---|---|
| C1 | The Skater | Man, early 20s, slim, low fade | Holy Ground Tee (oversized), Striped Track Pants, Lightning-Panel Suede Skate Shoes, Final Heaven Trucker Cap |
| C2 | The Collector | Man, mid 20s, short twists | Sculpted Tee, Iced Ghost Pendant, Iced Cuban Bracelet, Silver Tachymeter Watch, Iced Fang Grillz |
| C3 | The Trendsetter | Woman, early 20s, sleek bun | Heaven Sent Crop Top (White), Side-Stripe Summer Pants, Thick-Soled High-Top Sneakers, Star Cross Pendant |
| C4 | The Night Owl | Man, late 20s, tall, beard | Double Star Tracksuit (Black), Utility Chest Rig Bag, Fleece-Lined High-Top Sneaker Boots, plain black shades (prop) |
| C5 | The Creative | Woman, early 20s, braids | Spray Mark Tee (White), Faces Print Knee-Length Shorts, Suede Low-Top Court Sneakers, Buckle-Front Sling Bag, paint marker (prop) |

| ID | Place | Look |
|---|---|---|
| L1 | Underpass | Graffiti-covered Lagos flyover underpass at night, one sodium streetlight, wet concrete |
| L2 | Tunnel | Long pedestrian tunnel, flickering strip lights, vanishing point |
| L3 | Parking structure | Empty multi-storey car park, pillars, oil-slick reflections |
| ~~L4~~ | ~~Night street~~ (dropped: looked fake) | Lagos street after rain, okada and car headlights as bokeh |
| ~~L5~~ | ~~Rooftop~~ (dropped: looked fake) | Lagos skyline at blue hour, wind, water tanks |

## 2. Teasers (30 credits, 4 clips)

| ID | Shot | Still (9:16) | Motion (5 s) | Notes |
|---|---|---|---|---|
| T1 | **The location** | L2 tunnel, empty; a blank skateboard rolls in from the left and stops in the middle; camera locked | The board rolls in, slows, stops; the lights flicker once | Camera **locked** so the logo can be stencilled onto the wall in the edit. Copy: SOMETHING IS COMING. / NOVEMBER |
| T2a | **The finds: pendant** | Iced Ghost Pendant hanging in pure darkness, one hard spotlight | Slow rotation, light sweeping across the stones | Start from the store photo. Copy for T2: YOU KNOW THE FEELING. |
| T2b | **The finds: sneaker** | Lightning-Panel Suede Skate Shoe suspended in darkness, rim light | Slow push in, slight turn | The same shot is the hero film's "sneakers suspended" |
| T2c | **The finds: gadget** | Orange Retro Handheld Console under a single streetlight beam, dust in the air | Slow push in, the screen glows on | Screen shows abstract glow only, no game art |
| T3 | **The message** | C4 under the L1 bridge, centred, hands in pockets, looking into the lens | Slow push in, he doesn't move, one blink | Copy: WHAT IF EVERYTHING YOU FOUND ONLINE WAS CLOSER? |

Teaser 4 is the hero film (section 5).

## 3. Culture shorts (90 credits, 15 clips)

Each clip is 1 still plus 5 credits of motion. Each lists its start frame, the action, the camera, and how it gets round AI weak spots.

| ID | Character, place | Start frame | Action (5 s) | Camera | Risk handled |
|---|---|---|---|---|---|
| S1 | **Lens signature**: C5, L1 | Close; she's uncapping the marker, eyes on the lens | She steps in and raises the marker to the lens; **cut on contact** | Handheld, flash | The writing is drawn in the edit, never generated |
| S2 | **Lens signature**: C1, L3 | Medium; board under his arm, marker in his hand | He walks up, smirks, the marker comes up to the lens; cut | Handheld | As S1 |
| S3 | **Jewellery flex**: C2, L3 | Chest-up, chain on, car-park light behind | He lifts the pendant toward the lens; it swings and he lets go | Push in | Pendant in motion and in flash, never held still in focus |
| S4 | **Jewellery flex**: C3, L3 | Close; Star Cross Pendant against the white crop top | She tugs the chain and looks down, then up at the lens | Slow push | Same |
| S5 | **Grill flash**: C2, L1 | Extreme close-up, side profile, mouth closed | He turns to the lens and gives a half-grin; the grills catch the flash | Locked, flash frames added in the edit | The grin lasts under 1 s in the edit |
| S6 | **Fisheye lean-in**: C3, L1 | Fisheye, low angle, flyover deck behind | She leans right into the lens, deadpan, then pulls back | Fisheye, locked | Distortion hides face drift |
| S7 | **Fisheye sneakers**: C1, L1 | Fisheye at ground level, skate shoes 1 m away | The shoes step toward the lens until they fill it | Ground level | Sets up the hero-film transition (frame fills) |
| S8 | **Fisheye group**: C1, C3, C5, L2 | Fisheye from below, three faces looking down into the lens | They laugh, one points at the lens | Locked | Three people is the most a frame gets |
| S9 | **Skate roll-past**: C1, L1 | Low angle, empty underpass, board wheels in the foreground | He rolls past very close; motion blur | Locked low | No trick shown |
| S10 | **Skate pick-up**: C1, L3 | He stops in front of the lens, foot on the tail | He kicks the board up and catches it; holds the graphic side to the lens (blank deck) | Locked | Deck stays blank; graphic composited in the edit if wanted |
| S11 | **Outfit, Night Owl**: C4, L2 | From behind, him walking into the tunnel's vanishing point | Walks away into the dark; the lights flicker | Slow follow | **The hero film's last shot** |
| S12 | **Outfit, Trendsetter**: C3, L3 | Full body, walking toward the lens between the pillars, wet floor | Confident walk, a glance to the lens at the end | Backing dolly | Walk is the most reliable AI motion |
| S13 | **Outfit, Collector**: C2, L1 | Full body against a graffiti pillar, sodium light | He adjusts his chain, looks off into the dark | Slow arc | |
| S14 | **Group**: C1, C4, C5, L1 | Wide; three sitting on concrete steps under the bridge | They hang out; one passes earbuds (Clip-On Earbuds, LED Display) | Slow push | "Headphones going on" beat for the hero film |
| S15 | **Slow-motion fabric**: C4, L3 | Medium; the tracksuit jacket mid-turn in the wind | Slow-motion fabric ripple, his head turning to the lens | Locked | |

## 4. Photo sets (18 credits, 4:5 feed and website stills)

Set 03 (The Culture) costs nothing: it uses the 6 best start frames from section 3.

| Set | Stills (each from the real store photo) |
|---|---|
| **01 Concrete Jungle** | Lightning skate shoes on a concrete block · Retro Handheld Console on rusted steel · Iced Cuban Bracelet draped over rebar · Utility Chest Rig Bag on concrete stairs · Heaven Outline Tee folded on a cinder block · Matte Black Arabic-dial watch on weathered concrete |
| **02 After Dark** | Iced Ghost Pendant in direct flash · Magnetic Power Bank in car headlights · Clip-On Earbuds (LED) under a streetlight · Galaxy Projector stars on an underpass ceiling · Thick-Soled High-Tops in a wet reflection · Chrome Flames 07 Tee hung on a chain-link fence, flash |
| **04 Objects of Interest** | Heart Pendant Set · Star Grillz Set · Silver Tachymeter Watch · Orange Retro Handheld · **Devil & Angel Hearts Pendant (the red accent)** · Embroidered Suede Low-Top. All on a black background with one hard light, sculptural |

## 5. Hero film, 45 s (0 new credits, edit only)

| Time | Beat | Shots |
|---|---|---|
| 0–5 | The city | Black, skate-wheel sound, train → L1 plate (moved in the edit) → S9 roll-past. Text: THE WORLD IS FULL OF THINGS WORTH FINDING. |
| 5–12 | The culture | Fast cuts: S7, S3, L1 graffiti, S11 (first 1 s), S14, earbuds from S14. Text: BUT NOT EVERYTHING IS WITHIN REACH. |
| 12–18 | Interruption | Music cuts out. T2b sneaker suspended → T3 look into the lens. Text: UNTIL NOW. |
| 18–24 | Reveal | Black. The mark and FINAL HEAVEN, typeset, with a metallic hit |
| 24–37 | Discovery | Montage: S10, S12, S5, set-02 stills moved in the edit, T2c, S13, S8, S4. Text flashes: DISCOVER. HYPE. EXPLORE. |
| 37–45 | Invitation | S11 walking into the tunnel → black. OPENING THIS NOVEMBER. / Your next favourite find is closer than ever. / WAITLIST DISCOUNT · FREE STANDARD DELIVERY / FINAL HEAVEN |

**Lens-signature montage** (0 credits): S1 and S2, plus four start frames of the other characters with the marker raised. Ink is drawn on in the edit for each one, then: EVERYONE HAS THEIR OWN TASTE. / THERE'S ROOM FOR ALL OF IT. / FINAL HEAVEN.

## Budget

| Item | Credits |
|---|---|
| Cast and places (10 stills) | 10 |
| Teasers (5 stills, 5 clips) | 30 |
| Culture shorts (15 stills, 15 clips) | 90 |
| Photo sets 01, 02, 04 (18 stills) | 18 |
| Retakes (about 5 stills and 4 clips) | 25 |
| **Total** | **173** of 207, leaving about 34 |

## Order and approvals

1. Cast and places: 10 stills. **You approve the faces and places.**
2. All 20 start frames for teasers and shorts, as stills only (20 credits). **You approve them all at once.**
3. Animate the approved frames in batches of 5, checking each clip against the store photos.
4. Photo sets.
5. Edits: teasers, the hero film, the shorts, the signature montage. No credits.

## What the copy may say

- "Opening this November": no day, until `payments_open_on` is set.
- "Waitlist discount": the early access offer, true.
- "Free standard delivery": Express is paid, so never say just "free delivery".
- No claim about stock, scarcity or sell-outs.
