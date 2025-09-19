(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tile dimensions (diamond width/height)
  const TILE_W = 128;
  const TILE_H = 64;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  // Player state in tile coordinates (grid-locked)
  const player = {
    // Render position (may be between tiles while animating)
    i: 0,
    j: 0,
    // Discrete grid position (centers)
    gridI: 0,
    gridJ: 0,
    // Movement tween
    startI: 0,
    startJ: 0,
    destI: 0,
    destJ: 0,
    t: 0,             // 0..1 progress
    moving: false,
    speed: 7,         // tiles per second
    emoji: '🧭',
    emojiSize: 38
  };

  const cam = { x: 0, y: 0 };

  const keys = new Set();
  let lastKey = null;

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
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
        lastKey = e.key;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key.startsWith('Arrow')) {
        keys.delete(e.key);
        if (e.key === lastKey) {
          // Choose any remaining pressed key as lastKey, else null
          const order = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
          lastKey = order.find(k => keys.has(k)) || null;
        }
      }
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

  function chooseDirection() {
    // Prefer the most recent key if still held, otherwise a fixed priority
    let key = lastKey && keys.has(lastKey) ? lastKey : null;
    if (!key) {
      const order = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      key = order.find(k => keys.has(k)) || null;
    }
    if (!key) return null;

    switch (key) {
      case 'ArrowUp': return { di: -1, dj: -1 };
      case 'ArrowDown': return { di: 1, dj: 1 };
      case 'ArrowLeft': return { di: -1, dj: 1 };
      case 'ArrowRight': return { di: 1, dj: -1 };
      default: return null;
    }
  }

  function startStep(di, dj) {
    if (player.moving) return;
    player.startI = player.gridI;
    player.startJ = player.gridJ;
    player.destI = player.gridI + di;
    player.destJ = player.gridJ + dj;
    player.t = 0;
    player.moving = true;
  }

  function update(dt) {
    // Start a new step if idle and a direction is requested
    if (!player.moving) {
      const dir = chooseDirection();
      if (dir) startStep(dir.di, dir.dj);
    }

    // Progress ongoing step
    if (player.moving) {
      player.t += player.speed * dt; // tiles per second
      const t = Math.min(1, player.t);
      player.i = player.startI + (player.destI - player.startI) * t;
      player.j = player.startJ + (player.destJ - player.startJ) * t;

      if (t >= 1) {
        player.moving = false;
        player.gridI = player.destI;
        player.gridJ = player.destJ;
        // Snap exactly to center
        player.i = player.gridI;
        player.j = player.gridJ;
      }
    } else {
      // Ensure exact snapping when idle (just in case)
      player.i = player.gridI;
      player.j = player.gridJ;
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

        const topX = cx,            topY = cy - HALF_H;
        const rightX = cx + HALF_W, rightY = cy;
        const bottomX = cx,         bottomY = cy + HALF_H;
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

    // Ensure initial snap to grid center
    player.i = player.gridI;
    player.j = player.gridJ;

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