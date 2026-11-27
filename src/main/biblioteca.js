'use strict';

// Lógica de disco da janela Biblioteca, sem Electron (os caminhos vêm por parâmetro):
//   - monta a lista de snippets (oficiais + pessoais);
//   - cria, edita e exclui atalhos pessoais de texto simples no pessoal.yml;
//   - prepara o texto que "Copiar" põe na área de transferência.
// O Espanso recarrega sozinho quando o pessoal.yml muda (ESPANSO-NOTAS, P7): o motor não é reiniciado.

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { validarBiblioteca, PREFIXOS_TRIGGER, exemplosDeAtalho } = require('../shared/validador');
const {
  ErroPessoal,
  validarCamposPessoais,
  conflitosDoAtalho,
  lerPessoais,
  aplicarAlteracaoPessoal,
} = require('../shared/pessoais');
const { montarTextoParaCopia } = require('../shared/textoCopia');
const { formatarDataHora } = require('../shared/statusSync');
const { lerFonte } = require('./sincronizacao');

const ARQUIVO_PESSOAL = 'pessoal.yml';
const CATEGORIA_PESSOAL = 'Pessoal';

const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR');

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

async function lerOficiais(caminhos) {
  try {
    return await lerFonte(caminhos.oficial);
  } catch {
    return []; // pasta ainda não existe ou não está legível
  }
}

async function lerPessoalTexto(caminhos) {
  try {
    return await fsp.readFile(caminhos.pessoalYml, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw erro;
  }
}

// Monta a biblioteca completa: a lista (com os dados brutos usados para copiar) e o estado do pessoal.yml.
async function montar(caminhos, agora) {
  const oficiais = await lerOficiais(caminhos);
  const textoPessoal = await lerPessoalTexto(caminhos);
  const pessoal = lerPessoais(textoPessoal || '');

  const arquivos = [...oficiais];
  if (pessoal.valido && pessoal.matches.length > 0) arquivos.push({ nome: ARQUIVO_PESSOAL, conteudo: textoPessoal });
  const resultado = validarBiblioteca(arquivos);

  const repeticoes = new Map();
  const itens = resultado.snippets.map((s) => {
    const chave = `${s.arquivo}::${s.trigger}`;
    const n = repeticoes.get(chave) || 0;
    repeticoes.set(chave, n + 1);
    const ehPessoal = s.arquivo === ARQUIVO_PESSOAL;
    const dadosDoArquivo = ehPessoal ? pessoal.matches.find((m) => m.trigger === s.trigger) : null;
    const editavel = Boolean(dadosDoArquivo && dadosDoArquivo.editavel);
    return {
      bruto: s,
      visivel: {
        id: `${chave}::${n}`,
        arquivo: s.arquivo,
        categoria: ehPessoal ? CATEGORIA_PESSOAL : s.categoria,
        origem: ehPessoal ? 'pessoal' : 'oficial',
        trigger: s.trigger,
        label: s.label,
        tipo: s.tipo,
        campos: s.campos,
        preview: s.preview,
        previewCompleto: montarTextoParaCopia(s, agora).texto,
        editavel,
        // O texto original só é necessário (e só vai à janela) para preencher o formulário de edição.
        textoOriginal: editavel ? dadosDoArquivo.texto : null,
      },
    };
  });
  itens.sort((a, b) => comparar(a.visivel.trigger, b.visivel.trigger) || comparar(a.visivel.id, b.visivel.id));
  return { itens, pessoal, oficiais, textoPessoal };
}

/**
 * Lista para a janela.
 * @param {object} caminhos
 * @param {{aplicadoEm?: string|null, agora?: Date}} [opcoes] aplicadoEm = data da última versão oficial aplicada
 */
async function carregarBiblioteca(caminhos, { aplicadoEm = null, agora = new Date() } = {}) {
  const { itens, pessoal } = await montar(caminhos, agora);
  const snippets = itens.map((i) => i.visivel);
  const categorias = [...new Set(snippets.filter((s) => s.origem === 'oficial').map((s) => s.categoria))].sort(comparar);
  return {
    snippets,
    categorias: [...categorias, CATEGORIA_PESSOAL],
    erroPessoal: pessoal.valido ? null : pessoal.erro,
    atualizadoEmTexto: formatarDataHora(aplicadoEm),
    // Para a ajuda do formulário de atalho pessoal: a janela não importa o validador, então a lista (Marco 9) vem daqui.
    prefixosTrigger: [...PREFIXOS_TRIGGER],
    exemploAtalho: exemplosDeAtalho('ola'),
  };
}

// ---------------------------------------------------------------------------
// Cópia
// ---------------------------------------------------------------------------

/**
 * @param {{id: string, modo: "atalho"|"texto"}} pedido
 * @returns {Promise<{ok: boolean, texto?: string, html?: string|null, mensagem?: string}>}
 */
async function prepararCopia(caminhos, pedido, agora = new Date()) {
  if (!pedido || typeof pedido.id !== 'string' || (pedido.modo !== 'atalho' && pedido.modo !== 'texto')) {
    return { ok: false, mensagem: 'Pedido de cópia inválido.' };
  }
  const { itens } = await montar(caminhos, agora);
  const item = itens.find((i) => i.visivel.id === pedido.id);
  if (!item) return { ok: false, mensagem: 'Este snippet não existe mais. A lista foi atualizada.' };
  if (pedido.modo === 'atalho') return { ok: true, texto: item.bruto.trigger, html: null };
  const { texto, html } = montarTextoParaCopia(item.bruto, agora);
  return { ok: true, texto, html };
}

// ---------------------------------------------------------------------------
// Gravação do pessoal.yml
// ---------------------------------------------------------------------------

// Grava de forma atômica (.tmp + rename) e guarda o conteúdo anterior em pessoal.yml.bak (só a última cópia).
async function gravarPessoal(caminhos, novoConteudo, conteudoAnterior) {
  await fsp.mkdir(path.dirname(caminhos.pessoalYml), { recursive: true });
  if (conteudoAnterior !== null) await fsp.writeFile(caminhos.pessoalBak, conteudoAnterior, 'utf8');
  const temporario = `${caminhos.pessoalYml}.tmp`;
  try {
    await fsp.writeFile(temporario, novoConteudo, 'utf8');
    await fsp.rename(temporario, caminhos.pessoalYml);
  } catch (erro) {
    await fsp.rm(temporario, { force: true }).catch(() => {});
    throw erro;
  }
}

// Uma gravação por vez: duas operações seguidas não podem ler o mesmo arquivo e se sobrescrever.
let fila = Promise.resolve();
function emFila(tarefa) {
  const execucao = fila.then(tarefa, tarefa);
  fila = execucao.catch(() => {});
  return execucao;
}

function respostaDeErro(erro) {
  if (!(erro instanceof ErroPessoal)) throw erro;
  switch (erro.codigo) {
    case 'yaml-invalido':
      return { ok: false, erros: {}, arquivoInvalido: { linha: erro.linha, mensagem: erro.message } };
    case 'ja-existe':
      return { ok: false, erros: { trigger: 'Já existe um atalho pessoal com este nome. Escolha outro atalho.' } };
    case 'nao-editavel':
      return { ok: false, erros: { geral: erro.message } };
    case 'nao-encontrado':
      return { ok: false, erros: { geral: 'Este atalho não existe mais no arquivo. Feche o formulário e confira a lista.' } };
    default:
      return { ok: false, erros: { geral: erro.message } };
  }
}

/**
 * Cria ou edita um atalho pessoal de texto simples.
 * @param {{operacao: "criar"|"editar", triggerOriginal?: string, trigger: string, label: string, texto: string}} entrada
 * @returns {Promise<{ok: true, trigger: string} | {ok: false, erros: object, arquivoInvalido?: {linha: number|null, mensagem: string}}>}
 */
function salvarPessoal(caminhos, entrada) {
  return emFila(async () => {
    if (!entrada || (entrada.operacao !== 'criar' && entrada.operacao !== 'editar')) {
      return { ok: false, erros: { geral: 'Pedido inválido.' } };
    }
    const editar = entrada.operacao === 'editar';
    if (editar && typeof entrada.triggerOriginal !== 'string') return { ok: false, erros: { geral: 'Pedido inválido.' } };

    const { valor, erros } = validarCamposPessoais(entrada);
    if (Object.keys(erros).length > 0) return { ok: false, erros };

    const anterior = await lerPessoalTexto(caminhos);
    let novo;
    try {
      novo = aplicarAlteracaoPessoal(anterior || '', editar
        ? { tipo: 'editar', triggerOriginal: entrada.triggerOriginal, trigger: valor.trigger, label: valor.label, texto: valor.texto }
        : { tipo: 'criar', trigger: valor.trigger, label: valor.label, texto: valor.texto });
    } catch (erro) {
      return respostaDeErro(erro);
    }

    // Conflito com outro atalho (oficial ou pessoal) bloqueia. Ao editar sem trocar o atalho, não se
    // confere de novo: um conflito que já existia não deve impedir a correção do nome ou do texto.
    if (!editar || valor.trigger !== entrada.triggerOriginal) {
      const oficiais = await lerOficiais(caminhos);
      const simulacao = validarBiblioteca([...oficiais, { nome: ARQUIVO_PESSOAL, conteudo: novo }]);
      const conflitos = conflitosDoAtalho(simulacao.erros, valor.trigger, ARQUIVO_PESSOAL);
      if (conflitos.length > 0) return { ok: false, erros: { trigger: conflitos.join(' ') } };
    }

    await gravarPessoal(caminhos, novo, anterior);
    return { ok: true, trigger: valor.trigger };
  });
}

/** Exclui um atalho pessoal de texto simples. */
function excluirPessoal(caminhos, { trigger } = {}) {
  return emFila(async () => {
    if (typeof trigger !== 'string') return { ok: false, erros: { geral: 'Pedido inválido.' } };
    const anterior = await lerPessoalTexto(caminhos);
    let novo;
    try {
      novo = aplicarAlteracaoPessoal(anterior || '', { tipo: 'excluir', triggerOriginal: trigger });
    } catch (erro) {
      return respostaDeErro(erro);
    }
    await gravarPessoal(caminhos, novo, anterior);
    return { ok: true, trigger };
  });
}

module.exports = {
  ARQUIVO_PESSOAL,
  CATEGORIA_PESSOAL,
  carregarBiblioteca,
  prepararCopia,
  salvarPessoal,
  excluirPessoal,
};
