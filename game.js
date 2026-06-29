const overlay = document.getElementById('overlay');
const introScreen = document.getElementById('intro-screen');
const menuScreen = document.getElementById('menu-screen');
const endScreen = document.getElementById('end-screen');
const leanBtn = document.getElementById('lean-btn');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const retryBtn = document.getElementById('retry-btn');
const statusText = document.getElementById('status-text');
const timerText = document.getElementById('timer-text');
const levelText = document.getElementById('level-text');
const endTitle = document.getElementById('end-title');
const endText = document.getElementById('end-text');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const state = {
  mode: 'intro',
  timer: 0,
  level: 0,
  escaped: false,
  dead: false,
  player: { x: canvas.width / 2, y: canvas.height / 2, size: 14, speed: 220 },
  velocity: { x: 0, y: 0 },
  entities: [],
  nextEntityAt: 2,
  lastTimestamp: 0,
  wallTouched: false,
};

const keys = new Set();

function showPanel(panel) {
  introScreen.classList.toggle('hidden', panel !== 'intro');
  menuScreen.classList.toggle('hidden', panel !== 'menu');
  endScreen.classList.toggle('hidden', panel !== 'end');
  overlay.style.display = 'flex';
}

function hideOverlay() {
  overlay.style.display = 'none';
}

function updateHud() {
  statusText.textContent = state.mode === 'playing'
    ? `Survive the Backrooms — entity danger is rising` 
    : state.mode === 'menu'
    ? 'Main menu: prepare for the next level'
    : 'Waiting to noclip into the Backrooms';
  timerText.textContent = `Time: ${Math.floor(state.timer)}s`;
  levelText.textContent = `Level: ${state.level}`;
}

function crashIntoWall(x, y) {
  const margin = 36;
  return x < margin || x > canvas.width - margin || y < margin || y > canvas.height - margin;
}

function startGame() {
  state.mode = 'playing';
  state.timer = 0;
  state.level = 1;
  state.dead = false;
  state.escaped = false;
  state.entities = [];
  state.nextEntityAt = 2;
  state.player.x = canvas.width / 2;
  state.player.y = canvas.height / 2;
  state.lastTimestamp = 0;
  hideOverlay();
  updateHud();
  window.requestAnimationFrame(loop);
}

function goToMenu() {
  state.mode = 'menu';
  showPanel('menu');
  updateHud();
}

function endGame(reason) {
  state.mode = 'end';
  overlay.style.display = 'flex';
  endTitle.textContent = reason === 'escape' ? 'Escaped to reality' : 'Lost in the Backrooms';
  endText.textContent = reason === 'escape'
    ? 'A narrow chance was enough. You noclipped back into the real world.'
    : 'An entity found you or you slipped deeper. The Backrooms remain.';
  updateHud();
}

function spawnEntity() {
  const margin = 80;
  const x = Math.random() * (canvas.width - margin * 2) + margin;
  const y = Math.random() * (canvas.height - margin * 2) + margin;
  const speed = 50 + state.level * 15;
  return { x, y, size: 16, speed, vx: 0, vy: 0 };
}

function updateEntities(dt) {
  for (const entity of state.entities) {
    const angle = Math.atan2(state.player.y - entity.y, state.player.x - entity.x);
    const chase = Math.random() * 0.35 + 0.75;
    entity.vx = Math.cos(angle) * entity.speed * chase;
    entity.vy = Math.sin(angle) * entity.speed * chase;
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;
    entity.x = Math.max(entity.size, Math.min(canvas.width - entity.size, entity.x));
    entity.y = Math.max(entity.size, Math.min(canvas.height - entity.size, entity.y));
  }
}

function checkCollision(entity) {
  const dx = entity.x - state.player.x;
  const dy = entity.y - state.player.y;
  const distance = Math.hypot(dx, dy);
  return distance < entity.size + state.player.size - 2;
}

function updatePlayer(dt) {
  const speed = state.player.speed;
  let dx = 0;
  let dy = 0;
  if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
  if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    state.player.x += dx * speed * dt;
    state.player.y += dy * speed * dt;
  }
  state.player.x = Math.max(state.player.size, Math.min(canvas.width - state.player.size, state.player.x));
  state.player.y = Math.max(state.player.size, Math.min(canvas.height - state.player.size, state.player.y));
}

function drawScene() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1b1b1f');
  gradient.addColorStop(1, '#09090c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(180,180,190,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    ctx.strokeRect(40 + i * 70, 40 + (i % 2) * 30, canvas.width - 80 - i * 140, canvas.height - 80 - (i % 2) * 60);
  }

  ctx.fillStyle = '#82a3a1';
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YOU', state.player.x, state.player.y + 6);

  for (const entity of state.entities) {
    const pulse = Math.sin(Date.now() / 320) * 0.25 + 0.75;
    ctx.fillStyle = `rgba(255, 90, 70, ${0.4 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe8d2';
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('!', entity.x, entity.y + 4);
  }
}

function tryTransitionLevel() {
  const escapeChance = 0.00001; // 0.001%
  if (Math.random() < escapeChance) {
    state.escaped = true;
    endGame('escape');
    return;
  }
  state.level += 1;
  state.timer = 0;
  state.entities = [];
  state.nextEntityAt = 1.5;
  if (state.level > 4) {
    endGame('lost');
  } else {
    goToMenu();
  }
}

function loop(timestamp) {
  if (state.mode !== 'playing') return;
  const dt = state.lastTimestamp ? Math.min((timestamp - state.lastTimestamp) / 1000, 0.05) : 0;
  state.lastTimestamp = timestamp;
  state.timer += dt;

  if (state.timer >= state.nextEntityAt) {
    state.entities.push(spawnEntity());
    state.nextEntityAt += Math.max(1.2, 2.5 - state.level * 0.3);
  }

  updatePlayer(dt);
  updateEntities(dt);

  if (state.entities.some(checkCollision)) {
    state.dead = true;
    endGame('lost');
    return;
  }

  if (state.timer >= 20 + state.level * 10) {
    tryTransitionLevel();
    return;
  }

  drawScene();
  updateHud();
  window.requestAnimationFrame(loop);
}

leanBtn.addEventListener('click', () => {
  state.wallTouched = true;
  goToMenu();
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  state.mode = 'intro';
  showPanel('intro');
});
retryBtn.addEventListener('click', () => {
  state.mode = 'intro';
  showPanel('intro');
});

window.addEventListener('keydown', event => {
  keys.add(event.key);
  if (state.mode === 'menu' && event.key === 'Enter') {
    startGame();
  }
});

window.addEventListener('keyup', event => {
  keys.delete(event.key);
});

showPanel('intro');
updateHud();
