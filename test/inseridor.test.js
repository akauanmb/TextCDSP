'use strict';

// A sequência do Inserir (src/main/inserir.js), com a área de transferência, a janela e o Ctrl+V falsos.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { criarInseridor, colarComCtrlV, ARGUMENTOS_POWERSHELL, ESPERA_APOS_ESCONDER_MS, ESPERA_ANTES_DE_RESTAURAR_MS } = require('../src/main/inserir');

// Ambiente falso: registra a ordem de tudo que acontece, com a hora lógica (ms) de cada passo.
function ambiente({ areaInicial = 'texto antigo', colar = null, falharGuardar = false, mudarAreaDepoisDeColar = null } = {}) {
  const eventos = [];
  let agora = 0;
  const avisos = [];
  const logs = [];
  let areaTexto = areaInicial;
  let colou = false;
  const area = {
    guardar: async () => {
      eventos.push(['guardar', agora]);
      if (falharGuardar) throw new Error('não deu');
      return [{ 'text/plain': areaTexto }];
    },
    escreverTexto: async (t) => { eventos.push(['escrever', agora, t]); areaTexto = t; },
    lerTexto: async () => { eventos.push(['ler', agora]); return areaTexto; },
    restaurar: async (inst) => { eventos.push(['restaurar', agora, inst]); areaTexto = inst[0]['text/plain']; },
  };
  const falhas = [];
  const inseridor = criarInseridor({
    log: { info: (m) => logs.push(m), aviso: (m) => avisos.push(m), erro: (m) => avisos.push(`ERRO ${m}`) },
    area,
    esconderJanela: async () => { eventos.push(['esconder', agora]); },
    colar: colar || (async () => {
      eventos.push(['colar', agora]);
      colou = true;
      if (mudarAreaDepoisDeColar !== null) areaTexto = mudarAreaDepoisDeColar;
      return { ok: true, codigo: 0, esgotou: false };
    }),
    aoFalhar: (info) => falhas.push(info),
    esperar: async (ms) => { agora += ms; eventos.push(['esperar', agora, ms]); },
  });
  return { inseridor, eventos, avisos, logs, falhas, area: () => areaTexto, colou: () => colou };
}

const nomes = (eventos) => eventos.map((e) => e[0]).filter((n) => n !== 'esperar');

test('a sequência: guarda, esconde, espera 200 ms, grava, cola, espera 600 ms, confere e restaura', async () => {
  const a = ambiente();
  const r = await a.inseridor.inserir({ texto: 'Olá', trigger: '/ola' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(nomes(a.eventos), ['guardar', 'esconder', 'escrever', 'colar', 'ler', 'restaurar']);
  const hora = (nome) => a.eventos.find((e) => e[0] === nome)[1];
  assert.equal(hora('escrever') - hora('esconder'), ESPERA_APOS_ESCONDER_MS); // 200 ms entre esconder e gravar
  assert.equal(hora('ler') - hora('colar'), ESPERA_ANTES_DE_RESTAURAR_MS); // 600 ms entre colar e conferir
  assert.equal(a.area(), 'texto antigo'); // a área de transferência da pessoa voltou
});

test('as quebras de linha vão como \\r\\n para a área de transferência', async () => {
  const a = ambiente();
  await a.inseridor.inserir({ texto: 'linha 1\nlinha 2\nlinha 3', trigger: '/x' });
  assert.equal(a.eventos.find((e) => e[0] === 'escrever')[2], 'linha 1\r\nlinha 2\r\nlinha 3');
});

test('restaura mesmo que a área tenha o \\n no lugar do \\r\\n (a comparação ignora a diferença)', async () => {
  const a = ambiente({ mudarAreaDepoisDeColar: 'a\nb' });
  await a.inseridor.inserir({ texto: 'a\nb', trigger: '/x' });
  assert.deepEqual(nomes(a.eventos).slice(-1), ['restaurar']);
});

test('se a pessoa copiou outra coisa nesse meio tempo, a área NÃO é restaurada', async () => {
  const a = ambiente({ mudarAreaDepoisDeColar: 'a pessoa copiou isto' });
  const r = await a.inseridor.inserir({ texto: 'Olá', trigger: '/ola' });
  assert.equal(r.ok, true);
  assert.ok(!nomes(a.eventos).includes('restaurar'));
  assert.equal(a.area(), 'a pessoa copiou isto');
});

test('o log tem "Texto inserido: <atalho>" e NUNCA o conteúdo do snippet', async () => {
  const a = ambiente();
  await a.inseridor.inserir({ texto: 'CONTEUDO-SECRETO-DO-SNIPPET', trigger: '/ola' });
  assert.deepEqual(a.logs, ['Texto inserido: /ola']);
  assert.ok(![...a.logs, ...a.avisos].join('\n').includes('CONTEUDO-SECRETO'));
});

test('falha no Ctrl+V (código diferente de 0): o texto fica na área, avisa e NÃO restaura', async () => {
  const a = ambiente({ colar: async () => ({ ok: false, codigo: 1, esgotou: false }) });
  const r = await a.inseridor.inserir({ texto: 'Olá', trigger: '/ola' });
  assert.deepEqual(r, { ok: false });
  assert.deepEqual(a.falhas, [{ copiado: true }]);
  assert.equal(a.area(), 'Olá'); // fica para a pessoa colar à mão
  assert.ok(!nomes(a.eventos).includes('restaurar'));
  assert.ok(a.logs.every((l) => !l.startsWith('Texto inserido')));
  assert.match(a.avisos[0], /código 1/);
});

test('falha por tempo esgotado: mesmo tratamento', async () => {
  const a = ambiente({ colar: async () => ({ ok: false, codigo: null, esgotou: true }) });
  const r = await a.inseridor.inserir({ texto: 'Olá', trigger: '/ola' });
  assert.equal(r.ok, false);
  assert.deepEqual(a.falhas, [{ copiado: true }]);
  assert.match(a.avisos[0], /tempo esgotado/);
});

test('erro inesperado antes de gravar: avisa dizendo que o texto NÃO foi copiado', async () => {
  const eventos = [];
  const falhas = [];
  const inseridor = criarInseridor({
    log: { info() {}, aviso() {}, erro() {} },
    area: { guardar: async () => [], escreverTexto: async () => {}, lerTexto: async () => '', restaurar: async () => {} },
    esconderJanela: async () => { throw new Error('a janela sumiu'); },
    colar: async () => { eventos.push('colou'); return { ok: true }; },
    aoFalhar: (i) => falhas.push(i),
    esperar: async () => {},
  });
  const r = await inseridor.inserir({ texto: 'x', trigger: '/x' });
  assert.equal(r.ok, false);
  assert.deepEqual(falhas, [{ copiado: false }]);
  assert.deepEqual(eventos, []); // nem chegou a colar
});

test('se não deu para guardar a área, insere assim mesmo e não tenta restaurar', async () => {
  const a = ambiente({ falharGuardar: true });
  const r = await a.inseridor.inserir({ texto: 'Olá', trigger: '/ola' });
  assert.equal(r.ok, true);
  assert.ok(a.colou());
  assert.ok(!nomes(a.eventos).includes('restaurar'));
  assert.ok(a.avisos.some((m) => /não será restaurada/.test(m)));
});

test('uma inserção por vez: um segundo pedido durante outra é ignorado', async () => {
  let liberar;
  const travado = new Promise((r) => { liberar = r; });
  const chamadas = [];
  const inseridor = criarInseridor({
    log: { info() {}, aviso() {}, erro() {} },
    area: { guardar: async () => [], escreverTexto: async (t) => chamadas.push(t), lerTexto: async () => '', restaurar: async () => {} },
    esconderJanela: () => travado, // a primeira fica esperando a janela
    colar: async () => ({ ok: true }),
    esperar: async () => {},
  });
  const primeira = inseridor.inserir({ texto: 'um', trigger: '/um' });
  await Promise.resolve();
  assert.equal(inseridor.emAndamento(), true);
  const segunda = await inseridor.inserir({ texto: 'dois', trigger: '/dois' });
  assert.deepEqual(segunda, { ok: false, ignorado: true });
  liberar();
  assert.deepEqual(await primeira, { ok: true });
  assert.deepEqual(chamadas, ['um']); // só o primeiro texto foi gravado
  assert.equal(inseridor.emAndamento(), false);
  // Terminada a primeira, uma nova é aceita.
  assert.equal((await inseridor.inserir({ texto: 'três', trigger: '/tres' })).ok, true);
});

test('a trava é liberada mesmo quando a inserção falha', async () => {
  const a = ambiente({ colar: async () => { throw new Error('quebrou'); } });
  assert.equal((await a.inseridor.inserir({ texto: 'x', trigger: '/x' })).ok, false);
  assert.equal(a.inseridor.emAndamento(), false);
});

// ---------------------------------------------------------------------------
// colarComCtrlV
// ---------------------------------------------------------------------------

function processoFalso() {
  const p = new EventEmitter();
  p.matou = false;
  p.kill = () => { p.matou = true; };
  return p;
}

test('colarComCtrlV: o comando é fixo, escondido e sem nenhum texto de snippet', async () => {
  let chamado = null;
  const p = processoFalso();
  const promessa = colarComCtrlV({ executar: (exe, args, opcoes) => { chamado = { exe, args, opcoes }; return p; } });
  p.emit('exit', 0);
  assert.deepEqual(await promessa, { ok: true, codigo: 0, esgotou: false });
  assert.equal(chamado.exe, 'powershell.exe');
  assert.deepEqual(chamado.args, [...ARGUMENTOS_POWERSHELL]);
  assert.equal(chamado.opcoes.windowsHide, true);
  assert.equal(chamado.opcoes.stdio, 'ignore');
  assert.ok(chamado.args.includes('-NoProfile') && chamado.args.includes('-NonInteractive'));
  assert.deepEqual(chamado.args.slice(chamado.args.indexOf('-WindowStyle'), chamado.args.indexOf('-WindowStyle') + 2), ['-WindowStyle', 'Hidden']);
  assert.match(chamado.args[chamado.args.length - 1], /SendWait\('\^v'\)$/);
});

test('colarComCtrlV: código de saída diferente de 0 é falha', async () => {
  const p = processoFalso();
  const promessa = colarComCtrlV({ executar: () => p });
  p.emit('exit', 1);
  assert.deepEqual(await promessa, { ok: false, codigo: 1, esgotou: false });
});

test('colarComCtrlV: passou de 5 s (ou do tempo dado), mata o processo e falha', async () => {
  const p = processoFalso();
  const r = await colarComCtrlV({ tempoMaximoMs: 30, executar: () => p });
  assert.deepEqual(r, { ok: false, codigo: null, esgotou: true });
  assert.equal(p.matou, true);
});

test('colarComCtrlV: o tempo máximo padrão é 5 s', () => {
  const { TEMPO_MAXIMO_COLAR_MS } = require('../src/main/inserir');
  assert.equal(TEMPO_MAXIMO_COLAR_MS, 5000);
});

test('colarComCtrlV: erro ao iniciar o processo é falha, sem lançar', async () => {
  const p = processoFalso();
  const promessa = colarComCtrlV({ executar: () => p });
  p.emit('error', new Error('powershell não encontrado'));
  const r = await promessa;
  assert.equal(r.ok, false);
  assert.match(r.erro, /não encontrado/);
  const r2 = await colarComCtrlV({ executar: () => { throw new Error('spawn falhou'); } });
  assert.equal(r2.ok, false);
});

test('colarComCtrlV: depois do exit, o tempo máximo não dispara de novo', async () => {
  const p = processoFalso();
  const promessa = colarComCtrlV({ tempoMaximoMs: 20, executar: () => p });
  p.emit('exit', 0);
  await promessa;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(p.matou, false);
});
