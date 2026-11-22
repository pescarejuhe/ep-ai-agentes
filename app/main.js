// Página dos sete agentes: cena three.js no fundo, cartões e conversa no topo.
import * as THREE from 'three';
import { AGENTS } from '../ar/agents-data.js';

// base: '/' em desenvolvimento e produção na raiz; '/<repo>/' no GitHub Pages
const BASE = (() => {
  const p = location.pathname;
  const i = p.indexOf('/app/');
  return i >= 0 ? p.slice(0, i + 1) : '/';
})();
const asset = (src) => BASE + 'assets/' + src.replace(/^assets\//, '');

const $ = (s, r = document) => r.querySelector(s);
const SIM_LINES = {
  blue: ['São 1.284 pedidos na semana e 37 esperando separação.', 'Já atualizei os 37 pedidos.'],
  pink: ['A marca ganhou 1.240 seguidores nos últimos 30 dias.', 'Respondi 96% dos comentários hoje.'],
  heart: ['Atendi 312 clientes hoje; 9 em cada 10 resolvidos no primeiro contato.', 'Quando não resolvo, já encaminho com o histórico pronto.'],
  patch: ['Enxergo a demanda antes de ela virar falta.', 'Aviso: faltam 18 itens para o mês que vem.'],
  scar: ['Já vi esse problema antes — e o time bateu 112% da meta.', 'Relatório do mês fechado com 4 dias de antecedência.'],
  globe: ['Conferi 1.402 notas e 3 divergências de centavos.', 'Fechamento pronto para o contador.'],
  brain: ['Testei três formatos novos neste mês.', 'A melhor versão aumentou a conversão em 2,3 pontos.'],
};
const SPECS = [['Operações', 284], ['Social Media', 96], ['SAC', 312], ['Planejamento', 61], ['Gestão', 48], ['Contabilidade', 1402], ['P&D', 27]];

// posições em unidades de mundo; o enquadramento se ajusta ao formato da tela
const POS = [
  ['blue', -1.06, 0.62, 0.58], ['pink', -0.02, 0.86, 0.52], ['scar', 1.00, 0.60, 0.54],
  ['heart', -1.20, -0.02, 0.68], ['patch', -0.02, -0.02, 0.72], ['globe', 1.10, 0.02, 0.52], ['brain', 0.30, -0.86, 0.46],
];

const Voice = {
  ok: 'speechSynthesis' in window, voice: null, off: false,
  init() {
    if (!this.ok) return;
    const pick = () => {
      const v = speechSynthesis.getVoices().filter(x => x.lang && x.lang.toLowerCase().startsWith('pt'));
      this.voice = v.find(x => /luciana|google|natural|neural/i.test(x.name)) || v[0] || null;
    };
    pick(); speechSynthesis.addEventListener?.('voiceschanged', pick);
  },
  say(text) {
    if (!this.ok || this.off || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'pt-BR';
    u.rate = 1.03; u.pitch = 1;
    speechSynthesis.speak(u);
  },
};

const loadImage = (src) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i); i.onerror = () => rej(new Error(src));
  i.src = asset(src) + '?v=2';
});

function makeTexture(img) {
  const t = new THREE.Texture(img);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;   // sem isso a textura nunca é enviada ao GPU
  return t;
}

const FRAG = `
uniform sampler2D map; uniform float appear;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.02) discard;
  gl_FragColor = vec4(c.rgb, c.a * appear);
}`;
const FRAG_IRIS = `
uniform float appear; varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec3 col = mix(vec3(0.02,0.05,0.16), vec3(0.06,0.34,0.95), smoothstep(0.20,0.58,r));
  col = mix(col, vec3(0.25,0.76,1.0), smoothstep(0.74,0.99,r));
  float fib = 0.5 + 0.5*sin(atan(p.y,p.x)*36.0 + r*10.0);
  col *= 0.86 + 0.28*fib*smoothstep(0.32,0.92,r);
  col = mix(vec3(0.01,0.02,0.05), col, smoothstep(0.27,0.35,r));
  col = mix(col, vec3(1.0), smoothstep(0.10,0.055,length(p - vec2(-0.13,-0.15)))*0.95);
  gl_FragColor = vec4(col, appear);
}`;
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

const agents = [];
const byId = {};

async function buildScene() {
  const meta = await (await fetch(asset('agents.json'))).json();
  const irisImg = await loadImage('iris.webp');

  const renderer = new THREE.WebGLRenderer({ canvas: $('#stage'), antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);
  const fit = () => {
    // enquadra os sete na largura no celular (retrato) e na altura no desktop
    const aspect = innerWidth / innerHeight;
    const needW = 3.6, needH = 2.5;
    const dW = needW / (2 * Math.tan(THREE.MathUtils.degToRad(25)) * aspect);
    const dH = needH / (2 * Math.tan(THREE.MathUtils.degToRad(25)));
    camera.position.set(0, 0.05, Math.max(dW, dH) * 0.95);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };
  fit();

  for (const [id, x, y, s] of POS) {
    const def = AGENTS.find(a => a.id === id);
    if (!def) continue;
    const root = new THREE.Group();
    root.position.set(x, y, 0);
    root.scale.setScalar(s);
    const rig = new THREE.Group();
    root.add(rig);
    scene.add(root);

    const bodyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeTexture(await loadImage(def.body)) }, appear: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    });
    const body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bodyMat);
    body.renderOrder = 0;
    rig.add(body);

    let glowMat = null;
    if (def.glow) {
      glowMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: makeTexture(await loadImage(def.glow)) }, appear: { value: 1 } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), glowMat);
      glow.position.z = -0.02;
      glow.renderOrder = -1;
      rig.add(glow);
    }

    const eyes = [];
    if (meta[id] && def.sclera) {
      const scleraTex = makeTexture(await loadImage(def.sclera));
      for (const e of meta[id].eyes) {
        const eye = new THREE.Group();
        eye.position.set(e.cx - 0.5, 0.5 - e.cy, 0.01);
        const d = e.r * 2;
        const sclMat = new THREE.ShaderMaterial({
          uniforms: { map: { value: scleraTex }, appear: { value: 1 } },
          vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        });
        const scl = new THREE.Mesh(new THREE.PlaneGeometry(d, d), sclMat);
        scl.renderOrder = 2;
        eye.add(scl);
        if (def.look === 'iris') {
          const irisMat = new THREE.ShaderMaterial({
            uniforms: { appear: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG_IRIS,
            transparent: true, depthWrite: false,
          });
          const iris = new THREE.Mesh(new THREE.PlaneGeometry(d * 0.62, d * 0.62), irisMat);
          iris.position.z = 0.002;
          iris.renderOrder = 3;
          eye.add(iris);
        }
        rig.add(eye);
        eyes.push(eye);
      }
    }
    const ag = { def, root, rig, body, bodyMat, glowMat, eyes, base: s, t: Math.random() * 6, blink: 2 + Math.random() * 3, lid: 1 };
    agents.push(ag);
    byId[id] = ag;
  }

  let focus = null;
  let dim = 0;

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    for (const ag of agents) {
      ag.t += dt;
      const isFocus = !focus || focus === ag.def.id;
      const target = isFocus ? 1 : 0.32;
      // respiração e leve flutuação
      const breath = Math.sin(ag.t * 1.6) * 0.01;
      ag.rig.scale.set(1 + breath * 0.6, 1 - breath, 1);
      ag.rig.position.y = Math.sin(ag.t * 1.1) * 0.012;
      ag.root.position.z = focus === ag.def.id ? 0.35 : 0;
      // piscar: 0 = aberto, 1 = fechado
      ag.blink -= dt;
      if (ag.blink <= 0) {
        ag.blinkPhase = (ag.blinkPhase || 0) + dt;
        const k = ag.blinkPhase / 0.16;
        ag.lid = k < 0.5 ? 1 - k * 1.9 : Math.max(0.06, (k - 0.5) * 1.9);
        if (k >= 1) { ag.lid = 1; ag.blinkPhase = 0; ag.blink = 2.6 + Math.random() * 3.6; }
      }
      for (const eye of ag.eyes) eye.scale.y = ag.lid;
      // aparecer/sumir e brilho por foco
      const cur = ag.bodyMat.uniforms.appear.value;
      ag.bodyMat.uniforms.appear.value = cur + (target - cur) * Math.min(1, dt * 6);
      if (ag.glowMat) ag.glowMat.uniforms.appear.value = ag.bodyMat.uniforms.appear.value;
      for (const eye of ag.eyes) for (const c of eye.children) if (c.material.uniforms.appear) c.material.uniforms.appear.value = ag.bodyMat.uniforms.appear.value;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    fit();
  });

  return { setFocus(id) { focus = id; } };
}

function buildCards() {
  const host = $('#cards');
  host.replaceChildren();
  for (const def of AGENTS) {
    const b = document.createElement('button');
    b.className = 'card';
    b.style.setProperty('--c', def.color);
    b.dataset.id = def.id;
    const img = document.createElement('img');
    const ICONS = { blue: 'blue_icon', pink: 'pink_icon', heart: 'heart_icon', patch: 'patch_icon', scar: 'scar_icon', globe: 'globe', brain: 'brain' };
    img.src = asset((ICONS[def.id] || def.id) + '.webp') + '?v=3';
    img.alt = '';
    b.appendChild(img);
    const name = document.createElement('b');
    name.textContent = def.role;
    b.appendChild(name);
    b.addEventListener('click', () => openAgent(def.id));
    host.appendChild(b);
  }
}

let api = null;
let current = null;

function openAgent(id) {
  const def = AGENTS.find(a => a.id === id);
  if (!def) return;
  current = id;
  api?.setFocus(id);
  for (const c of document.querySelectorAll('.card')) c.classList.toggle('on', c.dataset.id === id);
  const talk = $('#talk');
  talk.hidden = false;
  $('#dot').style.setProperty('--c', def.color);
  $('#tname').textContent = def.name;
  $('#trole').textContent = def.role;
  $('#tline').textContent = def.greeting;
  Voice.say(def.greeting);
  const chips = $('#tchips');
  chips.replaceChildren();
  for (const act of (def.actions || []).slice(0, 2)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = act.label;
    b.addEventListener('click', () => runAction(def, act));
    chips.appendChild(b);
  }
}

async function runAction(def, act) {
  const line = (SIM_LINES[def.id] || [])[0] || 'Feito.';
  $('#tline').textContent = line;
  Voice.say(line);
  if (act.kind === 'table' || /relat[óo]rio|calend[áa]rio|fechar|fechamento/i.test(act.label)) {
    await showSheet();
  }
}

async function showSheet() {
  const sheet = $('#sheet');
  $('#talk').hidden = true;   // a planilha ocupa a frente
  sheet.hidden = false;
  const body = $('#rows');
  body.replaceChildren();
  const rows = SPECS.map(([name, n]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${name}</td><td><b>${n.toLocaleString('pt-BR')}</b><i><s style="width:${(n / 1402) * 100}%"></s></i></td>`;
    body.appendChild(tr);
    return { tr, n, b: tr.querySelector('b'), s: tr.querySelector('s') };
  });
  // animação: cada linha entra do zero até o valor, uma depois da outra
  for (const r of rows) {
    r.b.textContent = '0';
    r.s.style.transition = 'none';
    r.s.style.width = '0%';
  }
  void body.offsetHeight; // aplica o estado inicial
  for (const r of rows) {
    r.tr.classList.add('hl');
    r.s.style.transition = 'width .45s cubic-bezier(.2,.8,.2,1)';
    requestAnimationFrame(() => { r.s.style.width = (r.n / 1402) * 100 + '%'; });
    const t0 = performance.now();
    await new Promise(res => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 420);
        const e = 1 - Math.pow(1 - k, 3);
        r.b.textContent = Math.round(r.n * e).toLocaleString('pt-BR');
        if (k < 1) requestAnimationFrame(step); else { r.b.textContent = r.n.toLocaleString('pt-BR'); res(); }
      };
      requestAnimationFrame(step);
    });
    r.tr.classList.remove('hl');
  }
  setTimeout(() => { sheet.hidden = true; }, 5600);
}

async function boot() {
  Voice.init();
  buildCards();
  $('#close').addEventListener('click', () => {
    $('#talk').hidden = true;
    api?.setFocus(null);
    current = null;
    for (const c of document.querySelectorAll('.card')) c.classList.remove('on');
    if (Voice.ok) speechSynthesis.cancel();
  });
  try { api = await buildScene(); }
  catch (e) { console.error(e); }
  // primeira visita: apresenta o time
  window.EPAR = { agents, openAgent };
}

boot();
