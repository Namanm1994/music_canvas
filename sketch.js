let dots = [];
let ddspEngine;
let drumEngine; // Our new parallel percussive agent

// --- SHARED MASTER TIME CLOCK ---
let lastStepTime = 0;      
let currentTempo = 350;    // Time between 16th-note steps (milliseconds)
let currentStep = 0;       // Position in the 16-step rhythmic grid (0-15)
let globalKickPulse = 0;   // Audio-reactive visual multiplier driven by the kick drum

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
  
  // Initialize our sound generation engines
  ddspEngine = new ParametricDDSP();
  drumEngine = new SyntheticDrummer();
  
  // Algorithmically build the baseline Markov Matrix 
  for (let i = 0; i < musicalScale.length; i++) {
    transitionMatrix[i] = new Array(musicalScale.length).fill(0);
  }
  
  // Populate the visual grid
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
  background(0, 0, 100); 

  // 1. Decay the visual audio-reactive kick pulse smoothly every frame
  globalKickPulse = lerp(globalKickPulse, 0, 0.12);

  // 2. Warp the parameters of both AI brains based on mouse positioning
  let chaos = warpMatrixAndTimbre();

  // 3. Dual-Agent Clock Coordinator
  if (millis() - lastStepTime > currentTempo) {
    aiPlayNextMelodyNote();
    aiProcessDrumStep(chaos);
    
    currentStep = (currentStep + 1) % 16; // Advance sequence step
    lastStepTime = millis();
  }

  // 4. Draw Visual Radial Guideline boundary line
  drawRadialGuidelines();

  // 5. Process Visual Grid Animations
  for (let dot of dots) {
    dot.checkAIActivation(activeMidiNote);
    dot.update();
    dot.display(mouseX, mouseY); 
  }
  
  // 6. Draw Expanded Dual Telemetry Dashboard Overlay
  drawTelemetryHUD(chaos);
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
    currentTempo = 380; // Relaxed dub-techno pace
    chaosFactor = 0.0;
  } else {
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTempo = map(edgeFactor, 0.0, 1.0, 380, 95); // Speeds up into frantic Drum & Bass tempo
    chaosFactor = edgeFactor;
  }

  // Re-calculate melody transition matrix rules on the fly
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

  // Morph the melody synth timbre weights
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
  
  ddspEngine.morphTimbre(currentTimbreWeights);
  return chaosFactor;
}

function aiPlayNextMelodyNote() {
  let probabilities = transitionMatrix[currentNoteIndex];
  let r = random(1.0);
  let cumulativeProbability = 0;
  let nextIndex = 0;
  
  for (let i = 0; i < probabilities.length; i++) {
    cumulativeProbability += probabilities[i];
    if (r <= cumulativeProbability) {
      nextIndex = i;
      break;
    }
  }
  
  currentNoteIndex = nextIndex;
  activeMidiNote = musicalScale[currentNoteIndex];
  ddspEngine.triggerAttack(activeMidiNote);
}

function aiProcessDrumStep(chaosFactor) {
  let playKick = false;
  let playSnare = false;
  let playHat = false;

  // --- AMBIENT DUB TECHNO BASE PATTERN (Determined Structure) ---
  if (currentStep === 0 || currentStep === 4 || currentStep === 8 || currentStep === 12) {
    playKick = true; // Rigid Four-on-the-Floor sub kick structure
  }
  if (currentStep === 4 || currentStep === 12) {
    playSnare = true; // Classic backbeat snare alignment
  }
  if (currentStep % 4 === 2) {
    playHat = true; // Traditional off-beat hi-hat placements
  }

  // --- DRUM & BASS MUTATIONS (Probabilistic Displacements) ---
  if (chaosFactor > 0.05) {
    // Inject syncopated breakbeat kick variations
    if (currentStep === 10 && random() < chaosFactor * 0.8) playKick = true;
    if (currentStep === 15 && random() < chaosFactor * 0.6) playKick = true;
    
    // Frantic DnB snare rushes on fast passing steps
    if ((currentStep === 6 || currentStep === 14) && random() < chaosFactor * 0.9) {
      playSnare = true;
    }
    
    // Dense rolling hi-hat bursts 
    if (random() < chaosFactor * 0.65) {
      playHat = true;
    }
  }

  // Execute synth engine triggers based on decisions
  if (playKick) {
    drumEngine.triggerKick();
    globalKickPulse = 1.0; // Fire global visual impact scale modifier
  }
  if (playSnare) {
    drumEngine.triggerSnare();
  }
  if (playHat) {
    drumEngine.triggerHiHat(chaosFactor);
  }
}

function drawRadialGuidelines() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let safeZoneDiameter = maxRadius * 0.40 * 2;
  
  noFill();
  stroke(0, 0, 85, 120);
  strokeWeight(1);
  drawingContext.setLineDash([4, 4]); 
  ellipse(centerX, centerY, safeZoneDiameter);
  drawingContext.setLineDash([]); 
}

// --- ALGORTIHMIC SYNTHESIS ENGINES ---

class ParametricDDSP {
  constructor() {
    this.numHarmonics = 4;
    this.harmonics = [];
    
    for (let i = 0; i < this.numHarmonics; i++) {
      let osc = new p5.Oscillator('sine');
      osc.amp(0);
      osc.start();
      this.harmonics.push(osc);
    }
    
    this.noiseComponent = new p5.Noise('pink');
    this.noiseComponent.amp(0);
    this.noiseComponent.start();
    
    this.currentBaseFreq = 0;
    this.ampEnvelope = 0;
  }
  
  morphTimbre(weights) {
    this.ampEnvelope = lerp(this.ampEnvelope, 0, 0.07); 
    
    if (this.currentBaseFreq > 0) {
      for (let i = 0; i < this.numHarmonics; i++) {
        this.harmonics[i].freq(this.currentBaseFreq * (i + 1));
        let targetingAmp = weights[i] * 0.12 * this.ampEnvelope;
        this.harmonics[i].amp(targetingAmp, 0.01); 
      }
      let noiseTargetAmp = weights[4] * 0.03 * this.ampEnvelope;
      this.noiseComponent.amp(noiseTargetAmp, 0.01);
    }
  }
  
  triggerAttack(midiNote) {
    this.currentBaseFreq = midiToFreq(midiNote);
    this.ampEnvelope = 1.0; 
  }
}

class SyntheticDrummer {
  constructor() {
    // Kick synthesis components
    this.kickOsc = new p5.Oscillator('sine');
    this.kickOsc.amp(0);
    this.kickOsc.start();
    
    // Snare synthesis elements
    this.snareOsc = new p5.Oscillator('triangle');
    this.snareOsc.amp(0);
    this.snareOsc.start();
    
    // White noise generator shared across snare snaps and hi-hat metal bursts
    this.percussiveNoise = new p5.Noise('white');
    this.percussiveNoise.amp(0);
    this.percussiveNoise.start();
  }
  
  triggerKick() {
    this.kickOsc.freq(160); 
    this.kickOsc.freq(42, 0.09); // Rapid pitch slide down to achieve punchy acoustic sub weight
    this.kickOsc.amp(0.85, 0.005);
    this.kickOsc.amp(0, 0.16);   // Tight exponential dampening decay
  }
  
  triggerSnare() {
    this.snareOsc.freq(185);
    this.snareOsc.amp(0.35, 0.005);
    this.snareOsc.amp(0, 0.09);
    
    this.percussiveNoise.amp(0.35, 0.005);
    this.percussiveNoise.amp(0, 0.13); // Crisp white noise envelope decay creates snappy snare wire texture
  }
  
  triggerHiHat(chaos) {
    // Dynamic envelope lengths: clean tight hats at center, splashing metallic trash elements at edge
    let decayDuration = lerp(0.02, 0.07, chaos);
    let hatAmplitude = lerp(0.18, 0.32, chaos);
    
    this.percussiveNoise.amp(hatAmplitude, 0.002);
    this.percussiveNoise.amp(0, decayDuration);
  }
}

class Dot {
  constructor(x, y, c, note) {
    this.x = x;
    this.y = y;
    this.baseRadius = 2; 
    this.glowRadius = 16;  
    this.currentRadius = this.baseRadius;
    this.targetColor = c;  
    this.midiNote = note; 
    this.isGlowing = false;
    this.glowIntensity = 0;
  }

  checkAIActivation(currentAINote) {
    if (this.midiNote === currentAINote) {
      this.isGlowing = true;
      this.glowIntensity = 255;
      this.currentRadius = this.glowRadius;
    }
  }

  update() {
    this.glowIntensity = lerp(this.glowIntensity, 0, 0.12);
    this.currentRadius = lerp(this.currentRadius, this.baseRadius, 0.12);
    
    if (this.glowIntensity < 1) {
      this.isGlowing = false;
    }
  }

  display(mx, my) {
    noStroke();
    
    let renderX = this.x;
    let renderY = this.y;
    let sizeModifier = 1.0;
    
    let d = dist(this.x, this.y, mx, my);
    let gravityRadius = 140; 
    
    if (d < gravityRadius) {
      let pullFactor = sin(map(d, 0, gravityRadius, 0, PI)) * 14; 
      let angle = atan2(my - this.y, mx - this.x);
      
      renderX += cos(angle) * pullFactor;
      renderY += sin(angle) * pullFactor;
      sizeModifier = map(d, 0, gravityRadius, 0.4, 1.0);
    }

    // Audio reactive expansion link: scale object size according to global kick velocity
    let kickVisualMultiplier = 1.0 + (globalKickPulse * 0.45);
    
    let displayGlowRadius = this.currentRadius * sizeModifier * kickVisualMultiplier;
    let displayBaseRadius = this.baseRadius * sizeModifier * kickVisualMultiplier;

    if (this.glowIntensity > 2) {
      let c = color(this.targetColor);
      c.setAlpha(this.glowIntensity * 0.5); 
      fill(c);
      ellipse(renderX, renderY, displayGlowRadius * 2);
    }

    if (this.glowIntensity > 100) {
      fill(this.targetColor); 
    } else {
      // Subtle background ambient shift synced to kick heartbeat
      let backgroundDotBrightness = map(globalKickPulse, 0, 1, 20, 35);
      fill(0, 0, backgroundDotBrightness); 
    }
    
    ellipse(renderX, renderY, displayBaseRadius * 2);
  }
}

function drawTelemetryHUD(chaosFactor) {
  fill(0, 0, 15, 230);
  rect(15, 15, 360, 175, 8);
  
  fill(0, 0, 100);
  noStroke();
  textSize(10);
  textFont('Courier New');
  text("COOPERATIVE MULTI-AGENT JARRING NETWORK", 25, 35);
  
  text(`Master Step Clock Interval: ${currentTempo}ms`, 25, 55);
  text(`Melody Pitch Target Vector: ${midiToFreq(activeMidiNote).toFixed(1)} Hz`, 25, 75);
  
  // Dynamic Rhythmic Sequencer Step Grid Dashboard Visualization
  let stepGridString = "DRUM STATE: [ ";
  for (let i = 0; i < 16; i++) {
    if (i === currentStep) {
      stepGridString += "► "; // Cursor step tracker position
    } else if (i % 4 === 0) {
      stepGridString += "▪ "; // Strong downbeat indices
    } else {
      stepGridString += "· "; // Interior step subdivisions
    }
  }
  stepGridString += "]";
  
  if (chaosFactor === 0) {
    fill(140, 85, 95);
    text("SYSTEM GENRE : AMBIENT DUB TECHNO (0% ENTROPY)", 25, 95);
  } else {
    fill(15, 85, 95);
    text(`SYSTEM GENRE : GENERATIVE DRUM & BASS (${(chaosFactor * 100).toFixed(0)}% ENTROPY)`, 25, 95);
  }
  
  fill(0, 0, 100);
  text(stepGridString, 25, 120);
  text("Active Timbre Additive Synthesis Weight Map:", 25, 142);
  
  for(let i = 0; i < currentTimbreWeights.length; i++) {
    let barWidth = currentTimbreWeights[i] * 50;
    if (i === 4) fill(0, 80, 90); 
    else fill(i * 45 + 190, 85, 95); 
    
    rect(25 + (i * 65), 152, barWidth, 10, 2);
  }
}

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
