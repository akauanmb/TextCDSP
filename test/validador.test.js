'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validarBiblioteca, PREFIXOS_TRIGGER, PADRAO_TRIGGER } = require('../src/shared/validador');

const raiz = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

const arq = (conteudo, nome = 'a.yml') => ({ nome, conteudo });
const regras = (lista) => lista.map((p) => p.regra);
const doRegra = (lista, regra) => lista.filter((p) => p.regra === regra);

// Um match mínimo válido; `extra` entra depois da saída.
const match = (trigger, extra = '', label = 'Rótulo') =>
  `  - trigger: ${JSON.stringify(trigger)}\n    label: "${label}"\n    replace: "texto"\n${extra}`;
const lista = (...matches) => `matches:\n${matches.join('')}`;
const valida = (conteudo, opcoes) => validarBiblioteca([arq(conteudo)], opcoes);

// Garante que uma biblioteca válida não tem nenhum problema.
function semProblemas(resultado) {
  assert.deepEqual(resultado.erros, []);
  assert.deepEqual(resultado.avisos, []);
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

test('biblioteca válida: sem erros nem avisos e com o snippet extraído', () => {
  const r = valida(lista(match('/cont')));
  semProblemas(r);
  assert.equal(r.snippets.length, 1);
  assert.equal(r.snippets[0].trigger, '/cont');
  assert.equal(r.snippets[0].label, 'Rótulo');
  assert.equal(r.snippets[0].categoria, 'a');
  assert.equal(r.snippets[0].arquivo, 'a.yml');
  assert.equal(r.snippets[0].tipo, 'texto');
  assert.deepEqual(r.snippets[0].campos, []);
  assert.equal(r.snippets[0].preview, 'texto');
});

test('lista vazia de arquivos não gera nada', () => {
  assert.deepEqual(validarBiblioteca([]), { erros: [], avisos: [], snippets: [] });
});

test('a biblioteca de exemplo (snippets/exemplos.yml) não tem erros nem avisos', () => {
  const conteudo = fs.readFileSync(path.join(raiz, 'snippets', 'exemplos.yml'), 'utf8');
  const r = validarBiblioteca([{ nome: 'exemplos.yml', conteudo }]);
  semProblemas(r);
  assert.deepEqual(r.snippets.map((s) => s.trigger).sort(), ['/cont', '/fmt', '/hoje', '/prazo', '/prelim', '/qualif']);
});

test('src/shared/validador.js não importa fs, path nem electron', () => {
  const codigo = fs.readFileSync(path.join(raiz, 'src', 'shared', 'validador.js'), 'utf8');
  const importados = [...codigo.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(importados, ['yaml']);
});

// ---------------------------------------------------------------------------
// (yaml) e (estrutura)
// ---------------------------------------------------------------------------

test('yaml: arquivo com sintaxe inválida gera erro com a linha', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n   label: "x"\n    foo: [\n');
  const e = doRegra(r.erros, 'yaml');
  assert.ok(e.length >= 1);
  assert.equal(e[0].arquivo, 'a.yml');
  assert.equal(typeof e[0].linha, 'number');
  assert.match(e[0].mensagem, /YAML/);
});

test('yaml: chave repetida na mesma raiz gera erro de yaml', () => {
  const r = valida('matches:\n  - trigger: "/a1"\nmatches: []\n');
  assert.ok(doRegra(r.erros, 'yaml').length >= 1);
});

test('yaml: um arquivo inválido não impede a validação dos outros', () => {
  const r = validarBiblioteca([arq('matches: [', 'ruim.yml'), arq(lista(match('/cont')), 'bom.yml')]);
  assert.equal(doRegra(r.erros, 'yaml')[0].arquivo, 'ruim.yml');
  assert.equal(r.snippets.length, 1);
});

test('estrutura: arquivo sem a lista matches', () => {
  const r = valida('global_vars: []\n');
  assert.deepEqual(regras(r.erros), ['estrutura']);
  assert.match(r.erros[0].mensagem, /matches/);
});

test('estrutura: arquivo vazio ou só com comentários', () => {
  assert.deepEqual(regras(valida('').erros), ['estrutura']);
  assert.deepEqual(regras(valida('# só comentário\n').erros), ['estrutura']);
});

test('estrutura: chave de raiz fora de matches e global_vars', () => {
  const r = valida(`imports:\n  - "x.yml"\n${lista(match('/cont'))}`);
  assert.deepEqual(regras(r.erros), ['estrutura']);
  assert.match(r.erros[0].mensagem, /imports/);
  assert.equal(r.erros[0].linha, 1);
});

test('estrutura: global_vars e matches juntos são aceitos', () => {
  const r = valida(`global_vars:\n  - name: dia\n    type: date\n    params:\n      format: "%d"\n${lista(match('/cont', '    vars: []\n').replace('"texto"', '"{{dia}}"'))}`);
  semProblemas(r);
});

test('estrutura: item de matches que não é um mapa', () => {
  const r = valida('matches:\n  - "solto"\n');
  assert.deepEqual(regras(r.erros), ['estrutura']);
});

test('estrutura: variável sem name ou sem type', () => {
  const semNome = valida(lista(match('/a1', '    vars:\n      - type: echo\n        params:\n          echo: "x"\n')));
  assert.ok(doRegra(semNome.erros, 'estrutura').some((e) => /name/.test(e.mensagem)));
  const semTipo = valida(lista(match('/a1', '    vars:\n      - name: x\n')));
  assert.ok(doRegra(semTipo.erros, 'estrutura').some((e) => /type/.test(e.mensagem)));
});

// ---------------------------------------------------------------------------
// (trigger-ausente) e (trigger-formato)
// ---------------------------------------------------------------------------

test('trigger-ausente: match sem trigger', () => {
  const r = valida('matches:\n  - label: "x"\n    replace: "y"\n');
  assert.deepEqual(regras(r.erros), ['trigger-ausente']);
  assert.equal(r.snippets.length, 0);
});

test('trigger-ausente: trigger que não é texto', () => {
  const r = valida('matches:\n  - trigger: 123\n    label: "x"\n    replace: "y"\n');
  assert.deepEqual(regras(r.erros), ['trigger-ausente']);
});

test('trigger-ausente: "triggers", "regex" e "imports" não são permitidos', () => {
  for (const chave of ['triggers', 'regex', 'imports']) {
    const r = valida(`matches:\n  - ${chave}: ["/a1"]\n    label: "x"\n    replace: "y"\n`);
    assert.deepEqual(regras(r.erros), ['trigger-ausente'], chave);
    assert.match(r.erros[0].mensagem, new RegExp(chave));
  }
});

test('trigger-formato: padrões inválidos', () => {
  for (const ruim of ['cont', '/Cont', '/a', '/cont-x', '/cont x', '/ação', `/${'a'.repeat(31)}`]) {
    const r = valida(lista(match(ruim)));
    assert.deepEqual(regras(r.erros), ['trigger-formato'], ruim);
  }
});

test('trigger-formato: padrões válidos', () => {
  for (const bom of ['/ab', '/cont', '/a1', '/123', `/${'a'.repeat(30)}`]) {
    semProblemas(valida(lista(match(bom))));
  }
});

// Marco 9: o atalho pode começar por qualquer caractere de PREFIXOS_TRIGGER.

test('PREFIXOS_TRIGGER: a lista fixa de caracteres iniciais', () => {
  assert.deepEqual([...PREFIXOS_TRIGGER], ['/', ';', '!', '#', '=', '+', '-', '\\']);
  assert.ok(Object.isFrozen(PREFIXOS_TRIGGER));
});

test('trigger-formato: um caso válido para cada caractere da lista', () => {
  for (const prefixo of PREFIXOS_TRIGGER) {
    for (const base of ['ola', 'ab', 'a1', '123', 'a'.repeat(30)]) {
      semProblemas(valida(lista(match(`${prefixo}${base}`))));
    }
    // Os limites continuam valendo para qualquer caractere inicial.
    for (const ruim of ['a', 'A', 'a'.repeat(31), 'Ola', 'ação', 'a-b']) {
      assert.deepEqual(regras(valida(lista(match(`${prefixo}${ruim}`))).erros), ['trigger-formato'], `${prefixo}${ruim}`);
    }
  }
});

test('trigger-formato: sem caractere inicial da lista, ou com outro caractere, é erro', () => {
  const ruins = {
    'letra': 'cont',
    'número': '1cont',
    'espaço': ' cont',
    '@': '@cont',
    '.': '.cont',
    'acento agudo': '´cont',
    'til': '~cont',
    'circunflexo': '^cont',
    'apóstrofo': "'cont",
    'crase': '`cont',
    '*': '*cont',
    '/ duplicada': '//cont',
    'prefixo no meio': '/co;nt',
  };
  for (const [nome, ruim] of Object.entries(ruins)) {
    assert.deepEqual(regras(valida(lista(match(ruim))).erros), ['trigger-formato'], nome);
  }
});

test('PADRAO_TRIGGER aceita só os caracteres da lista: confere toda a pontuação ASCII', () => {
  for (let codigo = 33; codigo <= 126; codigo += 1) {
    const c = String.fromCharCode(codigo);
    if (/[a-zA-Z0-9]/.test(c)) continue;
    assert.equal(PADRAO_TRIGGER.test(`${c}ola`), PREFIXOS_TRIGGER.includes(c), `caractere ${c}`);
  }
});

test('trigger-formato: a mensagem cita os caracteres permitidos', () => {
  const [erro] = valida(lista(match('@cont'))).erros;
  assert.equal(erro.regra, 'trigger-formato');
  assert.match(erro.mensagem, /comece com um destes caracteres: \/ ; ! # = \+/);
  assert.match(erro.mensagem, /2 a 30 letras minúsculas sem acento ou números/);
  assert.match(erro.mensagem, /"@cont"/);
});

test('trigger-prefixo: o mesmo caractere inicial conflita (;cont e ;contestacao)', () => {
  for (const prefixo of PREFIXOS_TRIGGER) {
    const r = valida(lista(match(`${prefixo}cont`), match(`${prefixo}contestacao`)));
    const e = doRegra(r.erros, 'trigger-prefixo');
    assert.equal(e.length, 1, prefixo);
    assert.deepEqual(e[0].triggers, [`${prefixo}cont`, `${prefixo}contestacao`]);
  }
});

test('caracteres iniciais diferentes nunca conflitam (/cont e ;cont convivem)', () => {
  semProblemas(valida(lista(match('/cont'), match(';cont'))));
  // Os seis juntos, com o mesmo texto.
  semProblemas(valida(lista(...PREFIXOS_TRIGGER.map((p) => match(`${p}cont`)))));
  // "/cont" não é o começo de ";contestacao": o caractere inicial já os separa.
  semProblemas(valida(lista(match('/cont'), match(';contestacao'))));
});

test('trigger-duplicado: o mesmo texto com o mesmo caractere é duplicado; com outro, não', () => {
  assert.equal(doRegra(valida(lista(match(';cont'), match(';cont', '', 'Outro'))).erros, 'trigger-duplicado').length, 1);
  semProblemas(valida(lista(match(';cont'), match('!cont', '', 'Outro'))));
});

// ---------------------------------------------------------------------------
// (trigger-duplicado) e (trigger-prefixo)
// ---------------------------------------------------------------------------

test('trigger-duplicado: no mesmo arquivo, com a linha do primeiro', () => {
  const r = valida(lista(match('/cont'), match('/cont', '', 'Outro')));
  const e = doRegra(r.erros, 'trigger-duplicado');
  assert.equal(e.length, 1);
  assert.match(e[0].mensagem, /\/cont/);
  assert.match(e[0].mensagem, /a\.yml:2/);
  assert.equal(e[0].linha, 5);
});

test('trigger-duplicado: em arquivos diferentes', () => {
  const r = validarBiblioteca([arq(lista(match('/cont')), 'a.yml'), arq(lista(match('/cont')), 'b.yml')]);
  const e = doRegra(r.erros, 'trigger-duplicado');
  assert.equal(e.length, 1);
  assert.equal(e[0].arquivo, 'b.yml');
  assert.match(e[0].mensagem, /a\.yml/);
});

test('trigger-duplicado: triggers diferentes não disparam', () => {
  semProblemas(valida(lista(match('/cont'), match('/hoje'))));
});

test('trigger-prefixo: /cont e /contestacao informam os dois', () => {
  const r = valida(lista(match('/cont'), match('/contestacao')));
  const e = doRegra(r.erros, 'trigger-prefixo');
  assert.equal(e.length, 1);
  assert.match(e[0].mensagem, /\/cont\b/);
  assert.match(e[0].mensagem, /\/contestacao/);
  assert.equal(doRegra(r.erros, 'trigger-duplicado').length, 0);
});

test('trigger-prefixo: vale entre arquivos, qualquer que seja a ordem', () => {
  const r = validarBiblioteca([arq(lista(match('/contestacao')), 'a.yml'), arq(lista(match('/cont')), 'b.yml')]);
  const e = doRegra(r.erros, 'trigger-prefixo');
  assert.equal(e.length, 1);
  assert.match(e[0].mensagem, /\/cont\b/);
  assert.match(e[0].mensagem, /\/contestacao/);
});

test('trigger-prefixo: parecidos mas sem prefixo não disparam', () => {
  semProblemas(valida(lista(match('/cont'), match('/xcont'), match('/hoje'), match('/hojes').replace('/hojes', '/dia'))));
});

// ---------------------------------------------------------------------------
// (saida), (label), (texto-vazio)
// ---------------------------------------------------------------------------

test('saida: nenhuma saída', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n    label: "x"\n');
  assert.deepEqual(regras(r.erros), ['saida']);
});

test('saida: mais de uma saída', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: "a"\n    html: "<p>a</p>"\n');
  assert.deepEqual(regras(r.erros), ['saida']);
  assert.match(r.erros[0].mensagem, /replace, html/);
});

test('saida: exatamente uma entre replace, html e markdown é aceita', () => {
  for (const chave of ['replace', 'html', 'markdown']) {
    const r = valida(`matches:\n  - trigger: "/a1"\n    label: "x"\n    ${chave}: "texto"\n`);
    semProblemas(r);
  }
});

test('saida: replace que não é texto', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n    label: "x"\n    replace:\n      - "a"\n');
  assert.deepEqual(regras(r.erros), ['saida']);
});

test('label: ausente ou vazio', () => {
  assert.deepEqual(regras(valida('matches:\n  - trigger: "/a1"\n    replace: "x"\n').erros), ['label']);
  assert.deepEqual(regras(valida('matches:\n  - trigger: "/a1"\n    label: "  "\n    replace: "x"\n').erros), ['label']);
});

test('label: presente não dispara', () => {
  semProblemas(valida(lista(match('/a1'))));
});

test('texto-vazio: saída vazia é aviso, não erro', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: ""\n');
  assert.deepEqual(r.erros, []);
  assert.deepEqual(regras(r.avisos), ['texto-vazio']);
});

test('texto-vazio: opção de choice com id vazio não dispara', () => {
  const r = valida(lista(match('/a1', [
    '    vars:\n',
    '      - name: p\n',
    '        type: choice\n',
    '        params:\n',
    '          values:\n',
    '            - label: "Nenhuma"\n',
    '              id: ""\n',
    '            - label: "Uma"\n',
    '              id: "texto da uma"\n',
  ].join('')).replace('"texto"', '"{{p}}"')));
  semProblemas(r);
});

// ---------------------------------------------------------------------------
// (var-proibida)
// ---------------------------------------------------------------------------

test('var-proibida: shell e script', () => {
  for (const tipo of ['shell', 'script']) {
    const r = valida(lista(match('/a1', `    vars:\n      - name: x\n        type: ${tipo}\n        params:\n          cmd: "echo oi"\n`).replace('"texto"', '"{{x}}"')));
    assert.deepEqual(regras(r.erros), ['var-proibida'], tipo);
    assert.match(r.erros[0].mensagem, new RegExp(tipo));
  }
});

test('var-proibida: tipo fora da lista de permitidos', () => {
  const r = valida(lista(match('/a1', '    vars:\n      - name: x\n        type: match\n        params: {}\n').replace('"texto"', '"{{x}}"')));
  assert.deepEqual(regras(r.erros), ['var-proibida']);
});

test('var-proibida: também vale em global_vars', () => {
  const r = valida(`global_vars:\n  - name: g\n    type: shell\n    params:\n      cmd: "dir"\n${lista(match('/a1'))}`);
  assert.ok(doRegra(r.erros, 'var-proibida').length >= 1);
});

test('var-proibida: date, form, choice, echo, random e clipboard são aceitas', () => {
  const vars = [
    '      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n',
    '      - name: f\n        type: form\n        params:\n          layout: "Nome: [[n]]"\n',
    '      - name: c\n        type: choice\n        params:\n          values:\n            - "um"\n',
    '      - name: e\n        type: echo\n        params:\n          echo: "oi"\n',
    '      - name: r\n        type: random\n        params:\n          choices:\n            - "a"\n',
    '      - name: k\n        type: clipboard\n',
  ];
  const r = valida(lista(match('/a1', `    vars:\n${vars.join('')}`).replace('"texto"', '"{{d}} {{f.n}} {{c}} {{e}} {{r}} {{k}}"')));
  semProblemas(r);
});

// ---------------------------------------------------------------------------
// (var-indefinida) e (var-nao-usada)
// ---------------------------------------------------------------------------

test('var-indefinida: {{x}} sem declaração', () => {
  const r = valida(lista(match('/a1').replace('"texto"', '"Olá {{nome}}"')));
  assert.deepEqual(regras(r.erros), ['var-indefinida']);
  assert.match(r.erros[0].mensagem, /nome/);
});

test('var-indefinida: {{x.campo}} sem a variável x', () => {
  const r = valida(lista(match('/a1').replace('"texto"', '"{{form1.nome}}"')));
  assert.deepEqual(regras(r.erros), ['var-indefinida']);
});

test('var-indefinida: variável declarada no match ou em global_vars não dispara', () => {
  const local = valida(lista(match('/a1', '    vars:\n      - name: nome\n        type: echo\n        params:\n          echo: "x"\n').replace('"texto"', '"Olá {{nome}}"')));
  semProblemas(local);
  const global = valida(`global_vars:\n  - name: nome\n    type: echo\n    params:\n      echo: "x"\n${lista(match('/a1').replace('"texto"', '"Olá {{nome}}"'))}`);
  semProblemas(global);
});

test('var-indefinida: global_vars de outro arquivo valem para a biblioteca', () => {
  const r = validarBiblioteca([
    arq('global_vars:\n  - name: nome\n    type: echo\n    params:\n      echo: "x"\nmatches: []\n', 'globais.yml'),
    arq(lista(match('/a1').replace('"texto"', '"{{nome}}"')), 'a.yml'),
  ]);
  semProblemas(r);
});

test('var-indefinida: vale também para html e markdown', () => {
  const r = valida('matches:\n  - trigger: "/a1"\n    label: "x"\n    html: "<p>{{naoexiste}}</p>"\n');
  assert.deepEqual(regras(r.erros), ['var-indefinida']);
});

test('var-nao-usada: variável declarada e não usada é aviso', () => {
  const r = valida(lista(match('/a1', '    vars:\n      - name: sobra\n        type: echo\n        params:\n          echo: "x"\n')));
  assert.deepEqual(r.erros, []);
  assert.deepEqual(regras(r.avisos), ['var-nao-usada']);
  assert.match(r.avisos[0].mensagem, /sobra/);
});

test('var-nao-usada: variável usada só nos params de outra variável não dispara', () => {
  const vars = [
    '    vars:\n',
    '      - name: base\n        type: echo\n        params:\n          echo: "x"\n',
    '      - name: derivada\n        type: echo\n        params:\n          echo: "{{base}}!"\n',
  ].join('');
  const r = valida(lista(match('/a1', vars).replace('"texto"', '"{{derivada}}"')));
  semProblemas(r);
});

test('var-nao-usada: variável global que nenhum snippet usa', () => {
  const r = valida(`global_vars:\n  - name: g\n    type: echo\n    params:\n      echo: "x"\n${lista(match('/a1'))}`);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(regras(r.avisos), ['var-nao-usada']);
});

// ---------------------------------------------------------------------------
// (form-campo)
// ---------------------------------------------------------------------------

const formulario = (layout, fields = '') =>
  `    vars:\n      - name: form1\n        type: form\n        params:\n          layout: |\n${layout.split('\n').map((l) => `            ${l}`).join('\n')}\n${fields}`;

test('form-campo: campo em fields que não está no layout', () => {
  const r = valida(lista(match('/a1', formulario('Nome: [[nome]]', '          fields:\n            cnj:\n              default: "0"\n')).replace('"texto"', '"{{form1.nome}}"')));
  assert.deepEqual(regras(r.erros), ['form-campo']);
  assert.match(r.erros[0].mensagem, /cnj/);
});

test('form-campo: {{form.campo}} na saída sem [[campo]] no layout', () => {
  const r = valida(lista(match('/a1', formulario('Nome: [[nome]]')).replace('"texto"', '"{{form1.cnj}}"')));
  assert.deepEqual(regras(r.erros), ['form-campo']);
  assert.match(r.erros[0].mensagem, /cnj/);
});

test('form-campo: params.fields escrito como lista em vez de mapa', () => {
  const r = valida(lista(match('/a1', formulario('Nome: [[nome]]', '          fields: [nome]\n')).replace('"texto"', '"{{form1.nome}}"')));
  assert.deepEqual(regras(r.erros), ['form-campo']);
});

test('form-campo: formulário sem layout', () => {
  const r = valida(lista(match('/a1', '    vars:\n      - name: form1\n        type: form\n        params: {}\n').replace('"texto"', '"{{form1}}"')));
  assert.ok(doRegra(r.erros, 'form-campo').length >= 1);
});

test('form-campo: campos consistentes com o layout não disparam', () => {
  const r = valida(lista(match('/a1', formulario('Nome: [[nome]]\nCNJ: [[cnj]]', '          fields:\n            cnj:\n              default: "0"\n')).replace('"texto"', '"{{form1.nome}} {{form1.cnj}}"')));
  semProblemas(r);
});

// ---------------------------------------------------------------------------
// (data) e (locale)
// ---------------------------------------------------------------------------

const data = (params) => lista(match('/a1', `    vars:\n      - name: d\n        type: date\n${params}`).replace('"texto"', '"{{d}}"'));

test('data: var date sem params.format', () => {
  assert.deepEqual(regras(valida(data('')).erros), ['data']);
  assert.deepEqual(regras(valida(data('        params:\n          offset: 10\n')).erros), ['data']);
});

test('data: var date com format não dispara', () => {
  semProblemas(valida(data('        params:\n          format: "%d/%m/%Y"\n')));
});

test('locale: %B ou %A sem locale pt-BR é aviso', () => {
  for (const formato of ['%-d de %B de %Y', '%A, %d']) {
    const r = valida(data(`        params:\n          format: "${formato}"\n`));
    assert.deepEqual(r.erros, [], formato);
    assert.deepEqual(regras(r.avisos), ['locale'], formato);
  }
  const outroLocale = valida(data('        params:\n          format: "%B"\n          locale: "en-US"\n'));
  assert.deepEqual(regras(outroLocale.avisos), ['locale']);
});

test('locale: com locale pt-BR, ou sem %B e %A, não dispara', () => {
  semProblemas(valida(data('        params:\n          format: "%-d de %B de %Y"\n          locale: "pt-BR"\n')));
  semProblemas(valida(data('        params:\n          format: "%d/%m/%Y"\n')));
});

// ---------------------------------------------------------------------------
// Pessoais: (conflito-pessoal)
// ---------------------------------------------------------------------------

const pessoal = (...triggers) => [{ nome: 'pessoal.yml', conteudo: lista(...triggers.map((t) => match(t))) }];

test('conflito-pessoal: trigger igual a um oficial vira aviso, nunca erro', () => {
  const r = valida(lista(match('/cont')), { pessoais: pessoal('/cont') });
  assert.deepEqual(r.erros, []);
  const a = doRegra(r.avisos, 'conflito-pessoal');
  assert.equal(a.length, 1);
  assert.equal(a[0].arquivo, 'pessoal.yml');
  assert.match(a[0].mensagem, /\/cont/);
  assert.match(a[0].mensagem, /a\.yml/);
});

test('conflito-pessoal: pessoal que é prefixo do oficial, e o contrário', () => {
  const pessoalCurto = valida(lista(match('/contestacao')), { pessoais: pessoal('/cont') });
  assert.deepEqual(pessoalCurto.erros, []);
  assert.equal(doRegra(pessoalCurto.avisos, 'conflito-pessoal').length, 1);
  assert.match(pessoalCurto.avisos[0].mensagem, /\/cont\b.*\/contestacao/);

  const oficialCurto = valida(lista(match('/cont')), { pessoais: pessoal('/contestacao') });
  assert.deepEqual(oficialCurto.erros, []);
  assert.equal(doRegra(oficialCurto.avisos, 'conflito-pessoal').length, 1);
});

test('conflito-pessoal: pessoal sem conflito não gera nada e não entra em snippets', () => {
  const r = valida(lista(match('/cont')), { pessoais: pessoal('/ola') });
  semProblemas(r);
  assert.deepEqual(r.snippets.map((s) => s.trigger), ['/cont']);
});

test('conflito-pessoal: pessoal.yml inicial só com comentários é aceito', () => {
  const r = valida(lista(match('/cont')), { pessoais: [{ nome: 'pessoal.yml', conteudo: '# meus atalhos\n# exemplo comentado\n' }] });
  semProblemas(r);
});

test('conflito-pessoal: pessoal com YAML inválido vira aviso, não erro', () => {
  const r = valida(lista(match('/cont')), { pessoais: [{ nome: 'pessoal.yml', conteudo: 'matches:\n  - trigger: "/x\n' }] });
  assert.deepEqual(r.erros, []);
  assert.deepEqual(regras(r.avisos), ['pessoal-invalido']);
});

test('conflito-pessoal: a linha do aviso aponta para o trigger do pessoal', () => {
  const r = valida(lista(match('/cont')), { pessoais: [{ nome: 'pessoal.yml', conteudo: '# comentário\nmatches:\n  - trigger: "/cont"\n    label: "x"\n    replace: "y"\n' }] });
  assert.equal(doRegra(r.avisos, 'conflito-pessoal')[0].linha, 3);
});

test('conflito entre dois oficiais continua sendo erro mesmo com pessoais informados', () => {
  const r = valida(lista(match('/cont'), match('/contestacao')), { pessoais: pessoal('/ola') });
  assert.equal(doRegra(r.erros, 'trigger-prefixo').length, 1);
});

// ---------------------------------------------------------------------------
// Números de linha
// ---------------------------------------------------------------------------

test('linhas: o erro aponta para a linha do match (1 = primeira linha)', () => {
  const conteudo = 'matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: "y"\n  - trigger: "ERRADO"\n    label: "x"\n    replace: "y"\n';
  const r = valida(conteudo);
  assert.equal(doRegra(r.erros, 'trigger-formato')[0].linha, 5);
});

// ---------------------------------------------------------------------------
// Snippet: tipo, campos e preview
// ---------------------------------------------------------------------------

const unico = (conteudo) => {
  const r = valida(conteudo);
  assert.equal(r.snippets.length, 1);
  return r.snippets[0];
};

test('tipo: texto, formatado, data, escolha, formulário e misto', () => {
  assert.equal(unico(lista(match('/a1'))).tipo, 'texto');
  assert.equal(unico('matches:\n  - trigger: "/a1"\n    label: "x"\n    html: "<p>oi</p>"\n').tipo, 'formatado');
  assert.equal(unico('matches:\n  - trigger: "/a1"\n    label: "x"\n    markdown: "**oi**"\n').tipo, 'formatado');
  assert.equal(unico(data('        params:\n          format: "%d"\n')).tipo, 'data');
  assert.equal(unico(lista(match('/a1', '    vars:\n      - name: c\n        type: choice\n        params:\n          values:\n            - "um"\n').replace('"texto"', '"{{c}}"'))).tipo, 'escolha');
  assert.equal(unico(lista(match('/a1', formulario('Nome: [[nome]]')).replace('"texto"', '"{{form1.nome}}"'))).tipo, 'formulario');
  const misto = 'matches:\n  - trigger: "/a1"\n    label: "x"\n    html: "<p>{{form1.nome}}</p>"\n' + formulario('Nome: [[nome]]');
  assert.equal(unico(misto).tipo, 'misto');
});

test('tipo: uma data ao lado de um formulário não torna o snippet misto', () => {
  const vars = formulario('Nome: [[nome]]') + '      - name: d\n        type: date\n        params:\n          format: "%d"\n';
  assert.equal(unico(lista(match('/a1', vars).replace('"texto"', '"{{form1.nome}} {{d}}"'))).tipo, 'formulario');
});

test('campos: nome, tipo e opções do formulário e da escolha', () => {
  const layout = 'Nome: [[nome]]\nObs: [[obs]]\nTipo: [[tipo]]';
  const fields = '          fields:\n            obs:\n              multiline: true\n            tipo:\n              type: choice\n              values:\n                - "a"\n                - "b"\n';
  const s = unico(lista(match('/a1', formulario(layout, fields)).replace('"texto"', '"{{form1.nome}}{{form1.obs}}{{form1.tipo}}"')));
  assert.deepEqual(s.campos, [
    { nome: 'nome', tipo: 'texto' },
    { nome: 'obs', tipo: 'texto-longo' },
    { nome: 'tipo', tipo: 'lista', opcoes: ['a', 'b'] },
  ]);

  const escolha = unico(lista(match('/a1', '    vars:\n      - name: p\n        type: choice\n        params:\n          values:\n            - label: "Curto"\n              id: "texto longo"\n').replace('"texto"', '"{{p}}"')));
  assert.deepEqual(escolha.campos, [{ nome: 'p', tipo: 'escolha', opcoes: ['Curto'] }]);
});

test('preview: {{var}} vira [var] e {{form.campo}} vira [campo]', () => {
  const s = unico(lista(match('/a1', formulario('Nome: [[nome]]') + '      - name: d\n        type: date\n        params:\n          format: "%d"\n').replace('"texto"', '"Parte {{form1.nome}} em {{d}}"')));
  assert.equal(s.preview, 'Parte [nome] em [d]');
});

test('preview: html vira texto puro, sem etiquetas', () => {
  const s = unico('matches:\n  - trigger: "/a1"\n    label: "x"\n    html: "<p><b>TÍTULO</b></p><ol><li>um &amp; dois</li><li>três</li></ol>"\n');
  assert.equal(s.preview, 'TÍTULO\num & dois\ntrês');
});

test('preview: no máximo 300 caracteres', () => {
  const longo = 'palavra '.repeat(100).trim();
  const s = unico(`matches:\n  - trigger: "/a1"\n    label: "x"\n    replace: "${longo}"\n`);
  assert.ok(s.preview.length <= 300, `tamanho ${s.preview.length}`);
  assert.ok(s.preview.endsWith('…'));
  const curto = unico(lista(match('/a1')));
  assert.equal(curto.preview, 'texto');
});

test('categoria: nome do arquivo sem .yml', () => {
  const r = validarBiblioteca([arq(lista(match('/a1')), 'medicamentos.yml')]);
  assert.equal(r.snippets[0].categoria, 'medicamentos');
  assert.equal(r.snippets[0].arquivo, 'medicamentos.yml');
  assert.equal(r.snippets[0].pasta, ''); // na raiz
});

// Marco 10: o nome do arquivo é o caminho relativo, com "/".

test('pasta e categoria: o caminho da pasta e o caminho do arquivo sem a extensão', () => {
  const r = validarBiblioteca([
    arq(lista(match('/a1')), 'exemplos.yml'),
    arq(lista(match('/b1')), 'Medicamentos/contestacao.yml'),
    arq(lista(match('/c1')), 'Medicamentos/Recursos/agravo.yml'),
  ]);
  const por = (t) => r.snippets.find((s) => s.trigger === t);
  assert.deepEqual([por('/a1').pasta, por('/a1').categoria], ['', 'exemplos']);
  assert.deepEqual([por('/b1').pasta, por('/b1').categoria], ['Medicamentos', 'Medicamentos/contestacao']);
  assert.deepEqual([por('/c1').pasta, por('/c1').categoria], ['Medicamentos/Recursos', 'Medicamentos/Recursos/agravo']);
  assert.equal(por('/c1').arquivo, 'Medicamentos/Recursos/agravo.yml');
  assert.deepEqual(r.erros, []);
});

test('caminho-profundo: até 3 níveis de pastas é aceito; o 4º é erro e cita o caminho', () => {
  for (const nome of ['a.yml', 'A/a.yml', 'A/B/a.yml', 'A/B/C/a.yml']) {
    semProblemas(validarBiblioteca([arq(lista(match('/a1')), nome)]));
  }
  const r = validarBiblioteca([arq(lista(match('/a1')), 'A/B/C/D/x.yml')]);
  assert.deepEqual(regras(r.erros), ['caminho-profundo']);
  assert.equal(r.erros[0].arquivo, 'A/B/C/D/x.yml');
  assert.equal(r.erros[0].linha, null);
  assert.match(r.erros[0].mensagem, /A\/B\/C\/D\/x\.yml/);
  assert.match(r.erros[0].mensagem, /4 níveis/);
  assert.match(r.erros[0].mensagem, /máximo é 3/);
  // Mais fundo ainda também é erro.
  assert.deepEqual(regras(validarBiblioteca([arq(lista(match('/a1')), '1/2/3/4/5/6/x.yml')]).erros), ['caminho-profundo']);
});

test('caminho-profundo: o arquivo fundo continua sendo validado (os outros erros aparecem junto)', () => {
  const r = validarBiblioteca([arq(lista(match('/a1')), 'raiz.yml'), arq(lista(match('/a1')), 'A/B/C/D/x.yml')]);
  assert.deepEqual(regras(r.erros).sort(), ['caminho-profundo', 'trigger-duplicado']);
});

test('conflitos entre pastas citam o arquivo com o caminho relativo', () => {
  const dup = validarBiblioteca([arq(lista(match('/cont')), 'raiz.yml'), arq(lista(match('/cont')), 'Medicamentos/contestacao.yml')]);
  const d = doRegra(dup.erros, 'trigger-duplicado')[0];
  assert.equal(d.arquivo, 'Medicamentos/contestacao.yml');
  assert.match(d.mensagem, /raiz\.yml:2/);

  const pre = validarBiblioteca([arq(lista(match('/cont')), 'raiz.yml'), arq(lista(match('/contestacao')), 'Medicamentos/contestacao.yml')]);
  const p = doRegra(pre.erros, 'trigger-prefixo')[0];
  assert.match(p.mensagem, /\/cont \(raiz\.yml:2\)/);
  assert.match(p.mensagem, /\/contestacao \(Medicamentos\/contestacao\.yml:2\)/);
  assert.deepEqual(p.arquivos, ['raiz.yml', 'Medicamentos/contestacao.yml']);
});

test('BOM no início do arquivo é tolerado', () => {
  semProblemas(valida(`﻿${lista(match('/a1'))}`));
});

// ---------------------------------------------------------------------------
// Dados extras usados pela Biblioteca (Marco 5)
// ---------------------------------------------------------------------------

test('snippet traz formato, saída bruta e as datas (nome, formato e offset)', () => {
  const r = valida(lista(match('/a1', '    vars:\n      - name: d\n        type: date\n        params:\n          format: "%d/%m/%Y"\n          offset: 1296000\n').replace('"texto"', '"Em {{d}}"')));
  const s = r.snippets[0];
  assert.equal(s.formato, 'replace');
  assert.equal(s.saida, 'Em {{d}}');
  assert.deepEqual(s.datas, [{ nome: 'd', formato: '%d/%m/%Y', offset: 1296000 }]);
});

test('snippet html e markdown: formato correspondente e sem datas', () => {
  assert.equal(unico('matches:\n  - trigger: "/a1"\n    label: "x"\n    html: "<p>oi</p>"\n').formato, 'html');
  assert.equal(unico('matches:\n  - trigger: "/a1"\n    label: "x"\n    markdown: "**oi**"\n').formato, 'markdown');
  assert.deepEqual(unico(lista(match('/a1'))).datas, []);
});

test('trigger-duplicado e trigger-prefixo trazem os triggers e arquivos envolvidos', () => {
  const dup = validarBiblioteca([arq(lista(match('/cont')), 'a.yml'), arq(lista(match('/cont')), 'pessoal.yml')]);
  const d = doRegra(dup.erros, 'trigger-duplicado')[0];
  assert.deepEqual(d.triggers, ['/cont', '/cont']);
  assert.deepEqual(d.arquivos, ['a.yml', 'pessoal.yml']);

  const pre = validarBiblioteca([arq(lista(match('/cont')), 'a.yml'), arq(lista(match('/contestacao')), 'pessoal.yml')]);
  const p = doRegra(pre.erros, 'trigger-prefixo')[0];
  assert.deepEqual(p.triggers, ['/cont', '/contestacao']);
  assert.deepEqual(p.arquivos, ['a.yml', 'pessoal.yml']);
});
