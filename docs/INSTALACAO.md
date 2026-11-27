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

Procure um quadrado azul com **TC** perto do relógio. Se não aparecer, clique na seta **^** (ícones ocultos). Para deixá-lo sempre à vista, arraste-o para a barra.

Passe o mouse sobre o ícone: deve aparecer **TextCDSP - ativo**.

> Se já houver outro Espanso instalado no computador, o TextCDSP avisa e não inicia. Feche ou desinstale o outro Espanso e escolha **Retomar** no menu do ícone.

## 2. Configurar a pasta de snippets (só na primeira vez)

A janela **Configurações** abre sozinha. Se não abrir, clique com o botão direito no ícone e escolha **Configurações...**.

1. Clique em **Escolher...** e selecione a pasta compartilhada com os snippets da CDSP (o setor informa qual é).
2. Clique em **Testar**. Deve aparecer algo como "6 snippets, 0 erros".
3. Clique em **Salvar**.

Em poucos segundos o menu do ícone mostra **Snippets atualizados**. Depois disso, os snippets se atualizam sozinhos.

## 3. Usar

- Digite o atalho (por exemplo, `/hoje`) em qualquer lugar onde você escreve.
- Para ver todos os atalhos, dê **dois cliques no ícone**. A janela **Biblioteca** tem busca e botões para copiar o atalho ou o texto.

## 4. Criar um atalho pessoal

1. Abra a Biblioteca e clique em **Novo atalho pessoal**.
2. Preencha:
   - **Atalho:** por exemplo, `/ola`. Começa com `/` e tem de 2 a 30 letras minúsculas ou números.
   - **Nome:** como o atalho aparece na lista.
   - **Texto:** o que será inserido. Pode ter várias linhas.
3. Clique em **Salvar**. Em poucos segundos o atalho já funciona.

O atalho não pode ser igual ao início de outro atalho (por exemplo, `/ola` e `/olamundo`), e o texto não pode conter `{{` nem `}}`. Se algo estiver errado, a janela avisa ao lado do campo.

Para mudar ou apagar, selecione o atalho na lista e clique em **Editar** ou **Excluir**.

## 5. Atualizar o programa

Quando houver uma versão nova na pasta de snippets, o TextCDSP avisa com uma notificação ("Nova versão do TextCDSP disponível"), uma única vez por versão. Ele nunca atualiza sozinho.

Para atualizar, clique na notificação ou clique com o botão direito no ícone e escolha **Instalar versão X.Y.Z**. Confirme em **Instalar agora**. O TextCDSP fecha, a versão nova é instalada e ele abre de novo. Durante esse intervalo os atalhos ficam parados. Seus atalhos pessoais e as configurações são mantidos.

Se a notificação passar despercebida, o item **Instalar versão X.Y.Z** continua no menu do ícone até você atualizar.

## 6. Desinstalar

1. Abra **Configurações do Windows**, depois **Aplicativos** e **Aplicativos instalados**.
2. Procure **TextCDSP** e escolha **Desinstalar**.

Seus atalhos pessoais ficam guardados no computador, na pasta `%APPDATA%\TextCDSP` (cole esse endereço na barra do Explorador de Arquivos para abrir). Para apagar tudo de vez, apague essa pasta depois de desinstalar.

## Se algo não funcionar

- **O atalho não expande:** passe o mouse no ícone. Se disser **pausado** ou **erro**, clique com o botão direito e escolha **Retomar**.
- **O ícone sumiu:** abra **TextCDSP** pelo menu Iniciar. Se você escolheu **Sair**, ele só volta quando for aberto de novo.
- **Quer falar com a TI:** clique com o botão direito no ícone, escolha **Abrir pasta de logs** e envie o arquivo `app.log`.
- **Versão e licenças:** clique com o botão direito no ícone e escolha **Sobre o TextCDSP**.
