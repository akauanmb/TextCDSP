'use strict';

// Sincronização dos snippets oficiais: pasta compartilhada -> validação -> match\oficial\.
// Regras: nunca aplica uma versão inválida; se a pasta some, mantém o que está em uso;
// a troca é atômica (uma pasta nova no lugar da antiga) e guarda a última versão válida em cache\.
//
// A lógica de disco está em funções que recebem os caminhos por parâmetro, para testar sem Electron.
// A pasta temporária da troca fica FORA de match\ (em cache\): o Espanso carrega qualquer .yml de
// subpastas de match\ (docs/ESPANSO-NOTAS.md, P6), então uma pasta "oficial.novo" lá dentro seria lida.

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { validarBiblioteca } = require('../shared/validador');

const TEMPO_MAXIMO_LEITURA_MS = 20000;
const NIVEIS_MAXIMOS_DE_LEITURA = 10;
const ERROS_DE_RENOMEAR_TRANSITORIOS = ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'];

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function comTempoMaximo(promessa, ms) {
  let temporizador;
  const limite = new Promise((_, rejeitar) => {
    temporizador = setTimeout(() => {
      const erro = new Error('tempo esgotado');
      erro.code = 'ETIMEDOUT';
      rejeitar(erro);
    }, ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));
}

const MOTIVOS_DE_ERRO = {
  ENOENT: 'a pasta não existe ou está indisponível',
  ENOTDIR: 'o caminho não é uma pasta',
  EACCES: 'sem permissão para acessar a pasta',
  EPERM: 'sem permissão para acessar a pasta',
  ETIMEDOUT: 'a pasta não respondeu a tempo',
  EBUSY: 'a pasta está em uso por outro programa',
  ENETUNREACH: 'a rede está indisponível',
  EHOSTUNREACH: 'o computador da pasta não foi encontrado',
};

function descreverErroDeArquivo(erro) {
  return MOTIVOS_DE_ERRO[erro && erro.code] || (erro && erro.message) || 'erro desconhecido';
}

// ---------------------------------------------------------------------------
// Leitura e hash
// ---------------------------------------------------------------------------

const eArquivoYml = (e) => e.isFile() && /\.yml$/i.test(e.name) && !e.name.startsWith('_');
// Pastas iniciadas por "_" (como _historico e _instalador) ou "." não fazem parte dos snippets.
const eSubpastaDeSnippets = (e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.');

// Lê os .yml da pasta e de todas as subpastas. Ignora arquivos iniciados por "_", pastas iniciadas por "_" ou "."
// e tudo que não for .yml. O "nome" de cada arquivo é o caminho relativo com "/" ("Medicamentos/contestacao.yml"),
// também no Windows. Devolve [{ nome, conteudo }] em ordem de nome. Lança erro se alguma pasta estiver inacessível.
// O limite de 3 níveis NÃO é aplicado aqui: é a regra caminho-profundo do validador. Aqui só há uma trava de
// segurança (NIVEIS_MAXIMOS_DE_LEITURA) contra pastas absurdamente fundas.
function lerFonte(pasta, { tempoMaximoMs = TEMPO_MAXIMO_LEITURA_MS } = {}) {
  return comTempoMaximo(
    (async () => {
      const arquivos = [];
      async function percorrer(dir, prefixo, nivel) {
        const entradas = await fsp.readdir(dir, { withFileTypes: true });
        for (const e of entradas) {
          if (eArquivoYml(e)) {
            arquivos.push({ nome: `${prefixo}${e.name}`, conteudo: await fsp.readFile(path.join(dir, e.name), 'utf8') });
          } else if (eSubpastaDeSnippets(e) && nivel < NIVEIS_MAXIMOS_DE_LEITURA) {
            await percorrer(path.join(dir, e.name), `${prefixo}${e.name}/`, nivel + 1);
          }
        }
      }
      await percorrer(pasta, '', 0);
      return arquivos.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
    })(),
    tempoMaximoMs,
  );
}

// sha256 do conjunto (nome + conteúdo, em ordem de nome).
function calcularHash(arquivos) {
  const hash = crypto.createHash('sha256');
  const ordenados = [...arquivos].sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  for (const { nome, conteudo } of ordenados) hash.update(`${nome}\0${conteudo}\0`);
  return hash.digest('hex');
}

// Há algum .yml na pasta ou em qualquer subpasta? (match\oficial\ agora pode ter a árvore da pasta-fonte.)
async function temArquivosYml(pasta, nivel = 0) {
  try {
    const entradas = await fsp.readdir(pasta, { withFileTypes: true });
    if (entradas.some((e) => e.isFile() && /\.yml$/i.test(e.name))) return true;
    if (nivel >= NIVEIS_MAXIMOS_DE_LEITURA) return false;
    for (const e of entradas) {
      if (e.isDirectory() && (await temArquivosYml(path.join(pasta, e.name), nivel + 1))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function existe(caminho) {
  try {
    await fsp.access(caminho);
    return true;
  } catch {
    return false;
  }
}

const limpar = (caminho) => fsp.rm(caminho, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Troca atômica de pasta
// ---------------------------------------------------------------------------

/**
 * Coloca `arquivos` em `destino` de uma vez: grava tudo em `staging`, move o destino atual para
 * `antigo`, move `staging` para `destino` e apaga `antigo`. Se algo falhar no meio, restaura o antigo
 * e o destino fica como estava. `staging` e `antigo` devem estar fora de match\ e no mesmo volume.
 */
async function substituirPasta({ destino, staging, antigo, arquivos, renomear = fsp.rename, tentativas = 5, esperaMs = 150 }) {
  // No Windows, renomear pode falhar por instantes se o Espanso estiver lendo a pasta.
  async function renomearComTentativas(de, para) {
    for (let i = 1; ; i++) {
      try {
        return await renomear(de, para);
      } catch (erro) {
        if (i >= tentativas || !ERROS_DE_RENOMEAR_TRANSITORIOS.includes(erro.code)) throw erro;
        await dormir(esperaMs);
      }
    }
  }

  await limpar(staging);
  await fsp.mkdir(staging, { recursive: true });
  try {
    for (const { nome, conteudo } of arquivos) {
      const alvo = path.join(staging, nome);
      await fsp.mkdir(path.dirname(alvo), { recursive: true }); // "nome" pode ter subpastas (Marco 10)
      await fsp.writeFile(alvo, conteudo, 'utf8');
    }
  } catch (erro) {
    await limpar(staging);
    throw erro;
  }

  await limpar(antigo);
  const existiaDestino = await existe(destino);
  let moveuOAntigo = false;
  try {
    if (existiaDestino) {
      await renomearComTentativas(destino, antigo);
      moveuOAntigo = true;
    }
    await renomearComTentativas(staging, destino);
  } catch (erro) {
    if (moveuOAntigo) {
      try {
        await fsp.rename(antigo, destino);
      } catch {
        // sem como restaurar; o erro original é o que importa
      }
    }
    await limpar(staging);
    throw erro;
  }
  await limpar(antigo);
}

// Se match\oficial\ estiver sem arquivos e houver uma última versão válida em cache\, restaura dela.
async function restaurarDoCache({ oficial, ultimaValida, staging, antigo }) {
  if (await temArquivosYml(oficial)) return false;
  let arquivos;
  try {
    arquivos = await lerFonte(ultimaValida);
  } catch {
    return false;
  }
  if (arquivos.length === 0) return false;
  await substituirPasta({ destino: oficial, staging, antigo, arquivos });
  return true;
}

// ---------------------------------------------------------------------------
// estado.json
// ---------------------------------------------------------------------------

function lerEstado(arquivo) {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : null;
  } catch {
    return null;
  }
}

async function gravarEstado(arquivo, estado) {
  const temporario = `${arquivo}.tmp`;
  await fsp.mkdir(path.dirname(arquivo), { recursive: true });
  await fsp.writeFile(temporario, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
  await fsp.rename(temporario, arquivo);
}

// ---------------------------------------------------------------------------
// Teste de uma pasta (botão "Testar" das configurações): valida sem aplicar
// ---------------------------------------------------------------------------

const PROBLEMA_FONTE_VAZIA = Object.freeze({
  arquivo: '(pasta de snippets)',
  linha: null,
  regra: 'fonte-vazia',
  mensagem: 'A pasta não tem nenhum arquivo .yml. Por segurança, nada é aplicado e a versão em uso é mantida.',
});

async function testarFonte(pasta, pessoais = []) {
  const caminho = String(pasta || '').trim();
  if (!caminho) return { acessivel: false, mensagem: 'Informe a pasta de snippets.', arquivos: 0, snippets: 0, erros: [], avisos: [] };
  let arquivos;
  try {
    arquivos = await lerFonte(caminho);
  } catch (erro) {
    return { acessivel: false, mensagem: `Não foi possível acessar a pasta: ${descreverErroDeArquivo(erro)}.`, arquivos: 0, snippets: 0, erros: [], avisos: [] };
  }
  if (arquivos.length === 0) return { acessivel: true, mensagem: '', arquivos: 0, snippets: 0, erros: [{ ...PROBLEMA_FONTE_VAZIA }], avisos: [] };
  const r = validarBiblioteca(arquivos, { pessoais });
  return { acessivel: true, mensagem: '', arquivos: arquivos.length, snippets: r.snippets.length, erros: r.erros, avisos: r.avisos };
}

// ---------------------------------------------------------------------------
// Sincronizador
// ---------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {object} p.caminhos  de caminhos.js (oficial, ultimaValida, estado, pessoalYml e as pastas stagingXxx/antigoXxx)
 * @param {object} p.log
 * @param {() => {fonteSnippets: string}} p.obterConfig
 * @param {(info: {erros: object[], hash: string}) => void} [p.aoErroNovo]  chamada uma vez por versão com erro
 * @param {(estado: object) => void} [p.aoMudar]  chamada a cada resultado de sincronização
 */
function criarSincronizador({ caminhos, log, obterConfig, aoErroNovo = () => {}, aoMudar = () => {} }) {
  const salvo = lerEstado(caminhos.estado);
  let atual = {
    status: 'pendente',
    aplicadoEm: salvo ? salvo.aplicadoEm || null : null,
    totalSnippets: salvo ? salvo.totalSnippets || 0 : 0,
    erros: [],
    avisos: salvo && Array.isArray(salvo.avisos) ? salvo.avisos : [],
    mensagem: '',
    verificadoEm: null,
  };
  let emExecucao = null;
  let hashComErroAvisado = null;
  let statusAnterior = null;

  const lerPessoais = () => {
    try {
      return [{ nome: 'pessoal.yml', conteudo: fs.readFileSync(caminhos.pessoalYml, 'utf8') }];
    } catch {
      return [];
    }
  };

  function definir(parcial) {
    if (parcial.status !== statusAnterior) {
      if (parcial.status === 'offline') log.aviso(`Pasta de snippets indisponível. ${parcial.mensagem} Mantendo a versão em uso`);
      else if (parcial.status === 'nao-configurado') log.info('Pasta de snippets não configurada');
      else if (statusAnterior === 'offline') log.info('Pasta de snippets disponível de novo');
      statusAnterior = parcial.status;
    }
    atual = { ...atual, ...parcial, verificadoEm: new Date().toISOString() };
    const copia = { ...atual };
    aoMudar(copia);
    return copia;
  }

  function erroNaFonte(erros, hash) {
    if (hash !== hashComErroAvisado) {
      hashComErroAvisado = hash;
      log.erro(`Pasta de snippets com ${erros.length} erro(s); versão anterior mantida. Primeiro: ${erros[0].arquivo}${erros[0].linha ? `:${erros[0].linha}` : ''} [${erros[0].regra}] ${erros[0].mensagem}`);
      try {
        aoErroNovo({ erros, hash });
      } catch (erro) {
        log.aviso('Falha ao avisar sobre o erro na pasta', erro);
      }
    }
    return definir({ status: 'erro-na-fonte', erros, avisos: [], mensagem: '' });
  }

  async function executar() {
    const fonte = String(obterConfig().fonteSnippets || '').trim();
    const estado = lerEstado(caminhos.estado);
    const aplicado = { aplicadoEm: estado ? estado.aplicadoEm || null : null, totalSnippets: estado ? estado.totalSnippets || 0 : 0 };
    const avisosAplicados = estado && Array.isArray(estado.avisos) ? estado.avisos : [];

    if (!fonte) return definir({ status: 'nao-configurado', ...aplicado, erros: [], avisos: avisosAplicados, mensagem: '' });

    let arquivos;
    try {
      arquivos = await lerFonte(fonte);
    } catch (erro) {
      return definir({ status: 'offline', ...aplicado, erros: [], avisos: avisosAplicados, mensagem: `Não foi possível acessar a pasta: ${descreverErroDeArquivo(erro)}.` });
    }

    if (arquivos.length === 0) return erroNaFonte([{ ...PROBLEMA_FONTE_VAZIA }], 'fonte-vazia');

    const hash = calcularHash(arquivos);
    // Igual ao que já está aplicado: nada a fazer (a menos que alguém tenha esvaziado match\oficial\).
    if (estado && estado.hash === hash && (await temArquivosYml(caminhos.oficial))) {
      hashComErroAvisado = null;
      return definir({ status: 'atualizado', ...aplicado, erros: [], avisos: avisosAplicados, mensagem: '' });
    }

    const validacao = validarBiblioteca(arquivos, { pessoais: lerPessoais() });
    if (validacao.erros.length > 0) return erroNaFonte(validacao.erros, hash);

    try {
      await substituirPasta({ destino: caminhos.oficial, staging: caminhos.stagingOficial, antigo: caminhos.antigoOficial, arquivos });
    } catch (erro) {
      log.erro('Não foi possível aplicar os snippets oficiais; a versão anterior foi mantida', erro);
      return erroNaFonte([{ arquivo: '(aplicação)', linha: null, regra: 'aplicacao', mensagem: `Não foi possível aplicar os snippets neste computador (${descreverErroDeArquivo(erro)}). A versão anterior foi mantida.` }], hash);
    }
    try {
      await substituirPasta({ destino: caminhos.ultimaValida, staging: caminhos.stagingCache, antigo: caminhos.antigoCache, arquivos });
    } catch (erro) {
      log.aviso('Snippets aplicados, mas não foi possível atualizar o cache da última versão válida', erro);
    }
    const aplicadoEm = new Date().toISOString();
    try {
      await gravarEstado(caminhos.estado, { hash, aplicadoEm, totalSnippets: validacao.snippets.length, avisos: validacao.avisos });
    } catch (erro) {
      log.aviso('Não foi possível gravar o estado da sincronização', erro);
    }
    hashComErroAvisado = null;
    log.info(`Snippets oficiais atualizados: ${validacao.snippets.length} snippets em ${arquivos.length} arquivo(s), ${validacao.avisos.length} aviso(s)`);
    return definir({ status: 'atualizado', aplicadoEm, totalSnippets: validacao.snippets.length, erros: [], avisos: validacao.avisos, mensagem: '' });
  }

  // Sem execuções simultâneas: se já há uma rodando, devolve a mesma (não inicia outra).
  function sincronizar() {
    if (emExecucao) return emExecucao;
    emExecucao = executar()
      .catch((erro) => {
        log.erro('Falha inesperada na sincronização', erro);
        return definir({ status: 'erro-na-fonte', erros: [{ arquivo: '(sincronização)', linha: null, regra: 'interno', mensagem: `Falha inesperada: ${descreverErroDeArquivo(erro)}.` }], mensagem: '' });
      })
      .finally(() => {
        emExecucao = null;
      });
    return emExecucao;
  }

  return {
    sincronizar,
    estadoAtual: () => ({ ...atual, sincronizando: emExecucao !== null }),
    restaurarDoCache: () =>
      restaurarDoCache({ oficial: caminhos.oficial, ultimaValida: caminhos.ultimaValida, staging: caminhos.stagingOficial, antigo: caminhos.antigoOficial }),
    testar: (pasta) => testarFonte(pasta, lerPessoais()),
  };
}

module.exports = {
  criarSincronizador,
  comTempoMaximo,
  lerFonte,
  calcularHash,
  substituirPasta,
  restaurarDoCache,
  testarFonte,
  lerEstado,
  gravarEstado,
  descreverErroDeArquivo,
};
