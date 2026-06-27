let dots = [];
let lastNoteTime = 0;
let decoderModel;
let modelReady = false;
let currentTimbreWeights = [0.2, 0.2, 0.2, 0.2, 0.2]; // Fallback neural coefficients

// Continuous Parametric DDSP Synthesizer Architecture
let ddspEngine;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 255);
  
  // 1. Compile the Generative Latent Decoder Network in-browser
  buildNeuralDecoder();
  
  // 2. Instantiate the DDSP Additive Harmonic Synthesizer
  ddspEngine = new ParametricDDSP();
  
  // 3. Setup the Spaced 2D Looping Musical Grid
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

function buildNeuralDecoder() {
  // Instantiates a multi-layer feedforward neural network structure
  decoderModel = tf.sequential();
  
  // Hidden Layer 1: Ingests 2D Latent Vector Space [Latent_X, Latent_Y]
  decoderModel.add(tf.layers.dense({
    units: 16,
    activation: 'tanh',
    inputShape: [2],
    kernelInitializer: 'randomNormal'
  }));
  
  // Hidden Layer 2: Maps complex non-linear acoustic textures
  decoderModel.add(tf.layers.dense({
    units: 12,
    activation: 'relu',
    kernelInitializer: 'randomNormal'
  }));
  
  // Output Layer: Generates 5 precise structural synthesis coefficients
  decoderModel.add(tf.layers.dense({
    units: 5,
    activation: 'sigmoid',
    kernelInitializer: 'randomNormal'
  }));
  
  modelReady = true;
}

function draw() {
  background(0, 0, 100); 

  // 1. Run Real-Time Generative Inference 
  if (modelReady) {
    navigateLatentSpace();
  }

  // 2. Process and Render Visual Gravity Grid
  for (let dot of dots) {
    dot.checkHover(mouseX, mouseY);
    dot.update();
    dot.display(mouseX, mouseY); 
  }
  
  // 3. Draw Telemetry Dashboard Overlay
  drawTelemetryHUD();
}

function navigateLatentSpace() {
  // Wraps calculation inside tf.tidy to immediately garbage-collect WebGL textures and prevent memory leaks
  tf.tidy(() => {
    let normX = map(mouseX, 0, width, 0.0, 1.0, true);
    let normY = map(mouseY, 0, height, 0.0, 1.0, true);
    
    let inputTensor = tf.tensor2d([[normX, normY]]);
    let outputTensor = decoderModel.predict(inputTensor);
    
    // Unpack tensor array values into standard JavaScript array execution thread
    currentTimbreWeights = outputTensor.dataSync();
  });
  
  // Feed output parameter matrices straight into the dynamic voice synthesis channels
  ddspEngine.morphTimbre(currentTimbreWeights);
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
    
    // Component B: Residual Ambient Noise Shaper (Simulates breath/bowing/friction friction elements)
    this.noiseComponent = new p5.Noise('pink');
    this.noiseComponent.amp(0);
    this.noiseComponent.start();
    
    this.currentBaseFreq = 0;
    this.ampEnvelope = 0;
  }
  
  morphTimbre(weights) {
    // Gracefully bleed amplitude over time to simulate custom acoustic decays
    this.ampEnvelope = lerp(this.ampEnvelope, 0, 0.04); 
    
    if (this.currentBaseFreq > 0) {
      // Re-render frequency multipliers and map harmonic energy levels from model weights
      for (let i = 0; i < this.numHarmonics; i++) {
        this.harmonics[i].freq(this.currentBaseFreq * (i + 1));
        let targetingAmp = weights[i] * 0.16 * this.ampEnvelope;
        this.harmonics[i].amp(targetingAmp, 0.02); // 20ms smoothing to eliminate digital audio clipping
      }
      
      // Control noise injection mix balance using weight channel index 4
      let noiseTargetAmp = weights[4] * 0.03 * this.ampEnvelope;
      this.noiseComponent.amp(noiseTargetAmp, 0.02);
    }
  }
  
  triggerAttack(midiNote) {
    this.currentBaseFreq = midiToFreq(midiNote);
    this.ampEnvelope = 1.0; // Reset note strike velocity
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
  // Semi-transparent panel
  fill(0, 0, 15, 200);
  rect(15, 15, 320, 130, 8);
  
  fill(0, 0, 100);
  noStroke();
  textSize(11);
  textFont('Courier New');
  text("UNSUPERVISED AUDIO LATENT SPACE NAVIGATION", 25, 35);
  text(`Latent Vector Z0 (X): ${map(mouseX, 0, width, 0, 1, true).toFixed(4)}`, 25, 55);
  text(`Latent Vector Z1 (Y): ${map(mouseY, 0, height, 0, 1, true).toFixed(4)}`, 25, 75);
  
  text("Model Decoded DDSP Coefficients Matrix:", 25, 100);
  
  // Render real-time bar graphs indicating current model inference output array
  for(let i = 0; i < currentTimbreWeights.length; i++) {
    let barWidth = currentTimbreWeights[i] * 45;
    
    // Distinguish harmonic channels from the noise element color-wise
    if (i === 4) fill(0, 80, 90); // Residual Noise Channel
    else fill(i * 50 + 180, 85, 95); // Harmonic Channels
    
    rect(25 + (i * 58), 110, barWidth, 10, 2);
  }
}

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
