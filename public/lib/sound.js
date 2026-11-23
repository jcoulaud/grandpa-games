// The sounds of the games, made by the browser with Web Audio: no sound file, so they work offline and weigh nothing.
// Load this file in the <head> of a page, after lib/zoom.js. It adds a "Couper le son" key next to the size keys
// in every <div class="zoom">, and the choice is kept on the PC and shared by every window.
//
//   Sound.play(name)   one short sound; names below in SOUNDS. An unknown name or a muted page plays nothing.
//
// The sounds are soft and short, in the middle of the range, where an older ear hears best: no high whistle,
// no loud bang. A page plays nothing until his first click, as the browser asks.
(() => {
  'use strict';
  const KEY = 'gg:sound';
  const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  const write = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} };
  let on = read(), ctx = null, master = null, noiseBuf = null;

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // The browser lets a page play only after a click or a key.
  const unlock = () => { if (on && audio() && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, unlock, { capture: true, passive: true });

  // A note: a sine or triangle with a quick attack and a soft fall.
  function tone(freq, at, len, vol = 0.3, type = 'sine', slide = 0) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + len + 0.02);
  }
  // A burst of filtered noise: paper, felt, wood, water.
  function noise(at, len, vol, freq, q = 1, kind = 'bandpass', sweep = 0) {
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  const card = at => { noise(at, 0.07, 0.35, 2200, 0.8); noise(at, 0.04, 0.2, 900, 1); };
  const wood = (at, pitch = 1, vol = 0.45) => { tone(420 * pitch, at, 0.09, vol, 'triangle', 0.6); noise(at, 0.03, vol * 0.6, 1800 * pitch, 2); };
  const notes = (list, gap, len, vol = 0.22, type = 'triangle') => list.forEach((f, i) => { tone(f, i * gap, len, vol, type); tone(f * 2, i * gap, len * 0.6, vol * 0.15); });

  const SOUNDS = {
    // A soft click: a button, a choice.
    tap: () => tone(660, 0, 0.05, 0.12, 'triangle'),
    // Cards: one card laid down, one turned over, a deal or a shuffle.
    card: () => card(0),
    flip: () => { noise(0, 0.04, 0.3, 2600, 0.9); noise(0.05, 0.05, 0.3, 1700, 0.9); },
    deal: () => { for (let i = 0; i < 6; i++) card(i * 0.07); },
    shuffle: () => { for (let i = 0; i < 14; i++) noise(i * 0.025, 0.04, 0.22, 2400 + Math.random() * 800, 1.2); },
    // A piece or a pawn put on a wooden board, and a piece taken off it.
    piece: () => wood(0),
    capture: () => { wood(0, 1); wood(0.09, 0.8, 0.35); },
    // A pencil mark: a letter, a figure, a word circled.
    write: () => noise(0, 0.06, 0.25, 3200, 2, 'bandpass', 0.7),
    // Dice in the hand, then on the table.
    dice: () => { for (let i = 0; i < 7; i++) wood(i * 0.055 + Math.random() * 0.02, 1.4 + Math.random() * 0.5, 0.25); },
    // A good move, such as a pair found or a line done; and a move that is not allowed, low and kind.
    good: () => notes([659, 880], 0.09, 0.25, 0.2),
    bad: () => tone(196, 0, 0.18, 0.25, 'triangle', 0.85),
    // His turn again, after the computer.
    turn: () => tone(784, 0, 0.35, 0.12, 'sine'),
    // The end of a game: won, or lost.
    win: () => notes([523, 659, 784, 1047], 0.12, 0.5, 0.22),
    lose: () => notes([392, 330, 262], 0.16, 0.45, 0.18, 'sine'),
    // The sea: a shot in the water, and a ship hit.
    splash: () => noise(0, 0.5, 0.35, 900, 0.7, 'lowpass', 0.3),
    boom: () => { noise(0, 0.6, 0.6, 500, 0.7, 'lowpass', 0.2); tone(90, 0, 0.4, 0.4, 'sine', 0.5); },
    // Balls: two balls that touch, a ball in a pocket or a cup, a cushion, a club or a cue on a ball.
    clack: () => { tone(1900, 0, 0.04, 0.3, 'sine'); noise(0, 0.02, 0.3, 3000, 3); },
    pocket: () => { tone(220, 0, 0.18, 0.35, 'sine', 0.7); noise(0.04, 0.12, 0.2, 600, 1); },
    cushion: () => tone(140, 0, 0.1, 0.3, 'sine', 0.8),
    hit: () => { noise(0, 0.03, 0.4, 1500, 1.5); tone(300, 0, 0.06, 0.25, 'triangle', 0.7); },
    // Bowling: the ball rolls down the lane, and the pins fall.
    roll: () => noise(0, 1.1, 0.18, 220, 0.8, 'lowpass', 0.8),
    pins: () => { for (let i = 0; i < 9; i++) wood(i * 0.04 + Math.random() * 0.05, 1.6 + Math.random() * 0.6, 0.3); },
  };

  function play(name) {
    if (!on || !SOUNDS[name] || !audio()) return;
    if (ctx.state === 'suspended') return;
    try { SOUNDS[name](); } catch (e) {}
  }

  // The key next to "Réduire" and "Agrandir": a loudspeaker and plain words.
  const speaker = loud => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>${loud
    ? '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>' : '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'}</svg>`;
  function draw(box) {
    let key = box.querySelector('.sound');
    if (!key) {
      key = document.createElement('button');
      key.type = 'button';
      key.className = 'sound';
      key.addEventListener('click', () => { on = !on; write(on); drawAll(); if (on) { unlock(); setTimeout(() => play('tap'), 30); } });
      box.prepend(key);
    }
    key.innerHTML = speaker(on) + (on ? 'Couper le son' : 'Remettre le son');
    key.title = on ? 'Ne plus entendre les sons des jeux' : 'Entendre les sons des jeux';
    key.setAttribute('aria-pressed', String(!on));
  }
  const drawAll = () => document.querySelectorAll('.zoom').forEach(draw);
  // lib/zoom.js draws its keys on DOMContentLoaded too, and it loads first, so the sound key goes before them.
  addEventListener('DOMContentLoaded', drawAll);
  addEventListener('storage', e => { if (e.key === KEY) { on = read(); drawAll(); } });

  window.Sound = { play };
})();
