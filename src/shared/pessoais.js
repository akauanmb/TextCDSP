'use strict';

// Atalhos pessoais de texto simples: validação do formulário, leitura do pessoal.yml e a função pura
// aplicarAlteracaoPessoal, que cria, edita ou exclui um match preservando comentários, ordem e os
// matches escritos à mão. Não acessa disco: recebe e devolve o texto do arquivo.

const { parseDocument, LineCounter, Scalar, isMap, isSeq, isScalar } = require('yaml');
const { PADRAO_TRIGGER, PREFIXOS_TRIGGER, TEXTO_FORMATO_TRIGGER, exemplosDeAtalho } = require('./validador');

const CHAVES_EDITAVEIS = ['trigger', 'label', 'replace'];

// Erro de uma alteração que não pode ser feita. `codigo`:
//   "yaml-invalido"  o arquivo atual tem erro de sintaxe (traz `linha`)
//   "estrutura"      o arquivo não tem o formato esperado (matches como lista)
//   "ja-existe"      já há um atalho pessoal com esse trigger
//   "nao-encontrado" o atalho a editar ou excluir não existe
//   "nao-editavel"   o atalho foi escrito à mão (tem variáveis ou chaves extras) e não pode ser mexido pela janela
class ErroPessoal extends Error {
  constructor(codigo, mensagem, extra = {}) {
    super(mensagem);
    this.name = 'ErroPessoal';
    this.codigo = codigo;
    Object.assign(this, extra);
  }
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

// Minúsculas e sem espaços nas pontas. Só acrescenta a barra inicial quando a pessoa começou por uma letra
// ou um número ("ola" vira "/ola"). Um atalho que já começa por um caractere permitido fica como está, e um
// que começa por qualquer outro caractere (ex.: "@ola") também: a validação o recusa, em vez de o app
// escondê-lo atrás de uma barra ("/@ola").
function normalizarTrigger(entrada) {
  const t = String(entrada == null ? '' : entrada).trim().toLowerCase();
  if (t === '' || PREFIXOS_TRIGGER.includes(t[0])) return t;
  return /^[\p{L}\p{N}]/u.test(t) ? `/${t}` : t;
}

/**
 * Confere os campos do formulário. Devolve { valor, erros } onde `erros` tem uma mensagem por campo
 * com problema (trigger, label, texto). `valor` traz os campos já normalizados.
 */
function validarCamposPessoais({ trigger, label, texto } = {}) {
  const erros = {};
  const valor = {
    trigger: normalizarTrigger(trigger),
    label: String(label == null ? '' : label).trim(),
    texto: String(texto == null ? '' : texto).replace(/\r\n?/g, '\n'),
  };

  if (valor.trigger === '') {
    erros.trigger = `Informe o atalho (por exemplo, ${exemplosDeAtalho('ola')}).`;
  } else if (!PADRAO_TRIGGER.test(valor.trigger)) {
    erros.trigger = `Atalho inválido: ${TEXTO_FORMATO_TRIGGER} (por exemplo, ${exemplosDeAtalho('ola')}).`;
  }
  if (valor.label === '') erros.label = 'Informe o nome do atalho (ele aparece na lista e na busca).';
  if (valor.texto.trim() === '') erros.texto = 'Escreva o texto que o atalho vai inserir.';
  else if (valor.texto.includes('{{') || valor.texto.includes('}}')) {
    erros.texto = 'O texto não pode conter "{{" nem "}}": o Espanso interpretaria como uma variável.';
  }
  return { valor, erros };
}

/**
 * A partir dos erros de validarBiblioteca (feita com o arquivo pessoal já alterado), devolve as
 * mensagens de conflito que envolvem o atalho informado. Só conta trigger-duplicado e trigger-prefixo.
 */
function conflitosDoAtalho(erros, trigger, arquivoPessoal = 'pessoal.yml') {
  const mensagens = [];
  for (const e of erros) {
    if ((e.regra !== 'trigger-duplicado' && e.regra !== 'trigger-prefixo') || !e.triggers || !e.arquivos) continue;
    const i = e.triggers.findIndex((t, k) => t === trigger && e.arquivos[k] === arquivoPessoal);
    if (i === -1) continue;
    const outro = e.triggers[1 - i];
    const origem = e.arquivos[1 - i] === arquivoPessoal ? 'pessoal' : 'oficial';
    let mensagem;
    if (e.regra === 'trigger-duplicado') {
      mensagem = `Já existe o atalho ${origem} ${outro}. Escolha outro atalho.`;
    } else if (i === 0) {
      mensagem = `Já existe o atalho ${origem} ${outro}, que começa com ${trigger}: o seu atalho dispararia antes dele e o ${outro} deixaria de funcionar. Escolha outro atalho.`;
    } else {
      mensagem = `Já existe o atalho ${origem} ${outro}, que é o começo de ${trigger}: ele dispararia antes e o seu atalho nunca funcionaria. Escolha outro atalho.`;
    }
    if (!mensagens.includes(mensagem)) mensagens.push(mensagem);
  }
  return mensagens;
}

// ---------------------------------------------------------------------------
// Leitura do arquivo
// ---------------------------------------------------------------------------

function abrirDocumento(conteudo) {
  const texto = String(conteudo == null ? '' : conteudo).replace(/^﻿/, '');
  const contador = new LineCounter();
  const documento = parseDocument(texto, { lineCounter: contador });
  const linhaDe = (no) => (no && no.range ? contador.linePos(no.range[0]).line : null);
  return { documento, linhaDe };
}

function erroDeYaml(documento) {
  if (documento.errors.length === 0) return null;
  const e = documento.errors[0];
  const linha = e.linePos && e.linePos[0] ? e.linePos[0].line : null;
  const detalhe = String(e.message).split('\n')[0].replace(/\s+at line \d+, column \d+:?\s*$/, '');
  return { linha, mensagem: `Seu arquivo de atalhos pessoais tem um erro${linha ? ` na linha ${linha}` : ''}.`, detalhe };
}

function valorDoPar(no, chave) {
  if (!isMap(no)) return undefined;
  const par = no.items.find((p) => isScalar(p.key) && p.key.value === chave);
  return par ? par.value : undefined;
}

// Um match é "editável" pela janela quando só tem trigger, label e replace, todos textos.
function ehEditavel(no) {
  if (!isMap(no)) return false;
  const chaves = no.items.map((p) => (isScalar(p.key) ? String(p.key.value) : null));
  if (chaves.length !== CHAVES_EDITAVEIS.length || !CHAVES_EDITAVEIS.every((c) => chaves.includes(c))) return false;
  return CHAVES_EDITAVEIS.every((c) => {
    const v = valorDoPar(no, c);
    return isScalar(v) && typeof v.value === 'string';
  });
}

/**
 * Lê o pessoal.yml. Devolve { valido, erro, matches }:
 *   valido  false se o YAML tem erro (então `erro` = { linha, mensagem, detalhe })
 *   matches [{ trigger, label, texto, editavel, linha }]; `texto` e `label` só vêm nos editáveis
 * Um arquivo só com comentários é válido e não tem matches.
 */
function lerPessoais(conteudo) {
  const { documento, linhaDe } = abrirDocumento(conteudo);
  const erro = erroDeYaml(documento);
  if (erro) return { valido: false, erro, matches: [] };

  const matches = [];
  const raiz = documento.contents;
  const seq = isMap(raiz) ? valorDoPar(raiz, 'matches') : null;
  if (isSeq(seq)) {
    for (const item of seq.items) {
      const t = valorDoPar(item, 'trigger');
      if (!isScalar(t) || typeof t.value !== 'string') continue;
      const editavel = ehEditavel(item);
      matches.push({
        trigger: t.value,
        editavel,
        label: editavel ? valorDoPar(item, 'label').value : null,
        texto: editavel ? valorDoPar(item, 'replace').value : null,
        linha: linhaDe(item),
      });
    }
  }
  return { valido: true, erro: null, matches };
}

// ---------------------------------------------------------------------------
// Alteração do arquivo
// ---------------------------------------------------------------------------

// Texto de várias linhas vira bloco literal (|-); o resto, texto entre aspas duplas (aguenta : # " e acentos).
function escalar(valor) {
  const s = new Scalar(valor);
  s.type = valor.includes('\n') ? 'BLOCK_LITERAL' : 'QUOTE_DOUBLE';
  return s;
}

function acharMatch(seq, trigger) {
  return seq.items.findIndex((item) => {
    const t = valorDoPar(item, 'trigger');
    return isScalar(t) && t.value === trigger;
  });
}

function definirChave(mapa, chave, escalarNovo) {
  const par = mapa.items.find((p) => isScalar(p.key) && p.key.value === chave);
  if (par && isScalar(par.value)) {
    // Mantém os comentários que já estavam presos ao valor.
    par.value.value = escalarNovo.value;
    par.value.type = escalarNovo.type;
  } else if (par) {
    par.value = escalarNovo;
  } else {
    mapa.set(new Scalar(chave), escalarNovo);
  }
}

/**
 * @param {string} conteudoYaml  texto atual do pessoal.yml
 * @param {{tipo: "criar"|"editar"|"excluir", triggerOriginal?: string, trigger?: string, label?: string, texto?: string}} operacao
 *   criar: trigger, label, texto.  editar: triggerOriginal + trigger, label, texto.  excluir: triggerOriginal.
 * @returns {string} o novo conteúdo. Lança ErroPessoal se não puder alterar sem risco.
 */
function aplicarAlteracaoPessoal(conteudoYaml, operacao) {
  const { documento } = abrirDocumento(conteudoYaml);
  const erro = erroDeYaml(documento);
  if (erro) throw new ErroPessoal('yaml-invalido', erro.mensagem, { linha: erro.linha, detalhe: erro.detalhe });

  const { tipo } = operacao;
  if (tipo !== 'criar' && tipo !== 'editar' && tipo !== 'excluir') throw new Error(`Operação desconhecida: ${tipo}`);

  // Garante `matches:` como lista (um arquivo só com comentários ainda não tem nada).
  if (documento.contents === null || documento.contents === undefined) documento.contents = documento.createNode({});
  if (!isMap(documento.contents)) throw new ErroPessoal('estrutura', 'O arquivo de atalhos pessoais precisa ter a lista "matches:" na raiz.');
  let seq = documento.get('matches', true);
  if (seq === undefined || seq === null || (isScalar(seq) && seq.value === null)) {
    if (tipo !== 'criar') throw new ErroPessoal('nao-encontrado', `O atalho ${operacao.triggerOriginal} não foi encontrado no arquivo.`);
    documento.set('matches', documento.createNode([]));
    seq = documento.get('matches', true);
  }
  if (!isSeq(seq)) throw new ErroPessoal('estrutura', '"matches" precisa ser uma lista no arquivo de atalhos pessoais.');
  if (seq.flow && seq.items.length === 0) seq.flow = false; // "matches: []" vira lista em bloco

  if (tipo === 'criar') {
    if (acharMatch(seq, operacao.trigger) !== -1) throw new ErroPessoal('ja-existe', `Já existe o atalho pessoal ${operacao.trigger}.`);
    const mapa = documento.createNode({});
    mapa.set(new Scalar('trigger'), escalar(operacao.trigger));
    mapa.set(new Scalar('label'), escalar(operacao.label));
    mapa.set(new Scalar('replace'), escalar(operacao.texto));
    seq.add(mapa);
  } else {
    const indice = acharMatch(seq, operacao.triggerOriginal);
    if (indice === -1) throw new ErroPessoal('nao-encontrado', `O atalho ${operacao.triggerOriginal} não foi encontrado no arquivo.`);
    const item = seq.items[indice];
    if (!ehEditavel(item)) {
      throw new ErroPessoal('nao-editavel', `O atalho ${operacao.triggerOriginal} foi escrito direto no arquivo (tem variáveis ou opções extras) e só pode ser alterado lá.`);
    }
    if (tipo === 'excluir') {
      seq.items.splice(indice, 1);
    } else {
      if (operacao.trigger !== operacao.triggerOriginal && acharMatch(seq, operacao.trigger) !== -1) {
        throw new ErroPessoal('ja-existe', `Já existe o atalho pessoal ${operacao.trigger}.`);
      }
      definirChave(item, 'trigger', escalar(operacao.trigger));
      definirChave(item, 'label', escalar(operacao.label));
      definirChave(item, 'replace', escalar(operacao.texto));
    }
  }
  // lineWidth 0: não quebra linhas longas, para não mexer no formato dos outros matches.
  return documento.toString({ lineWidth: 0 });
}

module.exports = { ErroPessoal, normalizarTrigger, validarCamposPessoais, conflitosDoAtalho, lerPessoais, aplicarAlteracaoPessoal };
