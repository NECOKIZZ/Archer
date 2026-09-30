---
workflow: general-video
flow: automation
storyboard: no
message: "Close still pays."
audience: football fans, crypto users and AI builders on X and TikTok
destination: social (X, TikTok)
aspect: 16:9
length: 60s
language: en
---

# Kickoff: 60s beat-synced motion graphic

## Intent
Kickoff (kickoff.cash) is a football prediction market on Robinhood Chain: stake USDC on
Premier League scorelines and player performance, get paid by how close you land, not
just yes or no. People and AI agents both play. Tagline from the site: "Beat the pack.
Keep the stack."

## Storyboard (as briefed)
1. 0-5s: "Yes or no?" snaps from left, "Boring." drops from top, "Call the score." slams on the beat. Vertical push out.
2. 5-11s: 5x5 scoreline grid rises in, cursor taps 2-1, accent glow fades with distance. "Close still pays."
3. 11-21s: median gate. Grid slides left, leaderboard pushes in, MEDIAN line sweeps, losers wipe to -100%, particles stream to winners who roll up and glow. "Below median? Out." then "Winners split it." Zoom through out.
4. 21-26s: KICKOFF on the accent, "Beat the pack. Keep the stack." one word per beat. Whip pan with blur out.
5. 26-36s: four robots pop in, think, drop 1-0 / 2-1 / 3-1 / 0-0 into the grid, join the leaderboard with AGENT tags. "Agents play too." then "Same markets." Accent wipe out.
6. 36-43s: light scene, Palmer / Haaland / Gyokeres cards deal in with side snaps. "Pick your player." Vertical push out.
7. 43-54s: accumulator pool counter, Top 10 board one row per beat, coins flow in, payouts count up. "Top 10 split it." Staggered block wipe out.
8. 54-60s: logo lockup, "kickoff.cash" pill, "On Robinhood Chain" chip, music fades.

## Rules
Fraunces Bold for accent words, Clash Display Semibold for everything else. #000000 bg
(#F7F5F0 for scene 6), #FFFFFF text, accent #7B62F6 for winners, white/grey for losers.
Logo white on dark, never recolored or distorted. One paused GSAP timeline, transforms and
opacity (plus the requested whip-pan blur), deterministic, fixed particle coordinates.
Max 2-3 headline words on screen at once; leaderboard UI is exempt. All handles and
numbers are fake.

## Assets
- `assets/logo.svg`, `assets/logo-black.svg`: official marks from kickoff.cash/brand.
- `assets/cards/*.webp`, `assets/clubs/*.webp`: official player cards and club badges from kickoff.cash/brand.
- `assets/fonts/Fraunces-Bold.ttf` (Google Fonts, OFL), `assets/fonts/ClashDisplay-Semibold.ttf` (Fontshare), the same families kickoff.cash loads.
- `assets/music.mp3`: STAND-IN. The brief's music file was not supplied, so this is a synthesized
  120 BPM placeholder (`assets/make_placeholder_music.py`) with impacts on the scene changes.

To swap in the real track: replace `assets/music.mp3`, run `npx hyperframes beats .`
(with the track temporarily added as a `data-timeline-role="music"` `<audio>` in
`index.html`), update `BEATS` / `STRONG` at the top of the script in
`compositions/video.html`, then re-check and re-render.

## Commands
    npx hyperframes check .
    npx hyperframes render -c compositions/video.html -o renders/video.mp4
