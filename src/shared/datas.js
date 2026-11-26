'use strict';

// Formata datas no padrão do Espanso (strftime) em português do Brasil.
// Usada na Biblioteca para mostrar e copiar o texto de um snippet com as datas já resolvidas para hoje.
// Função pura: a data vem por parâmetro.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const dois = (n) => String(n).padStart(2, '0');

// Cada código aceita a variante "%-x" (sem zero à esquerda) onde faz sentido.
const CODIGOS = {
  d: { preenchido: (d) => dois(d.getDate()), simples: (d) => String(d.getDate()) },
  m: { preenchido: (d) => dois(d.getMonth() + 1), simples: (d) => String(d.getMonth() + 1) },
  Y: { preenchido: (d) => String(d.getFullYear()), simples: (d) => String(d.getFullYear()) },
  y: { preenchido: (d) => dois(d.getFullYear() % 100), simples: (d) => String(d.getFullYear() % 100) },
  H: { preenchido: (d) => dois(d.getHours()), simples: (d) => String(d.getHours()) },
  M: { preenchido: (d) => dois(d.getMinutes()), simples: (d) => String(d.getMinutes()) },
  S: { preenchido: (d) => dois(d.getSeconds()), simples: (d) => String(d.getSeconds()) },
  B: { preenchido: (d) => MESES[d.getMonth()], simples: (d) => MESES[d.getMonth()] },
  b: { preenchido: (d) => MESES_CURTOS[d.getMonth()], simples: (d) => MESES_CURTOS[d.getMonth()] },
  A: { preenchido: (d) => DIAS[d.getDay()], simples: (d) => DIAS[d.getDay()] },
  a: { preenchido: (d) => DIAS_CURTOS[d.getDay()], simples: (d) => DIAS_CURTOS[d.getDay()] },
};

/**
 * @param {string} formato  ex.: "%-d de %B de %Y"
 * @param {Date} data
 * @returns {string} ex.: "26 de novembro de 2026". Códigos desconhecidos ficam como estão.
 */
function formatarDataEspanso(formato, data) {
  return String(formato).replace(/%(-?)([A-Za-z%])/g, (inteiro, semZero, letra) => {
    if (letra === '%') return '%';
    const codigo = CODIGOS[letra];
    if (!codigo) return inteiro;
    return semZero ? codigo.simples(data) : codigo.preenchido(data);
  });
}

// Soma `segundos` (positivo ou negativo) a uma data, como o parâmetro "offset" do Espanso.
function somarSegundos(data, segundos) {
  return new Date(data.getTime() + (Number(segundos) || 0) * 1000);
}

module.exports = { formatarDataEspanso, somarSegundos };
