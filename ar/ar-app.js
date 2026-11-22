// Página de abertura da experiência AR.
// O clique do usuário é obrigatório para o navegador liberar a câmera.
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const warn = (msg) => { const w = $('#warn'); w.textContent = msg; w.hidden = false; };

function stripIntro() {
  const intro = $('#intro');
  if (intro) intro.hidden = true;
  document.body.classList.add('started');
}

async function startWithCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return warn('Este navegador não expõe a câmera. Use Chrome ou Safari atualizado, ou toque em "Ver sem câmera".');
  }
  if (!window.isSecureContext) {
    return warn('A câmera só abre em endereço https:// (ou localhost). Abra este link pelo endereço seguro que eu te passei.');
  }
  $('#start').disabled = true;
  $('#start').textContent = 'Abrindo…';
  try {
    const mod = await import('./ar-scene.js');
    await mod.startAR();
    stripIntro();
    const hint = $('#hint');
    hint.hidden = false;
    addEventListener('ar:found', () => { hint.hidden = true; const b = $('#badge'); b.hidden = false; setTimeout(() => b.hidden = true, 2600); });
  } catch (err) {
    console.error(err);
    $('#start').disabled = false;
    $('#start').textContent = 'Tentar de novo';
    warn('Não foi possível abrir a câmera. Confira a permissão do navegador e tente de novo.');
  }
}

async function startSim() {
  stripIntro();
  try {
    const mod = await import('./ar-scene.js');
    await mod.startSim();
  } catch (err) {
    console.error(err);
    warn('Não foi possível carregar a cena.');
  }
}

$('#start').addEventListener('click', startWithCamera);
$('#sim').addEventListener('click', startSim);
if (params.has('sim')) startSim();
