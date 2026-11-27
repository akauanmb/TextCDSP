# TextCDSP: fatos verificados sobre o Windows e o Electron

Mesmo formato do `ESPANSO-NOTAS.md`: **VERIFICADO** é o que foi testado de fato (com o comando ou o roteiro usado);
**NÃO VERIFICADO** é o que só foi lido, deduzido ou não deu para testar. Ambiente dos testes: Windows 11 Pro
10.0.26200, Electron 45.5.0, em 27/11/2026.

**Como foram feitos os testes.** Com roteiros temporários (apagados), usando uma janela-alvo própria com uma caixa de
texto, e não o Bloco de Notas: já havia um aberto na máquina, e o Windows 11 reaproveita a janela e restaura abas.
Um vigia em PowerShell registrava, a cada 10 ms, o processo e o título da janela em foco. O Ctrl+V real só era enviado
se a janela-alvo estivesse em foco naquele instante. **A confirmação no Bloco de Notas e no Google Docs, e pela
bandeja e pelo ícone flutuante com clique real, fica com a pessoa** (ver "Teste manual", no fim).

---

## Decisão tomada: minimizar e depois esconder (era o BLOQUEIO do W1)

**Problema (VERIFICADO):** com `janela.hide()`, o foco **não** voltava à janela anterior. Ele ficava na janela escondida
(o Windows ainda a reportava em foco) e só mudava cerca de **4 s depois**. Um Ctrl+V enviado 200 ms depois do `hide()` iria
para uma janela invisível.

| Teste | Quando o foco voltou à janela anterior |
|---|---|
| Electron, `janela.hide()` | **+4069 ms** (aos 200 ms ainda estava na janela escondida) |
| Controle sem Electron (janela comum do WinForms, `Form.Hide()`) | +42 ms (passando por "nenhuma janela" aos +22 ms) |
| Electron, `janela.minimize()` | antes de 200 ms |
| **Electron, minimizar e depois esconder** (a técnica adotada) | **+46 ms e +60 ms** (duas rodadas) |

**Causa provável (NÃO VERIFICADO, vem do que se conhece do Chromium; não li o código desta versão):** o Chromium
esconde a janela ativa com `SWP_HIDEWINDOW | SWP_NOACTIVATE`, de propósito para não ativar outra janela no meio de uma
troca de ativação. Minimizar é um caminho que o Windows trata como qualquer janela minimizada: ativa a seguinte.

**Técnica adotada** (`minimizar()` e `minimizarEAguardar()` em `src/main/janelaPrincipal.js`): a janela é **sempre
minimizada de verdade primeiro**. Com "Ao minimizar, transformar em ícone flutuante" ligado, o evento `minimize` a
esconde 40 ms depois e mostra o ícone; desligado, ela fica minimizada na barra de tarefas. Isso vale para todo
minimizar do programa (botão da barra de título, botão do menu lateral, Esc e Inserir): o minimizar para ícone do
Marco 11 tinha o mesmo defeito do foco e foi corrigido junto. Reabrir depois de minimizar e esconder (VERIFICADO): a
janela volta visível, restaurada, com foco, no mesmo tamanho e lugar, e o ícone some.

---

## W1. Ao esconder a janela, o foco volta para a janela anterior?

**Resposta: sim, com a técnica adotada** (VERIFICADO: +46 ms e +60 ms até a janela-alvo voltar ao foco, com a janela
principal escondida e o ícone visível). No teste de ponta a ponta (W3), o foco ficou na janela-alvo do clique até o fim.

**NÃO VERIFICADO automaticamente:** a janela aberta **pela bandeja** e **pelo ícone flutuante** com clique real. Os dois
roteiros automáticos falharam por limitação da simulação, não do produto: um clique sintético não dá ao app o direito
de pegar o foco que um clique de verdade dá, e o foco foi parar em janelas da pessoa durante o teste. O Alt+Tab foi
simulado com `AppActivate`. Confirmar no teste manual. O clique na bandeja deixa a barra de tarefas como janela ativa;
ao minimizar, o Windows deve passar o foco à janela seguinte (a que a pessoa estava usando), mas isso não foi visto.

## W2. O PowerShell aparece ou rouba o foco?

**Resposta: não** (VERIFICADO, em quatro rodadas): `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden
-Command ...`, com `spawn` e `windowsHide: true`, não apareceu, e nenhuma janela estranha chegou a ter o foco entre o
clique e o fim da colagem (só a janela-alvo e a do TextCDSP). O comando é fixo: nenhum texto do snippet vai na linha de
comando, o texto segue pela área de transferência.

## W3. Quanto tempo leva, do clique até o texto aparecer?

**Resposta (VERIFICADO, ponta a ponta, pelo botão da interface): 605 a 660 ms** (três rodadas). Nas medições
anteriores, por etapa: 200 ms de espera, gravar na área de transferência, e `powershell.exe` iniciar + `SendWait` +
sair em 280 a 380 ms. Fica bem abaixo de 1,5 s, então **não** foi implementado PowerShell residente.

## W4. O Ctrl+V sintético faz o Espanso expandir alguma coisa?

**Resposta: não** (VERIFICADO, ponta a ponta): com o Espanso em execução na máquina, inseri o texto `/cont `, que é um
atalho real dele, pelo Ctrl+Enter. Esperei 2,8 s e a janela-alvo continuou com `/cont ` literal, sem expansão. Bate com
o que o ESPANSO-NOTAS (P7) previa: o Espanso ignora teclas sintéticas. Vale para a caixa de texto de teste; confirmar
no teste manual no Google Docs.

## W5. Quebras de linha: é preciso converter `\n` para `\r\n`?

**Resposta: converte-se sempre para `\r\n`** (decisão, com verificação parcial). VERIFICADO: o texto de três linhas com
acentos (`Olá, tudo bem?`, `Ação: veja o ofício nº 1.`, `Atenciosamente,`) chegou à caixa de texto do Windows com as
três linhas certas e os acentos intactos, saindo como `\r\n` da área de transferência. **NÃO VERIFICADO:** se um texto
só com `\n` também sairia certo, e o comportamento no Bloco de Notas e no Google Docs. O `\r\n` é a convenção do
Windows e é aceito pelo Chrome; a conversão fica em `normalizarQuebrasDeLinha` (`src/shared/inserir.js`).

## W6. O que acontece com um programa aberto como administrador?

**NÃO VERIFICADO** (abrir um programa elevado exige a confirmação do UAC, que não dá para fazer por script). Esperado:
o Windows (UIPI) impede que um processo comum mande teclas a uma janela elevada, e o Ctrl+V **não faz nada**, sem
erro (o `SendWait` ainda sai com código 0), então o app **não consegue detectar** a falha. Efeito: como a área de
transferência é restaurada ~600 ms depois, o texto some sem ter entrado, e a pessoa não consegue colar à mão. Por isso
a documentação manda usar **Copiar texto** com programas abertos como administrador. O app não trava nem fecha.

---

## Área de transferência no Electron 45 (VERIFICADO)

A API mudou. No Electron 45 o módulo `clipboard` só tem `clear`, `has`, `read`, `readText`, `write` e `writeText`, **todos
assíncronos** (modelo W3C). Não existem mais `readHTML`, `readRTF`, `readImage` nem `availableFormats`.

| Chamada | Resultado |
|---|---|
| `clipboard.write({ text, html })` (formato antigo) | **Erro:** `clipboard.write expects an array of ClipboardItem` |
| `clipboard.writeText(texto)` | Devolve `Promise`; grava o texto |
| `clipboard.write([new ClipboardItem({ 'text/plain': t, 'text/html': h })])` | Grava texto e HTML juntos |
| `clipboard.read()` | Lista de `ClipboardItem`; cada um tem `types` e `getType(tipo)` (devolve `Blob`) |

**Defeito que isso expôs, já corrigido:** o "Copiar texto" de snippets **formatados** (HTML) usava o formato antigo e
falhava desde o Marco 5, no Electron 45. O texto simples continuava funcionando. A correção é o módulo
`src/main/areaTransferencia.js`, usado pela cópia da Biblioteca e pelo Inserir.

**Guardar e restaurar** (`guardar` e `restaurar` do mesmo módulo, VERIFICADO com texto e HTML, e no Inserir com texto):
guarda todos os tipos MIME que o Electron expõe, sem os formatos internos dele (`electron application/...`).
**Limites** (NÃO VERIFICADO além disso): formatos que o Electron não expõe, como a lista de arquivos copiada no
Explorador ou os formatos próprios do Excel, **se perdem** na restauração. A área só é restaurada se ainda tiver o
texto inserido (se a pessoa copiou outra coisa nesse meio tempo, não se mexe), regra em
`deveRestaurarAreaDeTransferencia`.

---

## Teste manual (com a pessoa)

Pendente, para fechar o Marco 12. Em cada programa, abra a janela do TextCDSP, escolha um atalho de texto simples de
várias linhas e clique em **Inserir** (ou Ctrl+Enter). Confira que o texto entra onde estava o cursor, com as quebras
de linha certas, que a janela vira o ícone e que a área de transferência volta ao que tinha.

1. **Bloco de Notas**, com o cursor no meio de uma linha: W1, W3 e W5.
2. **Google Docs**, com acentos: W1, W4 e W5.
3. Abrindo a janela **pela bandeja**, **pelo ícone flutuante** (clique de verdade) e **pelo Alt+Tab**: W1.
4. Copiar `ABC` antes de inserir: depois da inserção, Ctrl+V cola `ABC`.
5. Um programa aberto **como administrador**: W6 (o texto não deve entrar e o app não pode travar).
