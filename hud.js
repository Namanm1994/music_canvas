function drawRadialGuidelines() {
  let centerX = width / 2;
  let centerY = height / 2;
  let maxRadius = dist(0, 0, centerX, centerY);
  let safeZoneDiameter = maxRadius * 0.40 * 2;
  
  noFill();
  stroke(0, 0, 30, 150); 
  strokeWeight(1.5);
  drawingContext.setLineDash([6, 6]); 
  ellipse(centerX, centerY, safeZoneDiameter);
  drawingContext.setLineDash([]); 
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
