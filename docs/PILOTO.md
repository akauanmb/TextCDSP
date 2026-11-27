# TextCDSP: roteiro do piloto

Piloto com **2 a 3 pessoas do setor, por uma semana**, antes de instalar para todos. O objetivo é descobrir o que quebra no uso real, não provar que funciona.

Quem conduz o piloto (a pessoa que administra os snippets) preenche a seção 1. Cada participante usa as seções 2 a 8 e anota o que achar estranho na seção 9.

## 1. Antes de começar (quem conduz)

- [ ] **Escolher os participantes:** pessoas que usam o Google Docs todos os dias, de preferência com computadores diferentes (um deles com o Windows mais antigo do setor).
- [ ] **Falar com a TI da PGE:** o instalador não é assinado digitalmente, e ferramentas que leem o teclado (como o Espanso) costumam exigir liberação no antivírus. Combine a liberação **antes** do piloto, para não confundir esse bloqueio com defeito do programa.
- [ ] **Preparar uma pasta de snippets só para o piloto** (não a de produção), com os snippets reais mais usados. Rode `npm run validar -- <pasta>` e confira `0 erros`.
- [ ] **Quem pode gravar na pasta:** dê permissão de escrita só a quem administra. A pasta também distribui o instalador (`_instalador`), e quem escreve nela pode fazer todos os computadores do piloto receberem um programa novo. Os participantes só precisam de leitura.
- [ ] **Gerar o instalador:** `npm run dist` e anote a versão e o tamanho de `dist\TextCDSP-Setup-<versao>.exe`.
- [ ] **Entregar** o `.exe` e o `docs/INSTALACAO.md` aos participantes.
- [ ] **Combinar como relatar problemas** (seção 8) e quando será a conversa final.

## 2. Instalação

- [ ] A instalação terminou sem pedir senha de administrador.
- [ ] Apareceu o aviso azul do Windows (SmartScreen)? Anote. O texto do `INSTALACAO.md` foi suficiente para a pessoa seguir sozinha?
- [ ] O antivírus bloqueou ou avisou de algo? Anote o nome do programa e a mensagem.
- [ ] O ícone **TC** apareceu na bandeja (talvez dentro do "^")?
- [ ] O programa tem o Espanso já instalado no computador? Se sim, apareceu o aviso de "Já existe um Espanso em execução"? Ficou claro o que fazer?
- [ ] Tempo total da instalação: ______ minutos.

## 3. Primeira configuração

- [ ] A janela do TextCDSP abriu sozinha, na seção **Configurações**.
- [ ] A pessoa conseguiu escolher a pasta de snippets sem ajuda.
- [ ] O botão **Testar** mostrou o número certo de snippets e `0 erros`.
- [ ] Depois de **Salvar**, o menu do ícone mostrou "Snippets atualizados".
- [ ] O programa abriu sozinho depois de reiniciar o Windows.

## 4. Uso no Google Docs

Use durante a semana de trabalho normal, não só em testes.

- [ ] Os atalhos expandem no Google Docs (no navegador usado pela pessoa).
- [ ] Os atalhos com formulário (campos para preencher) funcionam.
- [ ] Os atalhos com formatação (negrito, listas) mantêm a formatação.
- [ ] Funciona em outro programa (Word, e-mail, PJe, Bloco de Notas)? Anote onde **não** funciona.
- [ ] Algum atalho disparou sem querer no meio de uma palavra ou de um endereço? Anote qual.
- [ ] Digitar rápido, ou com o computador lento, faz o atalho falhar ou sair pela metade?
- [ ] **Buscar** e **Copiar texto** na Biblioteca: a busca acha o que a pessoa procura? O texto colado no Google Docs sai certo?
- [ ] **Minimizar** a janela vira o ícone flutuante, que dá para arrastar; um clique reabre a janela. O ícone atrapalha ou toma o cursor do programa em que a pessoa escreve? Onde ele fica no segundo monitor, se houver?
- [ ] **Inserir**: com o cursor no Google Docs, abrir o TextCDSP, escolher um atalho de texto de várias linhas e clicar **Inserir** (ou Ctrl+Enter). O texto entra onde estava o cursor, com as quebras de linha e os acentos certos? O que a pessoa tinha copiado antes voltou? Em algum programa (principalmente os abertos como administrador) o texto não entrou?
- [ ] Criar, editar e excluir um **atalho pessoal** pela Biblioteca: o atalho novo funciona em até alguns segundos, sem reiniciar?

## 5. Comportamento offline

- [ ] Desconectar da rede (ou do Google Drive para computador) e continuar usando os atalhos: tudo segue funcionando.
- [ ] O menu do ícone mostra "Sem conexão com a pasta, usando versão de dd/mm hh:mm".
- [ ] Ao reconectar, o menu volta a "Snippets atualizados" em até o intervalo de sincronização.
- [ ] Reiniciar o computador **sem rede** e usar os atalhos: continuam funcionando (vêm da última versão válida guardada).

## 6. Atualização dos snippets

Quem conduz altera a pasta de snippets e cada participante confere.

- [ ] Adicionar um snippet novo: aparece na Biblioteca e funciona dentro do intervalo de sincronização (ou na hora, com **Atualizar snippets**).
- [ ] Alterar o texto de um snippet existente: o texto novo é usado.
- [ ] Apagar um snippet: ele deixa de funcionar.
- [ ] **Erro de propósito** (por exemplo, dois atalhos em que um começa com o outro, como `/cont` e `/contestacao`): chegou uma notificação de erro, os atalhos continuaram funcionando com a versão anterior e a seção Configurações mostra o erro. Corrija na pasta e confirme que volta ao normal.
- [ ] O atalho pessoal de cada participante continuou intacto depois de todas as atualizações.

## 7. Atualização do programa

Para testar, quem conduz publica uma versão nova **durante o piloto**.

**Como publicar (quem conduz):**

1. Aumente a `version` do `package.json` (por exemplo, de `0.1.0` para `0.1.1`).
2. `npm run dist`
3. `npm run publicar -- <pasta de snippets do piloto>` e escreva as notas da versão (uma linha).

**O que conferir (participantes):**

- [ ] Em até o intervalo de sincronização, chegou a notificação "Nova versão do TextCDSP disponível" **uma única vez**. Mesmo reiniciando o programa, ela não volta.
- [ ] O menu do ícone mostra **Instalar versão X.Y.Z**.
- [ ] Ao clicar, o texto de confirmação mostra as notas da versão.
- [ ] Depois de **Instalar agora**, o programa fecha, instala e abre sozinho, sem erro de "arquivo em uso" e sem pedir administrador.
- [ ] Os atalhos pessoais, a pasta configurada e o início com o Windows continuaram como estavam.
- [ ] O item **Instalar versão** sumiu do menu e **Sobre o TextCDSP** mostra a versão nova.
- [ ] Quem estava com a pasta **offline** no momento da publicação recebeu o aviso quando a conexão voltou.

## 8. Onde estão os logs e o que coletar em caso de problema

Cole estes endereços na barra do Explorador de Arquivos para abrir:

| O quê | Endereço |
|---|---|
| Log do TextCDSP (**o principal**) | `%APPDATA%\TextCDSP\logs\app.log` (ou menu do ícone: **Abrir pasta de logs**) |
| Log do motor de expansão | `%APPDATA%\TextCDSP\engine\espanso-portable\.espanso-runtime\espanso.log` |
| Estado da última sincronização | `%APPDATA%\TextCDSP\cache\estado.json` |
| Configurações | `%APPDATA%\TextCDSP\config.json` |

**Envie para quem conduz o piloto:**

1. O `app.log` (e o `espanso.log`, se o problema for um atalho que não expande).
2. A versão do programa (menu do ícone, **Sobre o TextCDSP**) e a do Windows.
3. O que a pessoa estava fazendo, **em qual programa** e o que apareceu na tela (uma foto ou captura ajuda muito).
4. O atalho que falhou e o que era esperado.
5. Se o ícone estava como **ativo**, **pausado** ou **erro** (passe o mouse sobre ele).

**Não envie** o `pessoal.yml`, a menos que o problema seja dele: ele pode ter textos pessoais.

Os logs registram o que o programa fez (sincronizações, erros, versões), mas **não** o que a pessoa digitou.

## 9. Registro do piloto

Cada participante anota, ao longo da semana:

| Dia | O que aconteceu | Programa | Atalho | Gravidade (atrapalhou / incomodou / detalhe) |
|---|---|---|---|---|
| | | | | |

## 10. Encerramento: seguir para todo o setor?

Reunir os participantes ao final da semana e decidir com base nestes critérios:

- [ ] Nenhum problema que **atrapalhou** o trabalho ficou sem solução.
- [ ] A instalação foi feita por todos sem ajuda além do `INSTALACAO.md` (ou o texto foi corrigido).
- [ ] A TI da PGE liberou o instalador (assinatura ou exceção no antivírus).
- [ ] A atualização do programa (seção 7) funcionou em todos os computadores do piloto.
- [ ] Os participantes querem continuar usando.

Se algum item falhar, registre o motivo, corrija e repita só a parte afetada num segundo piloto curto.
