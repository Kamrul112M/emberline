// EMBERLINE — hud.js
// Everything flat that sits over the 3D view: health/ammo/money bars, the
// round banner, hitmarker, damage vignette, the buy menu, and the canvas
// minimap (yard walls from the same collider list the world collides
// with, the Beacon Pad, the player arrow and living Wardens as dots).

import { SITE, YARD } from './world.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['health-fill', 'health-num', 'ammo', 'weapon-name', 'money', 'grenades',
      'score-us', 'score-them', 'timer', 'round-label', 'banner', 'banner-sub', 'hitmarker',
      'vignette', 'crosshair', 'interact', 'interact-fill', 'bomb-timer', 'message',
      'buy-menu', 'buy-items', 'buy-money', 'title-screen', 'end-screen', 'end-title',
      'end-sub', 'pause-screen', 'start-btn', 'restart-btn', 'resume-btn', 'final-score']) {
      this.el[id] = document.getElementById(id);
    }
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.bannerUntil = 0;
    this.messageUntil = 0;
  }

  showBanner(text, sub = '', seconds = 2.2, now = 0) {
    this.el.banner.textContent = text;
    this.el.banner.style.opacity = 1;
    this.el['banner-sub'].textContent = sub;
    this.el['banner-sub'].style.opacity = sub ? 1 : 0;
    this.bannerUntil = now + seconds;
  }
  showMessage(text, seconds = 2.5, now = 0) {
    this.el.message.textContent = text;
    this.el.message.style.opacity = 1;
    this.messageUntil = now + seconds;
  }
  flashHitmarker(head = false, kill = false) {
    const h = this.el.hitmarker;
    h.style.opacity = 1;
    h.style.color = kill ? '#ff5a4e' : head ? '#ffc46b' : '#ffffff';
    h.style.transform = `translate(-50%,-50%) scale(${kill ? 1.5 : 1.15})`;
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.style.opacity = 0; h.style.transform = 'translate(-50%,-50%) scale(1)'; }, 110);
  }
  hurtFlash() {
    this.el.vignette.style.opacity = 0.55;
    clearTimeout(this._vgT);
    this._vgT = setTimeout(() => { this.el.vignette.style.opacity = 0; }, 180);
  }

  /** Per-frame DOM sync from the game state (cheap textContent writes only when changed). */
  sync(s, now) {
    const set = (id, v) => { if (this.el[id]._v !== v) { this.el[id]._v = v; this.el[id].textContent = v; } };
    set('health-num', `${Math.ceil(s.player.health)}`);
    this.el['health-fill'].style.width = `${Math.max(0, s.player.health)}%`;
    this.el['health-fill'].style.background = s.player.health > 50 ? '#51e0a5' : s.player.health > 25 ? '#ffc46b' : '#ff5a4e';
    const w = s.arsenal;
    set('ammo', w.reloading(now) ? '— —' : `${w.st.mag} / ${w.st.reserve}`);
    set('weapon-name', w.def.name + (w.ads ? ' · ADS' : ''));
    set('money', `$${s.money}`);
    set('grenades', `✸ ${w.grenades}`);
    set('score-us', `${s.scoreUs}`);
    set('score-them', `${s.scoreThem}`);
    const t = Math.max(0, Math.ceil(s.phase === 'planted' ? s.bombLeft : s.timeLeft));
    set('timer', s.phase === 'buy' ? `BUY ${Math.max(0, Math.ceil(s.buyLeft))}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    set('round-label', `ROUND ${s.round} · ${s.phase === 'planted' ? 'CHARGE PLANTED' : s.phase.toUpperCase()}`);
    // Crosshair bloom: the gap grows with the weapon's live spread.
    const gap = 6 + s.arsenal.spread(s.player) * 900;
    this.el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    this.el.crosshair.style.opacity = s.phase === 'live' || s.phase === 'planted' ? 1 : 0;
    // Bomb countdown chip.
    this.el['bomb-timer'].style.opacity = s.phase === 'planted' ? 1 : 0;
    if (s.phase === 'planted') set('bomb-timer', `⚠ CHARGE ${s.bombLeft.toFixed(1)}s${s.defusing ? ' · DEFUSING!' : ''}`);
    // Interact progress (plant channel).
    if (s.plantProgress > 0) {
      this.el.interact.style.opacity = 1;
      this.el['interact-fill'].style.width = `${Math.min(100, s.plantProgress * 100)}%`;
    } else this.el.interact.style.opacity = 0;
    if (now > this.bannerUntil) { this.el.banner.style.opacity = 0; this.el['banner-sub'].style.opacity = 0; }
    if (now > this.messageUntil) this.el.message.style.opacity = 0;
  }

  drawMinimap(s, colliders) {
    const ctx = this.mm, W = this.minimap.width, H = this.minimap.height;
    const sx = W / (YARD.halfX * 2 + 4), sz = H / (YARD.halfZ * 2 + 4);
    const px = (x) => (x + YARD.halfX + 2) * sx;
    const pz = (z) => (z + YARD.halfZ + 2) * sz;
    ctx.fillStyle = 'rgba(16,14,22,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,196,107,0.9)';
    ctx.beginPath(); ctx.arc(px(SITE.x), pz(SITE.z), SITE.radius * sx, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f0d16';
    ctx.font = `bold ${Math.round(9 * sx * 2)}px system-ui`;
    ctx.textAlign = 'center'; ctx.fillText('A', px(SITE.x), pz(SITE.z) + 3);
    ctx.fillStyle = 'rgba(220,200,170,0.5)';
    for (const c of colliders) ctx.fillRect(px(c.minX), pz(c.minZ), (c.maxX - c.minX) * sx, (c.maxZ - c.minZ) * sz);
    // Bomb marker once planted.
    if (s.phase === 'planted') {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(px(SITE.x), pz(SITE.z), 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // Wardens.
    for (const b of s.bots) {
      if (!b.alive) continue;
      ctx.fillStyle = '#2fd8c8';
      ctx.beginPath(); ctx.arc(px(b.pos.x), pz(b.pos.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow: map north is -Z (up on the canvas); facing (yaw 0 = -Z)
    // must point straight up, and canvas rotation for that is exactly -yaw.
    ctx.save();
    ctx.translate(px(s.player.pos.x), pz(s.player.pos.z));
    ctx.rotate(-s.yaw);
    ctx.fillStyle = '#ff7a2f';
    ctx.beginPath();
    ctx.moveTo(0, -5.5); ctx.lineTo(4, 4.5); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  renderBuyMenu(s, onBuy) {
    const items = [
      { id: 'smg', label: '2 · Rook-9 SMG', desc: 'Fast, loose, close-range' },
      { id: 'longbow', label: '3 · Longbow .50', desc: 'One-shot power, slow, scoped' },
      { id: 'grenade', label: 'G · Ember Grenade', desc: `Area blast · own ${s.arsenal.grenades}/${3}` },
    ];
    this.el['buy-items'].innerHTML = '';
    for (const it of items) {
      const cost = s.arsenal.costOf(it.id);
      const can = s.arsenal.canBuy(it.id, s.money);
      const owned = it.id !== 'grenade' && s.arsenal.owned[it.id];
      const row = document.createElement('button');
      row.className = 'buy-row' + (can ? '' : ' disabled');
      row.innerHTML = `<span>${it.label}</span><span class="buy-desc">${it.desc}</span><b>${owned ? 'OWNED' : '$' + cost}</b>`;
      if (can) row.addEventListener('click', () => onBuy(it.id));
      this.el['buy-items'].appendChild(row);
    }
    this.el['buy-money'].textContent = `$${s.money}`;
  }
  showBuy(show) { this.el['buy-menu'].style.display = show ? 'flex' : 'none'; }
  showTitle(show) { this.el['title-screen'].style.display = show ? 'flex' : 'none'; }
  showEnd(show, title, sub, finalScore) {
    this.el['end-screen'].style.display = show ? 'flex' : 'none';
    if (show) {
      this.el['end-title'].textContent = title;
      this.el['end-sub'].textContent = sub;
      this.el['final-score'].textContent = finalScore;
    }
  }
  showPause(show) { this.el['pause-screen'].style.display = show ? 'flex' : 'none'; }
}
