// Roteiro e personagens da demo. Texto puro para o servidor e o navegador lerem o mesmo arquivo.
export const AGENTS = [
  {
    id: 'blue',
    role: 'Operações',
    name: 'Zico',
    color: '#249ce8',
    body: 'assets/blue.webp',
    sclera: 'assets/eye/blue_sclera.webp',
    look: 'iris',
    greeting: 'Opa! Aqui é o Zico, das operações. Eu acompanho pedido, estoque e entrega.',
    talk: [
      'São 1.284 pedidos na semana, 37 esperando separação.',
      'Posso atualizar o status deles agora.',
    ],
    actions: [
      { label: 'Atualizar 37 pedidos', kind: 'table' },
      { label: 'Mostrar atrasos' },
    ],
  },
  {
    id: 'pink',
    role: 'Social Media',
    name: 'Lia',
    color: '#ed238f',
    body: 'assets/pink.webp',
    sclera: 'assets/eye/pink_sclera.webp',
    look: 'iris',
    greeting: 'Lia, social media. Eu escuto o que o público fala e respondo em minutos.',
    talk: [
      'Nos últimos 30 dias a marca ganhou 1.240 seguidores.',
      'E respondi 96% dos comentários.',
    ],
    actions: [
      { label: 'Gerar calendário' },
      { label: 'Responder comentários' },
    ],
  },
  {
    id: 'heart',
    role: 'SAC',
    name: 'Bia',
    color: '#ee655a',
    body: 'assets/heart.webp',
    sclera: 'assets/eye/heart_sclera.webp',
    look: 'iris',
    greeting: 'Bia, do SAC. O cliente fala comigo por WhatsApp, chat ou e-mail.',
    talk: [
      'Atendi 312 clientes hoje e resolveu no primeiro contato em 9 de cada 10.',
      'Quando não resolve, já encaminho com o histórico pronto.',
    ],
    actions: [
      { label: 'Ver conversas', kind: 'chat' },
      { label: 'Abrir um atendimento' },
    ],
  },
  {
    id: 'patch',
    role: 'Planejamento',
    name: 'Pirata',
    color: '#3c3532',
    body: 'assets/patch.webp',
    sclera: 'assets/eye/patch_sclera.webp',
    look: 'ring',
    greeting: 'Arrr. Pirata, planejamento. Eu olho adiante antes de virarem problema.',
    talk: [
      'A qualidade do estoque segue de olho na demanda.',
      'E já avisei que faltam 18 itens para o próximo mês.',
    ],
    actions: [
      { label: 'Ver previsão' },
      { label: 'Itens em risco' },
    ],
  },
  {
    id: 'scar',
    role: 'Gestão',
    name: 'Rui',
    color: '#5d5e65',
    body: 'assets/scar.webp',
    sclera: 'assets/eye/scar_sclera.webp',
    look: 'iris',
    greeting: 'Rui, gestão. Cicatriz de guerra, história para contar: eu já vi esse problema antes.',
    talk: [
      'Esta semana concluí a meta do mês com 4 dias de antecedência.',
      'O time bateu 112% da meta de vendas.',
    ],
    actions: [
      { label: 'Ver indicadores' },
      { label: 'Relatório do mês' },
    ],
  },
  {
    id: 'globe',
    role: 'Contabilidade',
    name: 'Bot Pílula',
    color: '#4da3ff',
    body: 'assets/globe_points.webp',
    glow: 'assets/globe_glow.webp',
    look: 'orbit',
    greeting: 'Bot Pílula, contabilidade. Eu confiro nota, imposto e conciliação sem cansar.',
    talk: [
      'Fechamento deste mês: 3 notas com divergência de centavos.',
      'Já conferi as 1.402 notas e testei tudo.',
    ],
    actions: [
      { label: 'Fechar o mês', kind: 'table' },
      { label: 'Ver divergências' },
    ],
  },
  {
    id: 'brain',
    role: 'P&D',
    name: 'Nova',
    color: '#56d6ff',
    body: 'assets/brain_points.webp',
    glow: 'assets/brain_glow.webp',
    look: 'orbit',
    greeting: 'Nova, de pesquisa e desenvolvimento. Eu transformo dados em ideia e ideia em teste.',
    talk: [
      'Testei três formatos novos de contrato neste mês.',
      'A melhor versão aumentou a conversão em 2,3 pontos.',
    ],
    actions: [
      { label: 'Ver experimentos' },
      { label: 'Ideias abertas' },
    ],
  },
];

export const PLANILHA = {
  titulo: 'Relatório semanal',
  colunas: ['Agente', 'Tarefas concluídas', 'Tempo economizado'],
  linhas: [
    ['Operações', '284', '12 h'],
    ['Social Media', '96', '4 h'],
    ['SAC', '312', '18 h'],
    ['Planejamento', '61', '7 h'],
    ['Gestão', '48', '3 h'],
    ['Contabilidade', '1402', '22 h'],
    ['P&D', '27', '5 h'],
  ],
  total: ['Total', '2.230', '71 h'],
};
