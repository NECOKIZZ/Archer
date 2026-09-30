---
workflow: general-video
flow: automation
storyboard: no
message: "Shop smart. Sell big."
audience: Nigerian shoppers and small business owners who sell on Instagram, TikTok and WhatsApp
destination: social (Instagram, TikTok, WhatsApp)
aspect: 16:9
length: 30s
language: en
---

# AvioMax: 30s beat-synced motion graphic

## Intent
Nigerian online marketplace: verified sellers open stores, buyers shop safely,
Paystack payments, 6% vendor commission. Site: aviomax.store.

## Storyboard (as briefed)
1. 0-5s: "Overpriced?" snaps from left, "Low reach?" drops from top, "Better way." slams in red. Zoom-through out.
2. 5-10s: logo scale-slam, "AVIOMAX" letter reveal, tagline one word per beat. Push out.
3. 10-15s: buyers, phone home screen scrolling on the beat, chips "Verified sellers", "Delivered". Vertical push out.
4. 15-20s: vendors dashboard, "New order!" ping, sales count-up, "6% commission" stamp. Red wipe out.
5. 20-25s: trust icons drop into slots: "Verified", "Paystack secure", "Buyer protection". Whip pan with blur out.
6. 25-30s: red close, logo on white plate, "Shop smart. Sell big.", "aviomax.store" pill, music fades.

## Rules
Poppins Bold/Medium only. #2D2D2D / #FFFFFF / #CC0000, no blue, green or purple.
Logo never recolored or distorted (always shown on white). One paused GSAP timeline,
deterministic, transforms and opacity (plus the requested whip blur). Max 2-3 words of
message copy on screen at once (the closing line is the briefed exception).

## Assets (STAND-INS: replace with the real files)
The brand assets were not supplied with the request, so these are placeholders:
- `assets/logo.svg`, `assets/logo-mark.svg`: vector trace of the logo in the production guide PDF, original colors.
- `assets/fonts/Poppins-*.ttf`: official Poppins (OFL) from Google Fonts.
- `assets/music.mp3`: synthesized 96 BPM Afrobeats-style placeholder (`assets/make_placeholder_music.py`).
- Phone home screen and vendor dashboard are recreated from scratch (no screenshots were supplied).

To swap in the real track: replace `assets/music.mp3`, temporarily add it as a
`data-timeline-role="music"` `<audio>` in `index.html`, run `npx hyperframes beats .`,
update the `B` beat list at the top of the script in `compositions/video.html`, then
re-check and re-render.

## Commands
    npx hyperframes check .
    npx hyperframes render -c compositions/video.html -o renders/video.mp4
