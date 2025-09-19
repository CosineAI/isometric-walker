(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tile dimensions (diamond width/height)
  const TILE_W = 128;
  const TILE_H = 64;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  // Player state in tile coordinates (free movement)
  const player = {
    i: 0,
    j: 0,
    speed: 4, // tiles per second
    emoji: '🧭',
    emojiSize: 38
  };

  const cam = { x: 0, y: 0 };

  // Visual snap (emoji) easing towards nearest tile center
  const snap = {
    i: 0,
    j: 0,
    startI: 0,
    startJ: 0,
    targetI: 0,
    targetJ: 0,
    t: 1,
    duration: 0.12,
    speed: 12 // tiles per second used to derive duration
  };

  const keys = new Set();

  function iso(i, j) {
    return {
      x: (i - j) * HALF_W,
      y: (i + j) * HALF_H
    };
  }

  function isoToTile(x, y) {
    const i = (y / HALF_H + x / HALF_W) / 2;
    const j = (y / HALF_H - x / HALF_W) / 2;
    return { i, j };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutSine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }

  function setupInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key.startsWith('Arrow')) keys.delete(e.key);
    });
  }

  // Resize handling with HiDPI support
  function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function update(dt) {
    // Isometric mapping:
    // Up:    top-right      => (di=0,  dj=-1)
    // Down:  bottom-left    => (di=0,  dj=+1)
    // Right: bottom-right   => (di=+1, dj=0)
    // Left:  top-left       => (di=-1, dj=0)
    let di = 0, dj = 0;
    if (keys.has('ArrowUp'))    { dj -= 1; }
    if (keys.has('ArrowDown'))  { dj += 1; }
    if (keys.has('ArrowRight')) { di += 1; }
    if (keys.has('ArrowLeft'))  { di -= 1; }

    if (di !== 0 || dj !== 0) {
      const len = Math.hypot(di, dj);
      player.i += (di / len) * player.speed * dt;
      player.j += (dj / len) * player.speed * dt;
    }

    // Update visual snap target and ease progress
    const ti = Math.round(player.i);
    const tj = Math.round(player.j);
    if (ti !== snap.targetI || tj !== snap.targetJ) {
      snap.startI = snap.i;
      snap.startJ = snap.j;
      snap.targetI = ti;
      snap.targetJ = tj;
      const dist = Math.hypot(snap.targetI - snap.startI, snap.targetJ - snap.startJ);
      snap.duration = Math.max(0.08, Math.min(0.25, dist / snap.speed));
      snap.t = 0;
    }
    if (snap.t < 1) {
      snap.t = Math.min(1, snap.t + (dt / snap.duration));
      const u = easeInOutSine(snap.t);
      snap.i = lerp(snap.startI, snap.targetI, u);
      snap.j = lerp(snap.startJ, snap.targetJ, u);
    } else {
      snap.i = snap.targetI;
      snap.j = snap.targetJ;
    }

    // Camera deadzone (a centered rectangle on the screen)
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const p = iso(player.i, player.j);
    const onScreenX = p.x - cam.x + w / 2;
    const onScreenY = p.y - cam.y + h / 2;

    // Deadzone is a smaller rect inside the viewport
    const dzw = Math.min(380, Math.max(200, w * 0.32));
    const dzh = Math.min(260, Math.max(160, h * 0.28));
    const dzLeft = w / 2 - dzw / 2;
    const dzRight = w / 2 + dzw / 2;
    const dzTop = h / 2 - dzh / 2;
    const dzBottom = h / 2 + dzh / 2;

    if (onScreenX < dzLeft)   cam.x = p.x + w / 2 - dzLeft;
    else if (onScreenX > dzRight) cam.x = p.x + w / 2 - dzRight;

    if (onScreenY < dzTop)    cam.y = p.y + h / 2 - dzTop;
    else if (onScreenY > dzBottom) cam.y = p.y + h / 2 - dzBottom;
  }

  function drawGrid() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fbfcfe');
    grad.addColorStop(1, '#edf1f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const margin = Math.max(TILE_W, TILE_H) * 2;
    const corners = [
      { x: cam.x - w / 2 - margin, y: cam.y - h / 2 - margin },
      { x: cam.x + w / 2 + margin, y: cam.y - h / 2 - margin },
      { x: cam.x + w / 2 + margin, y: cam.y + h / 2 + margin },
      { x: cam.x - w / 2 - margin, y: cam.y + h / 2 + margin }
    ];

    let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
    for (const c of corners) {
      const t = isoToTile(c.x, c.y);
      iMin = Math.min(iMin, t.i);
      iMax = Math.max(iMax, t.i);
      jMin = Math.min(jMin, t.j);
      jMax = Math.max(jMax, t.j);
    }
    iMin = Math.floor(iMin) - 1;
    iMax = Math.ceil(iMax) + 1;
    jMin = Math.floor(jMin) - 1;
    jMax = Math.ceil(jMax) + 1;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.18)';

    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        const c = iso(i, j);
        const cx = c.x - cam.x + w / 2;
        const cy = c.y - cam.y + h / 2;

        const topX = cx,            topY = cy - HALF_H;
        const rightX = cx + HALF_W, rightY = cy;
        const bottomX = cx,         bottomY = cy + HALF_H;
        const leftX = cx - HALF_W,  leftY = cy;

        if (rightX < -TILE_W || leftX > w + TILE_W || bottomY < -TILE_H || topY > h + TILE_H) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(leftX, leftY);
        ctx.lineTo(topX, topY);
        ctx.lineTo(rightX, rightY);
        ctx.lineTo(bottomX, bottomY);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  function drawPlayer() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const p = iso(snap.i, snap.j);
    const x = p.x - cam.x + w / 2;
    const y = p.y - cam.y + h / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + HALF_H * 0.2, HALF_W * 0.35, HALF_H * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `${player.emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111';
    ctx.fillText(player.emoji, x, y + 6);
  }

  function render() {
    drawGrid();
    drawPlayer();
  }

  function init() {
    setupInput();
    resize();

    // Initialize snap to nearest center
    snap.i = Math.round(player.i);
    snap.j = Math.round(player.j);
    snap.startI = snap.i;
    snap.startJ = snap.j;
    snap.targetI = snap.i;
    snap.targetJ = snap.j;
    snap.t = 1;

    const startP = iso(player.i, player.j);
    cam.x = startP.x;
    cam.y = startP.y;

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      render();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  init();
})();