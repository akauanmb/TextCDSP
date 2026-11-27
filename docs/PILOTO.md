# TextCDSP: roteiro do piloto

Piloto com **2 a 3 pessoas do setor, por uma semana**, antes de instalar para todos. O objetivo é descobrir o que quebra no uso real, não provar que funciona.

Quem conduz o piloto (a pessoa que administra os snippets) preenche a seção 1. Cada participante usa as seções 2 a 8 e anota o que achar estranho na seção 9.

## 1. Antes de começar (quem conduz)

- [ ] **Escolher os participantes:** pessoas que usam o Google Docs todos os dias, de preferência com computadores diferentes (um deles com o Windows mais antigo do setor).
- [ ] **Falar com a TI da PGE:** o instalador não é assinado digitalmente, e ferramentas que leem o teclado (como o Espanso) costumam exigir liberação no antivírus. Combine a liberação **antes** do piloto, para não confundir esse bloqueio com defeito do programa.
- [ ] **Conferir os snippets embutidos:** eles vêm dentro do programa (pasta `snippets-oficiais`, gerada por `node scripts/converter-textblaze.js <arquivo.json>`). Rode `npm run validar -- snippets-oficiais` e confira `0 erros`. Essa pasta **não vai para o git** (tem nomes da equipe e textos internos): antes de `npm run dist`, ela precisa existir neste computador.
- [ ] **Trocar um snippet durante o piloto** exige gerar e instalar um instalador novo (não há pasta compartilhada por enquanto). Combine como vai fazer isso.
- [ ] **Gerar o instalador:** `npm run dist` e anote a versão e o tamanho de `dist\TextCDSP-Setup-<versao>.exe`.
- [ ] **Entregar** o `.exe` e o `docs/INSTALACAO.md` aos participantes.
- [ ] **Combinar como relatar problemas** (seção 8) e quando será a conversa final.

## 2. Instalação

- [ ] A instalação terminou sem pedir senha de administrador.
- [ ] Apareceu o aviso azul do Windows (SmartScreen)? Anote. O texto do `INSTALACAO.md` foi suficiente para a pessoa seguir sozinha?
- [ ] O antivírus bloqueou ou avisou de algo? Anote o nome do programa e a mensagem.
- [ ] O ícone do TextCDSP (o escudo azul) apareceu na bandeja (talvez dentro do "^")?
- [ ] O programa tem o Espanso já instalado no computador? Se sim, apareceu o aviso de "Já existe um Espanso em execução"? Ficou claro o que fazer?
- [ ] Tempo total da instalação: ______ minutos.

## 3. Primeira execução

Não há mais pasta para configurar: os snippets vêm no programa.

- [ ] Em poucos segundos, o menu do ícone mostrou "Snippets atualizados".
- [ ] Ao dar dois cliques no ícone, a Biblioteca mostrou as 12 pastas (Nomes da equipe, Triagem jurídica, Fora do SUS...) e **148 snippets** no rodapé.
- [ ] Os atalhos mais usados funcionam (por exemplo, o nome de um colega com `-` e um da triagem com a barra invertida).
- [ ] Algum atalho com `-` ou `\` disparou sem querer no meio de uma palavra ou de um caminho de arquivo? Anote qual e onde.
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

Os snippets oficiais estão dentro do programa, então não dependem de rede nem de pasta.

- [ ] Desconectar da rede e continuar usando os atalhos: tudo segue funcionando.
- [ ] Reiniciar o computador **sem rede** e usar os atalhos: continuam funcionando.

## 6. Atualização dos snippets

Os snippets oficiais mudam junto com o programa: quem conduz gera um instalador novo e cada participante instala por cima. (Reativar a pasta compartilhada traria de volta a atualização sem reinstalar: o código está no projeto, comentado.)

- [ ] Depois de instalar a versão nova, a Biblioteca mostra o snippet novo, o texto alterado e não mostra o apagado.
- [ ] O menu do ícone mostra "Snippets atualizados" e a data nova.
- [ ] O atalho pessoal de cada participante continuou intacto depois de todas as atualizações.

## 7. Atualização do programa

**Por enquanto, sem aviso automático.** O aviso de nova versão (notificação e "Instalar versão X.Y.Z" no menu) lê a pasta compartilhada de snippets, que está desativada. O código continua no projeto e volta a funcionar quando a pasta for reativada (`npm run publicar -- <pasta>`).

Para testar a atualização agora, quem conduz gera um instalador de versão maior e cada participante o instala por cima:

1. Aumente a `version` do `package.json` (por exemplo, de `0.2.0` para `0.2.1`).
2. `npm run dist` e entregue o `.exe`.

**O que conferir (participantes):**

- [ ] O instalador fecha o programa, atualiza e abre sozinho, sem erro de "arquivo em uso" e sem pedir administrador.
- [ ] Os atalhos pessoais, as configurações e o início com o Windows continuaram como estavam.
- [ ] **Sobre o TextCDSP** mostra a versão nova.

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
