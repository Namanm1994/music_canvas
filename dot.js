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
    let zHeight = 0; 
    
    if (glitchActive) {
      renderX += random(-2.5, 2.5);
      renderY += random(-2.5, 2.5);
    }
    
    let d = dist(this.x, this.y, mx, my);
    let lensRadius = 160; 
    
    if (d < lensRadius) {
      let normDist = d / lensRadius;
      zHeight = cos(normDist * HALF_PI);
      
      let pushFactor = sin(normDist * PI) * 24; 
      let angle = atan2(this.y - my, this.x - mx); 
      
      renderX += cos(angle) * pushFactor;
      renderY += sin(angle) * pushFactor;
      
      sizeModifier = map(zHeight, 0, 1, 1.0, 3.4);
    }

    let kickVisualMultiplier = 1.0 + (globalKickPulse * 0.45);
    let displayGlowRadius = this.currentRadius * sizeModifier * kickVisualMultiplier;
    let displayBaseRadius = this.baseRadius * sizeModifier * kickVisualMultiplier;

    // 1. Ambient Glow Rings
    if (this.glowIntensity > 2) {
      let c = color(this.targetColor);
      c.setAlpha(this.glowIntensity * 0.4); 
      fill(c);
      ellipse(renderX, renderY, displayGlowRadius * 2);
    }

    // 2. Core Node Body with Topographic Shading
    if (this.glowIntensity > 100) {
      fill(this.targetColor); 
      ellipse(renderX, renderY, displayBaseRadius * 2);
    } else {
      let baseBrightness = map(globalKickPulse, 0, 1, 20, 32);
      let localizedLighting = baseBrightness + (zHeight * 45); 
      
      fill(0, 0, localizedLighting); 
      ellipse(renderX, renderY, displayBaseRadius * 2);
    }
    
    // 3. Pseudo-3D Glossy Specular Light Highlight Reflection
    let highlightSize = displayBaseRadius * 0.55;
    let highlightOffset = displayBaseRadius * 0.35;
    
    if (this.glowIntensity > 100) {
      fill(0, 0, 100, 180); 
    } else {
      let highlightAlpha = map(zHeight, 0, 1, 40, 160); 
      fill(0, 0, 100, highlightAlpha);
    }
    ellipse(renderX - highlightOffset, renderY - highlightOffset, highlightSize);
  }
}
