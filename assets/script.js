(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Tile dimensions (diamond width/height)
  const TILE_W = 96;
  const TILE_H = 48;
  const HALF_W = TILE_W / 2;
  const HALF_H = TILE_H / 2;
  const SPRITE_Y_OFFSET = 4;   // Player/emoji vertical offset (moved a bit up)
  const GROUND_Y_OFFSET = 12;  // Ground tiles offset (moved a few pixels down)

  // Character sprite sheet config
  const CHAR_SPRITE_W = 32;     // each frame width in px
  const CHAR_SPRITE_H = 27;     // each frame height in px
  const CHAR_SPRITE_COLS = 12;  // frames per row
  const CHAR_IDLE_FRAME = 4;    // 5th sprite is idle (0-indexed)
  const CHAR_SCALE = 2;         // scale sprite to fit tiles
  const CHAR_ANIM_FPS = 12;     // walking animation speed
  const CHAR_FEET_OFFSET = 6;   // small extra offset so feet sit nicely on tile

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

    // Facing direction for directional sprite sheets
    dir: 'bottom_left',

    // Animation
    frame: CHAR_IDLE_FRAME,
    animTimer: 0,

    // Fallback emoji while assets load (not used once sprites are ready)
    emoji: '🧭',
    emojiSize: 30
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

  // Map step delta to facing sheet name
  function facingFromDelta(di, dj) {
    if (di === 0 && dj === 1) return 'bottom_left';   // Down/S
    if (di === 1 && dj === 0) return 'bottom_right';  // Right/D
    if (di === 0 && dj === -1) return 'top_right';    // Up/W
    if (di === -1 && dj === 0) return 'top_left';     // Left/A
    return player.dir;
  }

  function setupInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // Accept arrows and WASD in tap mode (ignore auto-repeat)
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
        if (e.repeat) return; // tap mode: ignore auto-repeats

        // Isometric mapping on tap:
        // Up/W: top-right, Down/S: bottom-left, Right/D: bottom-right, Left/A: top-left
        let dir = null;
        switch (k) {
          case 'arrowup':
          case 'w': dir = { di: 0,  dj: -1 }; break;
          case 'arrowdown':
          case 's': dir = { di: 0,  dj:  1 }; break;
          case 'arrowright':
          case 'd': dir = { di: 1,  dj:  0 }; break;
          case 'arrowleft':
          case 'a': dir = { di: -1, dj:  0 }; break;
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

    // Update facing for the new step
    player.dir = facingFromDelta(di, dj);
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

    // Advance walk animation when moving; show idle when not
    if (player.moving) {
      player.animTimer += dt;
      const step = 1 / CHAR_ANIM_FPS;
      while (player.animTimer >= step) {
        player.animTimer -= step;
        player.frame = (player.frame + 1) % CHAR_SPRITE_COLS;
      }
    } else {
      player.frame = CHAR_IDLE_FRAME;
      player.animTimer = 0;
    }
  }

  function drawGrid() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Lazy-load grass and dirt tile sprites once
    if (!drawGrid._init) {
      // grass
      const grass = new Image();
      drawGrid._grassReady = false;
      grass.onload = () => {
        drawGrid._grass = grass;
        drawGrid._grassReady = true;
      };
      grass.src = 'assets/images/grass.png';
      drawGrid._grass = grass;

      // dirt
      const dirt = new Image();
      drawGrid._dirtReady = false;
      dirt.onload = () => {
        drawGrid._dirt = dirt;
        drawGrid._dirtReady = true;
      };
      dirt.src = 'assets/images/dirt.png';
      drawGrid._dirt = dirt;

      drawGrid._init = true;
    }

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

    // Deterministic pseudo-random per-tile selection favoring grass
    function tileRand(i, j) {
      // 2D integer hash -> [0,1)
      let x = i * 374761393 + j * 668265263;
      x = (x ^ (x >> 13)) >>> 0;
      x = (x * 1274126177) >>> 0;
      return (x >>> 0) / 4294967296;
    }
    const DIRT_PROB = 0.2; // 20% dirt, 80% grass
    function isDirt(i, j) {
      return tileRand(i, j) < DIRT_PROB;
    }

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

        // Draw tile sprite centered on the tile, using a slightly lower vertical offset for ground
        const imgX = cx - HALF_W;
        const imgY = cy - HALF_H + GROUND_Y_OFFSET;

        const useDirt = isDirt(i, j);
        if (useDirt && drawGrid._dirtReady) {
          ctx.drawImage(drawGrid._dirt, imgX, imgY, TILE_W, TILE_H);
        } else if (!useDirt && drawGrid._grassReady) {
          ctx.drawImage(drawGrid._grass, imgX, imgY, TILE_W, TILE_H);
        }

        // Optional outline to keep the grid readable
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
    const y = p.y - cam.y + h / 2 + SPRITE_Y_OFFSET;

    // Lazy-load character sprite sheets for 4 facings once
    if (!drawPlayer._init) {
      drawPlayer._sprites = {};
      drawPlayer._ready = {};
      function load(name, src) {
        const img = new Image();
        drawPlayer._ready[name] = false;
        img.onload = () => {
          drawPlayer._sprites[name] = img;
          drawPlayer._ready[name] = true;
        };
        img.src = src;
        drawPlayer._sprites[name] = img;
      }
      load('bottom_left',  'assets/images/character/character_bottom_left.png');
      load('bottom_right', 'assets/images/character/character_bottom_right.png');
      load('top_left',     'assets/images/character/character_top_left.png');
      load('top_right',    'assets/images/character/character_top_right.png');
      drawPlayer._init = true;
    }

    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y + HALF_H * 0.2, HALF_W * 0.35, HALF_H * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Choose sprite sheet by facing; fallback to bottom_left if available; else emoji
    const facing = player.dir;
    const hasSprites = !!drawPlayer._sprites;
    const ready = hasSprites ? drawPlayer._ready : null;
    let spriteImg = null;
    if (hasSprites && ready) {
      if (ready[facing]) {
        spriteImg = drawPlayer._sprites[facing];
      } else if (ready.bottom_left) {
        spriteImg = drawPlayer._sprites.bottom_left;
      }
    }

    if (spriteImg) {
      const frame = player.frame;
      const sx = (frame % CHAR_SPRITE_COLS) * CHAR_SPRITE_W;
      const sy = 0;
      const sw = CHAR_SPRITE_W;
      const sh = CHAR_SPRITE_H;

      const dw = sw * CHAR_SCALE;
      const dh = sh * CHAR_SCALE;
      const dx = x - dw / 2;
      const dy = y - dh + CHAR_FEET_OFFSET;

      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spriteImg, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = prevSmoothing;
    } else {
      // Fallback emoji while images load
      ctx.font = `${player.emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#111';
      ctx.fillText(player.emoji, x, y + 6);
    }
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