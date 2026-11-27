'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'validar.js');

function pastaTemporaria(arquivos) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'textcdsp-validar-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(pasta, nome);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo, 'utf8');
  }
  return pasta;
}

function rodar(pasta) {
  const r = spawnSync(process.execPath, [script, pasta], { encoding: 'utf8' });
  return { codigo: r.status, saida: r.stdout, erro: r.stderr };
}

const bloco = (trigger, label = 'Rótulo') => `  - trigger: "${trigger}"\n    label: "${label}"\n    replace: "texto"\n`;

test('CLI: /cont e /contestacao saem com código 1 e mostram trigger-prefixo com os dois', () => {
  const pasta = pastaTemporaria({ 'teste.yml': `matches:\n${bloco('/cont')}${bloco('/contestacao')}` });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 1);
    assert.match(saida, /ERROS \(1\)/);
    assert.match(saida, /teste\.yml:2 \[trigger-prefixo\]/);
    assert.match(saida, /\/cont\b/);
    assert.match(saida, /\/contestacao/);
    assert.match(saida, /2 snippets, 1 erros, 0 avisos/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('CLI: pasta válida sai com código 0 e mostra o resumo', () => {
  const pasta = pastaTemporaria({ 'ok.yml': `matches:\n${bloco('/cont')}${bloco('/hoje')}` });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 0);
    assert.match(saida, /2 snippets, 0 erros, 0 avisos/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('CLI: avisos aparecem separados dos erros e não derrubam o código de saída', () => {
  const pasta = pastaTemporaria({ 'a.yml': 'matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: ""\n' });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 0);
    assert.match(saida, /AVISOS \(1\)/);
    assert.match(saida, /a\.yml:4 \[texto-vazio\]/);
    assert.doesNotMatch(saida, /ERROS/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('CLI: ignora arquivos "_", outras extensões e pastas iniciadas por "_" ou "."', () => {
  const pasta = pastaTemporaria({
    'ok.yml': `matches:
${bloco('/cont')}`,
    '_rascunho.yml': 'isto nem é yaml: [',
    'notas.txt': 'texto qualquer',
    '_historico/velho.yml': 'isto também não: [',
    '_instalador/versao.json': '{}',
    '.oculta/x.yml': 'nem este: [',
    'sub/_rascunho.yml': 'nem este: [',
    'sub/leia.txt': 'texto',
  });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 0);
    assert.match(saida, /1 snippets, 0 erros, 0 avisos/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

// Marco 10: subpastas entram, com o caminho relativo nas mensagens.
test('CLI: lê as subpastas; _historico fica de fora (conta só os três primeiros arquivos)', () => {
  const pasta = pastaTemporaria({
    'exemplos.yml': `matches:
${bloco('/ola')}`,
    'Medicamentos/contestacao.yml': `matches:
${bloco('/cont')}`,
    'Medicamentos/Recursos/agravo.yml': `matches:
${bloco('/agr')}`,
    '_historico/velho.yml': `matches:
${bloco('/cont')}`,
  });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 0, saida);
    assert.match(saida, /3 snippets, 0 erros, 0 avisos/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('CLI: conflito entre pastas cita os dois caminhos; arquivo no 4º nível é caminho-profundo', () => {
  const pasta = pastaTemporaria({
    'raiz.yml': `matches:
${bloco('/cont')}`,
    'Medicamentos/contestacao.yml': `matches:
${bloco('/contestacao')}`,
    'A/B/C/D/x.yml': `matches:
${bloco('/fundo')}`,
  });
  try {
    const { codigo, saida } = rodar(pasta);
    assert.equal(codigo, 1);
    assert.match(saida, /raiz\.yml:2 \[trigger-prefixo\].*\(raiz\.yml:2\).*\(Medicamentos\/contestacao\.yml:2\)/);
    assert.match(saida, /A\/B\/C\/D\/x\.yml \[caminho-profundo\]/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('CLI: sem argumento ou com pasta inexistente sai com código 2', () => {
  const semArgumento = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(semArgumento.status, 2);
  const inexistente = rodar(path.join(os.tmpdir(), 'textcdsp-pasta-que-nao-existe'));
  assert.equal(inexistente.codigo, 2);
});
