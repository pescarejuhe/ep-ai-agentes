// Cena 3D dos sete agentes (three.js puro, câmera comum em plano XY).
// Esta é a base validada: sem MindAR, sem truques de matriz. O modo AR envolve a cena
// com a matriz do alvo depois que esta cena estiver confirmada na tela.
import * as THREE from 'three';
import { AGENTS } from './agents-data.js';

const params = new URLSearchParams(location.search);
const SIM = params.get('sim') === '1';
const T0 = performance.now();

const gl = document.getElementById('gl') || document.body;

const PILE = [
  { id: 'blue', x: -0.62, y: 0.42, s: 0.52, delay: 0.05 },
  { id: 'pink', x: 0.10, y: 0.52, s: 0.46, delay: 0.10 },
  { id: 'scar', x: 0.66, y: 0.44, s: 0.50, delay: 0.15 },
  { id: 'heart', x: -0.72, y: 0.08, s: 0.62, delay: 0.20 },
  { id: 'patch', x: -0.02, y: 0.14, s: 0.66, delay: 0.25 },
  { id: 'globe', x: 0.60, y: 0.20, s: 0.48, delay: 0.30 },
  { id: 'brain', x: 0.86, y: -0.06, s: 0.44, delay: 0.35 },
];

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `
uniform sampler2D map; uniform float appear; uniform float light;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.02) discard;
  vec3 col = c.rgb * (0.85 + 0.25 * clamp(light, 0.0, 1.6));
  gl_FragColor = vec4(col, c.a * appear);
}`;
const FRAG_IRIS = `
uniform float appear; uniform vec2 look;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5 + look * 0.15;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec3 col = mix(vec3(0.02,0.05,0.16), vec3(0.06,0.34,0.95), smoothstep(0.20,0.58,r));
  col = mix(col, vec3(0.25,0.76,1.0), smoothstep(0.74,0.99,r));
  float fib = 0.5 + 0.5 * sin(atan(p.y,p.x) * 36.0 + r * 10.0);
  col *= 0.86 + 0.28 * fib * smoothstep(0.32,0.92,r);
  col = mix(vec3(0.01,0.02,0.05), col, smoothstep(0.27,0.35,r));
  col = mix(col, vec3(1.0), smoothstep(0.10,0.055,length(p - vec2(-0.13,-0.15))) * 0.95);
  gl_FragColor = vec4(col, appear);
}`;

const tex = (img) => { const t = new THREE.Texture(img); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };

const loadImage = (src) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => rej(new Error(src));
  img.src = new URL('../assets/' + src.replace(/^assets\//, ''), location.href).href;
});

class Agent {
  constructor(def, media, irisImg, meta) {
    this.def = def;
    this.group = new THREE.Group();   // posição e escala no cartão
    this.rig = new THREE.Group();     // respiração/pisca: não mexe na escala do cartão
    this.group.add(this.rig);
    this.state = { appear: 0, light: 0.6, speaking: 0 };
    this.look = new THREE.Vector2();
    this.phase = Math.random() * 6.283;
    this.blinkT = -1;
    this.nextBlink = 2 + Math.random() * 3;
    this.t = 0;

    this.bodyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex(media.body) }, appear: { value: 0 }, light: { value: 0.6 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    });
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bodyMat);
    this.body.renderOrder = 0;
    this.rig.add(this.body);

    if (media.glow) {
      this.glowMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex(media.glow) }, appear: { value: 0 }, light: { value: 0.6 } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), this.glowMat);
      this.glow.position.z = -0.01;
      this.rig.add(this.glow);
    }

    this.eyes = [];
    if (meta && media.sclera) {
      const st = tex(media.sclera);
      for (const e of meta.eyes) {
        const eye = new THREE.Group();
        eye.position.set(e.cx - 0.5, 0.5 - e.cy, 0.01);
        const d = e.r * 2;
        const sclMat = new THREE.ShaderMaterial({
          uniforms: { map: { value: st }, appear: { value: 0 }, light: { value: 0.6 } },
          vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        });
        const scl = new THREE.Mesh(new THREE.PlaneGeometry(d, d), sclMat);
        scl.renderOrder = 2;
        eye.add(scl);
        if (def.look === 'iris' && irisImg) {
          const im = new THREE.ShaderMaterial({
            uniforms: { appear: { value: 0 }, look: { value: new THREE.Vector2() } },
            vertexShader: VERT, fragmentShader: FRAG_IRIS, transparent: true, depthWrite: false,
          });
          const iris = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.62, d * 0.62), im);
          iris.renderOrder = 3;
          iris.position.z = 0.002;
          eye.add(iris);
          eye.userData.irisMat = im;
        }
        eye.userData.mats = [sclMat, eye.userData.irisMat].filter(Boolean);
        this.eyes.push(eye);
        this.rig.add(eye);
      }
    }
  }

  update(dt) {
    this.t += dt;
    const s = this.state;
    s.appear = Math.min(1, s.appear + dt * 3);
    const breath = Math.sin(this.t * 1.7 + this.phase);
    this.rig.scale.set(1 + breath * 0.006, 1 - breath * 0.008, 1);

    this.nextBlink -= dt;
    let lid = 1;
    if (this.nextBlink <= 0) {
      if (this.blinkT < 0) this.blinkT = 0;
      this.blinkT += dt;
      const k = this.blinkT / 0.15;
      lid = k < 0.5 ? 1 - k * 1.9 : Math.max(0.05, (k - 0.5) * 1.9);
      if (this.blinkT > 0.15) { this.blinkT = -1; this.nextBlink = 2.5 + Math.random() * 3.5; }
    }
    for (const eye of this.eyes) {
      eye.scale.y = lid;
      for (const m of eye.userData.mats) m.uniforms.appear.value = s.appear;
      if (eye.userData.irisMat) {
        eye.userData.irisMat.uniforms.appear.value = s.appear;
        eye.userData.irisMat.uniforms.look.value.copy(this.look);
      }
    }
    this.bodyMat.uniforms.appear.value = s.appear;
    if (this.glowMat) this.glowMat.uniforms.appear.value = s.appear;
  }
}

const DEBUG = params.has('debug');

async function boot() {
  const META = await (await fetch('../assets/agents.json')).json();
  const irisImg = await loadImage('iris.webp');
  if (DEBUG) {
    // diagnóstico: textura do corpo desenhada num plano opaco, bem na frente da câmera
    const img = await loadImage('heart.webp');
    const r0 = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    r0.setSize(innerWidth, innerHeight); r0.setClearColor(0x000000, 1);
    document.body.appendChild(r0.domElement);
    const s0 = new THREE.Scene();
    const m0 = new THREE.MeshBasicMaterial({ map: tex(img), transparent: true });
    const p0 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m0);
    p0.position.z = -2;
    s0.add(p0);
    const c0 = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 10);
    r0.render(s0, c0);
    const glc = r0.getContext(); const px = new Uint8Array(4);
    glc.readPixels(innerWidth >> 1, innerHeight >> 1, 1, 1, glc.RGBA, glc.UNSIGNED_BYTE, px);
    window.__DBG_PLANO = [...px];
    await new Promise(res => setTimeout(res, 200));
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4);

  const agents = [];
  const byId = {};
  for (const p of PILE) {
    const def = AGENTS.find(a => a.id === p.id);
    if (!def) continue;
    const media = {
      body: await loadImage(def.body),
      sclera: def.sclera ? await loadImage(def.sclera) : null,
      glow: def.glow ? await loadImage(def.glow) : null,
    };
    const ag = new Agent(def, media, irisImg, META[def.id]);
    ag.group.position.set(p.x, p.y, 0);
    ag.group.scale.setScalar(p.s);
    scene.add(ag.group);
    agents.push(ag);
    byId[def.id] = ag;
  }

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    for (const ag of agents) ag.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  window.EPAR = { agents: byId, renderer, scene, camera };
  window.EPAR_READY = true;
  window.dispatchEvent(new CustomEvent('epar:ready'));
}

boot().catch(e => { console.error('boot', e); window.EPAR_ERROR = String(e && e.message || e); });
