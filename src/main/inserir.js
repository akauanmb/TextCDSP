'use strict';

// "Inserir" (Marco 12): coloca o texto de um snippet na caixa de texto em que a pessoa estava antes de abrir a janela.
//   1. guarda o que há na área de transferência;
//   2. minimiza (e esconde) a janela, para o Windows devolver o foco à janela anterior (docs/WINDOWS-NOTAS.md, W1:
//      hide() sozinho não devolve o foco; minimizar sim);
//   3. espera 200 ms, grava o texto (com \r\n) na área de transferência e manda Ctrl+V;
//   4. cerca de 600 ms depois, restaura a área de transferência, MAS só se ela ainda tiver o texto inserido.
// Uma inserção por vez. Tudo que toca o Windows entra por parâmetro, para testar a sequência sem Electron.
// O log nunca recebe o conteúdo do snippet: só o atalho.

const { spawn } = require('node:child_process');
const { normalizarQuebrasDeLinha, deveRestaurarAreaDeTransferencia } = require('../shared/inserir');

const ESPERA_APOS_ESCONDER_MS = 200;
const ESPERA_ANTES_DE_RESTAURAR_MS = 600;
const TEMPO_MAXIMO_COLAR_MS = 5000;

// Comando FIXO: nenhum texto de snippet entra na linha de comando (o texto vai pela área de transferência).
const ARGUMENTOS_POWERSHELL = Object.freeze([
  '-NoProfile',
  '-NonInteractive',
  '-WindowStyle', 'Hidden',
  '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
]);

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Manda Ctrl+V à janela em foco, por powershell.exe + SendKeys (docs/WINDOWS-NOTAS.md, W2/W3: não aparece e leva
 * cerca de 0,3 s). Sem janela de console, sem herdar entrada e saída. Devolve { ok, codigo, esgotou }.
 */
function colarComCtrlV({ tempoMaximoMs = TEMPO_MAXIMO_COLAR_MS, executar = spawn } = {}) {
  return new Promise((resolver) => {
    let terminou = false;
    const concluir = (resultado) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(limite);
      resolver(resultado);
    };
    let processo;
    try {
      processo = executar('powershell.exe', [...ARGUMENTOS_POWERSHELL], { windowsHide: true, stdio: 'ignore' });
    } catch (erro) {
      resolver({ ok: false, codigo: null, esgotou: false, erro: erro.message });
      return;
    }
    const limite = setTimeout(() => {
      try {
        processo.kill();
      } catch {
        // já tinha saído
      }
      concluir({ ok: false, codigo: null, esgotou: true });
    }, tempoMaximoMs);
    processo.on('error', (erro) => concluir({ ok: false, codigo: null, esgotou: false, erro: erro.message }));
    processo.on('exit', (codigo) => concluir({ ok: codigo === 0, codigo, esgotou: false }));
  });
}

/**
 * @param {object} p
 * @param {object} p.log
 * @param {object} p.area                    de areaTransferencia.js: guardar, restaurar, escreverTexto, lerTexto
 * @param {() => Promise<void>} p.esconderJanela  minimiza/esconde a janela e só volta com o foco de volta
 * @param {() => Promise<{ok: boolean, codigo: number|null, esgotou: boolean}>} [p.colar]
 * @param {(info: {copiado: boolean}) => void} [p.aoFalhar]  `copiado` = o texto ficou na área de transferência
 * @param {number} [p.esperaAposEsconderMs]
 * @param {number} [p.esperaAntesDeRestaurarMs]
 * @param {(ms: number) => Promise<void>} [p.esperar]
 */
function criarInseridor({
  log,
  area,
  esconderJanela,
  colar = colarComCtrlV,
  aoFalhar = () => {},
  esperaAposEsconderMs = ESPERA_APOS_ESCONDER_MS,
  esperaAntesDeRestaurarMs = ESPERA_ANTES_DE_RESTAURAR_MS,
  esperar = dormir,
}) {
  let emAndamento = false;

  /**
   * @param {{texto: string, trigger: string}} pedido
   * @returns {Promise<{ok: boolean, ignorado?: boolean}>}
   */
  async function inserir({ texto, trigger }) {
    // Uma inserção por vez: um segundo pedido durante outra é ignorado.
    if (emAndamento) return { ok: false, ignorado: true };
    emAndamento = true;
    let copiado = false;
    try {
      let guardado = null;
      try {
        guardado = await area.guardar();
      } catch (erro) {
        log.aviso('Não foi possível guardar a área de transferência; ela não será restaurada depois de inserir', erro);
      }

      await esconderJanela();
      await esperar(esperaAposEsconderMs);

      const paraColar = normalizarQuebrasDeLinha(texto);
      await area.escreverTexto(paraColar);
      copiado = true;

      const resultado = await colar();
      if (!resultado.ok) {
        // O texto fica na área de transferência para a pessoa colar à mão.
        const motivo = resultado.esgotou ? 'tempo esgotado' : resultado.erro ? resultado.erro : `código ${resultado.codigo}`;
        log.aviso(`Não foi possível enviar o Ctrl+V ao inserir ${trigger} (${motivo}); o texto ficou na área de transferência`);
        aoFalhar({ copiado: true });
        return { ok: false };
      }
      log.info(`Texto inserido: ${trigger}`);

      await esperar(esperaAntesDeRestaurarMs);
      try {
        const atual = await area.lerTexto();
        if (guardado !== null && deveRestaurarAreaDeTransferencia(atual, paraColar)) await area.restaurar(guardado);
      } catch (erro) {
        log.aviso('Não foi possível restaurar a área de transferência depois de inserir', erro);
      }
      return { ok: true };
    } catch (erro) {
      log.erro(`Falha ao inserir ${trigger}`, erro);
      aoFalhar({ copiado });
      return { ok: false };
    } finally {
      emAndamento = false;
    }
  }

  return { inserir, emAndamento: () => emAndamento };
}

module.exports = {
  criarInseridor,
  colarComCtrlV,
  ARGUMENTOS_POWERSHELL,
  ESPERA_APOS_ESCONDER_MS,
  ESPERA_ANTES_DE_RESTAURAR_MS,
  TEMPO_MAXIMO_COLAR_MS,
};
