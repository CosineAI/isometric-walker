(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tile dimensions (diamond width/height)
  const TILE_W = 128;
  const TILE_H = 64;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  // Player state in tile coordinates
  const player = {
    i: 0,
    j: 0,
    speed: 4, // tiles per second
    emoji: '🧭',
    emojiSize: 38
  };

  const cam = { x: 0, y: 0 };

  const keys = new Set();

  function iso(i, j) {
    return {
      x: (i - j) * HALF_W,
      y: (i + j) * HALF_H
    };
  }

  function isoToTile(x, y) {
    // Inverse of the above transform (returns fractional tile coords)
    const i = (y / HALF_H + x / HALF_W) / 2;
    const j = (y / HALF_H - x / HALF_W) / 2;
    return { i, j };
  }

  function setupInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key.startsWith('Arrow')) keys.add(e.key);
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
    // Movement mapped to screen cardinal directions
    // Up: (i--, j--), Down: (i++, j++), Left: (i--, j++), Right: (i++, j--)
    let di = 0, dj = 0;
    if (keys.has('ArrowUp'))    { di -= 1; dj -= 1; }
    if (keys.has('ArrowDown'))  { di += 1; dj += 1; }
    if (keys.has('ArrowLeft'))  { di -= 1; dj += 1; }
    if (keys.has('ArrowRight')) { di += 1; dj -= 1; }

    if (di !== 0 || dj !== 0) {
      const len = Math.hypot(di, dj);
      player.i += (di / len) * player.speed * dt;
      player.j += (dj / len) * player.speed * dt;
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

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Subtle background
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fbfcfe');
    grad.addColorStop(1, '#edf1f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Compute tile range visible using inverse transform of the viewport corners
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

        const topX = cx,          topY = cy - HALF_H;
        const rightX = cx + HALF_W, rightY = cy;
        const bottomX = cx,       bottomY = cy + HALF_H;
        const leftX = cx - HALF_W,  leftY = cy;

        // Quick reject offscreen
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
    const p = iso(player.i, player.j);
    const x = p.x - cam.x + w / 2;
    const y = p.y - cam.y + h / 2;

    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + HALF_H * 0.2, HALF_W * 0.35, HALF_H * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Emoji sprite
    ctx.font = `${player.emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111';
    // Slight vertical offset so emoji appears standing on the tile center
    ctx.fillText(player.emoji, x, y + 6);
  }

  function render() {
    drawGrid();
    drawPlayer();
  }

  function init() {
    setupInput();
    resize();
    const startP = iso(player.i, player.j);
    cam.x = startP.x;
    cam.y = startP.y;

    let last = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big jumps
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