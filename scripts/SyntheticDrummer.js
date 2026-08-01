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

  // Route the drum voices into a shared destination (the master FX bus) instead
  // of the default main output, so they share the same reverb/delay space.
  connectTo(destination) {
    this.kickOsc.disconnect();
    this.kickOsc.connect(destination);
    this.snareOsc.disconnect();
    this.snareOsc.connect(destination);
    this.percussiveNoise.disconnect();
    this.percussiveNoise.connect(destination);
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
