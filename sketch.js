let dots = [];
let ddspEngine;

// --- MARKOV CHAIN AI PARAMETERS ---
const musicalScale = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74]; // 2-Octave Pentatonic
let transitionMatrix = []; // The active, warped probability table
let currentNoteIndex = 0;  // What note the AI is currently processing
let activeMidiNote = -1;   // The note actively ringing out across the canvas

let lastStepTime = 0;      // Rhythmic clock timer
let currentTempo = 300;    // Time between notes in milliseconds

// --- SYNTH PARAMETERS ---
let currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0];

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 255);
  
  // 1. Initialize our Parametric Synth
  ddspEngine = new ParametricDDSP();
  
  // 2. Algorithmically build the baseline Markov Matrix 
  // Notes naturally prefer moving to immediate musical neighbors or perfect intervals
  for (let i = 0; i < musicalScale.length; i++) {
    transitionMatrix[i] = new Array(musicalScale.length).fill(0);
  }
  
  // 3. Populate the visual gravity grid
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

  // 1. Unsupervised Matrix Warping & Audio Morphing based on Mouse Position
  warpMatrixAndTimbre();

  // 2. The AI Clock: Trigger the next note based on the updated tempo
  if (millis() - lastStepTime > currentTempo) {
    aiPlayNextNote();
    lastStepTime = millis();
  }

  // 3. Draw Visual Radial Safe-Zone Guideline (40% boundary line)
  drawRadialGuidelines();

  // 4. Process Visual Grid Animations
  for (let dot of dots) {
    dot.checkAIActivation(activeMidiNote);
    dot.update();
    dot.display(mouseX, mouseY); 
  }
  
  // 5. Draw Telemetry Dashboard Overlay
  drawTelemetryHUD();
}

function warpMatrixAndTimbre() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let currentDist = dist(mouseX, mouseY, centerX, centerY);
  
  // Normalized distance: 0.0 (center) to 1.0 (extreme corner)
  let normRadialDist = constrain(currentDist / maxRadius, 0.0, 1.0);
  let safeZoneThreshold = 0.40;
  
  // --- STEP A: WARP THE MARKOV AI BRAIN ---
  let chaosFactor = 0;
  if (normRadialDist <= safeZoneThreshold) {
    // Core Zone: Smooth, deliberate tempo
    currentTempo = 350; 
    chaosFactor = 0.0; // Perfect mathematical structure
  } else {
    // Edge Zone: Tempo accelerates wildly as you push outward
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTempo = map(edgeFactor, 0.0, 1.0, 350, 80); // Speeds up down to a blistering 80ms
    chaosFactor = edgeFactor; // Inject pure probability entropy
  }

  // Re-calculate the transition matrix probabilities on the fly
  for (let i = 0; i < musicalScale.length; i++) {
    let rowTotal = 0;
    for (let j = 0; j < musicalScale.length; j++) {
      // Base structural melody behavior (prefers moving up or down by 1 scale step)
      let structuralProb = 0;
      if (abs(i - j) === 1 || abs(i - j) === 3) structuralProb = 0.8;
      if (i === j) structuralProb = 0.1; // Occasional note repeats
      
      // Chaos behavior: completely flat uniform randomness
      let randomProb = 1.0 / musicalScale.length;
      
      // Linearly blend structure and chaos based on your cursor position
      transitionMatrix[i][j] = lerp(structuralProb, randomProb, chaosFactor);
      rowTotal += transitionMatrix[i][j];
    }
    
    // Normalize row back to valid probability distribution summing to 1.0
    for (let j = 0; j < musicalScale.length; j++) {
      transitionMatrix[i][j] /= rowTotal;
    }
  }

  // --- STEP B: WARP THE DDSP SYNTH AUDIO TIMBRE ---
  if (normRadialDist <= safeZoneThreshold) {
    currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0]; // Pure fundamental tone
  } else {
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    currentTimbreWeights[0] = 1.0 - (edgeFactor * 0.4);
    currentTimbreWeights[1] = constrain(map(edgeFactor, 0.0, 0.5, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[2] = constrain(map(edgeFactor, 0.2, 0.8, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[3] = constrain(map(edgeFactor, 0.5, 1.0, 0.0, 1.0), 0.0, 1.0);
    currentTimbreWeights[4] = edgeFactor > 0.6 ? map(edgeFactor, 0.6, 1.0, 0.0, 0.7) : 0.0;
  }
  
  ddspEngine.morphTimbre(currentTimbreWeights);
}

function aiPlayNextNote() {
  // Unsupervised choice generation based on current node row probabilities
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
  
  // Direct execution down the DDSP synthesis thread
  ddspEngine.triggerAttack(activeMidiNote);
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
    this.ampEnvelope = lerp(this.ampEnvelope, 0, 0.07); // Slightly faster decay for faster speeds
    
    if (this.currentBaseFreq > 0) {
      for (let i = 0; i < this.numHarmonics; i++) {
        this.harmonics[i].freq(this.currentBaseFreq * (i + 1));
        let targetingAmp = weights[i] * 0.15 * this.ampEnvelope;
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
    // If the unsupervised partner triggers this specific dot's pitch, execute a flash spike
    if (this.midiNote === currentAINote) {
      this.isGlowing = true;
      this.glowIntensity = 255;
      this.currentRadius = this.glowRadius;
    }
  }

  update() {
    // Smoothly decay the flash glow back down over time
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

    let displayGlowRadius = this.currentRadius * sizeModifier;
    let displayBaseRadius = this.baseRadius * sizeModifier;

    if (this.glowIntensity > 2) {
      let c = color(this.targetColor);
      c.setAlpha(this.glowIntensity * 0.5); 
      fill(c);
      ellipse(renderX, renderY, displayGlowRadius * 2);
    }

    if (this.glowIntensity > 100) {
      fill(this.targetColor); 
    } else {
      fill(0, 0, 20); 
    }
    
    ellipse(renderX, renderY, displayBaseRadius * 2);
  }
}

function drawTelemetryHUD() {
  fill(0, 0, 15, 220);
  rect(15, 15, 340, 155, 8);
  
  fill(0, 0, 100);
  noStroke();
  textSize(10);
  textFont('Courier New');
  text("UNSUPERVISED MARKOV MATRIX AI JAM PARTNER", 25, 35);
  
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let currentDist = dist(mouseX, mouseY, centerX, centerY);
  let normRadialDist = constrain(currentDist / maxRadius, 0, 1);
  
  text(`AI Generative Tempo Clock: ${currentTempo}ms`, 25, 55);
  text(`Active Musical Target Frequency: ${midiToFreq(activeMidiNote).toFixed(1)} Hz`, 25, 75);
  
  if (normRadialDist <= 0.40) {
    fill(140, 85, 95);
    text("MATRIX STATE: CONSONANT MELODIC COHESION (0% ENTROPY)", 25, 95);
  } else {
    let entropy = map(normRadialDist, 0.40, 1.0, 0, 100);
    fill(15, 85, 95);
    text(`MATRIX STATE: PROBABILISTIC CHAOS (${entropy.toFixed(0)}% ENTROPY)`, 25, 95);
  }
  
  fill(0, 0, 100);
  text("Active Timbre Synth Weight Array Map:", 25, 122);
  
  for(let i = 0; i < currentTimbreWeights.length; i++) {
    let barWidth = currentTimbreWeights[i] * 50;
    if (i === 4) fill(0, 80, 90); 
    else fill(i * 45 + 190, 85, 95); 
    
    rect(25 + (i * 63), 132, barWidth, 10, 2);
  }
}

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
