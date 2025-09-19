(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tile dimensions (diamond width/height)
  const TILE_W = 128;
  const TILE_H = 64;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;

  // Player state in tile coordinates (grid-locked steps with easing)
  const player = {
    // Animated position
    i: 0,
    j: 0,
    // Discrete grid position
    gridI: 0,
    gridJ: 0,
    // Step tween
    startI: 0,
    startJ: 0,
    destI: 0,
    destJ: 0,
    t: 0,               // 0..1 progress
    moving: false,
    speed: 8,           // tiles per second
    emoji: '🧭',
    emojiSize: 38
  };

  const cam = { x: 0, y: 0 };

  // Tap queue: one move per discrete key press (no auto-repeat)
  const tapQueue = [];

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
        if (e.repeat) return; // tap mode: ignore auto-repeats

        // Isometric mapping on tap:
        // Up: top-right, Down: bottom-left, Right: bottom-right, Left: top-left
        let dir = null;
        switch (e.key) {
          case 'ArrowUp':    dir = { di: 0,  dj: -1 }; break;
          case 'ArrowDown':  dir = { di: 0,  dj:  1 }; break;
          case 'ArrowRight': dir = { di: 1,  dj:  0 }; break;
          case 'ArrowLeft':  dir = { di: -1, dj:  0 }; break;
        }
        if (dir) tapQueue.push(dir);
      }
    });
  }

  function startStep(di, dj) {
    player.moving = true;
    player.startI = player.gridI;
    player.startJ = player.gridJ;
    player.destI = player.gridI + di;
    player.destJ = player.gridJ + dj;
    player.t = 0;
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
    // Start a step from tap queue if idle
    if (!player.moving) {
      if (tapQueue.length > 0) {
        const dir = tapQueue.shift();
        startStep(dir.di, dir.dj);
      }
    } else {
      // Progress current step
      player.t += player.speed * dt; // tiles per second
      const t = Math.min(1, player.t);
      const u = easeInOutSine(t);
      player.i = lerp(player.startI, player.destI, u);
      player.j = lerp(player.startJ, player.destJ, u);

      if (t >= 1) {
        // Snap to destination grid
        player.gridI = player.destI;
        player.gridJ = player.destJ;
        player.i = player.gridI;
        player.j = player.gridJ;
        player.moving = false;

        // Chain next queued tap immediately
        if (tapQueue.length > 0) {
          const next = tapQueue.shift();
          startStep(next.di, next.dj);
        }
      }
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

    // Start at exact tile center
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