import * as THREE from './vendor/three.module.js';
import { PointerLockControls } from './vendor/PointerLockControls.js';

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
const horrorOverlay = document.getElementById('horror-overlay');
const hud = document.getElementById('hud');
const loadingScreen = document.getElementById('loading-screen');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 140);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new PointerLockControls(camera, document.body);
const clock = new THREE.Clock();

const audioState = {
    initialized: false,
    context: null,
    master: null,
    humOsc: null,
    pulseOsc: null,
    noiseSource: null,
    dripSource: null,
};

const state = {
    mode: 'intro',
    level: 0,
    timer: 0,
    escaped: false,
    dead: false,
    entities: [],
    nextSpawnAt: 2.0,
    cutsceneTime: 0,
    cutsceneDuration: 12,
    levelGroup: null,
    barrier: null,
    heartbeat: 0,
    lastDisturbance: 0,
    tremor: 0,
    effectStrength: 0,
    frameCount: 0,
};

const levelConfig = [
    {
        name: 'Level 0 — The Lobby',
        targetDuration: 26,
        spawnInterval: 2.4,
        fogColor: 0x090807,
        ambience: 0x5c523f,
        humFreq: 32,
        fillLight: 0.25,
        floorColor: 0x2f2b24,
    },
    {
        name: 'Level 1 — Utilities',
        targetDuration: 20,
        spawnInterval: 1.9,
        fogColor: 0x0c0b0e,
        ambience: 0x4b5059,
        humFreq: 42,
        fillLight: 0.22,
        floorColor: 0x242227,
    },
    {
        name: 'Level 2 — Pipeworks',
        targetDuration: 18,
        spawnInterval: 1.5,
        fogColor: 0x10121c,
        ambience: 0x3c4148,
        humFreq: 46,
        fillLight: 0.18,
        floorColor: 0x1f1f23,
    },
    {
        name: 'Level 3 — Void Passage',
        targetDuration: 14,
        spawnInterval: 1.2,
        fogColor: 0x111219,
        ambience: 0x2d2d33,
        humFreq: 54,
        fillLight: 0.15,
        floorColor: 0x18181c,
    },
];

const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
};

const corridorBounds = { x: 6.6, z: -42, zMax: 9 };

function showPanel(panel) {
    introScreen.classList.toggle('hidden', panel !== 'intro');
    cutsceneScreen.classList.toggle('hidden', panel !== 'cutscene');
    menuScreen.classList.toggle('hidden', panel !== 'menu');
    endScreen.classList.toggle('hidden', panel !== 'end');
    loadingScreen.classList.toggle('hidden', panel !== 'loading');
    hud.classList.toggle('hidden', panel !== 'playing');
}

function updateHud() {
    statusText.textContent = state.mode === 'playing'
        ? `${levelConfig[state.level].name} — keep moving, do not look back`
        : 'Backrooms breathing';
    timerText.textContent = `Time: ${Math.floor(state.timer)}s`;
    levelText.textContent = `Level: ${state.level}`;
}

function createNoiseTexture(width = 512, height = 512, base = '#161412') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 8000; i++) {
        const alpha = Math.random() * 0.16;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
    }
    return new THREE.CanvasTexture(canvas);
}

function createRustTexture() {
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2c2924';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = `rgba(${100 + Math.random() * 70}, ${30 + Math.random() * 40}, ${10 + Math.random() * 20}, ${Math.random() * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.5 + 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createFloorTexture(color) {
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 120; i++) {
        ctx.beginPath();
        ctx.moveTo(0, Math.random() * size);
        ctx.lineTo(size, Math.random() * size);
        ctx.stroke();
    }
    for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.7, 2.7);
    return texture;
}

function createLeakMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x241e15,
        roughness: 0.95,
        metalness: 0.02,
        emissive: 0x160d05,
        emissiveIntensity: 0.08,
    });
}

function buildCorridor(levelIndex) {
    const group = new THREE.Group();
    const config = levelConfig[levelIndex];

    const floorMat = new THREE.MeshStandardMaterial({
        map: createFloorTexture(`#${config.floorColor.toString(16)}`),
        roughness: 0.92,
        metalness: 0.04,
    });
    const wallMat = new THREE.MeshStandardMaterial({
        map: createNoiseTexture(1024, 1024, '#1d1814'),
        roughness: 1.0,
        metalness: 0,
        emissive: new THREE.Color(0x040304),
        emissiveIntensity: 0.07,
    });
    const ceilingMat = new THREE.MeshStandardMaterial({
        color: 0x0f0e10,
        roughness: 0.98,
        metalness: 0,
    });

    const corridorLength = 52;
    const corridorWidth = 14;
    const corridorHeight = 4.8;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, 0.2, corridorLength), floorMat);
    floor.position.set(0, -0.1, -corridorLength / 2 + 1.8);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, 0.18, corridorLength), ceilingMat);
    ceiling.position.set(0, corridorHeight, -corridorLength / 2 + 1.8);
    group.add(ceiling);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, corridorHeight, corridorLength), wallMat);
    leftWall.position.set(-corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 1.8);
    group.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.position.set(corridorWidth / 2, corridorHeight / 2, -corridorLength / 2 + 1.8);
    group.add(rightWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(corridorWidth, corridorHeight, 0.18), wallMat);
    backWall.position.set(0, corridorHeight / 2, -corridorLength + 1.8);
    group.add(backWall);

    for (let i = 0; i < 10; i++) {
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), createLeakMaterial());
        patch.position.set(-corridorWidth / 2 + 0.11, 2.2, -4 - i * 4.1);
        patch.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.02;
        group.add(patch);

        const patch2 = patch.clone();
        patch2.position.x = corridorWidth / 2 - 0.11;
        patch2.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.02;
        group.add(patch2);
    }

    for (let i = 0; i < 9; i++) {
        const lightBar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.7), new THREE.MeshStandardMaterial({
            color: 0xf4e2ca,
            emissive: 0xf7e7cf,
            emissiveIntensity: 0.96,
            roughness: 0.18,
            metalness: 0.18,
        }));
        lightBar.position.set(0, corridorHeight - 0.12, -2.5 - i * 5.2);
        lightBar.rotation.x = Math.PI / 2;
        group.add(lightBar);

        const bulb = new THREE.PointLight(0xfff1d8, 0.14, 18, 1.8);
        bulb.position.copy(lightBar.position);
        group.add(bulb);
    }

    const rust1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.12), new THREE.MeshStandardMaterial({
        map: createRustTexture(),
        roughness: 0.96,
        metalness: 0.18,
    }));
    rust1.position.set(3.45, 1.7, -14.2);
    rust1.rotation.y = -Math.PI / 2;
    group.add(rust1);

    const rust2 = rust1.clone();
    rust2.position.x = -3.45;
    rust2.rotation.y = Math.PI / 2;
    group.add(rust2);

    for (let i = 0; i < 6; i++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 16), new THREE.MeshStandardMaterial({
            color: 0x18140f,
            roughness: 0.85,
            metalness: 0.18,
            emissive: 0x21170f,
            emissiveIntensity: 0.03,
        }));
        pipe.position.set(corridorWidth / 2 - 0.5, corridorHeight - 0.7, -6 - i * 7);
        pipe.rotation.z = Math.PI / 2;
        group.add(pipe);

        const pipe2 = pipe.clone();
        pipe2.position.x = -corridorWidth / 2 + 0.5;
        group.add(pipe2);
    }

    const haze = new THREE.PointLight(config.ambience, 0.26, 40, 2);
    haze.position.set(0, corridorHeight - 0.1, -12);
    group.add(haze);

    const fill = new THREE.HemisphereLight(config.ambience, 0x071018, config.fillLight);
    group.add(fill);

    return group;
}

function createEntityMesh() {
    const geometry = new THREE.IcosahedronGeometry(0.42, 1);
    const material = new THREE.MeshStandardMaterial({
        color: 0x0f0000,
        emissive: 0xff3f32,
        emissiveIntensity: 0.82,
        roughness: 0.2,
        metalness: 0.45,
        transparent: true,
        opacity: 0.92,
    });
    const entity = new THREE.Mesh(geometry, material);
    entity.castShadow = true;
    return entity;
}

function createBarrier() {
    const geometry = new THREE.PlaneGeometry(13, 4.8);
    const material = new THREE.MeshBasicMaterial({
        color: 0xf8f2ee,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const barrier = new THREE.Mesh(geometry, material);
    barrier.position.set(0, 2.4, -19.5);
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
    audioState.master.gain.value = 0.16;
    audioState.master.connect(audioState.context.destination);

    audioState.humOsc = audioState.context.createOscillator();
    audioState.humOsc.type = 'sine';
    audioState.humOsc.frequency.value = 28;
    audioState.humGain = audioState.context.createGain();
    audioState.humGain.gain.value = 0.032;
    audioState.humOsc.connect(audioState.humGain);
    audioState.humGain.connect(audioState.master);
    audioState.humOsc.start();

    audioState.pulseOsc = audioState.context.createOscillator();
    audioState.pulseOsc.type = 'triangle';
    audioState.pulseOsc.frequency.value = 18;
    const pulseGain = audioState.context.createGain();
    pulseGain.gain.value = 0.014;
    audioState.pulseOsc.connect(pulseGain);
    pulseGain.connect(audioState.master);
    audioState.pulseOsc.start();

    const noiseBuffer = audioState.context.createBuffer(1, audioState.context.sampleRate * 3, audioState.context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.14;
    }
    audioState.noiseSource = audioState.context.createBufferSource();
    audioState.noiseSource.buffer = noiseBuffer;
    audioState.noiseSource.loop = true;
    const noiseGain = audioState.context.createGain();
    noiseGain.gain.value = 0.028;
    audioState.noiseSource.connect(noiseGain);
    noiseGain.connect(audioState.master);
    audioState.noiseSource.start();

    audioState.initialized = true;
}

function playAmbientTone(levelIndex) {
    if (!audioState.initialized || !audioState.humOsc) return;
    audioState.humOsc.frequency.exponentialRampToValueAtTime(levelConfig[levelIndex].humFreq, audioState.context.currentTime + 1.2);
}

function playImpactSound() {
    if (!audioState.initialized) return;
    const osc = audioState.context.createOscillator();
    const gain = audioState.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(70, audioState.context.currentTime);
    gain.gain.setValueAtTime(0.024, audioState.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioState.context.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioState.master);
    osc.start();
    osc.stop(audioState.context.currentTime + 0.12);
}

function setupLevel(levelIndex) {
    if (state.levelGroup) scene.remove(state.levelGroup);
    state.levelGroup = buildCorridor(levelIndex);
    scene.add(state.levelGroup);
    state.entities.forEach(entry => scene.remove(entry.mesh));
    state.entities = [];
    state.nextSpawnAt = 1.8;
    state.timer = 0;
    camera.position.set(0, 1.65, 3.1);
    camera.rotation.set(0, 0, 0);
    state.dead = false;
    state.effectStrength = 0;
    scene.fog = new THREE.Fog(levelConfig[levelIndex].fogColor, 6.8, 52);
    document.body.style.backgroundColor = '#050403';
    playAmbientTone(levelIndex);
}

function startCutscene() {
    initAudio();
    state.mode = 'cutscene';
    state.cutsceneTime = 0;
    if (state.barrier) scene.remove(state.barrier);
    state.barrier = createBarrier();
    showPanel('cutscene');
    cutsceneText.textContent = 'The corridor breathes around you as light begins to fail.';
}

function goToMenu() {
    state.mode = 'menu';
    showPanel('menu');
    startBtn.textContent = state.level === 0 ? 'Enter Level 0' : `Step deeper to Level ${state.level}`;
    updateHud();
}

function endGame(reason) {
    state.mode = 'end';
    showPanel('end');
    endTitle.textContent = reason === 'escape' ? 'A tear in reality opened' : 'The Backrooms claim you';
    endText.textContent = reason === 'escape'
        ? 'The world flickers. You stumble back to the familiar and everything behind you collapses into darkness.'
        : 'Something found you. The corridors close, leaving only the hum and the echo of your last step.';
    updateHud();
}

function spawnEntity() {
    const z = -8 - Math.random() * 24;
    const x = (Math.random() - 0.5) * 11.4;
    const mesh = createEntityMesh();
    mesh.position.set(x, 1.2 + Math.random() * 0.4, z);
    const light = new THREE.PointLight(0xff6643, 0.14, 8, 2);
    light.position.copy(mesh.position);
    const group = new THREE.Group();
    group.add(mesh);
    group.add(light);
    scene.add(group);
    return { mesh, group, speed: 1.1 + state.level * 0.58, drift: Math.random() * 0.5, phase: Math.random() * Math.PI };
}

function updateEntities(dt) {
    const playerPosition = controls.getObject().position;
    state.entities.forEach((entity, index) => {
        const direction = new THREE.Vector3().subVectors(playerPosition, entity.mesh.position).setY(0).normalize();
        entity.mesh.position.addScaledVector(direction, entity.speed * dt);
        entity.group.position.copy(entity.mesh.position);
        const pulse = 0.3 + Math.sin((performance.now() + index * 80) / 220) * 0.14;
        entity.mesh.material.emissiveIntensity = pulse;
        entity.mesh.rotation.y = performance.now() / 420 + index;
        entity.mesh.position.x += Math.sin(performance.now() / 900 + entity.phase) * entity.drift * dt;
        if (entity.mesh.position.distanceTo(playerPosition) < 1.0) {
            state.dead = true;
            state.effectStrength = 1.0;
        }
    });
}

function pulseAmbient(eventStrength = 1) {
    horrorOverlay.style.opacity = `${0.12 + Math.min(0.4, eventStrength * 0.22)}`;
}

function updateHorrorOverlay(dt) {
    state.frameCount += 1;
    const flicker = Math.max(0, Math.sin(state.frameCount * 0.09) * 0.02 + Math.random() * 0.01);
    horrorOverlay.style.filter = `contrast(${0.85 + flicker}) brightness(${0.88 + flicker})`;
    horrorOverlay.style.background = `radial-gradient(circle at 50% 45%, rgba(0,0,0,0.08), rgba(0,0,0,${0.42 + state.effectStrength * 0.25}) 58%)`;
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

    camera.position.z = 5.4 - progress * 24.8;
    camera.position.x = Math.sin(progress * Math.PI * 0.55) * 0.84;
    camera.rotation.y = Math.sin(progress * 0.32) * 0.14;
    camera.position.y = 1.65 + Math.sin(progress * Math.PI) * 0.08;

    if (t < 2.4) {
        cutsceneText.textContent = 'The damp corridor breathes around you. The lights flicker with every step.';
    } else if (t < 5.9) {
        cutsceneText.textContent = 'A pulse in the walls. The plaster weeps faint rust-colored trails.';
        state.barrier.material.opacity = 0.16 + Math.min(0.82, (t - 2.4) * 0.18);
    } else if (t < 8.5) {
        cutsceneText.textContent = 'Your hand grazes the wall. It feels alive, rough, and moving beneath your fingers.';
        if (state.barrier) state.barrier.material.opacity = Math.max(0, 0.82 - (t - 5.9) * 0.16);
    } else {
        cutsceneText.textContent = 'A tear opens. The world gives way to the Backrooms.';
    }

    if (progress >= 1) {
        if (state.barrier) scene.remove(state.barrier);
        state.barrier = null;
        setupLevel(0);
        goToMenu();
    }
}

function movePlayer(dt) {
    const baseSpeed = 4.2 + state.level * 0.18;
    const velocity = new THREE.Vector3();
    if (moveState.forward) velocity.z -= 1;
    if (moveState.backward) velocity.z += 1;
    if (moveState.left) velocity.x -= 1;
    if (moveState.right) velocity.x += 1;
    if (velocity.lengthSq() > 0) {
        velocity.normalize().multiplyScalar(baseSpeed * dt);
        controls.moveRight(velocity.x);
        controls.moveForward(velocity.z);
    }
}

function updateGame(dt) {
    movePlayer(dt);
    state.timer += dt;

    if (state.timer >= state.nextSpawnAt) {
        state.entities.push(spawnEntity());
        state.nextSpawnAt += Math.max(0.85, levelConfig[state.level].spawnInterval - state.level * 0.12);
        playImpactSound();
    }

    updateEntities(dt);

    const position = controls.getObject().position;
    position.x = Math.max(-corridorBounds.x, Math.min(corridorBounds.x, position.x));
    position.z = Math.max(-42, Math.min(corridorBounds.zMax, position.z));

    const distanceToEnd = Math.abs(position.z + 18);
    state.effectStrength = Math.min(1, state.effectStrength + Math.max(0, 0.01 - distanceToEnd * 0.0004));
    updateHorrorOverlay(dt);

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
    scene.fog = new THREE.Fog(0x09080a, 8, 54);
    camera.position.set(0, 1.65, 5.4);

    const ambient = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xfff1d6, 0.22);
    directional.position.set(0, 10, 5);
    directional.castShadow = true;
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 50;
    directional.shadow.mapSize.set(2048, 2048);
    scene.add(directional);

    const fill = new THREE.HemisphereLight(0x4a4c53, 0x08080a, 0.22);
    scene.add(fill);

    const backLight = new THREE.PointLight(0x2a1f1c, 0.12, 60, 2);
    backLight.position.set(0, 3.2, 8);
    scene.add(backLight);

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
    showPanel('loading');
    try {
        initScene();
        bindEvents();
        showPanel('intro');
        animate();
    } catch (error) {
        console.error('Failed to initialize Backrooms NoClip', error);
        showPanel('intro');
    }
});
