// Experiência AR: o cliente aponta a câmera para a TELA (computador, notebook ou tablet)
// e os sete agentes saem de dentro dela, no mundo real.
//
// Fluxo: QR abre esta página → ela mostra uma tela-marcador (com o rosto dos agentes) →
// o celular reconhece essa tela pela câmera → a cena 3D é ancorada sobre ela.
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-three.module.js';
import { AGENTS } from './agents-data.js';

const $ = (s, r = document) => r.querySelector(s);
const params = new URLSearchParams(location.search);
const SIM = params.has('sim');
const T0 = performance.now();

const gl = $('#gl');

// ------------------------------------------------------------------ shaders
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG_BODY = `
uniform sampler2D map; uniform float appear; uniform float light;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.02) discard;
  vec3 col = c.rgb * (0.86 + 0.24 * clamp(light, 0.0, 1.6));
  gl_FragColor = vec4(col, c.a * appear);
}`;
const FRAG_GLOW = `
uniform sampler2D map; uniform float appear; uniform float pulse;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  float a = c.a * appear * (0.6 + 0.7 * pulse);
  gl_FragColor = vec4(c.rgb * a, a);
}`;
const FRAG_IRIS = `
uniform float appear; uniform vec2 look;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5 + look * 0.14;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec3 col = mix(vec3(0.02,0.05,0.16), vec3(0.06,0.34,0.95), smoothstep(0.20,0.58,r));
  col = mix(col, vec3(0.25,0.76,1.0), smoothstep(0.74,0.99,r));
  float fib = 0.5 + 0.5 * sin(atan(p.y, p.x) * 36.0 + r * 10.0);
  col *= 0.86 + 0.28 * fib * smoothstep(0.32,0.92,r);
  col = mix(vec3(0.01,0.02,0.05), col, smoothstep(0.27,0.35,r));
  col = mix(col, vec3(1.0), smoothstep(0.10,0.055,length(p - vec2(-0.13,-0.15))) * 0.95);
  gl_FragColor = vec4(col, appear);
}`;

const makeTexture = (img) => {
  const t = new THREE.Texture(img);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;   // sem esta linha a textura nunca chega ao GPU
  return t;
};

const assetURL = (src) => new URL('../assets/' + src.replace(/^assets\//, ''), location.href).href;
const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('falha ao carregar ' + src));
  i.src = assetURL(src);
});

// posições sobre o marcador (1 = largura da tela reconhecida); em duas fileiras
const PILE = [
  { id: 'blue', x: -0.46, y: -0.02, s: 0.20, delay: 0.00 },
  { id: 'pink', x: -0.16, y: -0.02, s: 0.20, delay: 0.08 },
  { id: 'heart', x: 0.14, y: -0.02, s: 0.20, delay: 0.16 },
  { id: 'patch', x: 0.42, y: -0.02, s: 0.21, delay: 0.24 },
  { id: 'scar', x: -0.32, y: 0.26, s: 0.17, delay: 0.32 },
  { id: 'globe', x: 0.02, y: 0.27, s: 0.18, delay: 0.40 },
  { id: 'brain', x: 0.34, y: 0.28, s: 0.17, delay: 0.48 },
];

class Agent {
  constructor(def, media, meta) {
    this.def = def;
    this.root = new THREE.Group();   // posição/escala no marcador
    this.rig = new THREE.Group();    // respiração, pulo, pisca
    this.root.add(this.rig);
    this.state = { appear: 0, light: 0.6, flash: 0 };
    this.phase = Math.random() * 6.283;
    this.blink = 2 + Math.random() * 3;
    this.blinkPhase = 0;
    this.lid = 1;
    this.t = 0;
    this.look = new THREE.Vector2();

    this.bodyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeTexture(media.body) }, appear: { value: 0 }, light: { value: 0.6 } },
      vertexShader: VERT, fragmentShader: FRAG_BODY, transparent: true, depthWrite: false,
    });
    const body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bodyMat);
    body.renderOrder = 0;
    this.rig.add(body);

    if (media.glow) {
      this.glowMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: makeTexture(media.glow) }, appear: { value: 0 }, pulse: { value: 0.5 } },
        vertexShader: VERT, fragmentShader: FRAG_GLOW, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), this.glowMat);
      glow.position.z = -0.01;
      glow.renderOrder = -1;
      this.rig.add(glow);
    }

    this.eyes = [];
    if (meta && media.sclera) {
      const scleraTex = makeTexture(media.sclera);
      for (const e of meta.eyes) {
        const eye = new THREE.Group();
        eye.position.set(e.cx - 0.5, 0.5 - e.cy, 0.005);
        const d = e.r * 2;
        const sclMat = new THREE.ShaderMaterial({
          uniforms: { map: { value: scleraTex }, appear: { value: 0 } },
          vertexShader: VERT, fragmentShader: FRAG_BODY, transparent: true, depthWrite: false,
        });
        const scl = new THREE.Mesh(new THREE.PlaneGeometry(d, d), sclMat);
        scl.renderOrder = 2;
        eye.add(scl);
        if (def.look === 'iris') {
          const irisMat = new THREE.ShaderMaterial({
            uniforms: { appear: { value: 0 }, look: { value: new THREE.Vector2() } },
            vertexShader: VERT, fragmentShader: FRAG_IRIS, transparent: true, depthWrite: false,
          });
          const iris = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.62, d * 0.62), irisMat);
          iris.position.z = 0.0015;
          iris.renderOrder = 3;
          eye.add(iris);
          eye.userData.irisMat = irisMat;
        }
        eye.userData.mats = [sclMat, eye.userData.irisMat].filter(Boolean);
        this.eyes.push(eye);
        this.rig.add(eye);
      }
    }
  }

  update(dt, now, look) {
    this.t += dt;
    const target = Math.min(1, this.state.appear + dt * 2.2);
    this.state.appear = target;
    const breath = Math.sin(this.t * 1.8 + this.phase);
    this.rig.scale.set(1 + breath * 0.008, 1 - breath * 0.010, 1);
    // pulo de entrada: sobe ao aparecer
    const pop = Math.sin(Math.min(1, this.state.appear) * Math.PI);
    this.rig.position.y = pop * 0.02;

    // piscar
    this.blink -= dt;
    if (this.blink <= 0) {
      this.blinkPhase += dt;
      const k = this.blinkPhase / 0.16;
      this.lid = k < 0.5 ? 1 - k * 1.9 : Math.max(0.06, (k - 0.5) * 1.9);
      if (k >= 1) { this.lid = 1; this.blinkPhase = 0; this.blink = 2.6 + Math.random() * 3.4; }
    }
    for (const eye of this.eyes) {
      eye.scale.y = this.lid;
      for (const m of eye.userData.mats) m.uniforms.appear.value = this.state.appear;
      if (eye.userData.irisMat) {
        eye.userData.irisMat.uniforms.appear.value = this.state.appear;
        eye.userData.irisMat.uniforms.look.value.copy(look);
      }
    }
    this.bodyMat.uniforms.appear.value = this.state.appear;
    if (this.glowMat) {
      this.glowMat.uniforms.appear.value = this.state.appear;
      this.glowMat.uniforms.pulse.value = 0.5 + 0.5 * Math.sin(now * 2.1 + this.phase);
    }
    this.state.flash = Math.max(0, this.state.flash - dt * 2);
  }

  setActive(on) { this.active = on; }
}

// ------------------------------------------------------------------ montagem
async function build() {
  const meta = await (await fetch(assetURL('agents.json'))).json();
  const irisImg = await loadImage('iris.webp');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  gl.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
  const holder = new THREE.Object3D();     // recebe a matriz do alvo
  holder.matrixAutoUpdate = false;
  scene.add(holder);

  const agents = [];
  for (const p of PILE) {
    const def = AGENTS.find(a => a.id === p.id);
    if (!def) continue;
    const media = {
      body: await loadImage(def.body),
      sclera: def.sclera ? await loadImage(def.sclera) : null,
      glow: def.glow ? await loadImage(def.glow) : null,
    };
    const ag = new Agent(def, media, meta[def.id]);
    ag.root.position.set(p.x, p.y, 0.02);
    ag.root.scale.setScalar(p.s);
    ag.delay = p.delay;
    holder.add(ag.root);
    agents.push(ag);
  }

  return { renderer, scene, camera, holder, agents, irisImg, meta };
}

// ------------------------------------------------------------------ AR real
async function startAR() {
  const { renderer, scene, camera, holder, agents } = await build();

  const mindar = new MindARThree({
    container: gl, imageTargetSrc: 'screen.mind',
    maxTrack: 1, uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.001, filterBeta: 0.01,
    warmupTolerance: 5, missTolerance: 10,
  });
  const anchor = mindar.addAnchor(0);

  // o conteúdo entra na cena do MindAR (é ela que é desenhada)
  mindar.scene.add(holder);

  let found = false;
  const clock = new THREE.Clock();

  const tmp = new THREE.Matrix4();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const now = (performance.now() - T0) / 1000;

    // A matriz do alvo vem pronta do MindAR. O conteúdo fica em plano XY e a câmera olha
    // para -Z, então o grupo do cartão é deitado com rotação de -90° em X.
    holder.matrix.copy(anchor.group.matrix);
    holder.matrix.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    holder.matrixAutoUpdate = false;
    holder.matrixWorld.copy(holder.matrix);
    holder.matrixWorldNeedsUpdate = false;
    for (const ag of agents) ag.root.updateMatrixWorld(true);

    for (const ag of agents) ag.update(dt, now, { x: 0, y: 0 });
    mindar.renderer.render(mindar.scene, mindar.camera);
    requestAnimationFrame(frame);
  }

  anchor.onTargetFound = () => {
    if (found) return;
    found = true;
    document.body.classList.add('found');
    // entrada em cascata: os sete saem da tela
    for (const ag of agents) {
      setTimeout(() => { ag.state.appear = 0.001; ag.state.flash = 1; }, ag.delay * 1000);
    }
    window.dispatchEvent(new CustomEvent('ar:found'));
  };
  anchor.onTargetLost = () => {
    document.body.classList.remove('found');
    window.dispatchEvent(new CustomEvent('ar:lost'));
  };

  await mindar.start();
  document.body.classList.add('camera-on');
  frame();
  return { mindar, agents, holder };
}

// ------------------------------------------------------------------ ensaio (sem câmera)
async function startSim() {
  const { renderer, scene, camera, holder, agents } = await build();
  // câmera na origem olhando -Z; a "tela" fica à frente, inclinada como quem filma um monitor
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
  // marcador em plano XY à frente da câmera; os sete ocupam ~1.3 de largura
  holder.matrix
    .makeTranslation(0, 0.42, -1.95)
    .multiply(new THREE.Matrix4().makeRotationX(-0.10))
    .multiply(new THREE.Matrix4().makeScale(0.55, 0.55, 1));
  holder.matrixAutoUpdate = false;
  holder.matrixWorld.copy(holder.matrix);
  holder.matrixWorldNeedsUpdate = false;

  // fundo de ensaio: a tela-marcador, para ver o encaixe
  const back = document.createElement('img');
  back.src = assetURL('tela-marcador.png');
  back.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,70vh);z-index:0;opacity:.55;filter:saturate(.9)';
  document.body.appendChild(back);

  const clock = new THREE.Clock();
  window.__AR_DEBUG = { THREE, agents, camera, holder, renderer, scene };
  for (const ag of agents) setTimeout(() => { ag.state.appear = 0.001; }, ag.delay * 1000);

  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    const now = (performance.now() - T0) / 1000;
    holder.matrixWorld.copy(holder.matrix);
    holder.matrixWorldNeedsUpdate = false;
    for (const ag of agents) ag.update(dt, now, { x: 0, y: 0 });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
  document.body.classList.add('found', 'sim');
  window.dispatchEvent(new CustomEvent('ar:found'));
}

export { startAR, startSim, SIM };
window.EPAR_AR = { startAR, startSim, SIM };
