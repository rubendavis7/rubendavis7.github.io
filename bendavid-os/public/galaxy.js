// Animated particle galaxy. Respects prefers-reduced-motion (draws one still
// frame) and a manual Motion toggle; pauses when the tab is hidden.
(function () {
  'use strict';
  const canvas = document.getElementById('galaxy');
  const ctx = canvas.getContext('2d');
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stars = [];
  let dust = [];
  let w = 0, h = 0, dpr = 1, t = 0, raf = 0;
  let pointerX = 0, pointerY = 0;
  let userPaused = false;
  try { userPaused = localStorage.getItem('bdos.motion') === 'off'; } catch { /* storage blocked */ }

  const ARMS = 4;
  const COLORS = [[70, 224, 255], [157, 139, 255], [200, 220, 255], [246, 197, 110]];

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(1400, (w * h) / 1300));
    const R = Math.max(w, h) * 0.62;
    stars = [];
    for (let i = 0; i < count; i++) {
      const arm = i % ARMS;
      const r = Math.pow(Math.random(), 1.6) * R;
      const spread = (1 - r / R) * 0.9 + 0.12;
      const angle = (arm / ARMS) * Math.PI * 2 + r * 0.0052 + (Math.random() - 0.5) * spread;
      const c = Math.random() < 0.08 ? COLORS[3] : COLORS[Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : 2];
      stars.push({ r, angle, size: Math.random() * 1.4 + 0.3, speed: 0.00012 + (1 - r / R) * 0.00045, c, tw: Math.random() * Math.PI * 2 });
    }
    dust = Array.from({ length: Math.round(count / 6) }, () => ({ x: Math.random() * w, y: Math.random() * h, s: Math.random() * 0.9 + 0.2, a: Math.random() * 0.5 + 0.1 }));
  }

  function frame(dt) {
    t += dt;
    ctx.clearRect(0, 0, w, h);
    for (const d of dust) {
      ctx.fillStyle = `rgba(190,210,255,${d.a * 0.6})`;
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    const cx = w * 0.5 + pointerX * 18, cy = h * 0.36 + pointerY * 12;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.35);
    core.addColorStop(0, 'rgba(120,170,255,0.20)');
    core.addColorStop(0.35, 'rgba(110,90,255,0.07)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
    const tilt = 0.42;
    for (const s of stars) {
      s.angle += s.speed * dt;
      const x = cx + Math.cos(s.angle) * s.r;
      const y = cy + Math.sin(s.angle) * s.r * tilt;
      if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
      const a = 0.35 + 0.45 * Math.abs(Math.sin(s.tw + t * 0.0011));
      ctx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animating() { return !reduceQuery.matches && !userPaused && !document.hidden; }

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    frame(dt);
    raf = animating() ? requestAnimationFrame(loop) : 0;
  }

  function sync() {
    cancelAnimationFrame(raf);
    raf = 0; last = 0;
    document.body.classList.toggle('no-motion', !animating());
    if (animating()) raf = requestAnimationFrame(loop);
    else frame(0); // single still frame
    const btn = document.getElementById('motion-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(userPaused || reduceQuery.matches));
      btn.textContent = reduceQuery.matches ? 'Motion: reduced' : userPaused ? 'Motion: off' : 'Motion: on';
      btn.disabled = reduceQuery.matches;
    }
  }

  window.addEventListener('resize', () => { build(); sync(); });
  window.addEventListener('pointermove', (e) => {
    pointerX = e.clientX / w - 0.5; pointerY = e.clientY / h - 0.5;
  }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduceQuery.addEventListener('change', sync);
  document.getElementById('motion-toggle').addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('bdos.motion', userPaused ? 'off' : 'on'); } catch { /* ignore */ }
    sync();
  });

  build();
  sync();
})();
