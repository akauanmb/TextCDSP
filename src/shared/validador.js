'use strict';

// Validador puro de bibliotecas de snippets do Espanso, com as regras da CDSP.
// Não acessa disco, rede nem Electron: recebe o texto dos arquivos e devolve os problemas.
// Os fatos do Espanso em que as regras se apoiam estão em docs/ESPANSO-NOTAS.md (P6, P8, P9).

const { parseDocument, LineCounter, isMap, isSeq, isScalar } = require('yaml');

const PADRAO_TRIGGER = /^\/[a-z0-9]{2,30}$/;
const CHAVES_RAIZ = ['matches', 'global_vars'];
const CHAVES_SAIDA = ['replace', 'html', 'markdown'];
const CHAVES_TRIGGER_PROIBIDAS = ['triggers', 'regex', 'imports'];
// Variáveis permitidas nos snippets oficiais. shell e script ficam de fora de propósito:
// executariam comandos em todas as máquinas do setor.
const TIPOS_VAR_PERMITIDOS = ['date', 'form', 'choice', 'echo', 'random', 'clipboard'];
const TAMANHO_PREVIEW = 300;
const PADRAO_VARIAVEL = /\{\{\s*([^{}\s]+?)\s*\}\}/g;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function categoriaDe(nome) {
  return String(nome).replace(/\.ya?ml$/i, '');
}

function ehTextoNaoVazio(valor) {
  return typeof valor === 'string' && valor.trim() !== '';
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// Procura a chave num nó de mapa do YAML e devolve o par (chave e valor como nós).
function parDe(noMapa, chave) {
  if (!isMap(noMapa)) return null;
  return noMapa.items.find((par) => isScalar(par.key) && par.key.value === chave) || null;
}

// Todos os textos de um valor (recursivo), usado para achar {{variaveis}} dentro dos params.
function coletarTextos(valor, acumulado = []) {
  if (typeof valor === 'string') acumulado.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => coletarTextos(v, acumulado));
  else if (ehObjeto(valor)) Object.values(valor).forEach((v) => coletarTextos(v, acumulado));
  return acumulado;
}

// Variáveis citadas em {{nome}} ou {{nome.campo}}.
function variaveisCitadas(texto) {
  const citadas = [];
  for (const m of String(texto).matchAll(PADRAO_VARIAVEL)) {
    const ponto = m[1].indexOf('.');
    citadas.push({
      completo: m[1],
      nome: ponto === -1 ? m[1] : m[1].slice(0, ponto),
      campo: ponto === -1 ? null : m[1].slice(ponto + 1),
    });
  }
  return citadas;
}

function camposDoLayout(layout) {
  const campos = [];
  if (typeof layout !== 'string') return campos;
  for (const m of layout.matchAll(/\[\[\s*([^\][\s]+)\s*\]\]/g)) {
    if (!campos.includes(m[1])) campos.push(m[1]);
  }
  return campos;
}

// ---------------------------------------------------------------------------
// Leitura de um arquivo YAML (com números de linha)
// ---------------------------------------------------------------------------

// Devolve { arquivo, categoria, matches, globalVars, linhaDe }, onde cada item de matches e
// globalVars é { no, dados, linha }. `linhaDe(no)` dá a linha (1 = primeira) de um nó do YAML.
// Os problemas da leitura são acrescentados em `problemas`.
// `estrito` = true para os oficiais; false para os pessoais, que podem ser só comentários e
// cujos problemas nunca são erros.
function lerArquivo(arquivo, problemas, estrito) {
  const texto = String(arquivo.conteudo ?? '').replace(/^﻿/, '');
  const contador = new LineCounter();
  // Com prettyErrors (padrão) cada erro de sintaxe traz linePos, de onde sai o número da linha.
  const documento = parseDocument(texto, { lineCounter: contador });
  const linhaDe = (no) => (no && no.range ? contador.linePos(no.range[0]).line : null);
  const resultado = { arquivo: arquivo.nome, categoria: categoriaDe(arquivo.nome), matches: [], globalVars: [], linhaDe };
  const itens = (seq) => seq.items.map((no) => ({ no, dados: no && typeof no.toJS === 'function' ? no.toJS(documento) : no, linha: linhaDe(no) }));

  const relatar = (regra, mensagem, linha) => {
    if (estrito) {
      problemas.erros.push({ arquivo: arquivo.nome, linha: linha ?? null, regra, mensagem });
    } else if (regra === 'yaml') {
      problemas.avisos.push({ arquivo: arquivo.nome, linha: linha ?? null, regra: 'pessoal-invalido', mensagem: `Seu arquivo de atalhos pessoais tem um erro de YAML: ${mensagem}` });
    }
  };

  if (documento.errors.length > 0) {
    // Um defeito costuma gerar erros em cascata; o primeiro é a causa e basta para a pessoa corrigir.
    const erro = documento.errors[0];
    const linha = erro.linePos && erro.linePos[0] ? erro.linePos[0].line : null;
    const detalhe = String(erro.message).split('\n')[0].replace(/\s+at line \d+, column \d+:?\s*$/, '');
    relatar('yaml', `O arquivo não é um YAML válido${linha ? ` (problema perto da linha ${linha})` : ''}. Confira a indentação (só espaços, nunca tab), as aspas e os colchetes. Detalhe técnico: ${detalhe}.`, linha);
    return resultado;
  }

  const raiz = documento.contents;
  if (raiz === null || raiz === undefined) {
    relatar('estrutura', 'O arquivo está vazio. Ele precisa ter uma lista "matches:".', null);
    return resultado;
  }
  if (!isMap(raiz)) {
    relatar('estrutura', 'A raiz do arquivo precisa ser um mapa com a lista "matches:".', linhaDe(raiz));
    return resultado;
  }

  for (const par of raiz.items) {
    const chave = isScalar(par.key) ? String(par.key.value) : '?';
    if (!CHAVES_RAIZ.includes(chave)) {
      relatar('estrutura', `A chave "${chave}" não é permitida na raiz. Use apenas: ${CHAVES_RAIZ.join(', ')}.`, linhaDe(par.key));
    }
  }

  const parMatches = parDe(raiz, 'matches');
  if (parMatches && isSeq(parMatches.value)) {
    resultado.matches = itens(parMatches.value);
  } else if (estrito) {
    // Pessoal sem "matches" (só comentários) é normal; oficial sem "matches" é erro.
    relatar('estrutura', 'O arquivo não tem a lista "matches:".', parMatches ? linhaDe(parMatches.key) : null);
  }

  const parGlobais = parDe(raiz, 'global_vars');
  if (parGlobais) {
    if (isSeq(parGlobais.value)) resultado.globalVars = itens(parGlobais.value);
    else relatar('estrutura', '"global_vars" precisa ser uma lista de variáveis.', linhaDe(parGlobais.key));
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Regras de variáveis
// ---------------------------------------------------------------------------

// Valida uma variável (local ou global). Devolve a descrição normalizada ou null se não der para usá-la.
function validarVariavel(variavel, arquivo, linha, problemas) {
  const erro = (regra, mensagem) => problemas.erros.push({ arquivo, linha, regra, mensagem });
  const aviso = (regra, mensagem) => problemas.avisos.push({ arquivo, linha, regra, mensagem });

  if (!ehObjeto(variavel)) {
    erro('estrutura', 'Cada variável precisa ser um mapa com "name" e "type".');
    return null;
  }
  const { name: nome, type: tipo } = variavel;
  if (!ehTextoNaoVazio(nome)) {
    erro('estrutura', 'Variável sem "name".');
    return null;
  }
  if (!ehTextoNaoVazio(tipo)) {
    erro('estrutura', `A variável "${nome}" não tem "type".`);
    return null;
  }

  const params = ehObjeto(variavel.params) ? variavel.params : {};
  const descricao = { nome, tipo, params, layoutCampos: [], linha };

  if (!TIPOS_VAR_PERMITIDOS.includes(tipo)) {
    const motivo = tipo === 'shell' || tipo === 'script'
      ? `variáveis "${tipo}" executariam comandos em todas as máquinas e são proibidas nos snippets oficiais`
      : `o tipo "${tipo}" não é permitido nos snippets oficiais`;
    erro('var-proibida', `A variável "${nome}" é do tipo "${tipo}": ${motivo}. Tipos permitidos: ${TIPOS_VAR_PERMITIDOS.join(', ')}.`);
    return descricao;
  }

  if (tipo === 'date') {
    if (!ehTextoNaoVazio(params.format)) {
      erro('data', `A variável de data "${nome}" não tem "params.format". Exemplo: format: "%d/%m/%Y".`);
    } else if (/%[BA]/.test(params.format) && params.locale !== 'pt-BR') {
      aviso('locale', `A data "${nome}" usa nome de mês ou de dia (%B ou %A) sem locale "pt-BR"; ela pode sair em inglês. Acrescente locale: "pt-BR" em params.`);
    }
  }

  if (tipo === 'form') {
    const layout = params.layout;
    if (typeof layout !== 'string') {
      erro('form-campo', `O formulário "${nome}" não tem "params.layout". Escreva o texto do formulário com os campos no formato [[campo]].`);
    } else {
      descricao.layoutCampos = camposDoLayout(layout);
    }
    if (params.fields !== undefined && params.fields !== null && !ehObjeto(params.fields)) {
      erro('form-campo', `Em "params.fields" do formulário "${nome}", cada campo precisa ter o próprio bloco (ex.: "cnj:" seguido das opções), e não uma lista.`);
    } else if (ehObjeto(params.fields)) {
      for (const campo of Object.keys(params.fields)) {
        if (!descricao.layoutCampos.includes(campo)) {
          erro('form-campo', `O campo "${campo}" do formulário "${nome}" está em params.fields, mas não aparece como [[${campo}]] em params.layout.`);
        }
      }
    }
  }
  return descricao;
}

// ---------------------------------------------------------------------------
// Preview, campos e tipo
// ---------------------------------------------------------------------------

function htmlParaTexto(html) {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}

// Texto puro, até 300 caracteres, com {{var}} e {{form.campo}} trocados por [var] e [campo].
function montarPreview(saida, formato) {
  let texto = formato === 'html' ? htmlParaTexto(saida) : saida;
  texto = texto.replace(PADRAO_VARIAVEL, (_, nome) => `[${nome.slice(nome.lastIndexOf('.') + 1)}]`);
  texto = texto.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return texto.length > TAMANHO_PREVIEW ? `${texto.slice(0, TAMANHO_PREVIEW - 1).trimEnd()}…` : texto;
}

function opcoesDeEscolha(valores) {
  if (!Array.isArray(valores)) return [];
  return valores.map((v) => (ehObjeto(v) ? String(v.label ?? v.id ?? '') : String(v)));
}

// Campos que a pessoa preenche: os do formulário e as variáveis de escolha.
function descreverCampos(variaveis) {
  const campos = [];
  for (const v of variaveis) {
    if (v.tipo === 'form') {
      const declarados = ehObjeto(v.params.fields) ? v.params.fields : {};
      for (const nome of v.layoutCampos) {
        const def = ehObjeto(declarados[nome]) ? declarados[nome] : {};
        const campo = { nome, tipo: 'texto' };
        if (def.type === 'choice' || def.type === 'list') {
          campo.tipo = 'lista';
          campo.opcoes = opcoesDeEscolha(def.values);
        } else if (def.multiline === true) {
          campo.tipo = 'texto-longo';
        }
        campos.push(campo);
      }
    } else if (v.tipo === 'choice') {
      campos.push({ nome: v.nome, tipo: 'escolha', opcoes: opcoesDeEscolha(v.params.values) });
    }
  }
  return campos;
}

// "texto" (sem variáveis), "formatado" (html ou markdown), "formulario", "escolha", "data" ou "misto".
// Formulário, escolha e formatação são os tipos principais: um só dá o próprio nome e dois ou mais
// dão "misto". Uma data ao lado deles é secundária e não conta; uma data sozinha dá "data".
function classificarTipo(formatoSaida, variaveis) {
  const principais = [];
  if (variaveis.some((v) => v.tipo === 'form')) principais.push('formulario');
  if (variaveis.some((v) => v.tipo === 'choice')) principais.push('escolha');
  if (formatoSaida === 'html' || formatoSaida === 'markdown') principais.push('formatado');
  if (principais.length > 1) return 'misto';
  if (principais.length === 1) return principais[0];
  if (variaveis.length === 0) return 'texto';
  return variaveis.every((v) => v.tipo === 'date') ? 'data' : 'misto';
}

// ---------------------------------------------------------------------------
// Validação de cada match
// ---------------------------------------------------------------------------

function validarMatch(item, lido, globais, problemas, contexto) {
  const { dados, no, linha } = item;
  const arquivo = lido.arquivo;
  const erro = (regra, mensagem, l = linha) => problemas.erros.push({ arquivo, linha: l ?? null, regra, mensagem });
  const aviso = (regra, mensagem, l = linha) => problemas.avisos.push({ arquivo, linha: l ?? null, regra, mensagem });
  const linhaDaChave = (chave) => {
    const par = parDe(no, chave);
    return par ? lido.linhaDe(par.key) : linha;
  };

  if (!ehObjeto(dados)) {
    erro('estrutura', 'Cada item de "matches" precisa ser um mapa com "trigger", "label" e uma saída (replace, html ou markdown).');
    return;
  }

  // Trigger
  const proibidas = CHAVES_TRIGGER_PROIBIDAS.filter((c) => c in dados);
  for (const chave of proibidas) {
    erro('trigger-ausente', `A chave "${chave}" não é permitida nos snippets oficiais. Use um único "trigger" por match (ex.: trigger: "/cont").`, linhaDaChave(chave));
  }
  let trigger = null;
  if (!('trigger' in dados)) {
    // Se havia uma chave proibida, a mensagem dela já explica.
    if (proibidas.length === 0) erro('trigger-ausente', 'O match não tem "trigger". Exemplo: trigger: "/cont".');
  } else if (typeof dados.trigger !== 'string' || dados.trigger === '') {
    erro('trigger-ausente', 'O "trigger" precisa ser um texto não vazio. Exemplo: trigger: "/cont".', linhaDaChave('trigger'));
  } else {
    trigger = dados.trigger;
    if (!PADRAO_TRIGGER.test(trigger)) {
      erro('trigger-formato', `O atalho "${trigger}" está fora do padrão: use "/" seguida de 2 a 30 letras minúsculas sem acento ou números (ex.: /cont).`, linhaDaChave('trigger'));
    }
  }
  const nomeDoMatch = trigger ? `"${trigger}" ` : '';

  // Label
  if (!ehTextoNaoVazio(dados.label)) {
    erro('label', `O match ${nomeDoMatch}não tem "label". Acrescente um nome descritivo, ex.: label: "Texto fixo da contestação".`);
  }

  // Saída
  const presentes = CHAVES_SAIDA.filter((c) => c in dados);
  let formato = null;
  let saida = '';
  if (presentes.length === 0) {
    erro('saida', `O match ${nomeDoMatch}não tem saída. Use exatamente uma entre: ${CHAVES_SAIDA.join(', ')}.`);
  } else if (presentes.length > 1) {
    erro('saida', `O match ${nomeDoMatch}tem mais de uma saída (${presentes.join(', ')}). Use exatamente uma.`);
  } else {
    formato = presentes[0];
    const valor = dados[formato];
    if (valor !== null && typeof valor === 'object') {
      erro('saida', `A saída "${formato}" precisa ser um texto.`, linhaDaChave(formato));
    } else {
      saida = valor === null || valor === undefined ? '' : String(valor);
      if (saida.trim() === '') {
        aviso('texto-vazio', `O match ${nomeDoMatch}tem a saída "${formato}" vazia.`, linhaDaChave(formato));
      }
    }
  }

  // Variáveis do match
  const brutas = dados.vars === undefined || dados.vars === null ? [] : dados.vars;
  const variaveis = [];
  if (!Array.isArray(brutas)) {
    erro('estrutura', '"vars" precisa ser uma lista de variáveis.', linhaDaChave('vars'));
  } else {
    const parVars = parDe(no, 'vars');
    const nosVars = parVars && isSeq(parVars.value) ? parVars.value.items : [];
    brutas.forEach((bruta, i) => {
      const descricao = validarVariavel(bruta, arquivo, lido.linhaDe(nosVars[i]) ?? linha, problemas);
      if (descricao) variaveis.push(descricao);
    });
  }

  // Uso das variáveis: na saída e dentro dos params das outras variáveis.
  const locais = new Map(variaveis.map((v) => [v.nome, v]));
  const citadas = variaveisCitadas(saida);
  const usadas = new Set(citadas.map((c) => c.nome));
  for (const v of variaveis) {
    for (const texto of coletarTextos(v.params)) {
      for (const c of variaveisCitadas(texto)) if (c.nome !== v.nome) usadas.add(c.nome);
    }
  }
  for (const c of citadas) {
    const definida = locais.get(c.nome) || globais.get(c.nome);
    if (!definida) {
      erro('var-indefinida', `A saída usa {{${c.completo}}}, mas a variável "${c.nome}" não foi declarada neste match (nem em global_vars). Declare-a em "vars" ou remova o trecho.`);
    } else if (definida.tipo === 'form' && c.campo !== null && !definida.layoutCampos.includes(c.campo)) {
      erro('form-campo', `A saída usa {{${c.completo}}}, mas o campo "${c.campo}" não aparece como [[${c.campo}]] no params.layout do formulário "${c.nome}".`);
    }
  }
  for (const v of variaveis) {
    if (!usadas.has(v.nome)) {
      aviso('var-nao-usada', `A variável "${v.nome}" foi declarada, mas não é usada na saída.`, v.linha);
    }
  }
  usadas.forEach((nome) => contexto.usadas.add(nome));

  if (trigger === null) return;
  contexto.triggers.push({ trigger, arquivo, linha: linhaDaChave('trigger') });
  contexto.snippets.push({
    arquivo,
    categoria: lido.categoria,
    trigger,
    label: ehTextoNaoVazio(dados.label) ? dados.label : '',
    tipo: classificarTipo(formato, variaveis),
    campos: descreverCampos(variaveis),
    preview: montarPreview(saida, formato),
    // Dados para a Biblioteca copiar o texto com as datas resolvidas e os campos como [campo].
    formato,
    saida,
    datas: variaveis
      .filter((v) => v.tipo === 'date' && ehTextoNaoVazio(v.params.format))
      .map((v) => ({ nome: v.nome, formato: v.params.format, offset: Number(v.params.offset) || 0 })),
  });
}

// ---------------------------------------------------------------------------
// Conflitos entre triggers
// ---------------------------------------------------------------------------

function onde(t) {
  return `${t.arquivo}${t.linha ? `:${t.linha}` : ''}`;
}

function verificarConflitosOficiais(triggers, problemas) {
  const primeiro = new Map();
  for (const t of triggers) {
    const anterior = primeiro.get(t.trigger);
    if (anterior) {
      problemas.erros.push({
        arquivo: t.arquivo,
        linha: t.linha,
        regra: 'trigger-duplicado',
        mensagem: `O atalho ${t.trigger} já existe em ${onde(anterior)}. Cada atalho só pode ser definido uma vez; renomeie um deles.`,
        // Estrutura para quem precisa saber quem conflita com quem (Biblioteca): [o primeiro, o repetido].
        triggers: [anterior.trigger, t.trigger],
        arquivos: [anterior.arquivo, t.arquivo],
      });
    } else {
      primeiro.set(t.trigger, t);
    }
  }

  // Prefixo: só entre atalhos distintos e no formato válido (os inválidos já geram trigger-formato).
  const unicos = [...primeiro.values()].filter((t) => PADRAO_TRIGGER.test(t.trigger));
  for (const curto of unicos) {
    for (const longo of unicos) {
      if (longo.trigger.length > curto.trigger.length && longo.trigger.startsWith(curto.trigger)) {
        problemas.erros.push({
          arquivo: curto.arquivo,
          linha: curto.linha,
          regra: 'trigger-prefixo',
          mensagem: `O atalho ${curto.trigger} é o começo de ${longo.trigger} (${onde(longo)}): ao digitar ${longo.trigger}, o ${curto.trigger} dispara antes. Renomeie um dos dois.`,
          // [o curto, o longo]
          triggers: [curto.trigger, longo.trigger],
          arquivos: [curto.arquivo, longo.arquivo],
        });
      }
    }
  }
}

function verificarConflitosPessoais(triggersOficiais, triggersPessoais, problemas) {
  for (const p of triggersPessoais) {
    for (const o of triggersOficiais) {
      let mensagem = null;
      if (p.trigger === o.trigger) {
        mensagem = `O seu atalho pessoal ${p.trigger} é igual ao atalho oficial ${o.trigger} (${onde(o)}).`;
      } else if (o.trigger.startsWith(p.trigger)) {
        mensagem = `O seu atalho pessoal ${p.trigger} é o começo do atalho oficial ${o.trigger} (${onde(o)}): o pessoal dispara antes e o oficial deixa de funcionar.`;
      } else if (p.trigger.startsWith(o.trigger)) {
        mensagem = `O atalho oficial ${o.trigger} (${onde(o)}) é o começo do seu atalho pessoal ${p.trigger}: o oficial dispara antes e o pessoal deixa de funcionar.`;
      }
      if (mensagem) {
        problemas.avisos.push({ arquivo: p.arquivo, linha: p.linha, regra: 'conflito-pessoal', mensagem });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Valida uma biblioteca de snippets.
 * @param {{nome: string, conteudo: string}[]} arquivos Arquivos oficiais.
 * @param {{pessoais?: {nome: string, conteudo: string}[]}} [opcoes]
 *   Arquivos pessoais: só entram na checagem de conflitos (sempre aviso "conflito-pessoal", nunca erro)
 *   e não são listados em `snippets`. Um pessoal com YAML inválido gera o aviso "pessoal-invalido".
 * @returns {{erros: object[], avisos: object[], snippets: object[]}}
 */
function validarBiblioteca(arquivos, opcoes = {}) {
  const problemas = { erros: [], avisos: [] };
  const contexto = { triggers: [], snippets: [], usadas: new Set() };

  // Lê todos os arquivos antes de validar, para que global_vars de um arquivo valham nos demais.
  const lidos = (arquivos || []).map((arquivo) => lerArquivo(arquivo, problemas, true));

  const globais = new Map();
  const globaisDeclaradas = [];
  for (const lido of lidos) {
    for (const g of lido.globalVars) {
      const descricao = validarVariavel(g.dados, lido.arquivo, g.linha, problemas);
      if (!descricao) continue;
      if (globais.has(descricao.nome)) {
        problemas.erros.push({ arquivo: lido.arquivo, linha: g.linha, regra: 'estrutura', mensagem: `A variável global "${descricao.nome}" foi declarada mais de uma vez.` });
      } else {
        globais.set(descricao.nome, descricao);
        globaisDeclaradas.push({ ...descricao, arquivo: lido.arquivo });
      }
    }
  }

  for (const lido of lidos) {
    for (const item of lido.matches) validarMatch(item, lido, globais, problemas, contexto);
  }

  // Uma global citada nos params de outra global também conta como usada.
  for (const g of globaisDeclaradas) {
    for (const texto of coletarTextos(g.params)) {
      for (const c of variaveisCitadas(texto)) if (c.nome !== g.nome) contexto.usadas.add(c.nome);
    }
  }
  for (const g of globaisDeclaradas) {
    if (!contexto.usadas.has(g.nome)) {
      problemas.avisos.push({ arquivo: g.arquivo, linha: g.linha, regra: 'var-nao-usada', mensagem: `A variável global "${g.nome}" foi declarada, mas nenhum snippet a usa.` });
    }
  }

  verificarConflitosOficiais(contexto.triggers, problemas);

  // Pessoais: só para conflitos.
  const triggersPessoais = [];
  for (const arquivo of (opcoes && opcoes.pessoais) || []) {
    const lido = lerArquivo(arquivo, problemas, false);
    for (const item of lido.matches) {
      if (ehObjeto(item.dados) && typeof item.dados.trigger === 'string' && item.dados.trigger !== '') {
        const par = parDe(item.no, 'trigger');
        triggersPessoais.push({ trigger: item.dados.trigger, arquivo: arquivo.nome, linha: par ? lido.linhaDe(par.key) : item.linha });
      }
    }
  }
  verificarConflitosPessoais(contexto.triggers, triggersPessoais, problemas);

  return { erros: problemas.erros, avisos: problemas.avisos, snippets: contexto.snippets };
}

module.exports = { validarBiblioteca, htmlParaTexto, PADRAO_TRIGGER, TIPOS_VAR_PERMITIDOS };
