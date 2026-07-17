let dots = [];
let ddspEngine;
let drumEngine; 

// --- SHARED MASTER TIME CLOCK ---
let lastStepTime = 0;      
let currentTempo = 350;    // Time between 16th-note steps (milliseconds)
let currentStep = 0;       // Position in the 16-step rhythmic grid (0-15)
let globalKickPulse = 0;   // Audio-reactive visual multiplier driven by the kick drum

// --- PERFORMANCE FX VARIABLES ---
let tapeStopValue = 1.0;   // Pitch and clock multiplier (1.0 = normal, 0.0 = stopped)
let wasGlitching = false;  // Memory gate for transition triggers
let glitchLockedStep = 0;  // The step index captured during a buffer freeze

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
  
  // Initialize sound engines
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
  background(0, 0, 8); // Shifted background deeper to maximize 3D contrast contrast

  // 1. Process Keyboard State Interpolations
  if (keyIsDown(SHIFT)) {
    tapeStopValue = lerp(tapeStopValue, 0.0, 0.12); 
  } else {
    tapeStopValue = lerp(tapeStopValue, 1.0, 0.08); 
  }

  let glitchActive = keyIsDown(32); // Spacebar
  if (glitchActive) {
    if (!wasGlitching) {
      glitchLockedStep = currentStep; 
      wasGlitching = true;
    }
    currentTempo = 55; 
  } else {
    wasGlitching = false;
  }

  // Decay the visual kick flash
  globalKickPulse = lerp(globalKickPulse, 0, 0.12);

  // 2. Warp Matrix & Synth settings
  let chaos = warpMatrixAndTimbre();

  // 3. Continuously update drum envelopes
  drumEngine.update(tapeStopValue);

  // 4. Dynamic Master Step Clock
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

  // 5. Draw Visual Radial Guideline
  drawRadialGuidelines();

  // 6. Process Visual Grid Animations
  for (let dot of dots) {
    dot.checkAIActivation(activeMidiNote);
    dot.update();
    dot.display(mouseX, mouseY, glitchActive); 
  }
  
  // 7. Render Extended Dashboard
  drawTelemetryHUD(chaos, glitchActive);
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
    currentTempo = 380; 
    chaosFactor = 0.0;
  } else {
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTempo = map(edgeFactor, 0.0, 1.0, 380, 95); 
    chaosFactor = edgeFactor;
  }

  // Shift Markov values based on grid position
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

  // Draw timbre weights
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

function drawRadialGuidelines() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let safeZoneDiameter = maxRadius * 0.40 * 2;
  
  noFill();
  stroke(0, 0, 30, 150); // Deepened frame overlay lines
  strokeWeight(1.5);
  drawingContext.setLineDash([6, 6]); 
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
  
  morphTimbre(weights, tapeStop) {
    this.ampEnvelope = lerp(this.ampEnvelope, 0, 0.07); 
    
    if (this.currentBaseFreq > 0) {
      for (let i = 0; i < this.numHarmonics; i++) {
        this.harmonics[i].freq(this.currentBaseFreq * (i + 1) * tapeStop);
        let targetingAmp = weights[i] * 0.12 * this.ampEnvelope * tapeStop;
        this.harmonics[i].amp(targetingAmp, 0.01); 
      }
      let noiseTargetAmp = weights[4] * 0.03 * this.ampEnvelope * tapeStop;
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
    this.kickOsc = new p5.Oscillator('sine');
    this.kickOsc.amp(0);
    this.kickOsc.start();
    
    this.snareOsc = new p5.Oscillator('triangle');
    this.snareOsc.amp(0);
    this.snareOsc.start();
    
    this.percussiveNoise = new p5.Noise('white');
    this.percussiveNoise.amp(0);
    this.percussiveNoise.start();

    this.kickFreq = 0;
    this.kickAmp = 0;
    this.snareAmp = 0;
    this.noiseAmp = 0;
    this.noiseDecay = 0.2; 
  }
  
  triggerKick() {
    this.kickFreq = 160;
    this.kickAmp = 0.85;
  }
  
  triggerSnare() {
    this.snareAmp = 0.35;
    this.noiseAmp = 0.35;
    this.noiseDecay = 0.15; 
  }
  
  triggerHiHat(chaos) {
    this.noiseAmp = lerp(0.18, 0.32, chaos);
    this.noiseDecay = lerp(0.35, 0.2, chaos); 
  }
  
  update(tapeStop) {
    if (this.kickAmp > 0.005) {
      this.kickFreq = lerp(this.kickFreq, 42, 0.15); 
      this.kickAmp = lerp(this.kickAmp, 0, 0.15);
      this.kickOsc.freq(this.kickFreq * tapeStop);
      this.kickOsc.amp(this.kickAmp * tapeStop, 0.01);
    } else {
      this.kickOsc.amp(0);
    }
    
    if (this.snareAmp > 0.005) {
      this.snareAmp = lerp(this.snareAmp, 0, 0.18);
      this.snareOsc.freq(185 * tapeStop);
      this.snareOsc.amp(this.snareAmp * tapeStop, 0.01);
    } else {
      this.snareOsc.amp(0);
    }
    
    if (this.noiseAmp > 0.005) {
      this.noiseAmp = lerp(this.noiseAmp, 0, this.noiseDecay);
      this.percussiveNoise.amp(this.noiseAmp * tapeStop, 0.01);
    } else {
      this.percussiveNoise.amp(0);
    }
  }
}

class Dot {
  constructor(x, y, c, note) {
    this.x = x;
    this.y = y;
    this.baseRadius = 2.5; 
    this.glowRadius = 18;  
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
    if (this.glowIntensity < 1) this.isGlowing = false;
  }

  display(mx, my, glitchActive) {
    noStroke();
    
    let renderX = this.x;
    let renderY = this.y;
    let sizeModifier = 1.0;
    let zHeight = 0; // The virtual Z-depth displacement
    
    if (glitchActive) {
      renderX += random(-2.5, 2.5);
      renderY += random(-2.5, 2.5);
    }
    
    let d = dist(this.x, this.y, mx, my);
    let lensRadius = 160; // Size of the physical 3D dome boundary
    
    if (d < lensRadius) {
      // Create a smooth cosine hemispherical surface height profile (1 at peak, 0 at skirt)
      let normDist = d / lensRadius;
      zHeight = cos(normDist * HALF_PI);
      
      // 3D Convex Warp: Push nodes away from the apex center point
      let pushFactor = sin(normDist * PI) * 24; 
      let angle = atan2(this.y - my, this.x - mx); 
      
      renderX += cos(angle) * pushFactor;
      renderY += sin(angle) * pushFactor;
      
      // Lift elements toward camera viewport along Z-axis (Magnification effect)
      sizeModifier = map(zHeight, 0, 1, 1.0, 3.4);
    }

    let kickVisualMultiplier = 1.0 + (globalKickPulse * 0.45);
    let displayGlowRadius = this.currentRadius * sizeModifier * kickVisualMultiplier;
    let displayBaseRadius = this.baseRadius * sizeModifier * kickVisualMultiplier;

    // 1. RENDER BACK LAYER: Ambient Glow Rings
    if (this.glowIntensity > 2) {
      let c = color(this.targetColor);
      c.setAlpha(this.glowIntensity * 0.4); 
      fill(c);
      ellipse(renderX, renderY, displayGlowRadius * 2);
    }

    // 2. RENDER MID LAYER: Core Node Body with Topographic Shading
    if (this.glowIntensity > 100) {
      fill(this.targetColor); 
      ellipse(renderX, renderY, displayBaseRadius * 2);
    } else {
      // Static background dots dynamically illuminate as they climb the 3D dome surface
      let baseBrightness = map(globalKickPulse, 0, 1, 20, 32);
      let localizedLighting = baseBrightness + (zHeight * 45); 
      
      fill(0, 0, localizedLighting); 
      ellipse(renderX, renderY, displayBaseRadius * 2);
    }
    
    // 3. RENDER FRONT LAYER: Pseudo-3D Glossy Specular Light Highlight Reflection
    // Layering an offset white dot transforms flat canvas graphics into micro-spherical glass beads
    let highlightSize = displayBaseRadius * 0.55;
    let highlightOffset = displayBaseRadius * 0.35;
    
    if (this.glowIntensity > 100) {
      fill(0, 0, 100, 180); // White highlight overlaying glowing note
    } else {
      let highlightAlpha = map(zHeight, 0, 1, 40, 160); // Highlights catch stronger light on dome crests
      fill(0, 0, 100, highlightAlpha);
    }
    ellipse(renderX - highlightOffset, renderY - highlightOffset, highlightSize);
  }
}

function drawTelemetryHUD(chaosFactor, glitchActive) {
  fill(0, 0, 12, 230);
  rect(15, 15, 360, 195, 8); 
  
  fill(0, 0, 100);
  noStroke();
  textSize(10);
  textFont('Courier New');
  text("COOPERATIVE MULTI-AGENT JARRING NETWORK", 25, 35);
  
  text(`Master Step Clock Interval: ${currentTempo}ms`, 25, 55);
  text(`Melody Pitch Target Vector: ${midiToFreq(activeMidiNote).toFixed(1)} Hz`, 25, 75);
  
  let stepGridString = "DRUM STATE: [ ";
  for (let i = 0; i < 16; i++) {
    if (i === currentStep) {
      stepGridString += "► "; 
    } else if (i % 4 === 0) {
      stepGridString += "▪ "; 
    } else {
      stepGridString += "· "; 
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

  if (glitchActive) {
    fill(0, 95, 95); 
    text("PERFORMANCE ALERT : [ SPACE ] STUTTER BUFFER LOCK ENABLED", 25, 185);
  } else if (keyIsDown(SHIFT)) {
    fill(200, 85, 95); 
    text("PERFORMANCE ALERT : [ SHIFT ] EXPONENTIAL TAPE STOP ACTIVE", 25, 185);
  } else {
    fill(0, 0, 55);
    text("PERFORMANCE ALERTS : FX STANDBY [SPACE=GLITCH, SHIFT=STOP]", 25, 185);
  }
}

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
