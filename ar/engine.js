// Cena WebAR: sete agentes que saem do cartão impresso, olham para a câmera, respiram e falam.
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-three.module.js';
import { AGENTS } from './agents-data.js';

const params = new URLSearchParams(location.search);
const SIM = params.get('sim'); // ?sim=marker → ensaio sem rastreio, com o cartão como fundo
const T0 = performance.now();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const gl = document.getElementById('gl');
// Plano do cartão no espaço do alvo (MindAR): 1 unidade = 1 largura da imagem.
const PILE = [
  { id: 'blue', x: -0.30, y: 0.44, s: 0.26, delay: 0.04 },
  { id: 'pink', x: 0.05, y: 0.54, s: 0.23, delay: 0.10 },
  { id: 'scar', x: 0.33, y: 0.45, s: 0.25, delay: 0.16 },
  { id: 'heart', x: -0.35, y: 0.05, s: 0.30, delay: 0.22 },
  { id: 'patch', x: -0.01, y: 0.11, s: 0.32, delay: 0.28 },
  { id: 'globe', x: 0.29, y: 0.21, s: 0.24, delay: 0.34 },
  { id: 'brain', x: 0.42, y: -0.03, s: 0.22, delay: 0.40 },
];
const ORDER = ['blue', 'heart', 'pink', 'patch', 'scar', 'globe', 'brain'];

let META = {};

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG_BODY = `
uniform sampler2D map; uniform float appear; uniform float light; uniform float flash;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.02) discard;
  float k = clamp(light, 0.0, 1.6);
  vec3 col = c.rgb * (0.82 + 0.26 * k);
  col = mix(col, vec3(1.0), flash * 0.22);
  float a = c.a * appear;
  gl_FragColor = vec4(col * a, a);
}`;

const FRAG_GLOW = `
uniform sampler2D map; uniform float appear; uniform float pulse; uniform float flash;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  float a = c.a * appear * (0.55 + 0.9 * pulse + flash);
  gl_FragColor = vec4(c.rgb * a, a);
}`;

const FRAG_IRIS = `
uniform float appear; uniform float flash; uniform vec2 look;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5 + look * 0.15;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec3 deep = vec3(0.02, 0.05, 0.16);
  vec3 mid  = vec3(0.06, 0.34, 0.95);
  vec3 rim  = vec3(0.25, 0.76, 1.0);
  vec3 col = mix(deep, mid, smoothstep(0.20, 0.58, r));
  col = mix(col, rim, smoothstep(0.74, 0.99, r));
  float ang = atan(p.y, p.x);
  float fib = 0.5 + 0.5 * sin(ang * 36.0 + r * 10.0);
  col *= 0.86 + 0.28 * fib * smoothstep(0.32, 0.92, r);
  col = mix(vec3(0.01, 0.02, 0.05), col, smoothstep(0.27, 0.35, r));
  col = mix(col, vec3(1.0), smoothstep(0.10, 0.055, length(p - vec2(-0.13, -0.15))) * 0.95);
  col = mix(col, vec3(0.86, 0.96, 1.0), smoothstep(0.038, 0.02, length(p - vec2(0.07, -0.03))) * 0.85);
  col = mix(col, vec3(1.0), flash * 0.35);
  gl_FragColor = vec4(col, appear);
}`;

const softTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.42, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// caminhos dos sprites são relativos à pasta /assets
const assetURL = (src) => new URL('../assets/' + src.replace(/^assets\//, ''), location.href).href;
const loadImage = (src) => new Promise((res, rej) => {
  const url = assetURL(src);
  const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(url)); img.src = url;
});
const tex = (img) => { const t = new THREE.Texture(img); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; };

class Agent {
  constructor(def, media, irisImg) {
    this.def = def;
    this.id = def.id;
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.state = { appear: 0, flash: 0, light: 0.5, speaking: 0, energy: 0 };
    this.look = { x: 0, y: 0 };
    this.phase = Math.random() * 6.283;
    this.active = true;
    this.blinkT = -1; this.lastBlink = performance.now() / 1000 + Math.random() * 3;
    this.eyes = [];

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.15),
      new THREE.MeshBasicMaterial({ map: softTexture, transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, -0.5, 0);
    this.group.add(this.shadow);

    this.bodyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex(media.body) }, appear: { value: 0 }, light: { value: 0.5 }, flash: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG_BODY, transparent: true, depthWrite: false,
    });
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bodyMat);
    this.rig.add(this.body);

    if (media.glow) {
      this.glowMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex(media.glow) }, appear: { value: 0 }, pulse: { value: 0 }, flash: { value: 0 } },
        vertexShader: VERT, fragmentShader: FRAG_GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), this.glowMat);
      glow.position.z = -0.004;
      this.rig.add(glow);
    } else if (!def.sclera) {
      this.glowMat = null;
    }

    const meta = META[def.id];
    if (meta && media.sclera) {
      const st = tex(media.sclera);
      for (const e of meta.eyes) {
        const eye = new THREE.Group();
        eye.position.set(e.cx - 0.5, 0.5 - e.cy, 0.006);
        const d = e.r * 2;
        const sclMat = new THREE.ShaderMaterial({
          uniforms: { map: { value: st }, appear: { value: 0 }, light: { value: 0.5 }, flash: { value: 0 } },
          vertexShader: VERT, fragmentShader: FRAG_BODY, transparent: true, depthWrite: false,
        });
        eye.add(new THREE.Mesh(new THREE.PlaneGeometry(d, d), sclMat));
        let irisMat = null;
        if (def.look === 'iris' && irisImg) {
          irisMat = new THREE.ShaderMaterial({
            uniforms: { appear: { value: 0 }, flash: { value: 0 }, look: { value: new THREE.Vector2() } },
            vertexShader: VERT, fragmentShader: FRAG_IRIS, transparent: true, depthWrite: false,
          });
          const iris = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.64, d * 0.64), irisMat);
          iris.position.z = 0.0016;
          eye.add(iris);
        }
        eye.userData = { mats: [sclMat, irisMat].filter(Boolean), irisMat, y0: eye.position.y };
        this.eyes.push(eye);
        this.rig.add(eye);
      }
    }
  }

  setActive(on) { this.active = on; }

  update(dt, now, lookAt) {
    const s = this.state;
    const target = this.active ? 1 : 0;
    s.appear += (target - s.appear) * Math.min(1, dt * 9);
    if (this.active && s.appear < 0.002) s.appear = 0.002;
    s.look = s.look || { x: 0, y: 0 };
    const want = this.active ? lookAt : { x: 0, y: 0 };
    this.look.x += (want.x - this.look.x) * Math.min(1, dt * 6);
    this.look.y += (want.y - this.look.y) * Math.min(1, dt * 6);

    const breath = reduceMotion ? 0 : Math.sin(now * 1.7 + this.phase);
    const hop = s.energy > 0.01 ? Math.abs(Math.sin(now * 5.2 + this.phase)) * 0.02 * s.energy : 0;
    this.rig.scale.set(1 + breath * 0.006, 1 - breath * 0.008, 1);
    this.rig.position.y = hop - (1 - s.appear) * 0.03;
    this.rig.rotation.z = -this.look.x * 0.02 + Math.sin(now * 0.8 + this.phase) * 0.004;

    // piscar
    if (now - this.lastBlink > 2.8 + Math.random() * 2.6) { this.blinkT = 0; this.lastBlink = now; }
    if (s.speaking > 0.2 && Math.sin(now * 12) > 0.85) this.blinkT = 0;
    let lid = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT / 0.15;
      lid = t < 0.5 ? 1 - t * 1.88 : Math.max(0.06, (t - 0.5) * 1.88);
      if (this.blinkT > 0.15) this.blinkT = -1;
    }

    s.light += ((0.5 + s.speaking * 0.3) - s.light) * Math.min(1, dt * 8);
    s.flash = Math.max(0, s.flash - dt * 1.8);
    s.energy = Math.max(0, s.energy - dt * 0.8);

    const u = this.bodyMat.uniforms;
    u.appear.value = s.appear; u.light.value = s.light; u.flash.value = s.flash;
    const sc = 0.94 + 0.06 * s.appear;
    this.body.scale.set(sc, sc, 1);
    if (this.glowMat) {
      this.glowMat.uniforms.appear.value = s.appear;
      this.glowMat.uniforms.flash.value = s.flash;
      this.glowMat.uniforms.pulse.value = 0.5 + 0.5 * Math.sin(now * 2.2 + this.phase) + s.speaking * 0.4;
    }
    for (const eye of this.eyes) {
      for (const m of eye.userData.mats) {
        if (m.uniforms.appear) m.uniforms.appear.value = s.appear;
        if (m.uniforms.flash) m.uniforms.flash.value = s.flash;
        if (m.uniforms.light) m.uniforms.light.value = s.light;
      }
      const im = eye.userData.irisMat;
      if (im) { im.uniforms.look.value.set(this.look.x, this.look.y); im.uniforms.flash.value = s.flash; }
      eye.scale.set(1, lid, 1);
      eye.position.y = eye.userData.y0 + (1 - lid) * 0.004;
    }
    this.shadow.material.opacity = 0.5 * s.appear * (1 - Math.min(1, hop * 25));
  }
}

export async function startAR() {
  try {
    return await startARInner();
  } catch (err) {
    console.log('AR-ERROR ' + (err === undefined ? 'undefined' : String(err && (err.message || err))));
    throw err;
  }
}

async function startARInner() {
  // o manifesto fica ao lado da página e também é servido em /assets
  const metaUrl = new URL('../assets/agents.json', location.href);
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error('agents.json: ' + res.status + ' ' + metaUrl.href);
  const txt = await res.text();
  try { META = JSON.parse(txt); } catch (e) { throw new Error('agents.json inválido: ' + txt.slice(0, 80)); }
  const irisImg = await loadImage('iris.webp');
  const media = {};
  for (const a of AGENTS) {
    media[a.id] = { body: await loadImage(a.body), sclera: a.sclera ? await loadImage(a.sclera) : null, glow: a.glow ? await loadImage(a.glow) : null };
  }

  // Câmera própria (fov 60, paisagem) e um grupo que recebe a matriz do alvo a cada quadro.
  // Assim a orientação do cartão segue a convenção de um vídeo deitado, não a de um alvo "de pé".
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  function fit() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, true);
  }
  fit();
  addEventListener('resize', () => {
    fit();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    mindar.camera.aspect = innerWidth / innerHeight;
    mindar.camera.updateProjectionMatrix();
  });
  renderer.setClearColor(0x000000, 1); // o vídeo da câmera fica atrás: canvas opaco
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  gl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Canvas já com tamanho certo (renderer.render não redimensiona sozinho)
  renderer.getSize(new THREE.Vector2());
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 20);
  let mindar;
  // O conteúdo entra na cena antes do primeiro render: sem isso o grupo fica fora da cena de desenho.
  const SIM_GROUP = new THREE.Object3D();
  scene.add(SIM_GROUP);
  if (SIM) {
    // No ensaio não há câmera nem rastreio: criamos só uma câmera própria.
    mindar = {
      camera: new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100),
      start: async () => {},
      controller: { dimensions: [[1024, 1024]] },
    };
    mindar.camera.updateProjectionMatrix();
  } else mindar = new MindARThree({
    container: gl, imageTargetSrc: 'targets.mind',
    maxTrack: 1, uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0001, filterBeta: 0.001,
  });
  // O anchor padrão do MindAR mora na cena dele e tem setters próprios em matrixWorld.
  // Aqui só precisamos receber a matriz do alvo a cada quadro pelo controlador.
  const anchor = { matrix: new THREE.Matrix4(), visible: false, post: new THREE.Matrix4() };
  // grupo "cartão": recebe a matriz do alvo e deita o conteúdo no plano do cartão
  const card = new THREE.Group();
  // o conteúdo está em plano XY; o grupo do alvo é que o deita no mundo (convenção do MindAR)
  SIM_GROUP.add(card);
  SIM_GROUP.matrixAutoUpdate = false; // a matriz vem do rastreio (ou do ensaio)
  if (SIM) { card.scale.setScalar(0.5); card.updateMatrix(); } // no ensaio o cartão ocupa ~50 cm
  card.name = 'cartao';
  if (!SIM) card.rotation.x = -Math.PI / 2; // no alvo real o conteúdo é deitado
  const TEMP = new THREE.Matrix4();
  const TEMP2 = new THREE.Matrix4();

  const byId = {};
  const agents = [];
  for (const p of PILE) {
    const def = AGENTS.find(a => a.id === p.id);
    if (!def) continue;
    const ag = new Agent(def, media[def.id], irisImg);
    ag.group.position.set(p.x, p.y, 0.012 + (p.id === 'brain' ? 0.006 : 0));
    ag.group.scale.setScalar(p.s);
    ag.delay = p.delay;
    ag.setActive(false);
    card.add(ag.group);
    agents.push(ag); byId[def.id] = ag;
  }
  // halo do cartão quando o alvo é reconhecido
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 1.04),
    new THREE.MeshBasicMaterial({ color: 0x2a5aa0, transparent: true, opacity: 0, depthWrite: false }));
  aura.position.z = 0.001;
  card.add(aura);

  const state = { phase: 'idle', found: false, activeId: null, talking: null };
  const api = {
    agents: byId, state,
    focus(id) {
      state.activeId = id;
      for (const ag of agents) {
        const on = id == null || ag.id === id;
        ag.setActive(on);
        if (ag.id === id) { ag.state.energy = 1; ag.state.flash = 1; }
      }
    },
    speak(id, on) { const ag = byId[id]; if (ag) ag.state.speaking = on ? 1 : 0; },
    pulse(id) { const ag = byId[id]; if (ag) { ag.state.flash = 1; ag.state.energy = 1; } },
    celebrate() { for (const ag of agents) { ag.setActive(true); ag.state.flash = 1; ag.state.energy = 1; } },
  };
  window.EPAR = api;
  window.__EPAR_CAMERA = camera;
  // utilidades de diagnóstico (usadas pelos scripts de teste)
  window.__EPAR_FIT = () => { fit(); return [renderer.domElement.width, renderer.domElement.height]; };
  window.__EPAR_RENDERER = renderer;
  window.__EPAR_SCENE = scene;

  const camWorld = new THREE.Vector3();
  let last = performance.now();
  function tick() {
    const ts = performance.now();
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    const now = (ts - T0) / 1000;
    // Matrizes de mundo frescas, sem depender do grafo que o MindAR embrulha.
    camera.matrixWorld.identity();
    camera.matrixWorldInverse.identity();
    for (const ag of agents) {
      ag.group.updateMatrix();
      ag.group.matrixWorld.copy(ag.group.matrix);
      ag.update(dt, now, { x: 0, y: 0 });
      ag.rig.updateMatrix();
      ag.rig.matrixWorld.multiplyMatrices(ag.group.matrixWorld, ag.rig.matrix);
      for (const ch of ag.rig.children) {
        ch.updateMatrix();
        ch.matrixWorld.multiplyMatrices(ag.rig.matrixWorld, ch.matrix);
      }
      for (const eye of ag.eyes) {
        eye.updateMatrix();
        eye.matrixWorld.multiplyMatrices(ag.rig.matrixWorld, eye.matrix);
      }
    }
    // Empurra o conteúdo para frente da câmera (-Z), deitado no plano do cartão.
    const push = new THREE.Matrix4().makeTranslation(0, -0.32, -1.7).multiply(new THREE.Matrix4().makeRotationX(-0.12));
    for (const ag of agents) ag.group.matrixWorld.premultiply(push);
    // Câmera na origem olhando -Z; o conteúdo é recuado e deitado no plano do cartão.
    camera.matrixWorld.identity();
    camera.matrixWorldInverse.identity();
    camera.matrix.copy(camera.matrixWorld);
    camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
    renderer.render(scene, camera);
    if (!window.__EPAR_ONCE) { window.__EPAR_ONCE = 1;
      const probe = new THREE.Vector3().setFromMatrixPosition(agents[3].group.matrixWorld).applyMatrix4(camera.projectionMatrix);
      console.log('ONCE calls=' + renderer.info.render.calls + ' heartNdc=' + probe.x.toFixed(3) + ',' + probe.y.toFixed(3) + ',' + probe.z.toFixed(3));
    }
    requestAnimationFrame(tick);
  }
  last = performance.now();
  tick();
  window.EPAR_READY = true;

  window.__EPAR_onMatrix = (worldMatrix) => {
    if (!worldMatrix) { anchor.visible = false; return; }
    const m = new THREE.Matrix4(); m.elements = [...worldMatrix];
    m.multiply(anchor.post);
    anchor.matrix.copy(m);
    SIM_GROUP.matrix.copy(m);
    if (!anchor.visible) { anchor.visible = true; onFound(); }
  };
  const onFound = () => {
    state.found = true;
    document.body.classList.add('target-found');
    window.dispatchEvent(new CustomEvent('epar:found'));
    spawn();
  };
  const onLost = () => {
    state.found = false;
    document.body.classList.remove('target-found');
    window.dispatchEvent(new CustomEvent('epar:lost'));
  };

  let spawned = false;
  function spawn() {
    if (spawned) return;
    spawned = true;
    state.phase = 'talk';
    for (const ag of agents) {
      setTimeout(() => { ag.setActive(true); ag.state.flash = 0.9; ag.state.energy = 0.8; }, ag.delay * 1000);
    }
    setTimeout(() => window.dispatchEvent(new CustomEvent('epar:spawned')), 1200);
  }
  window.__EPAR_SPAWN = spawn;

  if (SIM) {
    mindar.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
    mindar.camera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x05070d);
  } else {
    scene.background = null; // a câmera do celular é o fundo
    await mindar.start();
    // matriz de pós-processamento do alvo (normaliza a imagem para 1 unidade de largura)
    const dims = mindar.controller.dimensions?.[0] || [1, 1];
    const w = dims[0];
    anchor.post.compose(new THREE.Vector3(w / 2, w / 2, 0), new THREE.Quaternion(), new THREE.Vector3(w, w, w));
    // recebe a matriz do alvo pelo controlador (sem depender dos anchors internos do MindAR)
    mindar.controller.onUpdate = (data) => {
      if (data.type !== 'updateMatrix' || data.targetIndex !== 0) return;
      if (data.worldMatrix === null) { if (anchor.visible) { anchor.visible = false; onLost(); } }
      else window.__EPAR_onMatrix(data.worldMatrix);
    };
  }
  document.body.classList.add('ar-ready');
  if (SIM) {
    if (!document.body.classList.contains('sim')) document.body.classList.add('sim');
    const back = document.createElement('img');
    back.src = '../assets/cartao-ar.png';
    back.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,86vh);z-index:0;filter:brightness(.92) saturate(.95);border-radius:10px;pointer-events:none';
    gl.appendChild(back);
    document.body.classList.add('sim-card');
    spawn();
  }
  return api;
}
