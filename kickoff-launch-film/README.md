# Kickoff launch film (60 s)

A 1-minute launch film for [kickoff.cash](https://kickoff.cash), built with the
[motion-video-kit](https://github.com/echris6/motion-video-kit) `business-motion-film` workflow:
brief → storyboard → code-built motion → measured checks → independent critic.

- `BRIEF.md` covers what the audience needs to know, what's provably true, what must never be claimed, and the brand tokens.
- `STORYBOARD.md` is the beat-by-beat plan, including the persistent actor and the signature transformations.
- `index.html` + `film.js` are the film itself. Every frame is a pure function of time (`window.__seek(t)`):
  HTML/SVG for type and UI, plus Three.js for the football bookends.
- `audio.py` is a procedural score and sound design (120 BPM, A minor, no samples).
- `render.mjs` is a deterministic frame renderer (headless Chromium → ffmpeg).
- `mix.sh` handles the mix, the two-pass loudness normalisation (−14 LUFS, −1.5 dBTP), and the grain/vignette post and mux.
- `kickoff-launch-film.mp4` is the master: 1920×1080, 60 fps, AAC 256k.

## Rebuild

```sh
npm install                      # gsap, three
for i in 0 1 2 3; do node render.mjs video build/part$i.mp4 $((i*15)) $((i*15+15)) 60 & done; wait
./mix.sh                         # → kickoff-launch-film.mp4
node render.mjs stills out/ 0 13.5 58   # spot-check frames
```

Preview in a browser: serve the folder and open `index.html?play` (or `?t=27.5` to freeze a frame).

## Honesty notes

- All UI is illustrative. Fixture, pool and entry numbers are examples, and the payout table is the worked example from Kickoff's docs.
- Kickoff is currently a testnet season with play money, and the end card says so.
- Player Perps are paused, so they're left out of the film.
- There are no club crests, player likenesses or league marks; clubs appear only as three-letter codes.
