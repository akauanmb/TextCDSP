'use strict';

// Texto do status da sincronização, usado no menu da bandeja e na janela de configurações.
// Função pura: os textos são parte da interface e têm teste.

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

// "dd/mm hh:mm" no horário local, ou null se a data não existir ou for inválida.
function formatarDataHora(iso) {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} ${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}

/**
 * @param {{status: string, aplicadoEm?: string|null}} estado
 *   status: "nao-configurado" | "atualizado" | "offline" | "erro-na-fonte" | outro (ainda sem resultado)
 */
function textoStatusSync({ status, aplicadoEm }) {
  const quando = formatarDataHora(aplicadoEm);
  switch (status) {
    case 'nao-configurado':
      return 'Pasta de snippets não configurada';
    case 'atualizado':
      return quando ? `Snippets atualizados (${quando})` : 'Snippets atualizados';
    case 'offline':
      return quando ? `Sem conexão com a pasta, usando versão de ${quando}` : 'Sem conexão com a pasta (nenhuma versão aplicada ainda)';
    case 'erro-na-fonte':
      return 'Erro na pasta de snippets, veja detalhes';
    default:
      return 'Sincronizando snippets...';
  }
}

module.exports = { formatarDataHora, textoStatusSync };
