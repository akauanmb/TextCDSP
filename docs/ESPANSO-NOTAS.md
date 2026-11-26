# Espanso: fatos verificados

Versão testada: **Espanso 2.4.1** (`Espanso-Win-Portable-x86_64.zip`), fixada em `espanso.lock.json`.
Testado em Windows 11 Pro (10.0.26200) com Node v26.13.0, em 26/11/2026.

Legenda:

- **VERIFICADO**: testado de fato nesta máquina. O comando e a saída estão registrados.
- **NÃO VERIFICADO**: só lido na documentação ou deduzido. Não dependa disso sem testar.

Os marcos seguintes devem usar **somente** o que está aqui.

**Não há BLOQUEIO.** Nenhuma resposta inviabiliza a arquitetura do `CLAUDE.md`. Mas há cinco pontos que mudam a implementação e precisam ser lidos antes dos Marcos 3 e 4:

1. **Primeira execução.** O motor só inicia pelo comando `launcher` se existirem três arquivos em `.espanso-runtime\kvs\`. Veja P3. Além disso, ele recria `match\base.yml` (com um snippet `:shell`) a cada partida em que o arquivo não existe. Veja P1.
2. **Nunca use `service start` no app.** O comando pode registrar o Espanso para iniciar com o Windows e conflitar com um Espanso instalado. Veja P3.
3. **Pipes na saída.** Iniciar ou reiniciar o motor com `stdio` em pipes trava o chamador. Use `stdio: 'ignore'`. Veja P3.
4. **Uma instância por vez.** Duas instâncias do Espanso não convivem na mesma sessão do Windows. Veja P4.
5. **Erro vira janela.** Um YAML com erro em `match/` abre uma janela "Troubleshooting" no usuário. Só aplique arquivos já validados. Veja P9.

---

## P1. Estrutura de pastas e pasta de configuração

**Resposta (VERIFICADO).** O zip extrai uma subpasta única, `espanso-portable\`. Dentro de `vendor\espanso\` o caminho do motor fica:

```
vendor\espanso\VERSAO.txt                      (criado por scripts/baixar-espanso.js)
vendor\espanso\espanso-portable\               <- RAIZ DO MOTOR
    espansod.exe                               executável único (18 MB)
    espanso.cmd                                wrapper (não usar a partir do Node, veja P3)
    START_ESPANSO.bat                          contém: start espansod.exe launcher
    README.txt, setupscript.iss, *.dll         DLLs do runtime C++ (precisam ficar ao lado do exe)
    .espanso\                                  PASTA DE CONFIGURAÇÃO (vazia no zip)
    .espanso-runtime\                          PASTA DE RUNTIME E LOGS (vazia no zip)
```

Pasta de configuração (`.espanso\`), depois que o motor roda:

```
.espanso\config\default.yml        deve existir, senão o motor dá erro (veja abaixo)
.espanso\match\*.yml               snippets (carregados recursivamente, veja P6)
.espanso\match\packages\           criada pelo motor; não usamos
```

Pasta de runtime (`.espanso-runtime\`), depois da primeira execução:

```
espanso.log                        LOG ÚNICO (daemon e worker). Fica travado para escrita enquanto o motor roda; leitura funciona.
espanso-daemon.lock, espanso-worker.lock
kvs\has_completed_wizard, kvs\has_displayed_welcome, kvs\has_selected_auto_start_option   (cada um com o texto "true")
*.ico, *.png                       ícones extraídos pelo motor
```

Comando e saída:

```
> espansod.exe path        (sem config/default.yml)
thread 'main' panicked ... unable to load config: missing config directory      [exit 101]
> espansod.exe path        (com .espanso\config\default.yml)
Config: C:\...\.espanso
Packages: C:\...\.espanso\match\packages
Runtime: C:\...\.espanso-runtime                                                [exit 0]
```

Observações:

- O motor entra no modo portable pela pasta `.espanso\` ao lado do `espansod.exe`. Isso decorre do `README.txt` e da saída de `path`. **NÃO VERIFICADO**: o que acontece se essas pastas não existirem (provavelmente usaria `%APPDATA%\espanso`). Por isso, nunca apague `.espanso\` nem `.espanso-runtime\`.
- Sem `config\default.yml` o comando `path` falha. O app deve sempre gravá-lo.
- **VERIFICADO:** se o `launcher` iniciar com `.espanso\` **vazia** (como vem no zip), o motor gera sozinho o conjunto padrão do Espanso: `config\default.yml` (2138 bytes, quase tudo comentado) e `match\base.yml` (1132 bytes, snippets de exemplo `:espanso`, `:date` e `:shell`). O `:shell` executa comandos, então esse arquivo nunca pode ficar.
- **VERIFICADO: o `launcher` recria `match\base.yml` a cada partida em que ele não existe**, mesmo com outros arquivos em `match\` (apaguei o arquivo e reiniciei: voltou; com `match\` vazia, também). O `config\default.yml` existente é preservado (não foi sobrescrito).
- **VERIFICADO: apagar o `base.yml` não basta.** O que impede a recriação é **existir** um `match\base.yml` nosso. Testei com um arquivo de duas linhas (`# comentário` e `matches: []`): o motor o respeitou, o log não teve erros e o `match list` mostrou só os snippets reais.
- Portanto o `motor.preparar()` deve, **antes** de iniciar o motor: criar `config\` e `match\`; gravar o `default.yml`; e gravar um `match\base.yml` vazio (`matches: []`) no lugar do padrão, regravando-o se o conteúdo for o do Espanso. Isso cumpre o objetivo da regra do `CLAUDE.md` ("remover o base.yml padrão"), mas por substituição, não por remoção. Esse arquivo nunca entra na validação nem na biblioteca.
- Nada foi gravado fora da pasta do motor nesses testes (`%APPDATA%\espanso` e `%LOCALAPPDATA%\espanso` não foram criadas).
- **VERIFICADO (Marco 3):** um arquivo em `match\` **só com comentários** (sem `matches:`), como o `pessoal.yml` inicial, é aceito: nenhum WARN/ERROR no log e nenhum processo `modulo troubleshoot`.

**Para os caminhos do Marco 3:** raiz do motor = `<origem>\espanso-portable`. Config = `<raiz>\.espanso`. Match = `<raiz>\.espanso\match`. Log do motor = `<raiz>\.espanso-runtime\espanso.log`.

---

## P2. Copiar a pasta para outro lugar

**Resposta (VERIFICADO): funciona.** A pasta inteira pode ser copiada. A cópia usa a configuração que estiver dentro dela.

Teste: copiei a pasta do portable para `%TEMP%\teste espanso çã B`, um caminho com espaços e acentos. Nela coloquei uma configuração diferente (só o snippet `/sob`).

```
> espansod.exe path     (na cópia)
Config: C:\Users\...\Temp\teste espanso çã B\.espanso
Runtime: C:\Users\...\Temp\teste espanso çã B\.espanso-runtime
> espansod.exe match list
/sob - so existe na copia B                      <- só o snippet da cópia, nenhum da original
> launcher (com os arquivos kvs, veja P3)  => service status = 0 (ativo) em 289 ms
```

O log da cópia grava os caminhos da própria cópia. O app pode, então, copiar o motor para `%APPDATA%\TextCDSP\engine\` e usar de lá.

Cuidado: o Windows pode devolver o caminho em formato curto (8.3), como `C:\Users\AKAUAN~1\...`, em vez do longo. Ao comparar caminhos, normalize com `fs.realpathSync.native`.

---

## P3. Iniciar, parar, status e reiniciar

Todos usam `espansod.exe` **diretamente**, com a pasta do motor como `cwd`.

**Não use o `espanso.cmd` a partir do Node.** VERIFICADO: via `child_process` ele retorna a saída vazia (stdout e stderr), embora os códigos de saída sejam os mesmos. O `espansod.exe` chamado direto funciona, tanto com pipes quanto com arquivos, para os comandos de curta duração.

| Ação | Comando | Resultado (VERIFICADO) |
|---|---|---|
| **Iniciar** | `espansod.exe launcher` | Ver abaixo. É o que o `START_ESPANSO.bat` usa. **Use este.** |
| **Parar** | `espansod.exe service stop` | Exit 0, 230 ms, encerra launcher, daemon e worker. Se já parado: exit 4, stderr "espanso is not running!". |
| **Status** | `espansod.exe service status` | Exit 0 (stdout "espanso is running") ou exit 4 (stderr "espanso is not running"). 20 ms. |
| **Reiniciar** | `espansod.exe service restart` | Exit 0, ~750 ms. Mata e recria launcher/daemon/worker. Não registra nada no Windows. Veja a atenção sobre stdio abaixo. |
| **Pausar expansões** | `espansod.exe cmd disable` | Exit 0 (o efeito ao digitar não foi verificado, veja abaixo). |
| **Retomar expansões** | `espansod.exe cmd enable` | Exit 0. Com o motor parado: exit 2, stderr "Worker process is not running, please start Espanso first." |
| Alternar | `espansod.exe cmd toggle` | Exit 0. |

Exit codes observados de `service status`: **0 = ativo, 4 = parado**. Qualquer outro valor deve ser tratado como "erro".

**NÃO VERIFICADO:** que `cmd disable` realmente impede a expansão ao digitar (o comando retorna 0, mas não dá para digitar por script; veja P7). Isso precisa de teste manual no Marco 3. O plano alternativo para "Pausar" é `service stop` e `launcher`.

### Iniciar a partir do Node (VERIFICADO)

```js
const filho = spawn(caminhoDoEspansod, ['launcher'], {
  cwd: pastaDoMotor, detached: true, stdio: 'ignore', windowsHide: true,
});
filho.unref();
```

- Retorna na hora (6 ms). `service status` passa a dar 0 em **~300 ms**.
- Fica residente: `launcher` é o processo raiz e tem o `daemon` como filho. O `daemon` tem o `worker` como filho.
- Não abre janela de console (`windowsHide`) e não cria atalho de inicialização.
- Se o Electron morrer sem parar o motor, o `launcher` continua vivo. Por isso o app precisa encerrar motor órfão na inicialização (P4 mostra como achá-lo).

### ATENÇÃO 1: sem `stdio: 'ignore'` o chamador trava

O daemon herda o `stdout` e escreve o log nele. Com `stdio` em pipes, um `spawnSync('service','start')` ficou preso até o timeout de 60 s (`ETIMEDOUT`) e despejou o log inteiro do motor no `stdout`. Vale para `launcher`, `service start` e `service restart`. Use `stdio: 'ignore'` (ou um arquivo) ao iniciar ou reiniciar. Para `stop`, `status`, `cmd` e `match list`, pipes funcionam normalmente.

### ATENÇÃO 2: primeira execução e os arquivos `kvs`

Com `.espanso-runtime\` vazia, o `launcher` **não sobe o daemon**: ficou 6 s residente, sem filhos, sem janela visível e com `service status` = 4. Com os três arquivos abaixo criados antes, ele sobe em 289 ms:

```
.espanso-runtime\kvs\has_completed_wizard
.espanso-runtime\kvs\has_displayed_welcome
.espanso-runtime\kvs\has_selected_auto_start_option
```

Cada um com o texto `true` (4 bytes, sem quebra de linha), exatamente como o próprio motor os grava. É a causa mais provável: o `launcher` espera o assistente de primeira execução. Isso é uma dedução; o fato verificado é que **com os arquivos funciona e sem eles trava**. O `motor.preparar()` deve criá-los quando não existirem.

### ATENÇÃO 3: `service start` registra autostart (não use)

Na primeira execução (sem `kvs`), `service start` imprimiu "service registered correctly!" e criou `espanso.lnk` em `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`. Isso fez o Espanso iniciar com o Windows por conta própria.

- O nome `espanso.lnk` é o mesmo de uma instalação normal do Espanso. O comando `service check` chegou a avisar "already registered, but it points to another executable". Ou seja, o nosso `service start` poderia sobrescrever o autostart do Espanso do usuário.
- Com os `kvs` já presentes, um segundo `service start` retornou 0 em 236 ms e não criou atalho. Mesmo assim, evite: o `launcher` não tem esse risco.
- `service unregister` remove o atalho (exit 0). Sem registro: exit 1, "entry not found". `service check`: exit 0 se registrado, exit 2 se não.
- O início com o Windows é responsabilidade do **nosso app** (`app.setLoginItemSettings`), nunca do Espanso.

---

## P4. Nome do processo e como diferenciar a nossa instância

**Nome do processo (VERIFICADO):** `espansod.exe`. Há um só executável e vários processos, distinguíveis pelo argumento:

```
espansod.exe launcher
espansod.exe daemon
espansod.exe worker --monitor-daemon [--start-reason config_changed]
espansod.exe modulo troubleshoot     (só aparece com erro de configuração, veja P9)
```

`tasklist /FI "IMAGENAME eq espansod.exe"` mostra só o nome, **sem caminho**. Para saber de qual pasta o processo vem, use o CIM (VERIFICADO, 380-480 ms a partir do Node):

```js
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='espansod.exe'\" | " +
  'Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'],
  { encoding: 'utf8', windowsHide: true });
```

O `wmic` não existe nesta máquina. Cuidados com o JSON: com um só processo o resultado é um objeto, não uma lista; com zero, a saída é vazia.

**Critério para o `detectarOutroEspanso()`:** existe processo `espansod.exe` cujo `ExecutablePath` (normalizado com `realpathSync.native`, sem diferenciar maiúsculas) **não** esteja dentro de `<dados>\engine\`. Esses são "de outro Espanso". Os que estiverem dentro da nossa pasta e sobrarem de uma execução anterior são "motor órfão" e podem ser encerrados.

**Por que o app precisa detectar (VERIFICADO):** duas instâncias não convivem. Com A rodando, ao iniciar B (outra pasta):

- o `launcher` de B terminou em 55 ms com código 101;
- o log de B registrou `unable to initialize IPC server: Acesso negado. (os error 5)` e `unable to register hotkey: ALT+SPACE`.

O motivo é que o pipe nomeado (`\\.\pipe\espansodaemonv2`) e o atalho Alt+Espaço são globais na sessão. Um Espanso instalado normalmente, rodando, impediria o nosso de funcionar (e vice-versa). O que `service status` informa é por pasta de runtime, não global: com A rodando, o status de B dava "parado".

**NÃO VERIFICADO:** o caminho de um Espanso instalado normalmente. Pelo `setupscript.iss` do pacote, o instalador oficial usa `{autopf}\Espanso` com `PrivilegesRequired=lowest` (ou seja, `%LOCALAPPDATA%\Programs\Espanso\`) e o mesmo `espansod.exe`. Por isso o critério acima é por pasta, não por nome de arquivo.

---

## P5. Chaves para desligar ícone e notificações

**Resposta:** as chaves existem em `config\default.yml` e têm os nomes esperados.

```yaml
show_icon: false
show_notifications: false
```

- **VERIFICADO:** as duas cadeias existem no `espansod.exe` (busca no binário) e foram aceitas em `default.yml` sem nenhum aviso no log. Com `show_notifications: true`, o worker registra `unable to find espanso AppUserModelID in the list of registered ones, falling back to Powershell`; com `false`, esse aviso some. Isso mostra que a configuração é lida e muda o comportamento.
- **Documentação oficial** (espanso.org/docs/configuration/options): `show_icon` "if false, avoid showing the espanso icon on the system's tray bar", padrão `true`; `show_notifications` "if false, disable all notifications", padrão `true`. Ambas só valem em `default.yml`.
- **NÃO VERIFICADO:** que o ícone da bandeja realmente não aparece. Não há como checar por API; confira visualmente (inclusive na área oculta, no "^" da bandeja) no teste do Marco 3.
- **VERIFICADO:** chave desconhecida em `default.yml` (testei `chave_inventada: 123`) é ignorada, sem erro nem aviso. Erros de digitação em chaves, portanto, não são detectados.
- **NÃO VERIFICADO (só documentação):** `toggle_key` vem desligada por padrão. `search_shortcut` é `ALT+SPACE` e pode ser desligada com `search_shortcut: off`. `auto_restart` é `true` por padrão.
- **VERIFICADO:** mesmo com `show_notifications: false`, um erro de configuração abre uma janela do módulo "Troubleshooting" (P9). Essas chaves não a impedem.

---

## P6. Subpastas de `match/` e arquivos iniciados por `_`

**Resposta (VERIFICADO), via `espansod.exe match list` e confirmado no daemon:**

| Caso | Carregado? |
|---|---|
| `match\oficial\x.yml` | **Sim** |
| `match\oficial\sub\y.yml` (sub-subpasta) | **Sim** (recursivo) |
| `match\_ignorado.yml` | Não |
| `match\oficial\_z.yml` | Não |
| `match\_pasta\q.yml` (arquivo normal dentro de pasta iniciada por `_`) | **Sim** |
| `match\oficial\w.yaml` | Sim (aceita `.yaml`) |
| `match\oficial\v.txt` | Não |

Conclusões:

- A regra do `_` vale só para o **nome do arquivo**. Uma **pasta** iniciada por `_` não é ignorada.
- **Para o Marco 4:** pastas temporárias dentro de `match/` (`oficial.novo/`, `oficial.antigo/`) seriam carregadas se o Espanso as lesse no meio da troca. Prefira montar a pasta nova **fora** de `match/` (por exemplo em `<dados>\cache\`, no mesmo volume) e só depois renomeá-la para `match\oficial`. Evite também criá-la dentro de `.espanso\`, que o motor vigia por inteiro (P7). Na troca que testei (criar `oficial.novo`, renomear, apagar `oficial.antigo`, tudo em milissegundos) houve só uma recarga, mas não dependa disso.
- A ordem em que o Espanso lista os matches não é estável.

---

## P7. Recarga automática ao mudar arquivos de `match/`

**Resposta (VERIFICADO): recarrega sozinho, em ~1,5 s.**

Com o daemon rodando, medi o tempo até o log registrar `configuration change detected, restarting worker process...`:

| Ação em `match\` | Recarga detectada em |
|---|---|
| criar `oficial\p7.yml` | 1526 ms |
| alterar o arquivo | 1575 ms |
| criar `pessoal.yml` | 1561 ms |
| apagar `oficial\p7.yml` | 1649 ms |
| criar `oficial\_ign.yml` (arquivo `_`) | 1550 ms |
| trocar a pasta `oficial` (renomear) | 1676 ms |

Detalhes:

- Cada mudança reinicia o **worker** (o daemon continua). O log mostra `exiting worker process...` e depois `spawning the worker process...`.
- Às vezes o evento vem duas vezes (duas recargas seguidas, com ~1 s entre elas). É inofensivo.
- Até um arquivo iniciado por `_` dispara a recarga (o filtro vale só na leitura).
- O watcher vigia `.espanso\` inteira, inclusive `config\default.yml`. Mudar uma chave lá também reinicia o worker.
- **NÃO VERIFICADO:** que o snippet novo expande ao digitar. O Espanso ignora teclas sintéticas (a opção `win32_exclude_orphan_events` é `true` por padrão) e eu não consigo digitar por script. Confirme no teste manual: alterar um snippet e ver o efeito no Google Docs em ~2 s.
- Quando o motor está parado, nada recarrega. Ele lê tudo ao iniciar.

---

## P8. Chaves desconhecidas e `label`

**Resposta (VERIFICADO):**

- **`label` é aceito.** `match list -j` retorna o campo `"label": "Rotulo A"`. Sem `label`, retorna `"label": null`. Também aparece na busca do Espanso (Alt+Espaço).
- **Chave desconhecida num match (ex.: `categoria: x`) é ignorada em silêncio.** Sem erro e sem aviso: nem no `match list` (exit 0, stderr vazio) nem no log do daemon. O match carrega normalmente e o campo é descartado (`categoria` não aparece no JSON).
- Consequência: o Espanso não avisa de erros de digitação em nomes de chaves (`replce`, `trigers`). A regra de validação do Marco 2 precisa rejeitá-los. Nos oficiais, o conjunto de chaves permitido é definido pelo nosso validador.

---

## P9. Arquivo YAML inválido: efeito nos outros e onde aparece o erro

**Resposta (VERIFICADO):** os outros arquivos continuam funcionando, e o erro aparece **só no log** (e numa janela).

| Defeito | Resultado |
|---|---|
| YAML com sintaxe quebrada (indentação errada, `[` aberto) | O **arquivo inteiro** é descartado. Os demais carregam. |
| Match sem `replace`/`html`/`markdown` | Só **aquele match** é descartado. Os outros matches do mesmo arquivo carregam. |
| Dois matches com o mesmo trigger (em arquivos diferentes) | **Ambos** carregam, sem aviso. Não se sabe qual vence. |
| Um trigger prefixo de outro (`/dup` e `/dupla`) | Ambos carregam, sem aviso. |
| Var com `type` inexistente | O match carrega. O erro só apareceria ao expandir. |

Onde o erro aparece:

- **Log** (`.espanso-runtime\espanso.log`), com arquivo, linha e coluna, uma vez para o daemon e outra para o worker:
  ```
  [WARN] ------- detected some errors in the configuration: -------
  [WARN] >>> ...\.espanso\match\oficial\quebrado.yml
  [ERROR] unable to load match group ...\quebrado.yml
      0: failed to parse YAML match group
      1: did not find expected '-' indicator at line 3 column 4, while parsing a block collection at line 2 column 3
  [ERROR] match triggered by "triggers: [\"/bad2\"]" does not produce any effect. Did you forget the 'replace' field?
  ```
- **CLI:** `espansod.exe match list` **não** mostra erro algum (pula o defeito em silêncio, exit 0).
- **Janela:** o módulo `espansod.exe modulo troubleshoot` sobe como processo e, na primeira ocorrência, apareceu uma janela visível chamada "Troubleshooting", mesmo com `show_notifications: false`. Não consegui reproduzir a janela visível numa segunda ocorrência, mas o processo `modulo troubleshoot` voltou a aparecer.

**Consequência para o app:** nunca deixe o Espanso ler um arquivo não validado. Um erro em `pessoal.yml` (editado à mão) também exibiria essa janela ao usuário. Os conflitos de trigger (duplicado, prefixo) não são detectados pelo Espanso e dependem inteiramente do nosso validador.

---

## P10. Listar matches ou validar sem iniciar o daemon

**Resposta (VERIFICADO): listar sim; validar não.**

`espansod.exe match list` funciona **sem o daemon**, lê a pasta de configuração do portable e retorna exit 0 em ~25 ms:

```
> espansod.exe match list
/cont - Trata-se de ação de obrigação de fazer ajuizada em face do ESTADO DE MATO GROSSO, ...
/hoje - Cuiabá-MT, {{data}}.
...
```

Opções (do `--help`): `-j/--json` (saída JSON com `triggers`, `replace` e `label`; testado só com matches `replace`), `-t/--only-triggers`, `-n/--preserve-newlines`, `--class`, `--exec`, `--title`. A opção é `-t`, não `--onlytriggers`.

Não existe comando de validação: erros de arquivo são pulados em silêncio (P9). Por isso a validação é responsabilidade do `src/shared/validador.js`.

Outros subcomandos do `--help` (não usados): `cmd`, `edit`, `env-path`, `log`, `package`, `path`, `service`, `stats`, `workaround`. `service register` e `env-path` alteram o Windows (autostart e PATH). **Não os use.**

---

## Roteiro de teste manual (a partir do zero)

Use uma **cópia**, para não sujar `vendor\`: qualquer comando rodado de dentro de `vendor\` (até `service status`) grava log e pastas em `.espanso\` e `.espanso-runtime\`. Se isso acontecer, apague `vendor\` e rode `npm run baixar-espanso`. Não funciona com outro Espanso rodando (feche o instalado, se houver).

```powershell
npm run baixar-espanso
$T = "$env:TEMP\teste-espanso"
Copy-Item -Recurse vendor\espanso\espanso-portable $T

# 1) configuração mínima (obrigatória; a pasta do zip vem vazia)
New-Item -ItemType Directory "$T\.espanso\config","$T\.espanso\match" -Force | Out-Null
Set-Content "$T\.espanso\config\default.yml" "show_icon: false`nshow_notifications: false"
# sem este arquivo, o motor cria um base.yml com os exemplos do Espanso, inclusive o :shell (P1)
Set-Content -Encoding utf8 "$T\.espanso\match\base.yml" "# reservado`nmatches: []"

# 2) snippets de teste
Copy-Item snippets\exemplos.yml "$T\.espanso\match\exemplos.yml"

# 3) evita o travamento da primeira execução (P3, atenção 2)
New-Item -ItemType Directory "$T\.espanso-runtime\kvs" -Force | Out-Null
foreach ($f in 'has_completed_wizard','has_displayed_welcome','has_selected_auto_start_option') {
  [IO.File]::WriteAllText("$T\.espanso-runtime\kvs\$f", 'true')
}

# 4) iniciar (volta na hora; o motor fica rodando em segundo plano)
Start-Process "$T\espansod.exe" -ArgumentList 'launcher' -WorkingDirectory $T -WindowStyle Hidden

# conferir (no PowerShell o "| Out-String" é necessário, senão a saída não aparece)
& "$T\espansod.exe" service status | Out-String      # "espanso is running"
& "$T\espansod.exe" match list | Out-String          # lista os 6 triggers

# 5) parar e limpar quando terminar
& "$T\espansod.exe" service stop | Out-Null
Remove-Item -Recurse -Force $T
```

Depois de iniciar, abra o Google Docs e teste os seis atalhos do `docs\TESTE-MANUAL.md` (`/cont`, `/hoje`, `/prazo`, `/qualif`, `/prelim`, `/fmt`). Se houver um Espanso instalado e rodando, o do teste não inicia (P4).
