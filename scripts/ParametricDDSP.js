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
