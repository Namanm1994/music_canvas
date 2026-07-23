let dots = [];
let ddspEngine;
let drumEngine; 

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

function mousePressed() {
  userStartAudio(); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
