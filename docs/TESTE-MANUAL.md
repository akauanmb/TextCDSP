# Teste manual dos atalhos de exemplo

Os atalhos de teste estão em `snippets/exemplos.yml`. Este roteiro confere, no Google Docs, se cada tipo de atalho expande como esperado.

## 1. Conferir o arquivo antes de testar

```
npm run validar -- snippets
```

Deve terminar com `6 snippets, 0 erros, 0 avisos`.

## 2. Subir o motor

Use o motor portable do projeto, **não** o instalador do Espanso. Um Espanso instalado e rodando impede o portable de iniciar (e vice-versa): os dois disputam o mesmo canal interno e o atalho Alt+Espaço.

Siga o "Roteiro de teste manual" no fim do `docs/ESPANSO-NOTAS.md`. Ele copia o motor para uma pasta temporária, cria a configuração mínima e copia o `snippets/exemplos.yml` para a pasta `match` do motor. Se houver outro Espanso instalado, feche-o antes.

## 3. Roteiro de teste no Google Docs

Abra um documento em branco e digite cada atalho:

| Atalho | Função testada | O que deve acontecer |
|---|---|---|
| `/cont` | Texto fixo | Entra um parágrafo pronto. |
| `/hoje` | Data por extenso | "Cuiabá-MT, 26 de novembro de 2026." (a data do dia) |
| `/prazo` | Data com deslocamento | A data daqui a 15 dias (dd/mm/aaaa). |
| `/qualif` | Formulário | Abre uma janela com nome, CNJ, menu de medicamento e observações. Preencha e confirme com `Ctrl + Enter`. |
| `/prelim` | Escolha de parágrafo (condicional) | Abre uma lista. A opção escolhida decide qual parágrafo entra. |
| `/fmt` | Texto formatado | Pede o nome da parte e cola um bloco com negrito, itálico e lista numerada. |

Segundo a documentação do Espanso, `Alt + Espaço` abre uma busca com todos os atalhos. Isso ainda não foi verificado neste projeto.

## 4. Se algo não funcionar

- **A data saiu em inglês**: confira se o `locale: "pt-BR"` está na variável de data do atalho. O validador avisa (`locale`) quando falta.
- **O atalho não dispara no Google Docs**: clique dentro do texto antes de digitar e confira se o motor está rodando (`espansod.exe service status`, veja o roteiro do `ESPANSO-NOTAS.md`).
- **Mudei o arquivo e nada mudou**: o motor recarrega sozinho em cerca de 2 segundos. Se não recarregar, reinicie com `espansod.exe service restart`.
- **Apareceu uma janela "Troubleshooting"**: algum arquivo `.yml` tem erro. Rode `npm run validar -- snippets` e corrija o que ele apontar (geralmente é espaço ou indentação errada; use espaços, nunca tab).

## 5. Compartilhar com a equipe

Não use o recurso `imports` do Espanso apontando para a pasta compartilhada. A distribuição para o setor é feita pelo aplicativo TextCDSP, que copia os snippets oficiais da pasta compartilhada só depois de validá-los (Marco 4 do `docs/PLANO.md`).
