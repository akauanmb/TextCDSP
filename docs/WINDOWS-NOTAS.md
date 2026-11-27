# TextCDSP: fatos verificados sobre o Windows e o Electron

Mesmo formato do `ESPANSO-NOTAS.md`: **VERIFICADO** é o que foi testado de fato (com o comando ou o roteiro usado);
**NÃO VERIFICADO** é o que só foi lido, deduzido ou não deu para testar. Ambiente dos testes: Windows 11 Pro
10.0.26200, Electron 45.5.0, em 27/11/2026.

---

## BLOQUEIO: `janela.hide()` não devolve o foco à janela anterior (W1)

**O Marco 12 está parado na Etapa 1.** O plano manda parar quando o W1 falha e não trocar de técnica sem decisão
sua. Nenhum código da Etapa 2 foi escrito (nem `inserir.js`, nem o botão "Inserir", nem o canal `biblioteca:inserir`).

**O que acontece (VERIFICADO):** com a janela do Electron em foco, `janela.hide()` esconde a janela, mas o foco **não
vai para a janela que estava antes**. Ele fica na janela escondida (o Windows ainda a reporta como a janela em
foco) e só muda cerca de **4 s depois**. Um Ctrl+V enviado 200 ms depois do `hide()` iria para uma janela
invisível, e a colagem se perderia.

| Teste | Quando o foco voltou à janela anterior |
|---|---|
| Electron, `janela.hide()` | **+4069 ms** (aos 200 ms ainda estava na janela escondida) |
| Controle sem Electron (janela comum do WinForms, `Form.Hide()`) | **+42 ms** (passando por "nenhuma janela" aos +22 ms) |
| Electron, `janela.minimize()` (só diagnóstico) | **antes de 200 ms**, nas duas rodadas |

O controle mostra que o Windows devolve o foco na hora quando a janela é escondida do jeito normal. A diferença está
no `hide()` do Electron. **Causa provável (NÃO VERIFICADO, vem do que se conhece do Chromium, não li o código nesta
versão):** o Chromium esconde a janela ativa com `SWP_HIDEWINDOW | SWP_NOACTIVATE`, de propósito para não ativar
outra janela no meio de uma troca de ativação.

**Como foi verificado.** Roteiro temporário (apagado), com estes elementos:
- uma janela-alvo minha, com uma caixa de texto (o Bloco de Notas **não** foi usado: já havia um aberto na máquina,
  e o Windows 11 reaproveita a janela e restaura abas);
- um vigia em PowerShell que registra, a cada 10 ms, o processo e o título da janela em foco;
- só enviava Ctrl+V se a janela-alvo estivesse mesmo em foco. No W1 com `hide()` abortou antes de enviar qualquer
  tecla.

**Decisão pendente.** As técnicas candidatas, nenhuma adotada ainda:

1. **`minimize()` e depois esconder** (a janela é minimizada, o Windows devolve o foco, e só então ela é escondida
   para o ícone flutuante). É a que o diagnóstico sustenta: com `minimize()`, W1, W2 e W3 passaram. Falta medir o
   "minimizar e depois esconder" e a volta da janela (`restore`).
2. **Guardar a janela em foco antes de abrir o TextCDSP e devolver o foco a ela.** Pede chamadas do Windows que o
   Electron não expõe (PowerShell com `SetForegroundWindow`, ou um módulo nativo, que seria dependência nova).
3. **Abandonar o "Inserir"** e manter só "Copiar texto".

Recomendo a 1. Para seguir, o W1 deve ser refeito com ela, **também com a janela aberta pela bandeja, pelo ícone
flutuante e pelo Alt+Tab** (o plano pede isso), e você confirma W1 a W5 no Bloco de Notas e no Google Docs.

---

## W1. Ao esconder a janela, o foco volta para a janela anterior?

**Resposta: NÃO, com `hide()`** (VERIFICADO, ver o BLOQUEIO acima). Com `minimize()`, sim (VERIFICADO em duas rodadas,
só como diagnóstico).

**NÃO VERIFICADO:** a janela aberta pela bandeja, pelo ícone flutuante e pelo Alt+Tab. O teste mostrou a janela por
código e a ativou com `AppActivate`; o caminho real (clique na bandeja) pode se comportar diferente. O clique na
bandeja deixa a barra de tarefas como janela ativa, então "a janela anterior" pode não ser a que a pessoa esperava.

## W2. O PowerShell aparece ou rouba o foco?

**Resposta:** nas duas rodadas com `minimize()`, **não** (VERIFICADO): `powershell.exe -NoProfile -NonInteractive
-WindowStyle Hidden -Command ...`, com `spawn` e `windowsHide: true`, não apareceu e nenhuma janela estranha chegou
a ter o foco entre o minimize e o fim da colagem. Com `hide()` o W2 não foi avaliado (o teste abortou antes de colar).

## W3. Quanto tempo leva, do clique até o texto aparecer?

**Resposta (VERIFICADO, só no modo `minimize()`, duas rodadas):**

| Etapa | Tempo |
|---|---|
| Esconder, esperar 200 ms e gravar na área de transferência | 225 a 228 ms |
| `powershell.exe` iniciar, `SendWait('^v')` e sair (frio) | 278 a 381 ms |
| Do esconder até o texto aparecer na janela-alvo | **480 a 589 ms** |

Fica abaixo de 1,5 s, então **não** é preciso um PowerShell residente (o plano pede relatar e não implementar só se
passasse de 1,5 s). Medições "a quente", repetidas, ficaram inconclusivas e não valem.

## W4. O Ctrl+V sintético faz o Espanso expandir alguma coisa?

**NÃO VERIFICADO.** A medição desta rodada foi inconclusiva (a limpeza entre colagens não funcionou, porque a caixa de
texto do WinForms não aceita Ctrl+A). Esperado: não, porque o Espanso ignora teclas sintéticas (ESPANSO-NOTAS, P7,
`win32_exclude_orphan_events`). Confirmar no teste manual: com o Espanso ativo, usar o "Inserir" num texto que contenha
um atalho (por exemplo, `/hoje`) e ver que ele **não** expande.

## W5. Quebras de linha: é preciso converter `\n` para `\r\n`?

**NÃO VERIFICADO** (mesmo motivo do W4). A caixa de texto do WinForms aceitou o texto, mas a comparação entre `\n` e
`\r\n` não ficou confiável. Decisão provisória para a Etapa 2: converter para `\r\n`, que é a convenção do Windows e
é aceita pelo Chrome (Google Docs). Confirmar no Bloco de Notas e no Google Docs.

## W6. O que acontece com um programa aberto como administrador?

**NÃO VERIFICADO** (abrir um programa elevado exige a confirmação do UAC, que não dá para fazer por script). Esperado:
o Windows (UIPI) impede que um processo comum mande teclas a uma janela elevada, e o Ctrl+V **não faz nada**, sem
erro (o `SendWait` ainda sai com código 0). Efeito para o app: não dá para detectar a falha. Se a área de transferência
fosse restaurada em seguida, o texto sumiria sem ter entrado, e a pessoa não poderia colar à mão.

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
`src/main/areaTransferencia.js`, usado agora também pela cópia da Biblioteca; o Marco 12 usará o mesmo.

**Guardar e restaurar** (`guardar` e `restaurar` do mesmo módulo, VERIFICADO com texto e HTML): guarda todos os tipos
MIME que o Electron expõe, sem os formatos internos dele (`electron application/...`). Limites (NÃO VERIFICADO além
disso): formatos que o Electron não expõe, como a lista de arquivos copiada no Explorador ou os formatos próprios do
Excel, **se perdem** na restauração.
