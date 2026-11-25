# Pacote de teste CDSP para o Espanso

## 1. Instalar o Espanso

Baixe o instalador para Windows em https://espanso.org/install/ e instale.
Se aparecer a opção, escolha a instalação só para o seu usuário: ela não exige permissão de administrador.

## 2. Colocar o pacote no lugar certo

1. Aperte `Win + R`, digite `%APPDATA%\espanso\match` e aperte Enter.
2. Copie o arquivo `cdsp.yml` para essa pasta.
3. O Espanso recarrega sozinho. Se não recarregar, clique com o botão direito no ícone dele, na bandeja do Windows, e escolha **Reload**.

## 3. Roteiro de teste no Google Docs

Abra um documento em branco e digite cada atalho:

| Atalho | Função testada | O que deve acontecer |
|---|---|---|
| `/cont` | Texto fixo | Entra um parágrafo pronto. |
| `/hoje` | Data por extenso | "Cuiabá-MT, 25 de novembro de 2026." |
| `/prazo` | Data com deslocamento | A data daqui a 15 dias (dd/mm/aaaa). |
| `/qualif` | Formulário | Abre uma janela com nome, CNJ, menu de medicamento e observações. Preencha e confirme com `Ctrl + Enter`. |
| `/prelim` | Escolha de parágrafo (condicional) | Abre uma lista. A opção escolhida decide qual parágrafo entra. |
| `/fmt` | Texto formatado | Pede o nome da parte e cola um bloco com negrito, itálico e lista numerada. |

Outro recurso útil: `Alt + Espaço` abre uma busca com todos os atalhos.

## 4. Se algo não funcionar

- **A data saiu em inglês**: a versão instalada é antiga e não lê o parâmetro `locale`. Atualize o Espanso.
- **O atalho não dispara no Google Docs**: clique dentro do texto antes de digitar e confira se o Espanso está ativo (ícone na bandeja).
- **Erro ao recarregar**: o Espanso mostra a linha do problema. Geralmente é espaço ou indentação errada no YAML (use espaços, nunca tab).

## 5. Compartilhar com a equipe (depois do teste)

Deixe o `cdsp.yml` numa pasta compartilhada, por exemplo no Google Drive para computador.
Cada pessoa cria em `%APPDATA%\espanso\match` um arquivo `importar-cdsp.yml` com:

```yaml
imports:
  - "G:/Drives compartilhados/CDSP/espanso/cdsp.yml"
```

Ajuste o caminho para o local real da pasta compartilhada.
Assim, quando alguém atualizar o arquivo compartilhado, todos recebem a mudança.
