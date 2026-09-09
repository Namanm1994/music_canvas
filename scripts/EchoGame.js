// ECHO — an AI call-and-response memory duel (a "Simon says" for melodies).
//
// The NeuralMelodyModel composes a phrase and the grid flashes it back one note
// at a time; the player repeats it on the keyboard. Get it right and the phrase
// grows by one note and playback speeds up; get it wrong and you lose a life.
//
// It reuses the existing pieces wholesale:
//   - melodyModel.predictNext()  -> generates each new note (the "level")
//   - global activeMidiNote       -> lights every dot for that note (playback + input feedback)
//   - ddspEngine.triggerAttack()  -> voices both the AI's notes and the player's
//   - melodyTemperature (mouse)   -> difficulty dial for how wild the phrases are
class EchoGame {
  constructor() {
    // States: IDLE (title) -> PLAYBACK -> LISTEN -> PAUSE -> (PLAYBACK | GAMEOVER)
    this.state = 'IDLE';
    this.sequence = [];      // scale-degree indices the player must echo
    this.inputIndex = 0;     // how many correct notes entered this round
    this.lives = 3;
    this.bestScore = 0;

    this.playbackIndex = 0;
    this.playbackTimer = 0;
    this.pauseUntil = 0;
    this.lastInputTime = 0;

    this.messageFlash = '';
    this.flashHue = 140;
    this.flashUntil = 0;

    // 12 scale degrees mapped low -> high across two keyboard rows.
    this.keyLabels = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", '\\'];
    this.keyMap = {};
    for (let i = 0; i < this.keyLabels.length; i++) this.keyMap[this.keyLabels[i]] = i;
  }

  isActive() { return this.state !== 'IDLE'; }

  // Return to the title screen (used when entering / leaving game mode).
  reset() {
    this.state = 'IDLE';
    this.sequence = [];
    this.inputIndex = 0;
    this.lives = 3;
    activeMidiNote = -1;
  }

  // Begin a fresh game from scratch.
  start() {
    this.lives = 3;
    this.sequence = [];
    this.inputIndex = 0;
    this._extendSequence();
    this._beginPlayback();
  }

  // ENTER either starts a game (from the title / game-over screens) or is ignored
  // while a round is in progress.
  onEnter() {
    if (this.state === 'IDLE' || this.state === 'GAMEOVER') this.start();
  }

  // --- sequence + playback helpers -----------------------------------------

  _extendSequence() {
    let nextIdx = null;
    if (typeof melodyModelReady !== 'undefined' && melodyModelReady) {
      nextIdx = melodyModel.predictNext(this.sequence, melodyTemperature);
    }
    if (nextIdx === null) {
      nextIdx = floor(random(musicalScale.length)); // fallback until the LSTM is ready
    }
    this.sequence.push(nextIdx);
  }

  // Playback gets faster as the phrase grows, so memory load AND speed both climb.
  _stepInterval() {
    return constrain(map(this.sequence.length, 1, 20, 620, 260), 240, 700);
  }

  _beginPlayback() {
    this.state = 'PLAYBACK';
    this.playbackIndex = 0;
    this.playbackTimer = millis();
    this.inputIndex = 0;
    this._playSeqNote(0);
  }

  _playSeqNote(i) {
    let midi = musicalScale[this.sequence[i]];
    activeMidiNote = midi;              // lights every dot carrying this note
    ddspEngine.triggerAttack(midi);
  }

  _flash(msg, hue) {
    this.messageFlash = msg;
    this.flashHue = hue;
    this.flashUntil = millis() + 700;
  }

  // --- per-frame update -----------------------------------------------------

  update() {
    if (this.state === 'PLAYBACK') {
      let interval = this._stepInterval();
      let elapsed = millis() - this.playbackTimer;
      if (elapsed > interval) {
        this.playbackTimer = millis();
        this.playbackIndex++;
        if (this.playbackIndex < this.sequence.length) {
          this._playSeqNote(this.playbackIndex);
        } else {
          activeMidiNote = -1;
          this.state = 'LISTEN';
          this.inputIndex = 0;
          this.lastInputTime = millis();
        }
      } else if (elapsed > interval * 0.55) {
        activeMidiNote = -1;           // brief gap so repeated notes re-flash
      }
    } else if (this.state === 'LISTEN') {
      if (millis() - this.lastInputTime > 220) activeMidiNote = -1;
    } else if (this.state === 'PAUSE') {
      if (millis() >= this.pauseUntil) this._beginPlayback();
    }
  }

  // --- keyboard input -------------------------------------------------------
  // Returns true if the key was consumed by the game.
  handleKey(k) {
    if (this.state !== 'LISTEN') return true;   // swallow keys during playback/pauses
    if (!(k in this.keyMap)) return true;

    let idx = this.keyMap[k];
    activeMidiNote = musicalScale[idx];
    ddspEngine.triggerAttack(musicalScale[idx]);
    this.lastInputTime = millis();

    if (idx === this.sequence[this.inputIndex]) {
      this.inputIndex++;
      if (this.inputIndex >= this.sequence.length) {
        // Whole phrase echoed correctly -> grow it and replay.
        this.bestScore = max(this.bestScore, this.sequence.length);
        this._flash('ECHO!  +1', 140);
        this._extendSequence();
        this.state = 'PAUSE';
        this.pauseUntil = millis() + 800;
      }
    } else {
      this.lives--;
      this._flash('MISS', 0);
      if (this.lives <= 0) {
        this.state = 'GAMEOVER';
        activeMidiNote = -1;
      } else {
        this.state = 'PAUSE';         // replay the same phrase for a retry
        this.pauseUntil = millis() + 900;
      }
    }
    return true;
  }

  // --- rendering ------------------------------------------------------------

  render() {
    push();
    textFont('Courier New');
    noStroke();

    // Status panel (top-left)
    rectMode(CORNER);
    fill(0, 0, 12, 210);
    rect(15, 15, 360, 92, 8);
    fill(0, 0, 100);
    textAlign(LEFT, TOP);
    textSize(13);
    text('ECHO — AI MEMORY DUEL', 25, 26);

    textSize(10);
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += (i < this.lives) ? '♥ ' : '· ';
    fill(0, 80, 95);
    text(`LIVES  ${hearts}`, 25, 50);
    fill(0, 0, 78);
    text(`ROUND  ${this.sequence.length}      BEST  ${this.bestScore}`, 25, 66);
    let engine = (typeof melodyModelReady !== 'undefined' && melodyModelReady) ? 'NEURAL LSTM' : 'WARMING UP…';
    text(`COMPOSER  ${engine}   ·   DIFFICULTY ${melodyTemperature.toFixed(2)}`, 25, 82);

    // Center prompts by state
    let cx = width / 2;
    let cy = height / 2;
    textAlign(CENTER, CENTER);

    if (this.state === 'IDLE') {
      this._banner(cx, cy, 'ECHO', 'press ENTER to start',
        'Watch the grid flash a phrase, then repeat it on the keyboard.');
    } else if (this.state === 'PLAYBACK') {
      this._tag(cx, height - 74, 'WATCH…   the AI is playing');
    } else if (this.state === 'LISTEN') {
      this._tag(cx, height - 74, `YOUR TURN   —   ${this.inputIndex} / ${this.sequence.length}`);
      this._progress(cx, height - 44);
    } else if (this.state === 'GAMEOVER') {
      this._banner(cx, cy, 'GAME OVER', `longest phrase: ${this.bestScore}`,
        'ENTER to try again    ·    ESC to exit');
    }

    // Transient flash ("ECHO! +1" / "MISS")
    if (this.messageFlash && millis() < this.flashUntil) {
      let a = map(this.flashUntil - millis(), 0, 500, 0, 255, true);
      textSize(30);
      fill(this.flashHue, 80, 100, a);
      text(this.messageFlash, cx, cy - 95);
    }

    // Key legend (bottom)
    textSize(10);
    textAlign(CENTER, BOTTOM);
    fill(0, 0, 60);
    text("KEYS   A S D F G H J K L ; ' \\   (low → high)      ·      ESC to exit", cx, height - 14);

    pop();
  }

  _banner(cx, cy, title, sub, hint) {
    rectMode(CENTER);
    fill(0, 0, 10, 215);
    rect(cx, cy, 540, 176, 12);
    fill(0, 0, 100);
    textSize(46);
    text(title, cx, cy - 32);
    fill(180, 60, 96);
    textSize(16);
    text(sub, cx, cy + 16);
    fill(0, 0, 72);
    textSize(11);
    text(hint, cx, cy + 48);
  }

  _tag(cx, y, msg) {
    rectMode(CENTER);
    textSize(14);
    let w = max(textWidth(msg) + 44, 260);
    fill(0, 0, 10, 205);
    rect(cx, y, w, 34, 8);
    fill(0, 0, 100);
    text(msg, cx, y);
  }

  _progress(cx, y) {
    let n = this.sequence.length;
    let spacing = 16;
    let startX = cx - (n - 1) * spacing / 2;
    rectMode(CENTER);
    for (let i = 0; i < n; i++) {
      if (i < this.inputIndex) fill(140, 80, 95);
      else fill(0, 0, 40);
      ellipse(startX + i * spacing, y, 10, 10);
    }
  }
}
