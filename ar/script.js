// Roteiro da demo: o cartão desperta, apresenta os sete, conversa e "monta" a planilha.
import { startAR } from './engine.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const SIM = params.get('sim');
if (SIM) document.body.classList.add('sim');
const AUTOSTART = params.has('auto') || SIM;

const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let agents = [];
const byId = {};
let busy = false;

// ---------------------------------------------------------------- voz (TTS local, sem custo)
const Voice = {
  supported: 'speechSynthesis' in window,
  voice: null,
  muted: false,
  init() {
    if (!this.supported) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices().filter(v => /pt(-|_)?BR/i.test(v.lang) || v.lang.startsWith('pt'));
      this.voice = vs.find(v => /luciana|google|natural|neural/i.test(v.name)) || vs[0] || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  speak(text, agentId, { rate = 1.02, pitch = 1 } = {}) {
    if (!this.supported || this.muted || !text) return Promise.resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'pt-BR';
    u.rate = rate; u.pitch = pitch; u.volume = 1;
    const agent = byId[agentId];
    if (agent) agent.state.speaking = 1;
    u.onboundary = () => agent && (agent.state.speaking = 1);
    return new Promise(res => {
      u.onend = () => { if (agent) agent.state.speaking = 0; res(); };
      u.onerror = () => { if (agent) agent.state.speaking = 0; res(); };
      speechSynthesis.speak(u);
      // trava de segurança: algumas vozes não disparam onend
      const guard = setTimeout(() => { if (speechSynthesis.speaking === false) { if (agent) agent.state.speaking = 0; res(); } }, 12000);
      u.addEventListener?.('end', () => clearTimeout(guard));
    });
  },
  stop() { if (this.supported) { speechSynthesis.cancel(); agents.forEach(a => a.state.speaking = 0); } },
};

// ---------------------------------------------------------------- HUD
function toast(text, ms = 3400) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), ms);
}

function bubbleFor(agent, text) {
  const el = document.createElement('div');
  el.className = 'speech';
  el.innerHTML = `<span class="who" style="--c:${agent.def.color}">${agent.def.name} · ${agent.def.role}</span><p>${text}</p>`;
  const host = $('#bubble');
  host.replaceChildren(el);
  host.classList.add('on');
  return el;
}
const hideBubble = () => $('#bubble').classList.remove('on');

function chips(agent) {
  const host = $('#chips');
  host.replaceChildren();
  if (!agent) { host.classList.remove('on'); return; }
  const acts = agent.def.actions || [];
  for (const a of acts.slice(0, 2)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${a.kind === 'table' ? 'M4 5h16v14H4zM4 10h16M9 10v9' : a.kind === 'chat' ? 'M4 5h16v11H9l-5 4z' : 'M12 3v18M3 12h18'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>${a.label}`;
    b.onclick = () => runAction(agent, a);
    host.appendChild(b);
  }
  host.classList.add('on');
}

function setStatus(text, on = true) { const s = $('#status'); s.textContent = text || ''; s.classList.toggle('on', !!text && on); }

// ---------------------------------------------------------------- planilha em 3D
const SPECS = [['Operações', 284], ['Social Media', 96], ['SAC', 312], ['Planejamento', 61], ['Gestão', 48], ['Contabilidade', 1402], ['P&D', 27]];

function buildSheet() {
  const wrap = $('#sheet');
  wrap.replaceChildren();
  const card = document.createElement('div');
  card.className = 'sheet-card';
  card.innerHTML = `
    <header><span class="k">EP AI</span><h3>Relatório semanal</h3></header>
    <div class="grid"><div class="row head"><span>Agente</span><span>Tarefas</span><span>Barra</span></div></div>
    <footer><span>Total</span><b>2.230</b><i>71 h poupadas</i></footer>
    <div class="xls">.xlsx pronto</div>`;
  const grid = $('.grid', card);
  SPECS.forEach(([name, n]) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${name}</span><b>0</b><i><s></s></i>`;
    grid.appendChild(row);
  });
  wrap.appendChild(card);
  return card;
}

async function fillSheet(highlight = 'Contabilidade') {
  const card = buildSheet();
  $('#sheet').classList.add('on');
  const rows = $$('.row:not(.head)', card);
  for (const [i, [name, n]] of SPECS.entries()) {
    const row = rows[i];
    const b = $('b', row); const bar = $('s', row);
    row.classList.toggle('hl', name === highlight);
    const dur = 520 + Math.random() * 220;
    const t0 = performance.now();
    await new Promise(res => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        b.textContent = Math.round(n * e).toLocaleString('pt-BR');
        bar.style.width = `${(e * n / 1402) * 100}%`;
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    // o agente daquela linha pisca quando o número entra
    const ag = agents.find(a => a.def.role === name);
    if (ag) ag.state.flash = 0.8;
  }
  $('footer b', card).textContent = '2.230';
  return card;
}

function chatScene() {
  const el = document.createElement('div');
  el.className = 'chat-card';
  el.innerHTML = `
    <div class="head"><span class="dot"></span>WhatsApp · Ana Souza</div>
    <div class="msg in">Oi! Meu pedido #4821 atrasou, preciso para amanhã.</div>
    <div class="msg out">Oi, Ana! Acabei de ver aqui: sai hoje à tarde e chega amanhã até as 12h. Quer que eu avise por aqui?</div>
    <div class="msg in">Perfeito, obrigada!</div>
    <div class="resolved">Resolvido em 38 s · sem transferência</div>`;
  const host = $('#overlay');
  host.replaceChildren(el);
  host.classList.add('on');
  return el;
}

// ---------------------------------------------------------------- fluxo
async function intro() {
  busy = true;
  setStatus('cartão reconhecido');
  await sleep(380);
  setStatus('');
  await Voice.speak('Oi! Eu sou o Zico, das operações. Deixa eu te apresentar o time.', 'blue');
  hideBubble();
  setStatus('apresentando o time');
  for (const id of ['blue', 'heart', 'pink', 'patch', 'scar', 'globe', 'brain']) {
    const ag = byId[id];
    if (!ag) continue;
    ag.state.flash = 1; ag.state.energy = 1;
    bubbleFor(ag, ag.def.greeting);
    await Voice.speak(`${ag.def.name}. ${ag.def.role}.`, id, { rate: 1.05 });
    await sleep(520);
  }
  hideBubble();
  setStatus('');
  busy = false;
  $('#hud').classList.add('ready');
  toast('Toque em um agente para conversar');
}

async function talkTo(id) {
  if (busy) return;
  busy = true;
  hideBubble(); chips(null);
  Voice.stop();
  window.EPAR?.focus(id);
  const ag = byId[id];
  $('#focused').classList.add('on');
  $('#focused').innerHTML = `<i style="--c:${ag.def.color}"></i>${ag.def.name} <span>${ag.def.role}</span>`;
  await sleep(420);
  bubbleFor(ag, ag.def.greeting);
  await Voice.speak(ag.def.greeting, id);
  bubbleFor(ag, ag.def.talk[0]);
  await Voice.speak(ag.def.talk[0], id);
  chips(ag);
  busy = false;
}

async function runAction(agent, action) {
  if (busy) return;
  busy = true;
  chips(null);
  $('#bubble').classList.remove('on');
  const id = agent.id;

  if (action.kind === 'table' || /relat[óo]rio|calend[áa]rio/i.test(action.label)) {
    window.EPAR?.focus(id);
    window.EPAR?.pulse(id);
    await Voice.speak(`Beleza. Vou montar ${action.label.toLowerCase()} agora.`, id);
    buildersOverlay(true);
    await fillSheet(agent.def.role);
    const row = await Voice.speak('Prontinho. A planilha está montada e o arquivo já pode ser baixado.', id);
    hideBubble();
    bubblesafe(`Planilha montada: 2.230 tarefas concluídas e 71 horas poupadas no mês.`, agent);
    $('#hud').classList.add('ready');
    await row;
    $('#actions').classList.add('on');
    busy = false;
    toast('Arquivo .xlsx pronto para enviar ao cliente');
    return;
  }

  if (action.kind === 'chat' || /atendimento|conversas/i.test(action.label)) {
    window.EPAR?.focus(id);
    window.EPAR?.pulse(id);
    await Voice.speak('Deixa eu abrir o atendimento para você ver como eu respondo.', id);
    chatScene();
    await Voice.speak('Respondi em trinta e oito segundos, sem precisar transferir o cliente.', id);
    await sleep(400);
    $('#overlay').classList.remove('on');
    $('#actions').classList.add('on');
    busy = false;
    return;
  }

  // respostas rápidas
  window.EPAR?.pulse(id);
  const line = agent.def.talk[1] || 'Feito.';
  bubbleFor(agent, line);
  await Voice.speak(`${line} Feito.`, id);
  chips(agent);
  busy = false;
}

const bubblesafe = (text, agent) => {
  const b = document.createElement('div');
  b.className = 'note';
  b.innerHTML = text;
  $('#overlay').replaceChildren(b);
  $('#overlay').classList.add('on');
  setTimeout(() => $('#overlay').classList.remove('on'), 5200);
};

function buildersOverlay() { $('#overlay').classList.remove('on'); }

// toque no agente: converte a posição 3D para a tela
function hitTest(ev) {
  const cam = window.__EPAR_CAMERA;
  if (!cam || !window.EPAR) return null;
  const rect = $('#gl').getBoundingClientRect();
  let best = null, bestD = 1e9;
  for (const ag of Object.values(window.EPAR.agents)) {
    const v = new THREE.Vector3();
    ag.group.getWorldPosition(v);
    const p = v.clone().project(cam);
    const x = (p.x * 0.5 + 0.5) * rect.width;
    const y = (-p.y * 0.5 + 0.5) * rect.height;
    const dx = ev.clientX - rect.left - x, dy = ev.clientY - rect.top - y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && d < bestD) { bestD = d; best = ag.id; }
  }
  return best;
}

function bind() {
  $('#gl').addEventListener('pointerdown', (ev) => {
    if (busy) return;
    const id = hitTest(ev);
    const cx = ev.clientX, cy = ev.clientY;
    const up = (e2) => {
      $('#gl').removeEventListener('pointerup', up);
      if (Math.hypot(e2.clientX - cx, e2.clientY - cy) > 12) return;
      const hit = hitTest(e2);
      if (hit) talkTo(hit);
      else if (!$('#focused').classList.contains('on')) toast('Toque em um agente');
    };
    $('#gl').addEventListener('pointerup', up);
  });

  $$('.dock button').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'restart') { location.reload(); }
    if (act === 'sound') {
      Voice.muted = !Voice.muted;
      b.classList.toggle('off', Voice.muted);
      if (Voice.muted) Voice.stop();
      toast(Voice.muted ? 'Som desligado' : 'Som ligado', 1600);
    }
    if (act === 'sheet') finalScene();
    if (act === 'team') {
      Voice.stop(); hideBubble(); chips(null);
      window.EPAR?.focus(null);
      $('#focused').classList.remove('on');
      $('#overlay').classList.remove('on');
      $('#sheet').classList.remove('on');
      intro();
    }
  }));

  $$('.scrim button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.act === 'start') setTimeout(() => runIntroWhenReady(), 120);
    if (b.dataset.act === 'sim') location.href = '?sim=1&auto=1';
    if (b.dataset.act === 'close') $('#scrim').classList.remove('on');
  }));

  $('#actions').addEventListener('click', async (e) => {
    if (!e.target.closest('a')) return;
    e.preventDefault();
    // gera um .xlsx de verdade com as linhas da planilha
    const { PLANILHA } = await import('./agents-data.js');
    const rows = [...PLANILHA.linhas, PLANILHA.total];
    let csv = [PLANILHA.colunas, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio-semanal.csv';
    a.click();
    toast('Baixado: abra no Excel ou Sheets');
  });
}

async function finalScene() {
  if (busy) return;
  busy = true;
  Voice.stop();
  hideBubble(); chips(null);
  window.EPAR?.focus(null);
  $('#focused').classList.remove('on');
  await Voice.speak('Olha o time inteiro reunido. Sete agentes, uma empresa inteira funcionando.', 'blue');
  await fillSheet('SAC');
  $('#actions').classList.add('on');
  busy = false;
}

async function runIntroWhenReady() {
  if (!window.EPAR) return;
  await intro();
}

async function boot() {
  Voice.init();
  bind();
  try {
    await startAR();
    window.__EPAR_READY_DONE = true;
  } catch (err) {
    console.error(err);
    $('#scrim').classList.add('on');
    $('.scrim h2').textContent = 'A câmera não abriu';
    $('.scrim p').textContent = 'Abra por um endereço https:// ou localhost, e permita o acesso à câmera. Enquanto isso, dá para ensaiar sem câmera.';
    return;
  }
  agents = Object.values(window.EPAR.agents || {});
  for (const a of agents) byId[a.id] = a;
  window.__EPAR_AGENTS = agents;

  // a câmera do MindAR é lida do próprio anchor a cada quadro
  const poll = setInterval(() => {
    if (window.__EPAR_CAMERA) { clearInterval(poll); return; }
    if (window.MINDAR) { /* a câmera fica no escopo do engine; espelhamos em engine.js */ }
  }, 300);

  window.addEventListener('epar:spawned', () => {
    setStatus('cartão reconhecido');
    setTimeout(() => setStatus(''), 900);
    setTimeout(() => { intro(); }, 300);
  });

  if (SIM) {
    $('#scrim').classList.remove('on');
    setStatus('modo ensaio · sem câmera');
    setTimeout(() => setStatus(''), 2500);
  } else {
    $('#scrim').classList.add('on');
  }
}

boot();
