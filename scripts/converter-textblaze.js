'use strict';

// Converte uma exportação do Text Blaze (JSON) nos snippets oficiais do TextCDSP (YAML do Espanso).
// Uso:  node scripts/converter-textblaze.js <arquivo.json> [pasta-de-destino]      (padrão: snippets-oficiais)
//
// Entrada: lista de { nome, atalho, pasta, conteudo }.
// Saída:   um arquivo YAML por pasta do Text Blaze, na raiz da pasta de destino (a Biblioteca mostra cada um como
//          uma pasta que abre e fecha, com o total de snippets).
//
// O que cada comando do Text Blaze vira (docs/PLANO.md, Trilha C: "partes variáveis viram campos de formulário;
// escolhas viram var choice"; o texto jurídico não é alterado além disso):
//   {formtext: name=X}                  campo de texto num formulário ({{form1.x}})
//   {formparagraph: name=X}             campo de texto longo (multiline)
//   {formtoggle: name=X}...{endformtoggle}   escolha "Não incluir: X" / "Incluir: X"; o id da opção é o trecho
//   {time: DD/MM/YYYY}                  variável de data (%d/%m/%Y)
//   {clipboard}                         variável da área de transferência
// Qualquer outra coisa entre chaves fica como texto. O atalho perde acento, ponto e maiúscula (o validador só
// aceita letras minúsculas sem acento e números depois do primeiro caractere). Os avisos do que foi preciso mudar
// ou do que não pôde ser convertido saem no relatório. Sem dependência nova: usa o `yaml` já aprovado.

const fs = require('node:fs');
const path = require('node:path');
const { Document, Scalar, visit, parse } = require('yaml');
const { validarBiblioteca, PREFIXOS_TRIGGER } = require('../src/shared/validador');

const PASTA_PADRAO = 'snippets-oficiais';

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------
// Atalho
// ---------------------------------------------------------------------------

/** Mantém o primeiro caractere (o prefixo) e normaliza o resto: minúsculas, sem acento, só letras e números. */
function normalizarAtalho(atalho) {
  const original = String(atalho).trim();
  const prefixo = original[0];
  const corpo = semAcento(original.slice(1)).toLowerCase().replace(/[^a-z0-9]/g, '');
  const trigger = `${prefixo}${corpo}`;
  return { trigger, alterado: trigger !== original };
}

// ---------------------------------------------------------------------------
// Comandos do Text Blaze
// ---------------------------------------------------------------------------

// Só estes comandos são convertidos. {PRINT} e qualquer outra coisa entre chaves ficam como texto.
const PADRAO_COMANDO = /\{(formtext|formparagraph|formtoggle|time):([^}]*)\}|\{(endformtoggle|clipboard)\}/g;

function tokenizar(texto) {
  const tokens = [];
  let fim = 0;
  for (const m of texto.matchAll(PADRAO_COMANDO)) {
    if (m.index > fim) tokens.push({ tipo: 'texto', valor: texto.slice(fim, m.index) });
    tokens.push({ tipo: 'comando', nome: m[1] || m[3], params: m[2] === undefined ? '' : m[2], bruto: m[0] });
    fim = m.index + m[0].length;
  }
  if (fim < texto.length) tokens.push({ tipo: 'texto', valor: texto.slice(fim) });
  return tokens;
}

// "name=Erro médico, exclusivamente; default=no" -> { name: "Erro médico, exclusivamente", default: "no" }
function lerParametros(params) {
  const resultado = {};
  for (const parte of String(params).split(/;\s*(?=[a-z]+=)/i)) {
    const i = parte.indexOf('=');
    if (i > 0) resultado[parte.slice(0, i).trim().toLowerCase()] = parte.slice(i + 1);
  }
  return resultado;
}

// O nome pode vir com uma barra e um espaço sobrando no fim ("Transcrição das opções\ ").
const limparNome = (nome) => String(nome || '').replace(/\\\s*$/, '').trim();

// Identificador seguro para {{form1.campo}}: minúsculas, sem acento, só letras, números e "_".
function identificador(nome, usados, base = 'campo') {
  let id = semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/g, '');
  if (!id) id = base;
  let candidato = id;
  for (let n = 2; usados.has(candidato); n += 1) candidato = `${id}_${n}`;
  usados.add(candidato);
  return candidato;
}

const TOKENS_DE_TEMPO = [
  ['YYYY', '%Y'], ['YY', '%y'], ['MMMM', '%B'], ['MMM', '%b'], ['MM', '%m'], ['M', '%-m'],
  ['DD', '%d'], ['D', '%-d'], ['dddd', '%A'], ['HH', '%H'], ['hh', '%I'], ['mm', '%M'], ['ss', '%S'],
];

/** DD/MM/YYYY -> %d/%m/%Y. Devolve null se sobrar letra que não foi convertida. */
function converterFormatoDeTempo(formato) {
  let resto = String(formato).trim();
  let saida = '';
  while (resto.length > 0) {
    const achado = TOKENS_DE_TEMPO.find(([de]) => resto.startsWith(de));
    if (achado) {
      saida += achado[1];
      resto = resto.slice(achado[0].length);
    } else if (/[A-Za-z]/.test(resto[0])) {
      return null;
    } else {
      saida += resto[0];
      resto = resto.slice(1);
    }
  }
  return saida;
}

// Qualquer outro {comando} do Text Blaze que sobrou fica como texto: avisa, para alguém conferir se era mesmo texto.
const PADRAO_COMANDO_DESCONHECIDO = /(?<!\{)\{[A-Za-z_]+(?::[^}]*)?\}(?!\})/g;
const COMANDOS_CONHECIDOS = ['formtext', 'formparagraph', 'formtoggle', 'endformtoggle', 'time', 'clipboard'];
function avisarDesconhecidos(texto, avisos) {
  for (const m of texto.matchAll(PADRAO_COMANDO_DESCONHECIDO)) {
    // Um comando conhecido que falhou (ex.: toggle sem fim) já tem o próprio aviso.
    if (COMANDOS_CONHECIDOS.includes(m[0].slice(1).split(/[:}]/)[0])) continue;
    avisos.push(`"${m[0].slice(0, 40)}" não é um comando que o conversor conheça e ficou como texto`);
  }
}

/**
 * Converte o conteúdo de um snippet.
 * @returns {{replace: string, vars: object[], avisos: string[]}}
 */
function converterConteudo(conteudo) {
  const avisos = [];
  const tokens = tokenizar(String(conteudo));
  const saida = [];
  const pilha = []; // toggles abertos
  const formCampos = []; // { id, rotulo, multiline, padrao }
  const idsDosCampos = new Set();
  const campoPorNome = new Map();
  const outrasVars = []; // escolhas, datas e área de transferência, na ordem em que aparecem
  const nomesDeVar = new Set();
  let variavelArea = null;
  const datas = new Map(); // formato -> nome

  const emitir = (texto) => {
    if (pilha.length > 0) pilha[pilha.length - 1].corpo += texto;
    else saida.push(texto);
  };
  const dentroDeToggle = (o) => {
    if (pilha.length > 0) avisos.push(`${o} dentro de um bloco {formtoggle}: o texto da opção terá uma variável dentro; confira à mão`);
  };

  for (const t of tokens) {
    if (t.tipo === 'texto') {
      emitir(t.valor);
      continue;
    }
    switch (t.nome) {
      case 'formtext':
      case 'formparagraph': {
        const p = lerParametros(t.params);
        const nome = limparNome(p.name);
        if (!nome) {
          avisos.push(`${t.bruto} sem nome: ficou como texto`);
          emitir(t.bruto);
          break;
        }
        const chave = nome.toLowerCase();
        let campo = campoPorNome.get(chave);
        if (!campo) {
          campo = { id: identificador(nome, idsDosCampos), rotulo: nome, multiline: t.nome === 'formparagraph', padrao: p.default ? p.default : '' };
          campoPorNome.set(chave, campo);
          formCampos.push(campo);
        }
        dentroDeToggle('Campo de formulário');
        emitir(`{{form1.${campo.id}}}`);
        break;
      }
      case 'formtoggle': {
        const p = lerParametros(t.params);
        pilha.push({ nome: limparNome(p.name) || 'opção', padraoSim: /^(yes|sim|true)$/i.test((p.default || '').trim()), corpo: '' });
        break;
      }
      case 'endformtoggle': {
        const aberto = pilha.pop();
        if (!aberto) {
          avisos.push('{endformtoggle} sem {formtoggle}: ficou como texto');
          emitir(t.bruto);
          break;
        }
        avisarDesconhecidos(aberto.corpo, avisos);
        const nomeDaVar = identificador(`opcao ${outrasVars.filter((v) => v.type === 'choice').length + 1}`, nomesDeVar);
        const nao = { label: `Não incluir: ${aberto.nome}`, id: '' };
        const sim = { label: `Incluir: ${aberto.nome}`, id: aberto.corpo };
        outrasVars.push({ name: nomeDaVar, type: 'choice', params: { values: aberto.padraoSim ? [sim, nao] : [nao, sim] } });
        emitir(`{{${nomeDaVar}}}`);
        break;
      }
      case 'time': {
        const formato = converterFormatoDeTempo(t.params);
        if (formato === null) {
          avisos.push(`${t.bruto}: formato de data desconhecido; ficou como texto`);
          emitir(t.bruto);
          break;
        }
        let nome = datas.get(formato);
        if (!nome) {
          nome = identificador('hoje', nomesDeVar);
          datas.set(formato, nome);
          const params = { format: formato };
          if (/%[BAb]/.test(formato)) params.locale = 'pt-BR';
          outrasVars.push({ name: nome, type: 'date', params });
        }
        dentroDeToggle('Data');
        emitir(`{{${nome}}}`);
        break;
      }
      case 'clipboard': {
        if (!variavelArea) {
          variavelArea = identificador('area de transferencia', nomesDeVar);
          outrasVars.push({ name: variavelArea, type: 'clipboard' });
        }
        dentroDeToggle('{clipboard}');
        emitir(`{{${variavelArea}}}`);
        break;
      }
      default:
        emitir(t.bruto);
    }
  }
  while (pilha.length > 0) {
    const sobra = pilha.pop();
    avisos.push(`{formtoggle: ${sobra.nome}} sem {endformtoggle}: o trecho ficou como texto`);
    emitir(`{formtoggle: name=${sobra.nome}}${sobra.corpo}`);
  }

  const texto = saida.join('');
  avisarDesconhecidos(texto, avisos);

  const vars = [];
  if (formCampos.length > 0) {
    const fields = {};
    for (const c of formCampos) {
      const def = {};
      if (c.multiline) def.multiline = true;
      if (c.padrao) def.default = c.padrao;
      if (Object.keys(def).length > 0) fields[c.id] = def;
    }
    const params = { layout: `${formCampos.map((c) => `${c.rotulo}: [[${c.id}]]`).join('\n')}\n` };
    if (Object.keys(fields).length > 0) params.fields = fields;
    vars.push({ name: 'form1', type: 'form', params });
  }
  vars.push(...outrasVars);
  return { replace: texto, vars, avisos };
}

// ---------------------------------------------------------------------------
// Conjunto
// ---------------------------------------------------------------------------

function nomeDeArquivo(pasta) {
  return `${String(pasta).replace(/[<>:"/\\|?*]/g, '-').trim()}.yml`;
}

/**
 * @param {{nome: string, atalho: string, pasta: string, conteudo: string}[]} itens
 * @returns {{arquivos: Map<string, object[]>, atalhosAlterados: object[], avisos: object[]}}
 */
function converterTudo(itens) {
  const arquivos = new Map();
  const atalhosAlterados = [];
  const avisos = [];
  for (const item of itens) {
    const prefixo = String(item.atalho).trim()[0];
    if (!PREFIXOS_TRIGGER.includes(prefixo)) {
      avisos.push({ atalho: item.atalho, mensagem: `o atalho começa com "${prefixo}", que não está na lista permitida (${PREFIXOS_TRIGGER.join(' ')})` });
    }
    const { trigger, alterado } = normalizarAtalho(item.atalho);
    if (alterado) atalhosAlterados.push({ de: item.atalho, para: trigger, nome: item.nome });
    const convertido = converterConteudo(item.conteudo);
    for (const a of convertido.avisos) avisos.push({ atalho: trigger, mensagem: a });
    const match = { trigger, label: String(item.nome).trim(), replace: convertido.replace };
    if (convertido.vars.length > 0) match.vars = convertido.vars;
    const arquivo = nomeDeArquivo(item.pasta);
    if (!arquivos.has(arquivo)) arquivos.set(arquivo, []);
    arquivos.get(arquivo).push(match);
  }
  return { arquivos, atalhosAlterados, avisos };
}

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

const CHAVES_ENTRE_ASPAS = new Set(['trigger', 'label', 'replace', 'id', 'default', 'format', 'locale', 'layout']);
const CABECALHO = (pasta) => [` Pasta do Text Blaze: ${pasta}`, ' Gerado por scripts/converter-textblaze.js. Os atalhos podem ser editados à mão.'].join('\n');

// O leitor de YAML do Espanso lê diferente da biblioteca "yaml" (e da especificação) um bloco literal cujo texto
// COMEÇA por TAB ou espaço: o TAB não conta como recuo, o bloco fica ambíguo e o Espanso descarta o ARQUIVO INTEIRO,
// sem aviso (docs/ESPANSO-NOTAS.md, P12). Por isso, texto que começa por espaço em branco vai entre aspas duplas.
const blocoLiteralEhSeguro = (texto) => texto.includes('\n') && !/^\s/.test(texto);

/**
 * Gera o texto do arquivo. modo "bloco": texto de várias linhas vira bloco literal (|-), mais legível de editar.
 * modo "aspas": tudo entre aspas duplas, com as quebras de linha escapadas (sempre volta igual; é o plano B se o
 * bloco literal não devolver o texto igual).
 */
function gerarYaml(matches, pasta, modo = 'bloco') {
  const documento = new Document({ matches });
  documento.commentBefore = CABECALHO(pasta);
  visit(documento, {
    Scalar(chave, no, caminho) {
      if (chave === 'key' || typeof no.value !== 'string') return;
      const pai = caminho[caminho.length - 1];
      const nome = pai && pai.key && pai.key.value;
      if (modo === 'bloco' && blocoLiteralEhSeguro(no.value)) no.type = Scalar.BLOCK_LITERAL;
      else if (modo === 'aspas' || CHAVES_ENTRE_ASPAS.has(nome)) no.type = Scalar.QUOTE_DOUBLE;
    },
  });
  // doubleQuotedAsJSON: o texto entre aspas duplas sai numa linha só, em sintaxe JSON. Sem isso, a biblioteca dobra
  // a linha e, num texto com uma linha só de espaço (" \n"), a barra de continuação volta como uma barra de verdade.
  return documento.toString({ lineWidth: 0, doubleQuotedAsJSON: true });
}

// O YAML precisa devolver exatamente o mesmo conteúdo. Se o bloco literal não guardar algum texto igual, usa aspas duplas.
function gerarYamlConferido(matches, pasta) {
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const modo of ['bloco', 'aspas']) {
    const texto = gerarYaml(matches, pasta, modo);
    if (igual(parse(texto).matches, matches)) return texto;
  }
  throw new Error(`O YAML de "${pasta}" não volta igual ao conteúdo convertido.`);
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

function principal() {
  const entrada = process.argv[2];
  if (!entrada) {
    console.error('Uso: node scripts/converter-textblaze.js <arquivo.json> [pasta-de-destino]');
    process.exit(2);
  }
  const destino = path.resolve(process.argv[3] || path.join(__dirname, '..', PASTA_PADRAO));
  const itens = JSON.parse(fs.readFileSync(entrada, 'utf8').replace(/^﻿/, ''));
  if (!Array.isArray(itens)) throw new Error('O JSON precisa ser uma lista de snippets.');

  const { arquivos, atalhosAlterados, avisos } = converterTudo(itens);
  const textos = new Map();
  for (const [arquivo, matches] of arquivos) {
    const pasta = arquivo.replace(/\.yml$/, '');
    textos.set(arquivo, gerarYamlConferido(matches, pasta));
  }

  // Valida o conjunto como o programa valida (mesmo validador).
  const validacao = validarBiblioteca([...textos].map(([nome, conteudo]) => ({ nome, conteudo })));
  fs.mkdirSync(destino, { recursive: true });
  for (const [arquivo, texto] of textos) fs.writeFileSync(path.join(destino, arquivo), texto, 'utf8');
  const sobras = fs.readdirSync(destino).filter((n) => /\.yml$/i.test(n) && !textos.has(n));

  console.log(`${itens.length} snippets em ${arquivos.size} arquivo(s), gravados em ${destino}`);
  for (const [arquivo, matches] of arquivos) console.log(`  ${String(matches.length).padStart(4)}  ${arquivo}`);
  console.log(`\nAtalhos alterados para caber no padrão (${atalhosAlterados.length}):`);
  for (const a of atalhosAlterados) console.log(`  ${a.de}  ->  ${a.para}    [${a.nome}]`);
  console.log(`\nAvisos da conversão (${avisos.length}):`);
  for (const a of avisos) console.log(`  ${a.atalho}: ${a.mensagem}`);
  if (sobras.length > 0) console.log(`\nAtenção: já havia arquivos .yml na pasta de destino que a conversão não gerou: ${sobras.join(', ')}`);
  console.log(`\nValidador: ${validacao.snippets.length} snippets, ${validacao.erros.length} erros, ${validacao.avisos.length} avisos`);
  for (const e of validacao.erros) console.log(`  ERRO ${e.arquivo}:${e.linha || ''} [${e.regra}] ${e.mensagem}`);
  for (const a of validacao.avisos) console.log(`  aviso ${a.arquivo}:${a.linha || ''} [${a.regra}] ${a.mensagem}`);
  process.exit(validacao.erros.length > 0 ? 1 : 0);
}

if (require.main === module) principal();

module.exports = { gerarYaml, normalizarAtalho, tokenizar, lerParametros, converterFormatoDeTempo, converterConteudo, converterTudo, gerarYamlConferido, nomeDeArquivo };
