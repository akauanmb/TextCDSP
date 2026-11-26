# TextCDSP: regras do projeto

Expansor de texto para Windows usado pela CDSP. O plano completo, com os marcos, está em `docs/PLANO.md`.
Leia este arquivo inteiro antes de qualquer tarefa. Se a tarefa contradisser algo aqui, pare e pergunte.

## Arquitetura (não mude sem pedido explícito)

- **Motor de expansão:** Espanso *portable*, oficial e sem modificações (licença GPL-3).
  - Versão fixada em `espanso.lock.json`.
  - Baixado por `scripts/baixar-espanso.js` para `vendor/espanso/`. Essa pasta não vai para o git.
  - Fatos verificados sobre o Espanso (comandos, pastas, chaves de configuração) ficam em `docs/ESPANSO-NOTAS.md`.
  - Use só o que estiver lá. Não invente comandos nem chaves do Espanso.
- **Aplicativo:** Electron + Node.js (JavaScript, CommonJS, sem TypeScript, sem framework de interface).
  - Ícone na bandeja do Windows.
  - Controla o motor, sincroniza snippets e abre as janelas.
- **Instalador:** electron-builder, alvo NSIS, por usuário e sem administrador.
- **Snippets:** arquivos YAML no formato do Espanso.
  - Os snippets oficiais vêm de uma pasta-fonte compartilhada.
  - Os pessoais ficam em `pessoal.yml`. Só o próprio usuário altera esse arquivo, à mão ou pela janela Biblioteca (texto simples). A sincronização e as atualizações do app nunca o sobrescrevem.

## Estrutura de pastas

```
CLAUDE.md, package.json, espanso.lock.json, .gitignore
docs/            PLANO.md, ESPANSO-NOTAS.md
scripts/         scripts de desenvolvimento (baixar-espanso.js, validar.js)
snippets/        exemplos e biblioteca inicial (YAML do Espanso)
src/main/        processo principal do Electron (um módulo por responsabilidade)
src/shared/      código puro, sem Electron e sem acesso a disco (ex.: validador.js)
src/renderer/    janelas (HTML/CSS/JS puro), uma subpasta por janela
src/preload/     scripts de preload (ponte IPC)
assets/          ícones
test/            testes (node:test) e test/fixtures/
vendor/          (gitignored) Espanso baixado
dist/            (gitignored) saída do build
```

## Caminhos na máquina do usuário

- Dados: `%APPDATA%\TextCDSP\` (`app.getPath('userData')`).
  - `config.json`: configurações.
  - `engine\`: cópia do Espanso portable em uso.
  - `cache\ultima-valida\`: última versão válida dos snippets oficiais.
  - `logs\app.log`.
- Snippets oficiais em uso: `engine\<pasta de config do portable>\match\oficial\`.
- Snippets pessoais: `...\match\pessoal.yml`.

## Regras de código

- Interface e mensagens em português do Brasil. Nomes de arquivos e funções em português sem acento (ex.: `validarBiblioteca`).
- Segurança do Electron:
  - `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`.
  - Toda comunicação passa por `contextBridge` no preload.
  - Nenhum conteúdo remoto carregado em janelas.
- Nenhuma telemetria. Nenhum acesso à rede, exceto o que o marco pedir.
- Dependências: o mínimo possível. Antes de adicionar uma nova, justifique na resposta. Já aprovadas: `electron`, `electron-builder`, `yaml`.
- `src/shared/` não importa `fs`, `electron` nem nada com efeito colateral, para poder ser testado com dados em memória.
- Testes com `node:test` (`npm test`). Todo módulo em `src/shared/` tem teste.
- Os snippets oficiais **nunca** podem usar variáveis `shell` ou `script`, porque isso executaria comandos em todas as máquinas do setor. O validador rejeita essas variáveis.

## Comandos

- `npm test`: testes.
- `npm run validar -- <pasta>`: valida uma pasta de snippets.
- `npm run baixar-espanso`: baixa o motor para `vendor/`.
- `npm start`: abre o app em modo desenvolvimento.
- `npm run dist`: gera o instalador em `dist/`.

## Forma de trabalhar

- Faça só o que o marco pede. Não adiante funções de marcos futuros nem refatore o que não foi pedido.
- Ao terminar, rode `npm test` e os demais critérios de aceite do marco. Depois mostre:
  - o resultado de cada critério;
  - os arquivos criados ou alterados;
  - o que ficou pendente.
- Faça commit só ao final, com a mensagem indicada no marco. Não faça push.
