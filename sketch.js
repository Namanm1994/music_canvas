let dots = [];
let lastNoteTime = 0;
let currentTimbreWeights = [1.0, 0.0, 0.0, 0.0, 0.0]; // Default: Pure fundamental

// Continuous Parametric DDSP Synthesizer Architecture
let ddspEngine;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 255);
  
  // Initialize the DDSP Additive Harmonic Synthesizer
  ddspEngine = new ParametricDDSP();
  
  // Setup the Spaced 2D Looping Musical Grid
  let spacing = 12;
  let noteZoneSize = 6; // Note spans 6 dots before shifting pitch
  const musicalScale = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74]; // 2-Octave Pentatonic
  
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

  // 1. Calculate Radial Harmonics based on Cursor Position
  calculateRadialHarmonics();

  // 2. Draw the 40% Acoustic Safe Zone Guideline
  drawRadialGuidelines();

  // 3. Process and Render Visual Gravity Grid
  for (let dot of dots) {
    dot.checkHover(mouseX, mouseY);
    dot.update();
    dot.display(mouseX, mouseY); 
  }
  
  // 4. Draw Telemetry Dashboard Overlay
  drawTelemetryHUD();
}

function calculateRadialHarmonics() {
  let centerX = width / 2;
  let centerY = height / 2;
  
  // Max possible distance from center to a corner
  let maxRadius = dist(0, 0, centerX, centerY);
  let currentDist = dist(mouseX, mouseY, centerX, centerY);
  
  // Normalize radial distance from 0.0 (center) to 1.0 (extreme corner)
  let normRadialDist = constrain(currentDist / maxRadius, 0.0, 1.0);
  
  let safeZoneThreshold = 0.40; // 40% Radially
  
  if (normRadialDist <= safeZoneThreshold) {
    // --- ZONE 1: THE CORE (Base Tones Only) ---
    currentTimbreWeights[0] = 1.0; // Fundamental (1x) is fully open
    currentTimbreWeights[1] = 0.0; // 2x Muted
    currentTimbreWeights[2] = 0.0; // 3x Muted
    currentTimbreWeights[3] = 0.0; // 4x Muted
    currentTimbreWeights[4] = 0.0; // Noise Muted
  } else {
    // --- ZONE 2: THE ACOUSTIC EXPANSION ---
    // Scale the factor from 0.0 (at the 40% line) to 1.0 (at the extreme edge)
    let edgeFactor = map(normRadialDist, safeZoneThreshold, 1.0, 0.0, 1.0);
    
    // Systematic Harmonic Layering:
    currentTimbreWeights[0] = 1.0 - (edgeFactor * 0.3); // Fundamental drops slightly to let overtones pierce through
    currentTimbreWeights[1] = constrain(map(edgeFactor, 0.0, 0.5, 0.0, 1.0), 0.0, 1.0); // 2x fades in first
    currentTimbreWeights[2] = constrain(map(edgeFactor, 0.2, 0.8, 0.0, 1.0), 0.0, 1.0); // 3x follows
    currentTimbreWeights[3] = constrain(map(edgeFactor, 0.5, 1.0, 0.0, 1.0), 0.0, 1.0); // 4x comes in last
    
    // Add a tiny bit of chaotic noise/friction at the very extremes
    currentTimbreWeights[4] = edgeFactor > 0.7 ? map(edgeFactor, 0.7, 1.0, 0.0, 0.8) : 0.0;
  }
  
  // Feed output parameters straight into the synthesizer voice lines
  ddspEngine.morphTimbre(currentTimbreWeights);
}

function drawRadialGuidelines() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let safeZoneDiameter = maxRadius * 0.40 * 2;
  
  // Draw a clean, minimal dashed boundary line for the 40% threshold
  noFill();
  stroke(0, 0, 80, 150);
  strokeWeight(1);
  drawingContext.setLineDash([4, 4]); // Creates dashed look
  ellipse(centerX, centerY, safeZoneDiameter);
  drawingContext.setLineDash([]); // Reset dash settings so it doesn't affect dots
}

class ParametricDDSP {
  constructor() {
    this.numHarmonics = 4;
    this.harmonics = [];
    
    // Component A: Pure Additive Sinusoidal Harmonics (F0, 2F0, 3F0, 4F0)
    for (let i = 0; i < this.numHarmonics; i++) {
      let osc = new p5.Oscillator('sine');
      osc.amp(0);
      osc.start();
      this.harmonics.push(osc);
    }
    
    // Component B: Residual Ambient Noise Shaper (Simulates friction/breath at canvas edges)
    this.noiseComponent = new p5.Noise('pink');
    this.noiseComponent.amp(0);
    this.noiseComponent.start();
    
    this.currentBaseFreq = 0;
    this.ampEnvelope = 0;
  }
  
  morphTimbre(weights) {
    this.ampEnvelope = lerp(this.ampEnvelope, 0, 0.04); // Natural note decay profile
    
    if (this.currentBaseFreq > 0) {
      for (let i = 0; i < this.numHarmonics; i++) {
        this.harmonics[i].freq(this.currentBaseFreq * (i + 1));
        let targetingAmp = weights[i] * 0.16 * this.ampEnvelope;
        this.harmonics[i].amp(targetingAmp, 0.02); // 20ms click prevention smoothing
      }
      
      let noiseTargetAmp = weights[4] * 0.03 * this.ampEnvelope;
      this.noiseComponent.amp(noiseTargetAmp, 0.02);
    }
  }
  
  triggerAttack(midiNote) {
    this.currentBaseFreq = midiToFreq(midiNote);
    this.ampEnvelope = 1.0; // Peak strike volume
  }
}

class Dot {
  constructor(x, y, c, note) {
    this.x = x;
    this.y = y;
    this.baseRadius = 2; 
    this.glowRadius = 14;  
    this.currentRadius = this.baseRadius;
    this.targetColor = c;  
    this.midiNote = note; 
    this.isGlowing = false;
    this.glowIntensity = 0;
    this.cooldown = 0;
  }

  checkHover(mx, my) {
    let d = dist(this.x, this.y, mx, my);
    
    if (d < 8 && this.cooldown === 0) {
      this.isGlowing = true;
      this.cooldown = 45; 

      if (millis() - lastNoteTime > 35) {
        ddspEngine.triggerAttack(this.midiNote); 
        lastNoteTime = millis(); 
      }
    }
  }

  update() {
    if (this.isGlowing) {
      this.glowIntensity = lerp(this.glowIntensity, 255, 0.2);
      this.currentRadius = lerp(this.currentRadius, this.glowRadius, 0.2);
    } else {
      this.glowIntensity = lerp(this.glowIntensity, 0, 0.05);
      this.currentRadius = lerp(this.currentRadius, this.baseRadius, 0.05);
    }

    if (this.cooldown > 0) {
      this.cooldown--;
      if (this.cooldown === 0) this.isGlowing = false;
    }
  }

  display(mx, my) {
    noStroke();
    
    let renderX = this.x;
    let renderY = this.y;
    let sizeModifier = 1.0;
    
    let d = dist(this.x, this.y, mx, my);
    let gravityRadius = 160; 
    
    if (d < gravityRadius) {
      let pullFactor = sin(map(d, 0, gravityRadius, 0, PI)) * 12; 
      let angle = atan2(my - this.y, mx - this.x);
      
      renderX += cos(angle) * pullFactor;
      renderY += sin(angle) * pullFactor;
      
      sizeModifier = map(d, 0, gravityRadius, 0.5, 1.0);
    }

    let displayGlowRadius = this.currentRadius * sizeModifier;
    let displayBaseRadius = this.baseRadius * sizeModifier;

    if (this.glowIntensity > 5) {
      let c = color(this.targetColor);
      c.setAlpha(this.glowIntensity * 0.4); 
      fill(c);
      ellipse(renderX, renderY, displayGlowRadius * 2);
    }

    if (this.glowIntensity > 150) {
      fill(this.targetColor); 
    } else {
      fill(0); 
    }
    
    ellipse(renderX, renderY, displayBaseRadius * 2);
  }
}

function drawTelemetryHUD() {
  fill(0, 0, 15, 200);
  rect(15, 15, 320, 135, 8);
  
  fill(0, 0, 100);
  noStroke();
  textSize(11);
  textFont('Courier New');
  text("RADIAL HARMONIC TIMBRE NAVIGATION", 25, 35);
  
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let currentDist = dist(mouseX, mouseY, centerX, centerY);
  let normRadialDist = constrain(currentDist / maxRadius, 0, 1);
  
  text(`Radial Position: ${(normRadialDist * 100).toFixed(1)}% from Center`, 25, 55);
  
  if (normRadialDist <= 0.40) {
    fill(140, 85, 95);
    text("CURRENT ZONE: CORE SAFE ZONE (Base Tones)", 25, 75);
  } else {
    fill(15, 85, 95);
    text("CURRENT ZONE: HARMONIC EXPANSION EDGE", 25, 75);
  }
  
  fill(0, 0, 100);
  text("Active DDSP Harmonic Modifiers:", 25, 102);
  
  for(let i = 0; i < currentTimbreWeights.length; i++) {
    let barWidth = currentTimbreWeights[i] * 45;
    
    if (i === 4) fill(0, 80, 90); // Residual edge noise
    else fill(i * 45 + 200, 85, 95); // Harmonics 1x, 2x, 3x, 4x
    
    rect(25 + (i * 58), 112, barWidth, 10, 2);
  }
}

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
