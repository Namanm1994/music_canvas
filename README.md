# music_canvas
p5.js music canvas with unsupervised machine learning algo

# Precise Gradient Sound Dots

An interactive, browser-based audio-visual sketch built with [p5.js](https://p5js.org/). 

This project generates a dense grid of resting black dots on a crisp, pure white canvas. When the exact tip of your cursor touches a dot, it bursts into a unique color and plays a synthesized musical note.

## Features

* **Precise Interaction:** Uses a tiny, 8-pixel hit radius to ensure only the exact tip of the cursor triggers the effect, allowing for sharp, granular drawing.
* **HSB Gradient Mapping:** The color of the glow is procedurally generated based on the dot's position. The X-axis controls the Hue (sweeping across the rainbow spectrum), and the Y-axis controls the Brightness.
* **Generative Audio:** Utilizes `p5.PolySynth` to map the Y-axis position of each dot to a MIDI note—dots near the top play high pitches, while dots near the bottom play lower bass notes.
* **Smooth Animation:** Uses linear interpolation (`lerp()`) for organic, smoothly fading glow and size transitions.
* **Zero Install:** Runs completely natively in the browser via CDN.

## How to Run

### Method 1: Local HTML File (Easiest)
1. Save the code as a standard `index.html` file on your computer.
2. Double-click the file to open it in any modern web browser (Chrome, Firefox, Safari, Edge).
3. *Note: Browsers require you to click anywhere on the canvas once to enable audio playback.*

### Method 2: p5.js Web Editor
1. Open the official [p5.js Web Editor](https://editor.p5js.org/).
2. Open the file sidebar (using the `>` arrow) and select the `index.html` file.
3. Delete the existing code and replace it with the provided code.
4. Click the **Play (▶)** button at the top.

## Technologies Used
* HTML5 & CSS3
* [p5.js](https://p5js.org/) (for canvas rendering, math, and interaction)
* [p5.sound](https://p5js.org/reference/#/libraries/p5.sound) (for real-time polyphonic audio synthesis)
