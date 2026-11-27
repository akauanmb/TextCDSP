# TextCDSP: plano de implementação

**Objetivo final:** um instalador `TextCDSP-Setup-x.y.z.exe` que qualquer pessoa da CDSP instala sem permissão de administrador. Depois de instalado:

- os atalhos (`/cont`, `/qualif`...) funcionam no Google Docs e em qualquer programa do Windows;
- os snippets oficiais se atualizam sozinhos a partir de uma pasta compartilhada.

## Visão geral

```
TextCDSP (Electron, ícone na bandeja)
 ├── Motor: Espanso portable, sem modificações, iniciado e parado pelo app
 ├── Sincronização: pasta compartilhada → validação → snippets oficiais em uso
 ├── Janela principal com menu lateral (Marco 11): Biblioteca + Configurações
 │    ├── Biblioteca: buscar, copiar e inserir snippets, organizados em pastas
 │    └── Minimizada, vira um ícone flutuante e arrastável
 ├── Editor (modo administrador): cria snippets sem escrever YAML
 └── Instalador NSIS por usuário (sem administrador)
```

| Marco | Entrega | Quem faz | Depende de |
|---|---|---|---|
| 1 | Motor baixado e fatos do Espanso verificados | Sonnet + teste manual seu | — |
| 2 | Validador de snippets + biblioteca de exemplo | Sonnet | 1 |
| 3 | App na bandeja controlando o motor | Sonnet | 1, 2 |
| 4 | Sincronização com a pasta compartilhada + tela de configurações | Sonnet | 3 |
| 5 | Janela Biblioteca (busca e cópia) + criação de atalhos pessoais | Sonnet | 4 |
| 6 | Instalador `.exe` | Sonnet | 5 |
| 7 | Aviso de nova versão + piloto no setor | Sonnet + você | 6 |
| 8 | Editor visual de snippets (opcional) | Sonnet | 7 |
| 9 | Atalhos iniciados por caractere especial (lista permitida) | Sonnet + teste manual seu | 6 |
| 10 | Pastas nos snippets oficiais | Sonnet | 9 |
| 11 | Janela única com menu lateral + ícone flutuante | Sonnet + teste manual seu | 10 |
| 12 | Botão "Inserir" na caixa de texto ativa | Sonnet + teste manual seu | 11 |
| C | Conteúdo: converter os textos reais em snippets | Sonnet ou Opus | 2 (em paralelo) |

O **Marco 6 já entrega um executável usável**. Os marcos 7 e 8 são melhorias para o uso no dia a dia do setor.

Os **marcos 9 a 12** foram pedidos depois do Marco 6. **Ordem sugerida: 9, 10, 11, 12 e só então o 7**, para o piloto testar a interface final. O Marco 8 continua opcional e vem depois de todos.

---

## Decisões já tomadas (mude agora, se discordar)

Cada prompt depende destas escolhas. Se mudar alguma, ajuste também o `CLAUDE.md` **antes** de enviar o Marco 1.

1. **Electron + Node.** O Node já está instalado na máquina. O app e o instalador saem do mesmo projeto e nada exige administrador. Contra: o instalador fica com cerca de 100 MB.
2. **Espanso sem modificações, embutido no app.** O app usa a versão portable e não faz fork. Assim não é preciso compilar Rust e as atualizações do Espanso são só trocar a versão.
3. **Fonte dos snippets oficiais = uma pasta.** Pode ser o Google Drive para computador ou uma pasta de rede. A sincronização é uma cópia com validação, e o setor continua funcionando se a pasta ficar indisponível.
   - **Atenção:** confira se o repositório no GitHub está público. Se estiver, qualquer pessoa pode ler o que estiver nele.
   - Os textos oficiais da CDSP devem ficar na pasta compartilhada, não no repositório. Se preferir versionar os textos no git, deixe o repositório privado.
4. **Qualquer pessoa cria os próprios atalhos pessoais; só administradores publicam os oficiais.**
   - **Pessoais:** criados, editados e excluídos pela janela Biblioteca (Marco 5), sem ver YAML. Só texto simples, sem campos, escolhas ou formatação. Ficam no `pessoal.yml` de cada máquina.
   - **Oficiais:** publicados por quem tem permissão de escrita na pasta compartilhada. Podem usar todos os recursos (formulários, escolhas, texto formatado).

---

## Como usar cada prompt

1. Abra uma sessão nova do Claude Code na pasta do projeto e troque o modelo com `/model sonnet`.
2. **Nos marcos 3 a 12**, ative o *plan mode* (Shift+Tab) antes de colar o prompt. Leia o plano que o Sonnet propõe e aprove só se ele bater com os critérios de aceite. É aqui que se evita retrabalho.
3. Cole o prompt do marco **inteiro**.
4. Ao final, confira você mesmo os **critérios de aceite**. Se algum falhar, use o *prompt de correção* no fim deste documento, **na mesma sessão**.
5. Com tudo aprovado, rode `git push`. O Sonnet faz o commit, mas não o push.
6. (Opcional) Numa sessão com Opus, rode `/code-review` antes do push nos marcos 3, 4, 6, 10 e 12.

Se o Sonnet relatar que um fato contradiz o plano, **não improvise**. Por exemplo, se o Espanso portable não puder mudar de pasta. Traga o relatório para uma sessão com Opus e ajuste o plano primeiro.

---

## Marco 1: motor do Espanso e fatos verificados

**Por que primeiro:** todos os marcos seguintes dependem de detalhes do Espanso que precisam ser verificados na prática: comandos, pastas e chaves de configuração.

````text
Leia o CLAUDE.md e o docs/PLANO.md. Execute o MARCO 1 do docs/PLANO.md.

Objetivo: preparar o motor (Espanso portable para Windows) e registrar fatos verificados sobre ele. Os próximos marcos usarão SOMENTE o que você registrar.

Entregas:
1. package.json na raiz (name "textcdsp", version "0.1.0", private true, scripts "test": "node --test", "baixar-espanso": "node scripts/baixar-espanso.js"). Sem dependências por enquanto.
2. espanso.lock.json com { "versao", "url", "sha256" } da versão estável mais recente do Espanso portable para Windows x64. Pegue esses dados das releases oficiais em github.com/espanso/espanso. O sha256 deve ser calculado por você sobre o arquivo baixado e conferido com o publicado, se houver.
3. scripts/baixar-espanso.js:
   - baixa a URL do lock e confere o sha256 (aborta com mensagem clara se divergir);
   - extrai em vendor/espanso/ com PowerShell Expand-Archive via child_process (sem dependências npm);
   - é idempotente: se vendor/espanso/VERSAO.txt já tiver a versão do lock, não faz nada.
4. docs/ESPANSO-NOTAS.md respondendo cada pergunta abaixo com: resposta, comando usado para verificar e saída relevante. Marque como VERIFICADO o que você testou de fato e como NÃO VERIFICADO o que só leu na documentação.
   P1. Estrutura de pastas após extrair. Qual é a pasta de configuração no modo portable (onde ficam config/ e match/)? E a pasta de runtime/logs?
   P2. Se eu copiar a pasta inteira para outro lugar (ex.: %TEMP%\teste-espanso), ela continua funcionando com a configuração nova? (Teste de verdade.)
   P3. Comandos exatos para: iniciar o daemon em segundo plano sem janela de console, parar, ver o status e reiniciar. Quais executáveis, argumentos e códigos de saída? Teste cada um a partir do Node com child_process (spawn com windowsHide: true) e registre o comportamento: o processo fica preso? Retorna na hora?
   P4. Qual é o nome do processo em execução (para detectar no tasklist) e como diferenciar uma instância nossa de um Espanso instalado normalmente pelo usuário?
   P5. As chaves show_icon e show_notifications (ou equivalentes) existem nesta versão em config/default.yml? Quais as chaves para desligar o ícone próprio do Espanso e as notificações?
   P6. O Espanso carrega arquivos YAML em subpastas de match/ (ex.: match/oficial/x.yml)? Arquivos iniciados por "_" são ignorados?
   P7. Ao alterar, criar ou apagar um arquivo em match/ com o daemon rodando, ele recarrega sozinho? Em quanto tempo? (Veja no log.)
   P8. Uma chave desconhecida em um match (ex.: "categoria: x") gera erro, aviso ou é ignorada? A chave "label" é aceita?
   P9. Quando um arquivo YAML está inválido, o que acontece com os outros arquivos? Onde o erro aparece (log, CLI)?
   P10. Existe algum comando de CLI que liste os matches carregados ou valide a configuração sem iniciar o daemon?
   Para P5 a P10, use a pasta snippets/ do teste: copie espanso/cdsp.yml para a pasta match do portable extraído.
5. Ao final, pare o daemon e apague as cópias de teste. Deixe só o vendor/ limpo.

Fora do escopo: qualquer código do aplicativo Electron, validador ou interface.

Se alguma resposta tornar inviável a arquitetura do CLAUDE.md (ex.: o portable não pode mudar de pasta), destaque isso no topo do ESPANSO-NOTAS.md com o título "BLOQUEIO" e pare.

Critérios de aceite:
- npm run baixar-espanso roda duas vezes seguidas sem erro (a segunda não baixa de novo).
- docs/ESPANSO-NOTAS.md responde P1 a P10, e P1, P2, P3, P6 e P7 estão VERIFICADAS.
- git status não mostra nada de vendor/.

Commit: "Marco 1: motor Espanso portable e notas verificadas"
````

**Seu teste manual (depois do Sonnet):**

1. Siga as instruções de inicialização que ficaram no `ESPANSO-NOTAS.md`.
2. Coloque o `espanso/cdsp.yml` na pasta `match` do portable.
3. No Google Docs, teste os 6 atalhos do `espanso/LEIAME.md`.

Anote o que falhar. **Siga para o Marco 2 só se a expansão funcionar no Google Docs.**

---

## Marco 2: validador de snippets e biblioteca de exemplo

**Por que:** é a proteção que impede um snippet com erro, publicado na pasta compartilhada, de quebrar o expansor de todo o setor. A sincronização (Marco 4) e a Biblioteca (Marco 5) reutilizam este módulo.

````text
Leia o CLAUDE.md, o docs/PLANO.md e o docs/ESPANSO-NOTAS.md. Execute o MARCO 2.

Objetivo: um validador puro de bibliotecas de snippets do Espanso, com regras da CDSP, e a biblioteca de exemplo migrada.

Entregas:
1. Dependência: yaml (npm). Nenhuma outra.
2. src/shared/validador.js exportando:
   validarBiblioteca(arquivos) onde arquivos = [{ nome: "medicamentos.yml", conteudo: "<texto>" }]
   retorna { erros: Problema[], avisos: Problema[], snippets: Snippet[] }
   Problema = { arquivo, linha (número ou null), regra (código curto), mensagem (português, acionável) }
   Snippet = { arquivo, categoria (nome do arquivo sem .yml), trigger, label, tipo ("texto" | "formatado" | "formulario" | "escolha" | "data" | "misto"), campos: [{ nome, tipo, opcoes? }], preview (texto puro, até 300 caracteres, com {{var}} trocado por [var]) }
   Use yaml.parseDocument para obter números de linha.
3. Regras de ERRO (código da regra entre parênteses):
   - (yaml) arquivo não é YAML válido;
   - (estrutura) raiz sem lista "matches", ou chaves de raiz fora de: matches, global_vars;
   - (trigger-ausente) match sem "trigger" (string). "triggers", "regex" e "imports" não são permitidos nos oficiais;
   - (trigger-formato) trigger fora do padrão ^/[a-z0-9]{2,30}$;
   - (trigger-duplicado) mesmo trigger em dois matches (inclusive em arquivos diferentes);
   - (trigger-prefixo) um trigger é prefixo de outro (ex.: /cont e /contestacao). Informe os dois;
   - (saida) o match não tem exatamente uma entre replace, html e markdown;
   - (label) match sem "label" (string não vazia). Só se o ESPANSO-NOTAS.md confirmar que label é aceito (P8); caso contrário, troque esta regra por um comentário no código e avise;
   - (var-proibida) variável de tipo shell ou script, ou de qualquer tipo fora de: date, form, choice, echo, random, clipboard;
   - (var-indefinida) {{x}} ou {{x.campo}} usado na saída sem variável x declarada no match ou em global_vars;
   - (form-campo) em var form: campo em params.fields que não aparece como [[campo]] em params.layout; ou {{form.campo}} usado na saída sem [[campo]] no layout;
   - (data) var date sem params.format.
4. Regras de AVISO:
   - (var-nao-usada) variável declarada e não usada;
   - (locale) var date com format contendo %B ou %A sem locale "pt-BR";
   - (texto-vazio) saída vazia (exceto opção de choice com id vazio).
5. validarBiblioteca também aceita um parâmetro opcional { pessoais: [{nome, conteudo}] }. Conflitos de trigger, duplicado ou prefixo, entre pessoais e oficiais viram AVISO com regra "conflito-pessoal", nunca erro.
6. scripts/validar.js: CLI que lê todos os .yml de uma pasta (não recursivo, ignora arquivos iniciados por "_"), chama o validador e imprime:
   arquivo:linha [regra] mensagem
   separando ERROS e AVISOS e terminando com um resumo "N snippets, N erros, N avisos". Sai com código 1 se houver erro. Script npm: "validar": "node scripts/validar.js".
7. test/validador.test.js com pelo menos um teste por regra (o caso que dispara e o que não dispara). Use fixtures em test/fixtures/ ou strings no próprio teste.
8. Migração: mova espanso/cdsp.yml para snippets/exemplos.yml e adicione "label" a cada match. Mova espanso/LEIAME.md para docs/TESTE-MANUAL.md, corrigindo os caminhos citados. Apague a pasta espanso/.

Fora do escopo: Electron, interface, sincronização, leitura de disco dentro de src/shared/.

Critérios de aceite:
- npm test passa.
- npm run validar -- snippets termina com 0 erros.
- Uma pasta temporária com um arquivo contendo /cont e /contestacao faz npm run validar sair com código 1 e mostrar a regra trigger-prefixo com os dois triggers.
- src/shared/validador.js não importa fs, path nem electron.

Commit: "Marco 2: validador de snippets e biblioteca de exemplo"
````

---

## Marco 3: app na bandeja controlando o motor

````text
Leia o CLAUDE.md, o docs/PLANO.md e o docs/ESPANSO-NOTAS.md. Execute o MARCO 3. Use somente comandos e caminhos do Espanso registrados no ESPANSO-NOTAS.md.

Objetivo: um app Electron sem janela principal, com ícone na bandeja, que prepara, inicia e para o Espanso portable.

Entregas:
1. Dependências: electron (dev). Scripts: "start": "electron .". "main" no package.json aponta para src/main/index.js.
2. src/main/caminhos.js: centraliza todos os caminhos.
   - Motor de origem: em desenvolvimento, vendor/espanso; empacotado, process.resourcesPath/espanso.
   - Dados: app.getPath('userData'), com engine/, cache/ e logs/.
   - Pastas de config e match do motor, conforme o ESPANSO-NOTAS.md.
   Nenhum outro módulo monta caminhos por conta própria.
3. src/main/log.js: logger em logs/app.log (níveis info, aviso, erro; linha com data e hora ISO). Rotação simples: ao passar de 1 MB, renomeia para app.1.log.
4. src/main/config.js: lê e grava config.json com os padrões { fonteSnippets: "", intervaloSyncMin: 15, iniciarComWindows: true, modoAdmin: false }. Mescla com os padrões ao ler (chaves novas aparecem sozinhas). Grava de forma atômica (arquivo .tmp + rename).
5. src/main/motor.js:
   - preparar(): se engine/ não existe ou a versão em engine/VERSAO.txt difere da origem, copia a origem para engine/ preservando match/pessoal.yml, se existir. Sempre regrava config/default.yml com: ícone e notificações próprias do Espanso desligados (chaves do P5). Cria match/oficial/ e match/pessoal.yml (com comentário explicando como criar um atalho pessoal e um exemplo comentado) se não existirem. Remove o base.yml padrão do Espanso, se houver.
   - iniciar(), parar(), status() retornando "ativo" | "parado" | "erro".
   - detectarOutroEspanso(): true se houver processo do Espanso rodando fora da nossa pasta engine/ (critério do P4).
   - Copie snippets/exemplos.yml para match/oficial/exemplos.yml SOMENTE quando match/oficial/ estiver vazia. É provisório até o Marco 4.
6. src/main/bandeja.js e src/main/index.js:
   - Trava de instância única (requestSingleInstanceLock).
   - Na inicialização: preparar(). Se detectarOutroEspanso(), mostra dialog avisando que o Espanso já instalado precisa ser fechado ou desinstalado e não inicia o nosso. Senão, iniciar().
   - Ícone na bandeja (assets/icone.ico: gere um ícone simples com as letras "TC", 16/32/256 px) com tooltip "TextCDSP - ativo" ou "pausado" ou "erro".
   - Menu: linha de status (desabilitada); Pausar/Retomar; "Atualizar snippets" (desabilitado, rótulo "(em breve)"); "Abrir biblioteca" (desabilitado, "(em breve)"); "Abrir meus snippets pessoais" (abre pessoal.yml no editor padrão via shell.openPath); "Abrir pasta de logs"; separador; Sair.
   - Sair e before-quit param o motor. Se o app fechar de forma inesperada, na próxima inicialização ele deve encerrar um motor órfão da nossa pasta antes de iniciar.
   - iniciarComWindows: aplicar via app.setLoginItemSettings na inicialização.
   - Status verificado a cada 30 s. Se cair sozinho, tenta reiniciar 1 vez e depois mostra "erro" no tooltip.
7. Testes: test/config.test.js (mescla de padrões, gravação atômica) usando uma pasta temporária. O motor e a bandeja não precisam de teste automatizado.

Fora do escopo: sincronização, janelas (Biblioteca, configurações), instalador.

Critérios de aceite (rode e relate cada um):
- npm start: o ícone aparece, o status fica "ativo" e o Espanso não mostra ícone próprio.
- Com o app rodando, digitar /hoje em qualquer campo de texto expande (peça ao usuário para confirmar este item).
- Pausar faz /hoje parar de expandir; Retomar volta a funcionar.
- Sair encerra o motor: nenhum processo do Espanso fica no tasklist.
- Matar o processo do Electron pelo Gerenciador de Tarefas e rodar npm start de novo: não ficam dois motores.
- Editar pessoal.yml com um atalho novo: ele funciona sem reiniciar o app.
- npm test passa.

Commit: "Marco 3: app na bandeja controlando o motor"
````

---

## Marco 4: sincronização e tela de configurações

````text
Leia o CLAUDE.md, o docs/PLANO.md e o docs/ESPANSO-NOTAS.md. Execute o MARCO 4.

Objetivo: manter match/oficial/ igual à pasta-fonte compartilhada, sem nunca aplicar uma versão inválida, e uma janela de configurações.

Entregas:
1. src/main/sincronizacao.js com sincronizar(), que:
   a. Lê config.fonteSnippets. Se vazio: status "nao-configurado".
   b. Lê todos os .yml da fonte (não recursivo; ignora "_*" e a subpasta _historico). Fonte inacessível: status "offline", mantém o que está em uso e registra no log.
   c. Calcula um hash (sha256 do conjunto nome+conteúdo, em ordem). Igual ao último aplicado: nada a fazer, status "atualizado".
   d. Valida com validarBiblioteca(oficiais, { pessoais: [pessoal.yml] }). Com erro: NÃO aplica, status "erro-na-fonte", guarda os erros para exibição e registra no log. Mostra uma Notification do sistema só quando o hash com erro for novo (sem repetir a cada ciclo).
   e. Se for válido, aplica de forma atômica: escreve em match/oficial.novo/, renomeia match/oficial/ para match/oficial.antigo/, renomeia oficial.novo para oficial e apaga oficial.antigo. Se algo falhar no meio, restaura o antigo. Copia o mesmo conteúdo para cache/ultima-valida/ e grava estado.json com { hash, aplicadoEm, totalSnippets, avisos }.
   f. Na inicialização, se match/oficial/ estiver vazia e houver cache/ultima-valida/, restaura dele antes de tudo.
   g. Retorna { status, aplicadoEm, totalSnippets, erros, avisos }.
   Remova o comportamento provisório do Marco 3 que copiava snippets/exemplos.yml.
2. Agendamento: sincroniza na inicialização, a cada config.intervaloSyncMin minutos e pelo item de menu "Atualizar snippets" (agora habilitado). Sem execuções simultâneas (se uma estiver rodando, ignora o novo pedido).
3. Menu da bandeja: linha de status de sincronização (desabilitada), com textos exatos:
   - "Snippets atualizados (dd/mm hh:mm)"
   - "Sem conexão com a pasta, usando versão de dd/mm hh:mm"
   - "Erro na pasta de snippets, veja detalhes"
   - "Pasta de snippets não configurada"
   Mais o item "Configurações...".
4. Janela de configurações (src/renderer/configuracoes/ + src/preload/configuracoes.js):
   - Campo da pasta-fonte com botão "Escolher..." (dialog.showOpenDialog, openDirectory) e botão "Testar", que valida a pasta e mostra quantos snippets, erros e avisos ela tem, com a lista de problemas.
   - Intervalo de sincronização (5 a 120 min), "Iniciar com o Windows", "Modo administrador" (por enquanto só grava o valor).
   - Seção "Situação": status atual, data da última atualização, total de snippets e a lista de erros/avisos da última sincronização (arquivo:linha e mensagem).
   - Salvar grava o config.json e dispara uma sincronização.
   - Abre sozinha na primeira execução se a fonte não estiver configurada.
   - Visual simples e limpo, fonte do sistema, sem bibliotecas de interface.
   - IPC: canais nomeados "config:ler", "config:salvar", "fonte:escolher", "fonte:testar", "sync:estado", "sync:agora". Nada além disso exposto ao renderer.
5. Testes: test/sincronizacao.test.js com pastas temporárias. Cubra: fonte válida aplicada; fonte com erro não aplicada e o anterior mantido; fonte inacessível; hash igual não reaplica; arquivo removido na fonte é removido em oficial/; restauração a partir do cache. Para testar sem Electron, separe a lógica de disco em funções que recebem os caminhos por parâmetro.

Fora do escopo: janela Biblioteca, editor, instalador, aviso de nova versão.

Critérios de aceite:
- npm test passa.
- Configurar uma pasta local com snippets/exemplos.yml: em até 10 s, /hoje funciona e o menu mostra "Snippets atualizados".
- Introduzir um erro de propósito na fonte (/cont e /contestacao) e clicar "Atualizar snippets": aparece a notificação, o status vira "Erro na pasta...", e /hoje e /cont continuam funcionando com a versão anterior.
- Renomear a pasta-fonte: o status vira "Sem conexão..." e os atalhos continuam funcionando.
- Fechar o app, apagar match/oficial/ e abrir de novo: os atalhos voltam a partir do cache.

Commit: "Marco 4: sincronização com pasta compartilhada e configurações"
````

---

## Marco 5: janela Biblioteca e atalhos pessoais

````text
Leia o CLAUDE.md, o docs/PLANO.md e o docs/ESPANSO-NOTAS.md. Execute o MARCO 5.

Objetivo: uma janela onde qualquer pessoa encontra um snippet, vê o que ele faz e copia o texto quando não quiser ou não puder usar o atalho; e onde cria, edita e exclui os próprios atalhos pessoais de texto simples, sem ver YAML.

Entregas:
1. src/renderer/biblioteca/ + src/preload/biblioteca.js. Abre pelo menu da bandeja ("Abrir biblioteca", agora habilitado) e com clique duplo no ícone da bandeja. Uma única janela (se já estiver aberta, foca nela).
2. Dados: a lista de Snippet vem de validarBiblioteca, aplicada sobre match/oficial/ e pessoal.yml. Os pessoais aparecem marcados como "Pessoal". IPC: "biblioteca:listar", "biblioteca:copiar", "pessoal:salvar", "pessoal:excluir" e "pessoal:abrir-arquivo". Nada além disso.
3. Layout: à esquerda, busca + lista; à direita, os detalhes.
   - Busca instantânea (sem botão) em trigger, label, preview e categoria; sem diferenciar maiúsculas nem acentos.
   - Filtro por categoria (lista suspensa com "Todas" + categorias + "Pessoal").
   - Cada item da lista mostra o trigger em fonte monoespaçada, o label e a categoria.
   - Detalhes: trigger, label, tipo, campos do formulário (nome, tipo e opções) e o preview completo.
   - Botão "Copiar atalho": copia o trigger.
   - Botão "Copiar texto": copia a saída com os campos trocados por [nome_do_campo] e as datas já resolvidas para hoje. Para html, copia como HTML + texto puro no clipboard (clipboard.write com html e text), para colar formatado no Google Docs.
   - Atalhos de teclado: Ctrl+F foca a busca; setas navegam; Enter copia o texto; Esc fecha.
   - Rodapé: "N snippets, atualizado em dd/mm hh:mm".
   - A lista se atualiza sozinha quando uma sincronização aplicar uma versão nova (evento IPC "biblioteca:mudou").
4. Para resolver as datas em "Copiar texto", implemente em src/shared/ uma função pura que formate as datas do Espanso (%d, %-d, %m, %Y, %B, %A, %H, %M) em pt-BR, com teste.
5. Atalhos pessoais de texto simples:
   - Botão "Novo atalho pessoal" acima da lista. Abre, no painel da direita, um formulário com três campos: Atalho (ex.: /ola), Nome (vira o label) e Texto (área de várias linhas). Botões "Salvar" e "Cancelar".
   - Nos detalhes de um snippet pessoal "editável", aparecem "Editar" e "Excluir" (com confirmação). Editável = tem só trigger, label e replace, sem vars. Os pessoais que não são editáveis (escritos à mão com variáveis) mostram o aviso "Este atalho foi criado direto no arquivo" e o botão "Abrir arquivo" (pessoal:abrir-arquivo). Snippets oficiais nunca mostram Editar nem Excluir.
   - Validação no formulário, com a mensagem ao lado do campo e sem fechar o formulário:
     * atalho no padrão ^/[a-z0-9]{2,30}$ (normalize para minúsculas; se faltar a barra inicial, acrescente);
     * nome e texto não vazios;
     * o texto não pode conter "{{" nem "}}" (o Espanso interpretaria como variável);
     * rode validarBiblioteca com a biblioteca inteira simulada após a mudança (oficiais + pessoais). Qualquer trigger-duplicado ou trigger-prefixo que envolva o atalho novo BLOQUEIA o salvamento, mesmo quando o conflito é com um oficial. A mensagem cita o outro atalho e de onde ele vem ("já existe o atalho oficial /cont").
   - Gravação: implemente em src/shared/pessoais.js uma função pura aplicarAlteracaoPessoal(conteudoYaml, operacao), onde operacao = { tipo: "criar" | "editar" | "excluir", triggerOriginal?, trigger?, label?, texto? }, que devolve o novo conteúdo. Use yaml.parseDocument e altere só o match afetado, preservando comentários, ordem e os matches escritos à mão. Precisa funcionar com o pessoal.yml inicial do Marco 3 (só comentários, sem "matches"). Para o texto, use bloco literal (|-) do YAML quando houver quebra de linha.
   - Se o pessoal.yml atual não for YAML válido (editado à mão com erro), NÃO grava. Mostra "Seu arquivo de atalhos pessoais tem um erro na linha N" com o botão "Abrir arquivo".
   - No processo principal: leia, aplique, grave de forma atômica (.tmp + rename) e emita "biblioteca:mudou". O Espanso recarrega sozinho (P7 do ESPANSO-NOTAS.md); não reinicie o motor.
   - Antes de cada gravação, mantenha uma cópia em pessoal.yml.bak (só a última).
6. Testes: test/pessoais.test.js cobrindo: criar no arquivo inicial só com comentários; criar com matches existentes; editar mudando o trigger; excluir; preservação de comentários e de um match escrito à mão com vars; texto com várias linhas, aspas, dois-pontos e acentos (o resultado tem que ser lido de volta pelo validador com o mesmo texto).

Fora do escopo: criar ou editar snippets oficiais; snippets pessoais com campos, escolhas, datas ou formatação.

Critérios de aceite:
- npm test passa.
- Buscar "preliminar" (sem acento ou com acento) encontra /prelim.
- "Copiar texto" de /fmt e colar no Google Docs mantém negrito e lista numerada.
- Publicar um snippet novo na pasta-fonte e clicar "Atualizar snippets": ele aparece na Biblioteca aberta sem reabrir a janela.
- Criar o atalho pessoal /ola com um texto de 3 linhas com acentos: em até 5 s ele funciona no Google Docs, sem reiniciar o app, e as quebras de linha saem corretas.
- Editar /ola para /saudacao: /ola para de funcionar e /saudacao funciona.
- Tentar criar /contestacao (com /cont oficial existente): o salvamento é bloqueado com a mensagem citando /cont.
- Escrever à mão no pessoal.yml um match com var date e criar outro atalho pela janela: o escrito à mão continua no arquivo, com seus comentários.
- Excluir /saudacao: ele some da lista e para de funcionar.

Commit: "Marco 5: janela Biblioteca e atalhos pessoais"
````

---

## Marco 6: instalador (o executável)

````text
Leia o CLAUDE.md e o docs/PLANO.md. Execute o MARCO 6.

Objetivo: gerar dist/TextCDSP-Setup-<versao>.exe, que instala por usuário, sem administrador, e deixa tudo funcionando.

Entregas:
1. Dependência dev: electron-builder. Script "dist": roda baixar-espanso e depois electron-builder --win nsis.
2. Configuração do electron-builder no package.json:
   - appId "textcdsp.cdsp", productName "TextCDSP";
   - win.target nsis x64, ícone assets/icone.ico;
   - nsis: oneClick true, perMachine false, allowElevation false, createDesktopShortcut false, createStartMenuShortcut true, runAfterFinish true, artifactName "TextCDSP-Setup-${version}.exe";
   - extraResources: vendor/espanso → espanso;
   - files: só src/, assets/, package.json e snippets/exemplos.yml (nada de test/, docs/, scripts/, vendor/).
3. Desinstalação: script NSIS customizado (build/installer.nsh, via nsis.include) que, antes de remover os arquivos, encerra o motor que roda a partir de %APPDATA%\TextCDSP\engine (mesmo critério do P4) e o próprio TextCDSP. Os dados em %APPDATA%\TextCDSP NÃO são apagados (preserva pessoal.yml).
4. Atualização por cima: instalar uma versão nova com o app aberto deve fechar o app, atualizar e reabrir. Na primeira execução da versão nova, motor.preparar() troca o motor se a versão do Espanso mudou, preservando pessoal.yml.
5. Licenças: THIRD_PARTY_NOTICES.txt (incluído no pacote) com o aviso da GPL-3 do Espanso, a versão usada e o link para o código-fonte correspondente à release. Item "Sobre o TextCDSP" no menu da bandeja: dialog com a versão do app, a versão do Espanso e um botão que abre o THIRD_PARTY_NOTICES.
6. docs/INSTALACAO.md para os usuários do setor, curto e em linguagem simples:
   - como instalar e o que fazer no aviso do SmartScreen ("Mais informações" > "Executar assim mesmo");
   - como configurar a pasta;
   - como criar um atalho pessoal;
   - como desinstalar.

Fora do escopo: assinatura digital do executável, aviso de nova versão.

Critérios de aceite (relate cada um; os que exigem outro usuário do Windows, peça para eu testar):
- npm run dist gera o .exe sem erros.
- Instalar com um usuário SEM permissão de administrador: nenhum pedido de elevação; ícone na bandeja; atalhos funcionando após configurar a pasta.
- Reiniciar o Windows: o app inicia sozinho.
- Instalar a mesma versão por cima com o app aberto: termina sem erro de "arquivo em uso".
- Desinstalar: nenhum processo do Espanso ou do TextCDSP sobra; %APPDATA%\TextCDSP\engine\...\pessoal.yml continua lá.
- O tamanho do .exe está informado no relatório.

Commit: "Marco 6: instalador NSIS por usuário"
````

**Depois do Marco 6, antes de distribuir:**

- Leve o `.exe` à TI da PGE. Executáveis sem assinatura digital costumam ser barrados pelo antivírus ou pelo SmartScreen. Pergunte se a TI pode assiná-lo com o certificado do órgão ou liberar a instalação.
- Ferramentas que leem o teclado (como o Espanso) também costumam exigir liberação.

---

## Marco 7: aviso de nova versão e piloto

````text
Leia o CLAUDE.md e o docs/PLANO.md. Execute o MARCO 7.

Objetivo: avisar os usuários quando houver um instalador novo na pasta compartilhada, sem atualização silenciosa.

Entregas:
1. Convenção: a pasta-fonte pode ter a subpasta _instalador/ com versao.json { "versao": "0.2.0", "arquivo": "TextCDSP-Setup-0.2.0.exe", "notas": "texto curto" } e o .exe.
2. A cada sincronização, se _instalador/versao.json tiver uma versão maior que app.getVersion() (comparação semver; escreva a função em src/shared/ com teste, sem dependência), mostra uma Notification "Nova versão do TextCDSP disponível" uma vez por versão. O menu da bandeja ganha o item "Instalar versão X.Y.Z", que executa o .exe da pasta (shell.openPath) e encerra o app em seguida.
3. scripts/publicar.js (npm run publicar -- <pasta-fonte>): copia dist/TextCDSP-Setup-<versao>.exe para <pasta-fonte>/_instalador/ e grava o versao.json, pedindo as notas pelo terminal. Recusa se o .exe da versão atual do package.json não existir.
4. docs/PILOTO.md: checklist de piloto com 2 a 3 pessoas por uma semana. Itens: instalação, primeira configuração, uso no Google Docs, comportamento offline, atualização de snippets, atualização do app, onde estão os logs e o que coletar em caso de problema.

Critérios de aceite:
- npm test passa.
- Com o app na versão 0.1.0, publicar uma 0.1.1 numa pasta-fonte de teste: a notificação aparece uma vez e "Instalar versão 0.1.1" atualiza e reabre o app.

Commit: "Marco 7: aviso de nova versão e roteiro de piloto"
````

---

## Marco 8 (opcional): editor visual de snippets

Faça este marco só se, depois do piloto, editar YAML for um obstáculo para quem administra os snippets **oficiais**. Os atalhos pessoais de texto simples já existem desde o Marco 5. Até lá, os oficiais podem ser escritos pedindo ao Claude (ver Trilha C).

````text
Leia o CLAUDE.md e o docs/PLANO.md. Execute o MARCO 8.

Objetivo: no modo administrador, criar e editar snippets oficiais sem escrever YAML, com todos os tipos.

Entregas:
1. Na Biblioteca, se config.modoAdmin for true: botões "Novo oficial", "Editar" e "Excluir" nos snippets oficiais. Reaproveite o formulário e a lógica de src/shared/pessoais.js do Marco 5, generalizando a função para qualquer tipo de match em vez de duplicá-la. Os atalhos pessoais continuam só com texto simples.
2. Formulário de edição por tipo:
   - texto: trigger, label, categoria (arquivo) e texto;
   - formatado: editor com negrito, itálico, sublinhado, lista numerada e com marcadores, gerando HTML limpo (somente p, b, i, u, ol, ul, li, br);
   - formulário: texto com botão "Inserir campo" (nome + tipo: texto curto, texto longo, lista de opções) e "Inserir data";
   - escolha: lista de pares (rótulo curto, texto inserido).
   Mostra uma prévia ao lado.
3. Gravação:
   - Edite o YAML com yaml.parseDocument, alterando só o match afetado e preservando comentários e a ordem dos demais.
   - Antes de gravar, rode validarBiblioteca com a biblioteca inteira simulada após a mudança. Com erro, mostra os erros e não grava.
   - Concorrência: guarde o hash do arquivo ao abrir; se mudou na fonte até o momento de salvar, recusa com "Outra pessoa alterou este arquivo, recarregue".
   - Antes de sobrescrever, copie o arquivo para <fonte>/_historico/AAAA-MM-DD_HHMMSS_<arquivo>.yml.
   - Após gravar, dispara sincronizar().
4. Testes da função generalizada (inclusão, edição e exclusão de cada tipo, preservação de comentários). Os testes de test/pessoais.test.js do Marco 5 continuam passando sem alteração.

Critérios de aceite:
- npm test passa.
- Criar no editor um snippet de cada tipo: todos funcionam no Google Docs depois de "Atualizar snippets".
- Tentar criar /contestacao existindo /cont: o editor mostra o erro de prefixo e não grava.
- Comentários existentes no arquivo YAML continuam lá após uma edição.

Commit: "Marco 8: editor de snippets no modo administrador"
````

---

## Marcos 9 a 12: melhorias pedidas depois do Marco 6

### Decisões já tomadas (26/11/2026)

1. **Pastas só nos snippets oficiais.** As subpastas da pasta compartilhada viram pastas na Biblioteca. Os pessoais continuam em `pessoal.yml`, numa pasta "Pessoal".
2. **O atalho sempre começa com um caractere especial de uma lista fixa: `/ ; ! # = +`.** O `/` continua valendo, então nenhum atalho existente precisa mudar.
   - **Ficam fora da lista:**
     - letras, números e espaço;
     - teclas mortas do teclado ABNT2 e do US-Internacional (`´ ` ~ ^ ¨ ' "`), que ficam esperando a tecla seguinte;
     - caracteres comuns dentro de palavras, números e endereços (`- . , : _ & ? %`);
     - `@`, que abre o menu de menções do Google Docs;
     - `\` (caminhos de arquivo) e `*` (formatação automática).
   - O `/` tem um problema conhecido: ao digitar um endereço como `site.com/prazo`, o `/prazo` expande. Trocar o `/` dos oficiais existentes é uma decisão de conteúdo, fora destes marcos.
3. **Uma janela só, com menu lateral: Biblioteca e Configurações.** Minimizada, ela vira um ícone pequeno, flutuante e arrastável. Um clique no ícone reabre a janela.
4. **"Inserir" só para atalhos de texto simples** (sem campos, escolhas, datas nem formatação). Os outros continuam com "Copiar texto" ou com o próprio atalho.

Antes de cada marco, confira se o `CLAUDE.md` ainda bate com estas decisões. Os marcos 11 e 12 o atualizam no que for preciso.

---

## Marco 9: atalhos iniciados por caractere especial

**Por que primeiro:** é uma mudança pequena e pura no validador. Os marcos seguintes, a Trilha C e o formulário de atalhos pessoais dependem dela.

````text
Leia o CLAUDE.md, o docs/PLANO.md (inclusive "Marcos 9 a 12: decisões já tomadas") e o docs/ESPANSO-NOTAS.md. Execute o MARCO 9.

Objetivo: o atalho passa a poder começar com qualquer caractere de uma lista fixa de caracteres especiais (/ ; ! # = +), e nunca com outra coisa. Os atalhos que começam com "/" continuam válidos.

Entregas:
1. src/shared/validador.js:
   - exporte PREFIXOS_TRIGGER = ['/', ';', '!', '#', '=', '+']. É a única lista: nenhum outro módulo repete esses caracteres.
   - monte PADRAO_TRIGGER a partir dela: um caractere da lista seguido de 2 a 30 letras minúsculas sem acento ou números. Escape os caracteres ao montar a expressão regular.
   - a mensagem da regra trigger-formato passa a citar os caracteres permitidos (ex.: "comece com um destes caracteres: / ; ! # = +, seguido de 2 a 30 letras minúsculas sem acento ou números").
   - trigger-duplicado e trigger-prefixo não mudam. Atalhos com caracteres iniciais diferentes nunca conflitam (/cont e ;cont convivem).
2. src/shared/pessoais.js (formulário de atalho pessoal):
   - normalizarTrigger: se o atalho começar com letra ou número, acrescenta "/" (como hoje). Se começar com um caractere especial fora da lista, não acrescenta nada, e a validação recusa.
   - a mensagem de erro do campo cita os caracteres permitidos.
3. Janela Biblioteca: o texto de ajuda e o exemplo do campo Atalho mostram a lista (ex.: "/ola ou ;ola").
4. docs/ESPANSO-NOTAS.md, nova pergunta "P11. Atalhos iniciados por ; ! # = +":
   - use uma cópia do motor, como no roteiro de teste manual do fim do arquivo, com um match por caractere da lista;
   - registre o resultado de `espansod.exe match list -j` (VERIFICADO);
   - a expansão ao digitar fica NÃO VERIFICADO até o teste manual do critério de aceite;
   - se algum caractere não carregar, tire-o da lista e explique na resposta.
5. Testes:
   - test/validador.test.js: um caso válido para cada caractere da lista; casos inválidos para letra, número, espaço, "@", "-", ".", "´", "~", "^" e "'". O prefixo entre atalhos com o mesmo caractere inicial (;cont e ;contestacao) dá erro; /cont e ;cont juntos não dão.
   - test/pessoais.test.js: "ola" vira "/ola"; ";ola" fica igual; "@ola" é recusado com a mensagem que cita a lista.
6. Documentação:
   - na Trilha C deste PLANO.md, troque "Trigger no padrão /[a-z0-9]{2,30}" pela regra nova;
   - em docs/INSTALACAO.md, na parte do atalho pessoal, explique os caracteres permitidos.

Fora do escopo: trocar o "/" dos atalhos existentes; caractere inicial configurável; mudar as demais regras do validador.

Critérios de aceite:
- npm test passa.
- npm run validar -- snippets continua com 0 erros.
- Pasta temporária com ;cont e ;contestacao: npm run validar sai com código 1 e mostra trigger-prefixo. Com /cont e ;cont: 0 erros.
- Pasta com @cont ou cont: erro trigger-formato, com a lista de caracteres na mensagem.
- Criar pela Biblioteca os atalhos pessoais ;ola, !ola, #ola, =ola e +ola: cada um funciona no Google Docs (peça ao usuário para confirmar). O que não expandir sai da lista e é registrado na P11.
- Tentar criar @ola: o formulário recusa e cita os caracteres permitidos.
- Buscar ";ola" na Biblioteca encontra o atalho.

Commit: "Marco 9: atalhos iniciados por caractere especial"
````

---

## Marco 10: pastas nos snippets oficiais

**Por que:** com muitos snippets, uma lista plana de arquivos fica difícil de navegar. O Espanso já carrega subpastas de `match/` (P6), então o motor não muda: muda o que a sincronização copia e como a Biblioteca mostra.

````text
Leia o CLAUDE.md, o docs/PLANO.md (inclusive "Marcos 9 a 12: decisões já tomadas") e o docs/ESPANSO-NOTAS.md (principalmente P6 e P7). Execute o MARCO 10.

Objetivo: a pasta compartilhada pode ter subpastas (ex.: Medicamentos/contestacao.yml, Medicamentos/Recursos/agravo.yml). A sincronização reproduz a árvore em match/oficial/ e a Biblioteca mostra os snippets em pastas que abrem e fecham.

Entregas:
1. Leitura (src/main/sincronizacao.js, lerFonte):
   - passa a ler as subpastas recursivamente (com uma trava de segurança de 10 níveis);
   - ignora arquivos iniciados por "_", pastas iniciadas por "_" ou "." (como _historico e o _instalador do Marco 7) e o que não for .yml;
   - o "nome" de cada arquivo passa a ser o caminho relativo com "/" (ex.: "Medicamentos/contestacao.yml"), também no Windows;
   - o limite de 3 níveis NÃO é aplicado aqui, e sim no validador (entrega 4), para a regra ficar num lugar só;
   - mantenha o tempo máximo de leitura que já existe;
   - o hash usa o caminho relativo. Na primeira sincronização depois da atualização do app, os snippets são reaplicados uma vez (registre isso no log, é esperado).
2. Aplicação (substituirPasta e restaurarDoCache): cria as subpastas ao gravar em staging e em cache/ultima-valida/. temArquivosYml passa a procurar também nas subpastas. Um arquivo movido de pasta na fonte sai do lugar antigo (a troca da pasta inteira já garante isso; cubra com teste).
3. scripts/validar.js passa a usar a mesma lerFonte, para que a regra de quais arquivos entram seja uma só. O resumo continua igual.
4. src/shared/validador.js:
   - Snippet ganha "pasta": o caminho da pasta, com "" na raiz. "categoria" passa a ser o caminho sem a extensão (ex.: "Medicamentos/contestacao").
   - nova regra de ERRO (caminho-profundo): arquivo em mais de 3 níveis de subpastas, citando o caminho. Como todo erro, impede a aplicação;
   - nada de path nem fs: trate o caminho como texto.
   - Os erros já citam "arquivo" com o caminho relativo; confira as mensagens de trigger-duplicado e trigger-prefixo entre pastas diferentes.
5. src/shared/arvore.js (puro, carregável por <script> na janela como o busca.js), com montarArvore(snippets):
   - devolve nós { tipo: "pasta" | "arquivo", nome, caminho, filhos, total };
   - cada arquivo é um nó, com os snippets dele como filhos;
   - ordem pt-BR; a pasta "Pessoal" sempre por último.
   - Teste em test/arvore.test.js.
6. Biblioteca (src/main/biblioteca.js e src/renderer/biblioteca/):
   - a lista vira uma árvore: pastas e arquivos com seta para abrir e fechar e o total de snippets ao lado. Os snippets ficam dentro do arquivo deles. Arquivos da raiz aparecem como hoje, no primeiro nível. Os pessoais ficam na pasta "Pessoal".
   - a lista suspensa "Categoria" sai.
   - a busca continua instantânea. Com texto na busca, a árvore vira uma lista plana dos resultados, cada um com o caminho ("Medicamentos › contestacao"). Buscar o nome de uma pasta encontra os snippets dela.
   - o estado aberto/fechado das pastas é lembrado enquanto o app estiver aberto (inclusive quando a lista é relida por "biblioteca:mudou"). Começa tudo fechado.
   - teclado: setas para cima e para baixo percorrem os itens visíveis; seta para a direita abre a pasta; seta para a esquerda fecha ou volta para a pasta de cima; Enter num snippet copia o texto, como hoje; Enter numa pasta abre ou fecha.
   - os detalhes mostram "Pasta: Medicamentos › contestacao".
7. Documentação:
   - na Trilha C deste PLANO.md, o destino passa a ser <pasta-fonte>/<pasta>/<categoria>.yml (até 3 níveis);
   - em docs/INSTALACAO.md, uma seção curta "Para quem administra a pasta compartilhada": subpastas, limite de 3 níveis e o que é ignorado.
8. Testes em test/sincronizacao.test.js, com pastas temporárias:
   - árvore com raiz e 2 níveis aplicada igual;
   - _historico e _pasta ignoradas;
   - arquivo no 4º nível bloqueia a aplicação e mantém o anterior;
   - arquivo movido de pasta;
   - restauração do cache com subpastas;
   - o hash muda quando só o caminho muda.

Fora do escopo: pastas nos atalhos pessoais; criar, renomear ou mover pastas pelo app; mudanças no motor.

Critérios de aceite:
- npm test passa.
- Pasta-fonte de teste com exemplos.yml na raiz, Medicamentos/contestacao.yml, Medicamentos/Recursos/agravo.yml e _historico/velho.yml: npm run validar -- <pasta> conta só os snippets dos três primeiros.
- Configurar essa pasta no app: em até 10 s, match/oficial/ tem a mesma árvore (sem _historico) e os atalhos de todos os níveis funcionam no Google Docs.
- /cont na raiz e /contestacao em Medicamentos/: a sincronização não aplica, e a mensagem cita os dois caminhos.
- Um arquivo em A/B/C/D/x.yml: erro caminho-profundo, a versão anterior continua em uso.
- A Biblioteca mostra a árvore, abre e fecha pastas pelo mouse e pelo teclado, e a busca mostra o caminho de cada resultado.
- Fechar o app, apagar match/oficial/ e abrir de novo: a árvore volta do cache.

Commit: "Marco 10: pastas nos snippets oficiais"
````

---

## Marco 11: janela única com menu lateral e ícone flutuante

**Por que:** hoje Biblioteca e Configurações são duas janelas separadas. Juntas, ficam num só lugar, que se recolhe num ícone pequeno sempre à mão. O Marco 12 usa esse ícone.

````text
Leia o CLAUDE.md, o docs/PLANO.md (inclusive "Marcos 9 a 12: decisões já tomadas") e o docs/ESPANSO-NOTAS.md. Execute o MARCO 11.

Objetivo: substituir as janelas Biblioteca e Configurações por uma janela principal com menu lateral. Ao ser minimizada, ela vira um ícone pequeno, flutuante, sempre visível e arrastável, que reabre a janela com um clique.

Entregas:
1. Janela principal:
   - src/main/janelaPrincipal.js, src/renderer/principal/ e src/preload/principal.js substituem janelaBiblioteca.js, janelaConfiguracoes.js, src/renderer/biblioteca/, src/renderer/configuracoes/ e os dois preloads, que são apagados.
   - Uma única janela, título "TextCDSP", cerca de 1100x720, mínimo de 860x560.
   - Mesmas regras de segurança de hoje: contextIsolation, sandbox, sem navegação, sem novas janelas, sem permissões e IPC aceito só da própria janela.
2. Menu lateral à esquerda, com os itens "Biblioteca" e "Configurações" e o item ativo destacado. No rodapé do menu:
   - o texto de status da sincronização (o mesmo da bandeja);
   - o botão "Minimizar para ícone".
   As seções são só escondidas e mostradas, nunca recriadas: trocar de seção não perde o que foi digitado.
3. Conteúdo das seções:
   - a Biblioteca e as Configurações continuam com tudo o que fazem hoje (inclusive a árvore do Marco 10 e os atalhos pessoais do Marco 5);
   - reaproveite os scripts atuais como arquivos separados carregados por <script> (ex.: principal/biblioteca.js, principal/configuracoes.js), sem bundler e sem framework;
   - unifique o CSS que for igual.
4. IPC:
   - os canais existentes mantêm os nomes: biblioteca:*, pessoal:*, config:*, fonte:*, sync:*;
   - novos: "janela:secao" (do processo principal para a página: abre numa seção) e "janela:minimizar-para-icone" (da página para o processo principal).
   - Nada além disso.
5. Quem abre o quê:
   - bandeja "Abrir biblioteca" e clique duplo no ícone da bandeja: seção Biblioteca;
   - bandeja "Configurações...", clique na notificação de erro e primeira execução sem pasta configurada: seção Configurações;
   - abrir o TextCDSP de novo pelo menu Iniciar (second-instance): mostra a janela, em vez de só registrar no log.
   Se a janela já existir, ela vem para a frente na seção pedida. Nunca existem duas.
6. Ícone flutuante (src/main/iconeFlutuante.js, src/renderer/icone/, src/preload/icone.js):
   - BrowserWindow de 48x48: sem moldura, fundo transparente, redondo, sem redimensionar, sempre por cima, fora da barra de tarefas e do Alt+Tab, focusable: false (não tira o foco do programa em que a pessoa está digitando). Mostre com showInactive().
   - Visual: o ícone "TC" do app (gere um PNG com o scripts/gerar-icone.js, se ainda não houver). Levemente transparente; opaco ao passar o mouse. Dica: "TextCDSP: clique para abrir, arraste para mover".
   - Arrastar: implemente com pointerdown/pointermove/pointerup e setPointerCapture, enviando a posição de tela ao processo principal, que chama setPosition. Não use -webkit-app-region: drag (ele engole o clique). Movimento de menos de 4 px conta como clique.
   - Clique: abre a janela principal na última seção usada e esconde o ícone.
   - Botão direito: menu nativo com "Abrir TextCDSP" e "Esconder ícone". Escondido, a janela continua acessível pela bandeja.
   - Canais: "icone:mover", "icone:abrir" e "icone:menu", aceitos só da janela do ícone. Valide os números recebidos.
   - Posição: gravada em config.json ao soltar (chave posicaoIcone { x, y }), sem disparar sincronização. Ao mostrar, se a posição não estiver na área de trabalho de nenhum monitor (screen.getAllDisplays), use o canto inferior direito do monitor principal, com 24 px de margem. Limite o arraste à área de trabalho.
7. Minimizar:
   - nova configuração "minimizarParaIcone" (padrão true), com uma caixa "Ao minimizar, transformar a janela num ícone flutuante" na seção Configurações;
   - ligada: minimizar (botão da barra de título, botão do menu lateral ou Esc) esconde a janela e mostra o ícone;
   - desligada: minimiza normalmente para a barra de tarefas;
   - fechar (X) continua fechando a janela; o app segue na bandeja e o ícone não aparece.
   - config.js valida as duas chaves novas.
8. Caminhos novos em src/main/caminhos.js. Ajuste os testes que citam os arquivos antigos (ex.: test/empacotamento.test.js) sem enfraquecer o que eles verificam.
9. Documentação:
   - no CLAUDE.md, troque "pela janela Biblioteca" por "pela seção Biblioteca da janela principal";
   - em docs/INSTALACAO.md, atualize onde ficam Biblioteca e Configurações e explique o ícone flutuante.

Fora do escopo: o botão Inserir (Marco 12); ícone visível com a janela fechada; mudanças no funcionamento da Biblioteca ou das Configurações.

Critérios de aceite (os de mouse e de vários monitores, peça para eu confirmar):
- npm test passa.
- Bandeja "Abrir biblioteca" e "Configurações...": abrem a MESMA janela, cada um na sua seção.
- Digitar algo no campo da pasta, ir para a Biblioteca e voltar: o texto continua lá.
- Tudo dos marcos 4, 5 e 10 continua funcionando na janela nova: Testar, Salvar, árvore, busca, copiar, criar/editar/excluir pessoal, lista atualizada depois de "Atualizar snippets".
- Minimizar: a janela some da barra de tarefas e o ícone aparece. Arrastar para outro canto funciona. Um clique reabre a janela na seção em que estava e o ícone some.
- Com o Bloco de Notas em foco, o ícone visível e o cursor piscando: clicar e arrastar o ícone não abre a janela, e o cursor continua no Bloco de Notas.
- Fechar e abrir o app: o ícone volta na última posição. Com um segundo monitor desconectado, ele aparece no principal.
- Com "minimizarParaIcone" desligado, minimizar vai para a barra de tarefas.
- Abrir o TextCDSP pelo menu Iniciar com ele já rodando: a janela aparece.
- Todas as BrowserWindow do projeto têm contextIsolation: true, nodeIntegration: false e sandbox: true (mostre o grep).

Commit: "Marco 11: janela única com menu lateral e ícone flutuante"
````

---

## Marco 12: botão "Inserir" na caixa de texto ativa

**Por que:** "Copiar texto" exige ir até o documento e colar. "Inserir" faz isso de uma vez: devolve o foco ao programa em que a pessoa estava e cola o texto onde está o cursor.

**Como funciona:** a janela se esconde, o Windows devolve o foco à janela anterior, o app põe o texto na área de transferência e simula Ctrl+V. Depois restaura o que a pessoa tinha copiado.

**Risco:** a volta do foco e o Ctrl+V simulado são comportamento do Windows e precisam de verificação prática. Por isso o marco começa com uma verificação e para se ela falhar.

````text
Leia o CLAUDE.md, o docs/PLANO.md (inclusive "Marcos 9 a 12: decisões já tomadas") e o docs/ESPANSO-NOTAS.md (principalmente P7, sobre teclas sintéticas). Execute o MARCO 12.

Objetivo: na Biblioteca, um botão "Inserir" que coloca o texto de um snippet de texto simples na caixa de texto em que a pessoa estava antes de abrir a janela.

Etapa 1, verificação (antes de qualquer interface):
- Com um script temporário (apague ao final), teste a sequência:
  a. a janela principal está em foco;
  b. janela.hide();
  c. espera 200 ms;
  d. clipboard.writeText;
  e. Ctrl+V via powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden com [System.Windows.Forms.SendKeys]::SendWait('^v') (spawn com windowsHide: true e um comando FIXO, sem nenhum texto do snippet na linha de comando).
- Registre em docs/WINDOWS-NOTAS.md (novo, no formato VERIFICADO / NÃO VERIFICADO do ESPANSO-NOTAS.md):
  W1. Ao esconder a janela, o foco volta para a janela anterior? Teste com a janela aberta pela bandeja, pelo ícone flutuante e pelo Alt+Tab.
  W2. O PowerShell aparece ou rouba o foco?
  W3. Quanto tempo leva, do clique até o texto aparecer?
  W4. O Ctrl+V sintético faz o Espanso expandir alguma coisa? Espera-se que não (P7).
  W5. Quebras de linha: o Bloco de Notas recebe as linhas certas? É preciso converter \n para \r\n?
  W6. O que acontece com um programa aberto como administrador?
- Peça ao usuário para confirmar W1 a W5 no Bloco de Notas e no Google Docs.
- Se W1 ou W2 falhar, escreva "BLOQUEIO" no topo do WINDOWS-NOTAS.md e PARE. Não troque de técnica por conta própria e não adicione dependência.
- Acrescente docs/WINDOWS-NOTAS.md à estrutura de pastas do CLAUDE.md.

Etapa 2, implementação:
1. Quais snippets podem ser inseridos: só tipo "texto" (sem variáveis e sem html/markdown), oficiais ou pessoais.
   - Escreva podeInserir(snippet) em src/shared/ (com teste) e use a mesma função no processo principal e na janela.
   - Nos outros tipos, o botão aparece desabilitado com a explicação "Só atalhos de texto simples podem ser inseridos. Use Copiar texto."
2. Interface:
   - botão "Inserir" nos detalhes, o primeiro e em destaque, ao lado de "Copiar atalho" e "Copiar texto";
   - atalho de teclado Ctrl+Enter (o Enter continua copiando o texto);
   - nova linha nos atalhos de teclado da tela, se houver ajuda.
3. IPC: canal "biblioteca:inserir" { id }, aceito só da janela principal.
   - O texto é montado no processo principal a partir do id (como em biblioteca:copiar), nunca recebido da página.
   - O processo principal confere podeInserir de novo.
4. src/main/inserir.js, com a sequência verificada na etapa 1:
   a. Guarda o conteúdo atual da área de transferência (texto, html, rtf e imagem).
   b. Esconde a janela. Se "minimizarParaIcone" estiver ligado, mostra o ícone flutuante sem foco.
   c. Espera o tempo medido na etapa 1.
   d. Grava o texto (com as quebras de linha do W5) e manda o Ctrl+V.
   e. Espera cerca de 600 ms e restaura a área de transferência, MAS só se ela ainda tiver o texto inserido: se a pessoa copiou outra coisa nesse meio tempo, não mexe.
   f. Uma inserção por vez: um segundo pedido durante outra é ignorado.
   g. Falha do PowerShell (código diferente de 0 ou tempo esgotado em 5 s): deixa o texto na área de transferência e mostra a Notification "Não foi possível inserir. O texto foi copiado: use Ctrl+V".
   h. Log: "Texto inserido: <trigger>". Nunca registre o conteúdo do snippet.
5. Testes:
   - podeInserir para cada tipo;
   - a preparação da inserção em src/main/biblioteca.js (sem Electron, como prepararCopia): recusa id inexistente e snippet de formulário;
   - a regra de restaurar ou não a área de transferência, separada numa função pura.
6. Documentação em docs/INSTALACAO.md: como usar o Inserir e a limitação dos programas abertos como administrador (use Copiar texto).

Fora do escopo:
- inserir snippets com campos, escolhas, datas ou formatação;
- inserir sem abrir a janela (ex.: busca a partir do ícone);
- atalho de teclado global;
- processo de PowerShell residente (só se o W3 passar de 1,5 s; nesse caso, relate e não implemente).

Critérios de aceite (os de digitação, peça para eu confirmar):
- npm test passa.
- Bloco de Notas: cursor no meio de uma linha, abrir a Biblioteca pela bandeja, escolher um snippet de texto de várias linhas e clicar Inserir. O texto entra onde estava o cursor, com as quebras de linha certas, e a janela vira o ícone.
- Google Docs: o mesmo, com acentos corretos.
- Copiar "ABC" antes de inserir: depois da inserção, Ctrl+V cola "ABC".
- Um snippet com formulário (ex.: /qualif): o botão Inserir está desabilitado com a explicação.
- O atalho pessoal ;ola (Marco 9) pode ser inserido.
- Nenhuma janela de console pisca e nenhum atalho do Espanso dispara por causa do Ctrl+V.
- Programa aberto como administrador: o app não trava nem fecha (o texto pode não entrar; isso está documentado).
- O app.log tem a linha "Texto inserido: <trigger>" e não tem o conteúdo do snippet.

Commit: "Marco 12: inserir snippet de texto na caixa de texto ativa"
````

---

## Trilha C: conteúdo (em paralelo, a partir do Marco 2)

Use para transformar os textos reais da CDSP em snippets. Pode ser feito com o Sonnet ou com o Opus. Repita por lote de textos.

````text
Leia o CLAUDE.md e veja snippets/exemplos.yml como referência de formato.

Converta os textos abaixo em snippets do Espanso para o arquivo <pasta-fonte>/<categoria>.yml (ex.: medicamentos.yml). Se o arquivo existir, acrescente sem alterar os matches existentes.

Regras:
- Trigger começando por um destes caracteres: / ; ! # = + (lista PREFIXOS_TRIGGER, em src/shared/validador.js), seguido de 2 a 30 letras minúsculas sem acento ou números, curto e fácil de lembrar. Escreva-o sempre entre aspas no YAML ("!cont"): sem aspas, ! e # quebram o arquivo. Nenhum trigger pode ser prefixo de outro com o mesmo caractere inicial, nem dos que já existem na pasta (/cont e ;cont convivem).
- Todo match tem label descritivo.
- Partes variáveis (nome, CNJ, medicamento, datas...) viram campos de formulário. Escolhas entre parágrafos alternativos viram var choice com label curto e id contendo o parágrafo.
- Se o texto tiver formatação (negrito, listas), use html. Caso contrário, replace.
- Não altere uma palavra do texto jurídico além de trocar as partes variáveis por campos.
- Ao final, rode npm run validar -- <pasta-fonte> e corrija até 0 erros. Liste os triggers criados numa tabela (trigger, label, campos).

Textos:
<cole aqui os textos, cada um com um título>
````

---

## Prompt de correção (quando um critério de aceite falhar)

Use na mesma sessão em que o marco foi feito:

````text
O critério de aceite "<copie o critério>" falhou.
O que eu fiz: <passos>
O que aconteceu: <comportamento ou mensagem de erro; cole o trecho de logs\app.log se houver>
O esperado: <comportamento>

Encontre a causa antes de alterar o código e me explique em 2 a 3 frases. Corrija alterando apenas o necessário, sem mudar o escopo do marco. Rode de novo todos os critérios de aceite do marco e faça um commit "Marco N: correção - <resumo>".
````
