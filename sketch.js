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

// --- MELODY MARKOV AI PARAMETERS ---
const musicalScale = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74]; 
let transitionMatrix = []; 
let currentNoteIndex = 0;  
let activeMidiNote = -1;   

// --- SYNTH PARAMETERS ---
let currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0];

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 255);
  
  ddspEngine = new ParametricDDSP();
  drumEngine = new SyntheticDrummer();

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
  reverb.amp(0.55);

  delay = new p5.Delay();
  delay.process(masterBus, 0.18, 0.38, 2300); // short echo, filtered feedback
  delay.drywet(1.0);
  delay.amp(0.4);

  // --- LIVE SPECTRUM ANALYSER ---
  // Tap the master bus so the visuals react to the actual audio output.
  fft = new p5.FFT(0.8, 64);
  fft.setInput(masterBus);

  for (let i = 0; i < musicalScale.length; i++) {
    transitionMatrix[i] = new Array(musicalScale.length).fill(0);
  }
  
  let spacing = 12;
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
}
