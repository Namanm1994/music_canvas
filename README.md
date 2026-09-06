# music_canvas

An interactive, browser-based **audio-visual instrument** built with [p5.js](https://p5js.org/) — plus **Echo**, a memory game whose levels are composed live by a neural network.

A full-screen grid of dots doubles as a generative synthesizer: a small LSTM (running in your browser via TensorFlow.js) composes an endless melody, a step sequencer drives synthesized drums, and the whole mix is analyzed in real time so the dots pulse and glow with the sound. Move your mouse to steer everything from calm ambient to chaotic drum & bass — then press **ENTER** to challenge the same AI to a memory duel.

Everything runs natively in the browser from CDN — no build step, no install.

## Features

* **Neural melody engine (TensorFlow.js).** A small LSTM is trained *in the browser at startup* on a procedurally generated, voice-leading-weighted corpus, then predicts the next note from recent history. It falls back to a Markov chain until training finishes, so audio is instant.
* **Mouse-driven performance.** Distance from the center of the canvas controls the whole system: near the center it's calm ("Ambient Dub Techno, 0% entropy"); toward the edges it speeds up, gets busier, and the melody's **sampling temperature** climbs ("Generative Drum & Bass").
* **Synthesized everything.** A parametric additive synth (`ParametricDDSP`) and a from-scratch drum machine (`SyntheticDrummer`) — no audio files.
* **Master FX bus.** All voices route through a shared reverb + delay for depth and space instead of playing dry.
* **Live audio-reactive visuals.** A `p5.FFT` taps the master bus; each column of dots maps to a frequency bin and swells/brightens with the actual output.
* **Shareable seeds.** The seed and settings are encoded in the URL hash, so any soundscape is reproducible and shareable. Press **C** to copy the link, **R** to reseed.
* **Echo game mode.** An AI call-and-response memory duel (see below).
* **Zero install.** Runs entirely in the browser via CDN.

## Controls

### Free-play
| Input | Effect |
|---|---|
| **Mouse position** | Center = calm / structured, edges = chaotic / adventurous |
| **Hold SHIFT** | Exponential "tape stop" slowdown |
| **Hold SPACE** | Glitch / stutter buffer lock |
| **C** | Copy the shareable URL (seed + settings) to the clipboard |
| **R** | Mint a fresh random seed and reload |
| **ENTER** | Start the Echo game |
| Click once | Enables browser audio |

### Echo game
| Input | Effect |
|---|---|
| **ENTER** | Start / restart a game |
| **ESC** | Exit back to free-play |
| **A S D F G H J K L ; ' \\** | Play the 12 scale degrees (low → high) |
| **Mouse position** | Difficulty dial (how wild the AI's phrases are) |

## Echo — the game

A "Simon says" for melodies, where the LSTM is the caller:

1. The neural model composes a short phrase and the grid flashes it back to you, one note at a time.
2. You repeat the phrase on the keyboard. Your keypresses light the same dots and play the same synth.
3. Echo it correctly and the phrase grows by one note and playback speeds up. A wrong note costs a life (3 total). Your score is the longest phrase you survive.

Because every phrase comes from `NeuralMelodyModel.predictNext()`, no two rounds are the same — and the mouse's chaos factor is literally the model's sampling temperature, so it sets the difficulty.

## Project structure

```
index.html                    Loads p5, p5.sound, TensorFlow.js, and the scripts below
sketch.js                     Main loop, dot grid, sequencer, mouse control, seed/URL config
scripts/
  NeuralMelodyModel.js        In-browser LSTM melody model (TensorFlow.js)
  ParametricDDSP.js           Parametric additive synth voice
  SyntheticDrummer.js         Synthesized kick / snare / hi-hat
  dot.js                      The Dot visual class (glow, lensing, audio reactivity)
  hud.js                      Telemetry HUD + radial guideline overlay
  EchoGame.js                 The Echo memory game
```

## How to run

### Method 1: Local server (recommended)
The scripts are split across files, so open `index.html` through a local web server rather than a `file://` URL:

```bash
# from the project root
python3 -m http.server 8000
# then visit http://localhost:8000
```

Click once on the canvas to enable audio.

### Method 2: p5.js Web Editor
Upload `index.html`, `sketch.js`, and the `scripts/` folder to the [p5.js Web Editor](https://editor.p5js.org/) and press **Play (▶)**.

## Technologies used
* HTML5 & CSS3
* [p5.js](https://p5js.org/) — canvas rendering, math, interaction
* [p5.sound](https://p5js.org/reference/#/libraries/p5.sound) — real-time synthesis, FX, and FFT analysis
* [TensorFlow.js](https://www.tensorflow.org/js) — the in-browser LSTM melody model
