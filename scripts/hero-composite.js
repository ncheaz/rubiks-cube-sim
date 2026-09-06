/* Build the definitive hero composite at true 1440x900:
 * CSS-gradient backdrop + full-res WebGL render + HUD drawn from live DOM.
 * Deterministic (g.draw(0), no bob/idle). Returns JPEG data URL parts. */
(async () => {
  const page = globalThis.__page;
  if (!page) throw new Error('no page');
  await page.goto('file:///home/ncheaz/Projects/glm/glm-test-flight-simulator/cube.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const dataUrl = await page.evaluate(() => {
    const g = window.game;
    g.resetCubies(); g.facelets = CubeSolver.solvedFacelets();
    g.cam.yaw = -0.785; g.cam.pitch = 0.55; g.cam.dist = g.cam.distT = 6.9;
    g.idleT = 0; g.solveSpin = 0; g.hint.amt = 0; g.anim = null; g.queue.length = 0;
    g.draw(0);
    const W = 1440, H = 900;
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const ctx = t.getContext('2d');
    ctx.fillStyle = '#07080d'; ctx.fillRect(0, 0, W, H);
    let grd = ctx.createRadialGradient(W/2, H*0.34, 0, W/2, H*0.34, 1100);
    grd.addColorStop(0, '#1a2136'); grd.addColorStop(0.62, 'rgba(26,33,54,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    grd = ctx.createRadialGradient(W/2, H*1.10, 0, W/2, H*1.10, 900);
    grd.addColorStop(0, '#101524'); grd.addColorStop(0.6, 'rgba(16,21,36,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(document.getElementById('c'), 0, 0, W, H);
    // ---- HUD from live DOM ----
    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function parseRgba(s) {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(v => parseFloat(v));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function drawEl(el, opts) {
      if (!el) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const bg = parseRgba(cs.backgroundColor);
      if (bg && bg.a > 0.02) {
        ctx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`;
        rr(r.x, r.y, r.width, r.height, 14); ctx.fill();
        const bc = parseRgba(cs.borderColor);
        if (bc && bc.a > 0.05) { ctx.strokeStyle = `rgba(${bc.r},${bc.g},${bc.b},${bc.a})`; ctx.lineWidth = 1; rr(r.x, r.y, r.width, r.height, 14); ctx.stroke(); }
      }
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      ctx.textBaseline = 'middle';
      const text = (el.textContent || '').trim();
      if (!text) return;
      const align = opts && opts.align || 'left';
      const tw = ctx.measureText(text).width;
      let x = r.x;
      if (align === 'center') x = r.x + (r.width - tw) / 2;
      else if (align === 'right') x = r.x + r.width - tw;
      ctx.fillText(text, x, r.y + r.height / 2 + 1);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
    drawEl(document.querySelector('#wordmark'));
    drawEl(document.querySelector('#ready'));
    drawEl(document.querySelector('#mode'), { align: 'right' });
    drawEl(document.querySelector('#timer'), { align: 'right' });
    drawEl(document.querySelector('#bestline'), { align: 'right' });
    drawEl(document.querySelector('#stat-right .lbl'));
    drawEl(document.querySelector('#moves'));
    ['btnScramble', 'btnSolve', 'btnHint', 'btnUndo', 'btnMode', 'btnMute'].forEach(id => drawEl(document.getElementById(id), { align: 'center' }));
    return t.toDataURL('image/jpeg', 0.92);
  });
  return JSON.stringify({ total: dataUrl.length, p: dataUrl.slice(0, 60000) });
})();
