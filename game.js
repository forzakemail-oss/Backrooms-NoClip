const canvas = document.getElementById('game-canvas');
const introScreen = document.getElementById('intro-screen');
const cutsceneScreen = document.getElementById('cutscene-screen');
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
const cutsceneText = document.getElementById('cutscene-text');
const hud = document.getElementById('hud');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const controls = new THREE.PointerLockControls(camera, document.body);
const clock = new THREE.Clock();

const audioState = {
  initialized: false,
  context: null,
  master: null,
  humOsc: null,
  humGain: null,
};

const state = {
  mode: 'intro',
  level: 0,
  timer: 0,
  escaped: false,
  dead: false,
  entities: [],
  nextSpawnAt: 1.8,
  cutsceneTime: 0,
  cutsceneDuration: 11,
  levelGroup: null,
  barrier: null,
};

const levelConfig = [
  { name: 'Level 0 — The Lobby', targetDuration: 28, spawnInterval: 2.4, fogColor: 0x09080a, ambience: 0x9f7f52, humFreq: 38 },
  { name: 'Level 1 — Maintenance', targetDuration: 22, spawnInterval: 2.0, fogColor: 0x0b0b0e, ambience: 0x6b6b6f, humFreq: 44 },
  { name: 'Level 2 — Pipes', targetDuration: 18, spawnInterval: 1.6, fogColor: 0x11131a, ambience: 0x4f565a, humFreq: 48 },
  { name: 'Level 3 — Empty Halls', targetDuration: 14, spawnInterval: 1.3, fogColor: 0x16141b, ambience: 0x363439, humFreq: 52 },
];

const moveState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const corridorBounds = { x: 6.4, z: -38, zMax: 8 };

function showPanel(panel) {
  introScreen.classList.toggle('hidden', panel !== 'intro');
  cutsceneScreen.classList.toggle('hidden', panel !== 'cutscene');
  menuScreen.classList.toggle('hidden', panel !== 'menu');
  endScreen.classList.toggle('hidden', panel !== 'end');
  hud.classList.toggle('hidden', panel !== 'playing');
}

function updateHud() {
  statusText.textContent = state.mode === 'playing'
    ? `${levelConfig[state.level].name} — survive the breach`
    : 'Backrooms atmosphere';
  timerText.textContent = `Time: ${Math.floor(state.timer)}s`;
  levelText.textContent = `Level: ${state.level}`;
}

function createWallTexture(color, noiseColor) {
  const size = 1024;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = size;
  const ctx = textureCanvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = noiseColor;
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 120; i++) {
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 28);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}

function buildCorridor(levelIndex) {
  const group = new THREE.Group();
  const { ambience } = levelConfig[levelIndex];
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x302b21, roughness: 0.88, metalness: 0.04 });
  const wallMat = new THREE.MeshStandardMaterial({
    map: createWallTexture('#d3c587', '#9f8a35'),
    roughness: 1,
    metalness: 0,
    emissive: new THREE.Color(0x070500),
    emissiveIntensity: 0.1,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x191920, roughness: 0.98, metalness: 0 });

  const corridorLength = 48;
  const corridorWidth = 13;
  const corridorHeight = 4.4;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, 0.2, corridorLength), floorMat);
  floor.position.set(0, -0.1, -corridorLength / 2 + 2);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, 0.15, corridorLength), ceilingMat);
  ceiling.position.set(0, corridorHeight, -corridorLength / 2 + 2);
  group.add(ceiling);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, corridorHeight, corridorLength), wallMat);
  leftWall.position.set(-corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 2);
  group.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.set(corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 2);
  group.add(rightWall);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, corridorHeight, 0.15), wallMat);
  backWall.position.set(0, corridorHeight / 2, -corridorLength + 2);
  group.add(backWall);

  for (let i = 0; i < 8; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.08), new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x302f1f).offsetHSL(0, 0, Math.random() * 0.08),
      roughness: 0.95,
      metalness: 0.02,
    }));
    panel.position.set(-corridorWidth / 2 + 0.085, 2.2, -5 - i * 4.7);
    panel.rotation.y = Math.PI / 2;
    group.add(panel);

    const panel2 = panel.clone();
    panel2.position.x = corridorWidth / 2 - 0.085;
    panel2.rotation.y = -Math.PI / 2;
    group.add(panel2);
  }

  for (let i = 0; i < 8; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.65), new THREE.MeshStandardMaterial({
      color: 0xfaf5d4,
      emissive: 0xf6e9c0,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.12,
    }));
    lamp.position.set(0, corridorHeight - 0.15, -3 - i * 5.2);
    lamp.rotation.x = Math.PI / 2;
    group.add(lamp);

    const light = new THREE.PointLight(0xfff7d7, 0.16, 18, 1.8);
    light.position.set(0, corridorHeight - 0.08, -3 - i * 5.2);
    group.add(light);
  }

  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x25221b, roughness: 0.94 }));
  pillar.position.set(2.9, 1.2, -13);
  group.add(pillar);

  const pillar2 = pillar.clone();
  pillar2.position.x = -2.9;
  group.add(pillar2);

  const ambienceLight = new THREE.HemisphereLight(ambience, 0x101018, 0.28);
  group.add(ambienceLight);

  return group;
}

function makeEntityMesh() {
  const geometry = new THREE.OctahedronGeometry(0.36, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x210402,
    emissive: 0xff5d40,
    emissiveIntensity: 0.88,
    roughness: 0.12,
    metalness: 0.35,
  });
  const entity = new THREE.Mesh(geometry, material);
  entity.castShadow = true;
  return entity;
}

function createBarrier() {
  const geometry = new THREE.PlaneGeometry(12.5, 4);
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff8f0,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const barrier = new THREE.Mesh(geometry, material);
  barrier.position.set(0, 2.05, -18.8);
  barrier.rotation.y = Math.PI;
  scene.add(barrier);
  return barrier;
}

function initAudio() {
  if (audioState.initialized) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioState.context = new AudioContext();
  audioState.master = audioState.context.createGain();
  audioState.master.gain.value = 0.15;
  audioState.master.connect(audioState.context.destination);

  audioState.humOsc = audioState.context.createOscillator();
  audioState.humOsc.type = 'sine';
  audioState.humOsc.frequency.value = 38;
  audioState.humGain = audioState.context.createGain();
  audioState.humGain.gain.value = 0.028;
  audioState.humOsc.connect(audioState.humGain);
  audioState.humGain.connect(audioState.master);
  audioState.humOsc.start();

  const noiseBuffer = audioState.context.createBuffer(1, audioState.context.sampleRate * 3, audioState.context.sampleRate);
  const bufferData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferData.length; i++) {
    bufferData[i] = (Math.random() * 2 - 1) * 0.12;
  }

  const noiseSource = audioState.context.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseGain = audioState.context.createGain();
  noiseGain.gain.value = 0.035;
  noiseSource.connect(noiseGain);
  noiseGain.connect(audioState.master);
  noiseSource.start();

  audioState.initialized = true;
}

function playAmbientTone(levelIndex) {
  if (!audioState.initialized || !audioState.humOsc) return;
  audioState.humOsc.frequency.exponentialRampToValueAtTime(levelConfig[levelIndex].humFreq, audioState.context.currentTime + 1.2);
}

function playPulseSound() {
  if (!audioState.initialized) return;
  const osc = audioState.context.createOscillator();
  const gain = audioState.context.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(90, audioState.context.currentTime);
  gain.gain.setValueAtTime(0.028, audioState.context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioState.context.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioState.master);
  osc.start();
  osc.stop(audioState.context.currentTime + 0.1);
}

function setupLevel(levelIndex) {
  if (state.levelGroup) scene.remove(state.levelGroup);
  state.levelGroup = buildCorridor(levelIndex);
  scene.add(state.levelGroup);
  state.entities.forEach(entry => scene.remove(entry.mesh));
  state.entities = [];
  state.nextSpawnAt = 1.6;
  state.timer = 0;
  camera.position.set(0, 1.6, 2.8);
  camera.rotation.set(0, 0, 0);
  state.dead = false;
  scene.fog = new THREE.Fog(levelConfig[levelIndex].fogColor, 7.5, 54);
  document.body.style.backgroundColor = '#070707';
  playAmbientTone(levelIndex);
}

function startCutscene() {
  initAudio();
  state.mode = 'cutscene';
  state.cutsceneTime = 0;
  if (state.barrier) scene.remove(state.barrier);
  state.barrier = createBarrier();
  showPanel('cutscene');
  cutsceneText.textContent = 'The group moves through the stale glow of broken fluorescents.';
}

function goToMenu() {
  state.mode = 'menu';
  showPanel('menu');
  startBtn.textContent = state.level === 0 ? 'Enter Level 0' : `Proceed to Level ${state.level}`;
  updateHud();
}

function endGame(reason) {
  state.mode = 'end';
  showPanel('end');
  endTitle.textContent = reason === 'escape' ? 'A breach to reality opened' : 'You remain trapped';
  endText.textContent = reason === 'escape'
    ? 'A sliver of luck sent you back to the real world. The walls stay silent behind you.'
    : 'An entity caught you. The Backrooms take another wanderer.';
  updateHud();
}

function spawnEntity() {
  const z = -8 - Math.random() * 24;
  const x = (Math.random() - 0.5) * 10.8;
  const mesh = makeEntityMesh();
  mesh.position.set(x, 1.2, z);
  scene.add(mesh);
  return { mesh, speed: 1.2 + state.level * 0.54 };
}

function updateEntities(dt) {
  const playerPosition = controls.getObject().position;
  state.entities.forEach((entity, index) => {
    const direction = new THREE.Vector3().subVectors(playerPosition, entity.mesh.position).setY(0).normalize();
    entity.mesh.position.addScaledVector(direction, entity.speed * dt);
    const pulse = 0.35 + Math.sin(performance.now() / 260 + index) * 0.12;
    entity.mesh.material.emissiveIntensity = pulse;
    entity.mesh.rotation.set(pulse * 0.8, performance.now() / 460 + index, pulse * 0.64);
    if (entity.mesh.position.distanceTo(playerPosition) < 0.92) state.dead = true;
  });
}

function tryTransitionLevel() {
  const escapeChance = 0.00001;
  if (Math.random() < escapeChance) {
    state.escaped = true;
    endGame('escape');
    return;
  }
  state.level += 1;
  if (state.level >= levelConfig.length) {
    endGame('lost');
    return;
  }
  setupLevel(state.level);
  goToMenu();
}

function updateCutscene(dt) {
  state.cutsceneTime += dt;
  const t = state.cutsceneTime;
  const progress = Math.min(1, t / state.cutsceneDuration);
  camera.position.z = 5.4 - progress * 23.4;
  camera.position.x = Math.sin(progress * Math.PI * 0.5) * 0.6;
  camera.rotation.y = Math.sin(progress * 0.35) * 0.12;

  if (t < 2.8) {
    cutsceneText.textContent = 'Your friends walk quietly. The hallway hums with broken lights and stale carpet.';
  } else if (t < 5.8) {
    cutsceneText.textContent = 'The air thickens. A crack appears in the plaster wall as fluorescent panels flicker.';
    state.barrier.material.opacity = 0.16 + Math.min(0.82, (t - 2.8) * 0.18);
  } else if (t < 9.1) {
    cutsceneText.textContent = 'You step closer. The wall shivers and reality bends around your hand.';
    if (state.barrier) state.barrier.material.opacity = Math.max(0, 0.82 - (t - 5.8) * 0.14);
  } else {
    cutsceneText.textContent = 'The breach opens. You slip through into the Backrooms.';
  }

  if (progress >= 1) {
    if (state.barrier) scene.remove(state.barrier);
    state.barrier = null;
    setupLevel(0);
    goToMenu();
  }
}

function movePlayer(dt) {
  const speed = 4.5;
  const velocity = new THREE.Vector3();
  if (moveState.forward) velocity.z -= 1;
  if (moveState.backward) velocity.z += 1;
  if (moveState.left) velocity.x -= 1;
  if (moveState.right) velocity.x += 1;
  if (velocity.lengthSq() > 0) {
    velocity.normalize().multiplyScalar(speed * dt);
    controls.moveRight(velocity.x);
    controls.moveForward(velocity.z);
  }
}

function updateGame(dt) {
  movePlayer(dt);
  state.timer += dt;

  if (state.timer >= state.nextSpawnAt) {
    state.entities.push(spawnEntity());
    state.nextSpawnAt += Math.max(0.9, levelConfig[state.level].spawnInterval - state.level * 0.12);
    playPulseSound();
  }

  updateEntities(dt);

  const position = controls.getObject().position;
  position.x = Math.max(-corridorBounds.x, Math.min(corridorBounds.x, position.x));
  position.z = Math.max(-38, Math.min(corridorBounds.zMax, position.z));

  if (state.dead) {
    endGame('lost');
    return;
  }

  if (state.timer >= levelConfig[state.level].targetDuration) {
    tryTransitionLevel();
    return;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function bindEvents() {
  leanBtn.addEventListener('click', startCutscene);
  startBtn.addEventListener('click', () => {
    initAudio();
    state.mode = 'playing';
    showPanel('playing');
    if (!controls.isLocked) controls.lock();
    state.timer = 0;
    state.dead = false;
  });
  restartBtn.addEventListener('click', () => {
    state.mode = 'intro';
    showPanel('intro');
    if (controls.isLocked) controls.unlock();
  });
  retryBtn.addEventListener('click', () => {
    state.level = 0;
    state.escaped = false;
    state.dead = false;
    setupLevel(0);
    state.mode = 'intro';
    showPanel('intro');
    if (controls.isLocked) controls.unlock();
  });

  document.addEventListener('keydown', event => {
    switch (event.code) {
      case 'KeyW': moveState.forward = true; break;
      case 'KeyS': moveState.backward = true; break;
      case 'KeyA': moveState.left = true; break;
      case 'KeyD': moveState.right = true; break;
      case 'Enter': if (state.mode === 'menu') startBtn.click(); break;
    }
  });

  document.addEventListener('keyup', event => {
    switch (event.code) {
      case 'KeyW': moveState.forward = false; break;
      case 'KeyS': moveState.backward = false; break;
      case 'KeyA': moveState.left = false; break;
      case 'KeyD': moveState.right = false; break;
    }
  });

  controls.addEventListener('lock', () => {
    hud.classList.remove('hidden');
  });

  controls.addEventListener('unlock', () => {
    if (state.mode === 'playing') {
      state.mode = 'menu';
      goToMenu();
    }
  });

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointerdown', () => {
    if (!audioState.initialized) initAudio();
  }, { once: true });
}

function initScene() {
  scene.background = new THREE.Color(0x09080a);
  scene.fog = new THREE.Fog(0x09080a, 9, 52);
  camera.position.set(0, 1.6, 5.4);
  const ambient = new THREE.AmbientLight(0xffffff, 0.16);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.22);
  directional.position.set(0, 10, 5);
  scene.add(directional);
  const fill = new THREE.HemisphereLight(0x6f6f7a, 0x08080a, 0.22);
  scene.add(fill);
  setupLevel(0);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'cutscene') updateCutscene(dt);
  else if (state.mode === 'playing') updateGame(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('load', () => {
  initScene();
  bindEvents();
  showPanel('intro');
  animate();
});
