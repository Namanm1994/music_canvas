let dots = [];
let ddspEngine;
let drumEngine;

// --- MASTER AUDIO FX BUS + LIVE ANALYSER ---
let masterBus;             // all voices sum here before hitting the speakers
let reverb;                // shared ambience / space
let delay;                 // rhythmic echoes
let fft;                   // spectrum analyser tapping the master bus
let audioSpectrum = [];    // latest per-bin amplitudes (0..255), refreshed each frame

// --- SHARED MASTER TIME CLOCK ---
let lastStepTime = 0;
let currentTempo = 350;
let currentStep = 0;
let globalKickPulse = 0;

// --- PERFORMANCE FX VARIABLES ---
let tapeStopValue = 1.0;
let wasGlitching = false;
let glitchLockedStep = 0;

// --- MELODY AI PARAMETERS ---
const musicalScale = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74];
let transitionMatrix = [];        // Markov fallback used until the LSTM is trained
let currentNoteIndex = 0;
let activeMidiNote = -1;

// --- NEURAL MELODY MODEL (TensorFlow.js LSTM) ---
let melodyModel;                  // NeuralMelodyModel instance
let melodyModelReady = false;     // true once in-browser training completes
let noteHistory = [];             // recent scale-degree indices fed to the LSTM
let melodyTemperature = 0.8;      // sampling temperature, driven by mouse chaos

// --- REPRODUCIBLE SESSION CONFIG (encoded in the URL hash) ---
let CONFIG = { seed: 1, tempo: 380, spacing: 12, reverb: 0.55, delay: 0.4 };

// --- ON-CANVAS TOAST ---
let toastMessage = '';
let toastFadeTime = 0;

// --- SYNTH PARAMETERS ---
let currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0];

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 255);

  // --- REPRODUCIBLE SEED + SETTINGS ---
  // Parse the config from the URL hash (or mint a fresh seed), make p5's random
  // stream deterministic, and write the config back so the URL is shareable.
  CONFIG = loadConfig();
  randomSeed(CONFIG.seed);
  noiseSeed(CONFIG.seed);
  writeConfigToHash(CONFIG);
  currentTempo = CONFIG.tempo;

  ddspEngine = new ParametricDDSP();
  drumEngine = new SyntheticDrummer();

  // --- NEURAL MELODY MODEL ---
  // Kick off in-browser LSTM training (seeded for reproducibility). Until it
  // finishes we transparently fall back to the Markov chain, so audio is
  // immediate and the swap-in is seamless.
  melodyModel = new NeuralMelodyModel(musicalScale.length, CONFIG.seed);
  melodyModel.train(12)
    .then(() => { melodyModelReady = true; })
    .catch((e) => {
      console.warn('LSTM training unavailable, using Markov fallback', e);
      melodyModelReady = false;
    });

  // --- MASTER FX BUS (reverb + delay) ---
  // Sum every synth + drum voice into one gain bus, then process the whole mix
  // through space-adding effects instead of leaving each voice bone-dry.
  masterBus = new p5.Gain();
  masterBus.connect();               // dry signal goes straight to the speakers
  ddspEngine.connectTo(masterBus);
  drumEngine.connectTo(masterBus);

  reverb = new p5.Reverb();
  reverb.process(masterBus, 3.5, 2); // 3.5s tail, moderate decay
  reverb.drywet(1.0);                // wet-only; the dry path is already direct
  reverb.amp(CONFIG.reverb);

  delay = new p5.Delay();
  delay.process(masterBus, 0.18, 0.38, 2300); // short echo, filtered feedback
  delay.drywet(1.0);
  delay.amp(CONFIG.delay);

  // --- LIVE SPECTRUM ANALYSER ---
  // Tap the master bus so the visuals react to the actual audio output.
  fft = new p5.FFT(0.8, 64);
  fft.setInput(masterBus);

  for (let i = 0; i < musicalScale.length; i++) {
    transitionMatrix[i] = new Array(musicalScale.length).fill(0);
  }

  let spacing = CONFIG.spacing;
  let noteZoneSize = 6;

  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      let col = floor(x / spacing);
      let row = floor(y / spacing);

      let musicalCol = floor(col / noteZoneSize);
      let musicalRow = floor(row / noteZoneSize);

      let scaleIndex = (musicalCol - musicalRow) % musicalScale.length;
      if (scaleIndex < 0) scaleIndex += musicalScale.length;

      let assignedMidiNote = musicalScale[scaleIndex];

      let h = map(x, 0, width, 0, 360);
      let b = map(y, 0, height, 100, 50);
      let dotColor = color(h, 85, b);

      dots.push(new Dot(x, y, dotColor, assignedMidiNote));
    }
  }
}

function draw() {
  background(0, 0, 8);

  if (keyIsDown(SHIFT)) {
    tapeStopValue = lerp(tapeStopValue, 0.0, 0.12);
  } else {
    tapeStopValue = lerp(tapeStopValue, 1.0, 0.08);
  }

  let glitchActive = keyIsDown(32);
  if (glitchActive) {
    if (!wasGlitching) {
      glitchLockedStep = currentStep;
      wasGlitching = true;
    }
    currentTempo = 55;
  } else {
    wasGlitching = false;
  }

  globalKickPulse = lerp(globalKickPulse, 0, 0.12);

  let chaos = warpMatrixAndTimbre();
  drumEngine.update(tapeStopValue);

  // Sample the live output spectrum so the dot grid can react to it this frame.
  audioSpectrum = fft.analyze();

  let stepDuration = currentTempo;
  if (keyIsDown(SHIFT)) {
    stepDuration = currentTempo / (tapeStopValue + 0.05);
  }

  if (millis() - lastStepTime > stepDuration) {
    if (glitchActive) {
      currentStep = glitchLockedStep;
    } else {
      currentStep = (currentStep + 1) % 16;
    }

    aiPlayNextMelodyNote();
    aiProcessDrumStep(chaos);

    lastStepTime = millis();
  }

  drawRadialGuidelines();

  for (let dot of dots) {
    dot.checkAIActivation(activeMidiNote);
    dot.update();
    dot.display(mouseX, mouseY, glitchActive);
  }

  drawTelemetryHUD(chaos, glitchActive);
  drawToast();
}

function warpMatrixAndTimbre() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let currentDist = dist(mouseX, mouseY, centerX, centerY);

  let normRadialDist = constrain(currentDist / maxRadius, 0.0, 1.0);
  let safeZoneThreshold = 0.40;

  let chaosFactor = 0;
  if (normRadialDist <= safeZoneThreshold) {
    currentTempo = CONFIG.tempo;
    chaosFactor = 0.0;
  } else {
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTempo = map(edgeFactor, 0.0, 1.0, CONFIG.tempo, 95);
    chaosFactor = edgeFactor;
  }

  // Distance from centre also sets how adventurous the LSTM's sampling is:
  // calm centre = low temperature (structured), chaotic edge = high temperature.
  melodyTemperature = map(chaosFactor, 0.0, 1.0, 0.55, 1.5);

  for (let i = 0; i < musicalScale.length; i++) {
    let rowTotal = 0;
    for (let j = 0; j < musicalScale.length; j++) {
      let structuralProb = 0;
      if (abs(i - j) === 1 || abs(i - j) === 3) structuralProb = 0.8;
      if (i === j) structuralProb = 0.1;

      let randomProb = 1.0 / musicalScale.length;
      transitionMatrix[i][j] = lerp(structuralProb, randomProb, chaosFactor);
      rowTotal += transitionMatrix[i][j];
    }
    for (let j = 0; j < musicalScale.length; j++) {
      transitionMatrix[i][j] /= rowTotal;
    }
  }

  if (normRadialDist <= safeZoneThreshold) {
    currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0];
  } else {
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTimbreWeights[0] = 1.0 - (edgeFactor * 0.4);
    currentTimbreWeights[1] = constrain(map(edgeFactor, 0.0, 0.5, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[2] = constrain(map(edgeFactor, 0.2, 0.8, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[3] = constrain(map(edgeFactor, 0.5, 1.0, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[4] = edgeFactor > 0.6 ? map(edgeFactor, 0.6, 1.0, 0.0, 0.5) : 0.0;
  }

  ddspEngine.morphTimbre(currentTimbreWeights, tapeStopValue);
  return chaosFactor;
}

function aiPlayNextMelodyNote() {
  let nextIndex = null;

  // Preferred path: the trained LSTM predicts the next scale-degree.
  if (melodyModelReady) {
    nextIndex = melodyModel.predictNext(noteHistory, melodyTemperature);
  }

  // Fallback path: Markov chain, used while the LSTM is still training
  // (or if TensorFlow.js is unavailable).
  if (nextIndex === null) {
    let probabilities = transitionMatrix[currentNoteIndex];
    let r = random(1.0);
    let cumulativeProbability = 0;
    nextIndex = 0;
    for (let i = 0; i < probabilities.length; i++) {
      cumulativeProbability += probabilities[i];
      if (r <= cumulativeProbability) {
        nextIndex = i;
        break;
      }
    }
  }

  currentNoteIndex = nextIndex;
  noteHistory.push(nextIndex);
  if (noteHistory.length > 64) noteHistory.shift();

  activeMidiNote = musicalScale[currentNoteIndex];
  ddspEngine.triggerAttack(activeMidiNote);
}

function aiProcessDrumStep(chaosFactor) {
  let playKick = false;
  let playSnare = false;
  let playHat = false;

  if (currentStep === 0 || currentStep === 4 || currentStep === 8 || currentStep === 12) {
    playKick = true;
  }
  if (currentStep === 4 || currentStep === 12) {
    playSnare = true;
  }
  if (currentStep % 4 === 2) {
    playHat = true;
  }

  if (chaosFactor > 0.05) {
    if (currentStep === 10 && random() < chaosFactor * 0.8) playKick = true;
    if (currentStep === 15 && random() < chaosFactor * 0.6) playKick = true;
    if ((currentStep === 6 || currentStep === 14) && random() < chaosFactor * 0.9) playSnare = true;
    if (random() < chaosFactor * 0.65) playHat = true;
  }

  if (playKick) {
    drumEngine.triggerKick();
    globalKickPulse = 1.0;
  }
  if (playSnare) {
    drumEngine.triggerSnare();
  }
  if (playHat) {
    drumEngine.triggerHiHat(chaosFactor);
  }
}

function mousePressed() {
  userStartAudio();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// --- KEY CONTROLS: share / reseed ---
// (SPACE and SHIFT are handled continuously via keyIsDown in draw().)
function keyPressed() {
  if (key === 'c' || key === 'C') {
    const url = getShareURL();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Shareable link copied to clipboard'))
        .catch(() => showToast('Link is in the address bar'));
    } else {
      showToast('Link is in the address bar');
    }
  } else if (key === 'r' || key === 'R') {
    // Mint a fresh, non-deterministic seed and reload into that soundscape.
    CONFIG.seed = Math.floor(Math.random() * 1e9);
    writeConfigToHash(CONFIG);
    showToast('New seed ' + CONFIG.seed + ' — reloading…');
    setTimeout(() => window.location.reload(), 650);
  }
}

// --- REPRODUCIBLE CONFIG <-> URL HASH ---
function loadConfig() {
  const defaults = { seed: null, tempo: 380, spacing: 12, reverb: 0.55, delay: 0.4 };
  const params = new URLSearchParams(window.location.hash.slice(1));
  const cfg = Object.assign({}, defaults);

  if (params.has('seed'))    cfg.seed    = parseInt(params.get('seed'), 10);
  if (params.has('tempo'))   cfg.tempo   = parseFloat(params.get('tempo'));
  if (params.has('spacing')) cfg.spacing = parseInt(params.get('spacing'), 10);
  if (params.has('reverb'))  cfg.reverb  = parseFloat(params.get('reverb'));
  if (params.has('delay'))   cfg.delay   = parseFloat(params.get('delay'));

  // Sanitise, and mint a fresh random seed if none was supplied.
  if (cfg.seed === null || isNaN(cfg.seed)) cfg.seed = Math.floor(Math.random() * 1e9);
  if (isNaN(cfg.tempo))   cfg.tempo   = defaults.tempo;
  if (isNaN(cfg.spacing) || cfg.spacing < 4) cfg.spacing = defaults.spacing;
  if (isNaN(cfg.reverb))  cfg.reverb  = defaults.reverb;
  if (isNaN(cfg.delay))   cfg.delay   = defaults.delay;

  return cfg;
}

function configToHash(cfg) {
  const params = new URLSearchParams();
  params.set('seed', cfg.seed);
  params.set('tempo', cfg.tempo);
  params.set('spacing', cfg.spacing);
  params.set('reverb', cfg.reverb);
  params.set('delay', cfg.delay);
  return '#' + params.toString();
}

function writeConfigToHash(cfg) {
  // replaceState keeps the shareable URL current without spamming history.
  window.history.replaceState(null, '', configToHash(cfg));
}

function getShareURL() {
  return window.location.origin + window.location.pathname + configToHash(CONFIG);
}

// --- TOAST ---
function showToast(msg) {
  toastMessage = msg;
  toastFadeTime = millis() + 2200;
}

function drawToast() {
  if (!toastMessage || millis() >= toastFadeTime) return;

  let remaining = toastFadeTime - millis();
  let alpha = map(min(remaining, 400), 0, 400, 0, 230);

  push();
  textFont('Courier New');
  textSize(12);
  let boxW = textWidth(toastMessage) + 34;
  rectMode(CENTER);
  noStroke();
  fill(140, 85, 30, alpha * 0.92);
  rect(width / 2, height - 48, boxW, 34, 8);
  fill(0, 0, 100, alpha);
  textAlign(CENTER, CENTER);
  text(toastMessage, width / 2, height - 48);
  pop();
}
