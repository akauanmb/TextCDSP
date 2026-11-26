'use strict';

// Único lugar que monta caminhos do TextCDSP. Nenhum outro módulo deve juntar caminhos por conta própria.
// Função pura (não importa Electron): quem chama passa os valores do `app`.
// Estrutura do motor conforme docs/ESPANSO-NOTAS.md (P1).

const path = require('node:path');

/**
 * @param {object} p
 * @param {boolean} p.empacotado     app.isPackaged
 * @param {string} [p.resourcesPath] process.resourcesPath (usado só empacotado)
 * @param {string} p.appPath         app.getAppPath() (em desenvolvimento, a raiz do projeto)
 * @param {string} p.userData        app.getPath('userData'), ou seja, %APPDATA%\TextCDSP
 */
function criarCaminhos({ empacotado, resourcesPath, appPath, userData }) {
  // Origem do motor: a pasta que contém VERSAO.txt e a subpasta espanso-portable.
  const origem = empacotado ? path.join(resourcesPath, 'espanso') : path.join(appPath, 'vendor', 'espanso');

  // Cópia do motor em uso, dentro dos dados do usuário.
  const engine = path.join(userData, 'engine');
  const raizMotor = path.join(engine, 'espanso-portable');
  const configMotor = path.join(raizMotor, '.espanso');
  const match = path.join(configMotor, 'match');
  const runtime = path.join(raizMotor, '.espanso-runtime');

  return {
    // Origem
    origem,
    origemVersao: path.join(origem, 'VERSAO.txt'),
    origemPortable: path.join(origem, 'espanso-portable'),

    // Dados do TextCDSP
    dados: userData,
    configJson: path.join(userData, 'config.json'),
    cache: path.join(userData, 'cache'),
    logs: path.join(userData, 'logs'),
    logApp: path.join(userData, 'logs', 'app.log'),

    // Motor em uso
    engine,
    engineVersao: path.join(engine, 'VERSAO.txt'),
    raizMotor,
    exe: path.join(raizMotor, 'espansod.exe'),
    configMotor,
    configDefault: path.join(configMotor, 'config', 'default.yml'),
    match,
    baseYml: path.join(match, 'base.yml'),
    pessoalYml: path.join(match, 'pessoal.yml'),
    oficial: path.join(match, 'oficial'),
    runtime,
    kvs: path.join(runtime, 'kvs'),
    logMotor: path.join(runtime, 'espanso.log'),

    // Arquivos do aplicativo
    exemplos: path.join(appPath, 'snippets', 'exemplos.yml'),
    icone: path.join(appPath, 'assets', 'icone.ico'),
  };
}

module.exports = { criarCaminhos };
