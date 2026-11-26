# TextCDSP: plano de implementação

**Objetivo final:** um instalador `TextCDSP-Setup-x.y.z.exe` que qualquer pessoa da CDSP instala sem permissão de administrador. Depois de instalado:

- os atalhos (`/cont`, `/qualif`...) funcionam no Google Docs e em qualquer programa do Windows;
- os snippets oficiais se atualizam sozinhos a partir de uma pasta compartilhada.

## Visão geral

```
TextCDSP (Electron, ícone na bandeja)
 ├── Motor: Espanso portable, sem modificações, iniciado e parado pelo app
 ├── Sincronização: pasta compartilhada → validação → snippets oficiais em uso
 ├── Biblioteca: janela para buscar e copiar snippets
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
| C | Conteúdo: converter os textos reais em snippets | Sonnet ou Opus | 2 (em paralelo) |

O **Marco 6 já entrega um executável usável**. Os marcos 7 e 8 são melhorias para o uso no dia a dia do setor.

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
2. **Nos marcos 3 a 8**, ative o *plan mode* (Shift+Tab) antes de colar o prompt. Leia o plano que o Sonnet propõe e aprove só se ele bater com os critérios de aceite. É aqui que se evita retrabalho.
3. Cole o prompt do marco **inteiro**.
4. Ao final, confira você mesmo os **critérios de aceite**. Se algum falhar, use o *prompt de correção* no fim deste documento, **na mesma sessão**.
5. Com tudo aprovado, rode `git push`. O Sonnet faz o commit, mas não o push.
6. (Opcional) Numa sessão com Opus, rode `/code-review` antes do push nos marcos 3, 4 e 6.

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

## Trilha C: conteúdo (em paralelo, a partir do Marco 2)

Use para transformar os textos reais da CDSP em snippets. Pode ser feito com o Sonnet ou com o Opus. Repita por lote de textos.

````text
Leia o CLAUDE.md e veja snippets/exemplos.yml como referência de formato.

Converta os textos abaixo em snippets do Espanso para o arquivo <pasta-fonte>/<categoria>.yml (ex.: medicamentos.yml). Se o arquivo existir, acrescente sem alterar os matches existentes.

Regras:
- Trigger no padrão /[a-z0-9]{2,30}, curto e fácil de lembrar. Nenhum trigger pode ser prefixo de outro, nem dos que já existem na pasta.
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
