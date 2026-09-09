// A small LSTM that learns to predict the next scale-degree from recent history.
// It is trained in-browser at startup on a procedurally generated melodic
// corpus, so the "AI" melody is a genuine neural sequence model (TensorFlow.js)
// rather than a fixed transition matrix. Everything is driven by a seeded RNG
// so a given seed reproduces the same model and the same note choices.
class NeuralMelodyModel {
  constructor(vocabSize, seed) {
    this.vocabSize = vocabSize;
    this.seqLength = 6;              // how many recent notes the model looks at
    this.seed = seed >>> 0;
    this.rng = this._mulberry32(this.seed);
    this.ready = false;
    this.model = null;
  }

  // Tiny deterministic PRNG (mulberry32) so corpus + sampling are reproducible.
  _mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _oneHot(index) {
    const v = new Array(this.vocabSize).fill(0);
    v[index] = 1;
    return v;
  }

  // Weighted pick over scale-degree moves that favours stepwise motion — a
  // crude stand-in for melodic voice-leading — using the seeded RNG.
  _nextCorpusIndex(current) {
    const weights = [];
    let total = 0;
    for (let j = 0; j < this.vocabSize; j++) {
      const interval = Math.abs(current - j);
      let w = 0.02;
      if (interval === 1) w = 0.9;
      else if (interval === 2) w = 0.5;
      else if (interval === 3) w = 0.6;
      else if (interval === 4) w = 0.2;
      else if (interval === 0) w = 0.08;
      weights.push(w);
      total += w;
    }
    let r = this.rng() * total;
    for (let j = 0; j < this.vocabSize; j++) {
      r -= weights[j];
      if (r <= 0) return j;
    }
    return this.vocabSize - 1;
  }

  _buildCorpus(length) {
    const seq = [];
    let cur = Math.floor(this.rng() * this.vocabSize);
    for (let i = 0; i < length; i++) {
      seq.push(cur);
      cur = this._nextCorpusIndex(cur);
    }
    return seq;
  }

  // Build the corpus, assemble sliding-window training pairs, and fit the LSTM.
  async train(epochs = 12) {
    const corpus = this._buildCorpus(800);
    const xsArr = [];
    const ysArr = [];
    for (let i = 0; i + this.seqLength < corpus.length; i++) {
      const window = [];
      for (let k = 0; k < this.seqLength; k++) {
        window.push(this._oneHot(corpus[i + k]));
      }
      xsArr.push(window);
      ysArr.push(this._oneHot(corpus[i + this.seqLength]));
    }

    this.model = tf.sequential();
    this.model.add(tf.layers.lstm({
      units: 24,
      inputShape: [this.seqLength, this.vocabSize],
      kernelInitializer: tf.initializers.glorotUniform({ seed: this.seed })
    }));
    this.model.add(tf.layers.dense({
      units: this.vocabSize,
      activation: 'softmax',
      kernelInitializer: tf.initializers.glorotUniform({ seed: this.seed + 1 })
    }));
    this.model.compile({ optimizer: tf.train.adam(0.01), loss: 'categoricalCrossentropy' });

    const xs = tf.tensor3d(xsArr);
    const ys = tf.tensor2d(ysArr);
    await this.model.fit(xs, ys, { epochs, batchSize: 32, shuffle: false });
    xs.dispose();
    ys.dispose();
    this.ready = true;
  }

  // Predict the next scale-degree index from recent history, softened/sharpened
  // by `temperature` (low = structured & predictable, high = adventurous).
  // Returns null until the model has finished training.
  predictNext(history, temperature) {
    if (!this.ready) return null;
    const t = Math.max(0.05, temperature || 1.0);

    // Take the last seqLength notes, left-padding with the earliest available.
    const recent = [];
    for (let k = this.seqLength - 1; k >= 0; k--) {
      const idx = history.length - 1 - k;
      recent.push(idx >= 0 ? history[idx] : (history.length ? history[0] : 0));
    }

    const probs = tf.tidy(() => {
      const input = tf.tensor3d([recent.map(i => this._oneHot(i))]);
      return this.model.predict(input).dataSync();
    });

    // Temperature-scaled resampling of the softmax distribution.
    const logits = [];
    let maxL = -Infinity;
    for (let i = 0; i < probs.length; i++) {
      const l = Math.log(probs[i] + 1e-9) / t;
      logits.push(l);
      if (l > maxL) maxL = l;
    }
    let sum = 0;
    const exps = logits.map(l => { const e = Math.exp(l - maxL); sum += e; return e; });
    let r = this.rng() * sum;
    for (let i = 0; i < exps.length; i++) {
      r -= exps[i];
      if (r <= 0) return i;
    }
    return exps.length - 1;
  }
}
