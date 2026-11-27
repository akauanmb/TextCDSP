# TextCDSP: como instalar e usar

O TextCDSP coloca atalhos de texto no seu computador. Você digita, por exemplo, `/hoje` e a data aparece escrita, no Google Docs e em qualquer programa do Windows.

## 1. Instalar

1. Dê dois cliques no arquivo `TextCDSP-Setup-` seguido do número da versão (o setor informa onde ele está guardado).
2. Não pede senha de administrador. Espere terminar: o TextCDSP abre sozinho.

### Se aparecer a tela azul "O Windows protegeu o computador"

Isso acontece porque o instalador ainda não tem assinatura digital. Se o arquivo veio da CDSP, siga:

1. Clique em **Mais informações**.
2. Clique em **Executar assim mesmo**.

### Onde fica o ícone

Procure o ícone azul do TextCDSP (um escudo com uma cruz) perto do relógio. Se não aparecer, clique na seta **^** (ícones ocultos). Para deixá-lo sempre à vista, arraste-o para a barra.

Passe o mouse sobre o ícone: deve aparecer **TextCDSP - ativo**.

> Se já houver outro Espanso instalado no computador, o TextCDSP avisa e não inicia. Feche ou desinstale o outro Espanso e escolha **Retomar** no menu do ícone.

## 2. Configurar a pasta de snippets (só na primeira vez)

A janela do TextCDSP abre sozinha, já na seção **Configurações** (o menu lateral à esquerda). Se não abrir, clique com o botão direito no ícone da bandeja e escolha **Configurações...**.

1. Clique em **Escolher...** e selecione a pasta compartilhada com os snippets da CDSP (o setor informa qual é).
2. Clique em **Testar**. Deve aparecer algo como "6 snippets, 0 erros".
3. Clique em **Salvar**.

Em poucos segundos o menu do ícone mostra **Snippets atualizados**. Depois disso, os snippets se atualizam sozinhos.

## 3. Usar

- Digite o atalho (por exemplo, `/hoje`) em qualquer lugar onde você escreve.
- Para ver todos os atalhos, dê **dois cliques no ícone da bandeja**, ou escolha **Abrir biblioteca** no menu dele. A seção **Biblioteca** da janela do TextCDSP mostra os atalhos em pastas que abrem e fecham (clique, ou use as setas do teclado: para a direita abre, para a esquerda fecha). Ao digitar na busca, a lista mostra os resultados com o caminho de cada um, e buscar o nome de uma pasta encontra os atalhos dela. Há botões para copiar o atalho ou o texto.

### A janela do TextCDSP e o ícone flutuante

A **Biblioteca** e as **Configurações** ficam numa só janela, com um menu à esquerda para trocar de uma para a outra. Trocar de seção não perde o que você estava digitando.

Ao **minimizar** a janela (o botão da barra de título, o botão **Minimizar para ícone** no fim do menu, ou a tecla **Esc**), ela some e aparece um **ícone pequeno e redondo**, sempre à vista, no canto da tela:

- **Clique** no ícone para abrir a janela de novo, na seção em que ela estava.
- **Arraste** o ícone para onde quiser. O programa lembra o lugar. Ele não tira o cursor do programa em que você está escrevendo.
- **Botão direito** no ícone: **Abrir TextCDSP** ou **Esconder ícone**. Com o ícone escondido, a janela continua acessível pelo ícone da bandeja.
- Para a janela minimizar para a barra de tarefas como qualquer outra, desmarque **Ao minimizar, transformar a janela num ícone flutuante** em **Configurações**.
- O botão **X** da janela só a fecha: o programa continua na bandeja e o ícone flutuante não aparece.
- Abrir o TextCDSP de novo pelo menu Iniciar, com ele já rodando, traz a janela para a frente.

## 4. Criar um atalho pessoal

1. Abra a seção **Biblioteca** e clique em **Novo atalho pessoal**.
2. Preencha:
   - **Atalho:** por exemplo, `/ola` ou `;ola`. Começa com um destes caracteres: `/` `;` `!` `#` `=` `+`, seguido de 2 a 30 letras minúsculas (sem acento) ou números. Se você digitar só `ola`, o programa acrescenta o `/`.
   - **Nome:** como o atalho aparece na lista.
   - **Texto:** o que será inserido. Pode ter várias linhas.
3. Clique em **Salvar**. Em poucos segundos o atalho já funciona.

Outros caracteres, como `@`, `-`, `.`, `\` ou as teclas de acento (`´` `` ` `` `~` `^`), não podem abrir um atalho: o Google Docs e o teclado dão outro uso a eles. A janela recusa e mostra a lista dos permitidos.

O atalho não pode ser igual ao início de outro atalho com o mesmo caractere inicial (por exemplo, `/ola` e `/olamundo`). Atalhos que começam por caracteres diferentes não se atrapalham: `/ola` e `;ola` podem existir juntos. O texto não pode conter `{{` nem `}}`. Se algo estiver errado, a janela avisa ao lado do campo.

Se você escrever o atalho direto no arquivo `pessoal.yml`, ponha-o **sempre entre aspas** (`trigger: "!ola"`). Sem aspas, `!` e `#` quebram o arquivo.

Para mudar ou apagar, selecione o atalho na lista e clique em **Editar** ou **Excluir**.

## 5. Atualizar o programa

Quando houver uma versão nova na pasta de snippets, o TextCDSP avisa com uma notificação ("Nova versão do TextCDSP disponível"), uma única vez por versão. Ele nunca atualiza sozinho.

Para atualizar, clique na notificação ou clique com o botão direito no ícone e escolha **Instalar versão X.Y.Z**. Confirme em **Instalar agora**. O TextCDSP fecha, a versão nova é instalada e ele abre de novo. Durante esse intervalo os atalhos ficam parados. Seus atalhos pessoais e as configurações são mantidos.

Se a notificação passar despercebida, o item **Instalar versão X.Y.Z** continua no menu do ícone até você atualizar.

## 6. Desinstalar

1. Abra **Configurações do Windows**, depois **Aplicativos** e **Aplicativos instalados**.
2. Procure **TextCDSP** e escolha **Desinstalar**.

Seus atalhos pessoais ficam guardados no computador, na pasta `%APPDATA%\TextCDSP` (cole esse endereço na barra do Explorador de Arquivos para abrir). Para apagar tudo de vez, apague essa pasta depois de desinstalar.

## Para quem administra a pasta compartilhada

A pasta de snippets pode ter **subpastas**, e a Biblioteca mostra a mesma organização, com pastas que abrem e fecham (cada pasta e cada arquivo mostram quantos snippets têm). Exemplo:

```
Pasta de snippets\
  exemplos.yml                      (na raiz)
  Medicamentos\
    contestacao.yml
    Recursos\
      agravo.yml
  _historico\                       (ignorada)
```

- **Até 3 níveis de subpastas.** `Medicamentos\Recursos\Agravos\interno.yml` está dentro do limite. Um arquivo em 4 níveis ou mais é um erro (`caminho-profundo`): a pasta inteira deixa de ser aplicada e os computadores continuam com a versão anterior, até você mover o arquivo.
- **O que é ignorado:** arquivos que começam com `_`, pastas que começam com `_` ou `.` (por exemplo `_historico` e `_instalador`) e tudo que não termina em `.yml`.
- **Os atalhos valem para a pasta toda.** Dois atalhos iguais, ou um que seja o começo de outro (`/cont` e `/contestacao`), são erro mesmo estando em pastas diferentes. A mensagem diz os dois caminhos.
- **Mover um arquivo de pasta** não tem efeito além da organização: na sincronização seguinte ele sai do lugar antigo e aparece no novo.
- Antes de publicar, confira com `npm run validar -- <pasta>`: ele lê as subpastas do mesmo jeito que o programa.
- Os atalhos pessoais não têm pastas: ficam todos na pasta **Pessoal**, no fim da lista.

## Se algo não funcionar

- **O atalho não expande:** passe o mouse no ícone. Se disser **pausado** ou **erro**, clique com o botão direito e escolha **Retomar**.
- **O ícone sumiu:** abra **TextCDSP** pelo menu Iniciar. Se você escolheu **Sair**, ele só volta quando for aberto de novo.
- **Quer falar com a TI:** clique com o botão direito no ícone, escolha **Abrir pasta de logs** e envie o arquivo `app.log`.
- **Versão e licenças:** clique com o botão direito no ícone e escolha **Sobre o TextCDSP**.
