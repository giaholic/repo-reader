# Repo Reader

Uma interface web minimalista e somente leitura para explorar repositórios públicos e privados do GitHub.

## Funcionalidades

- Abre um repositório por URL ou `owner/repo`
- Acessa repositórios privados com um fine-grained personal access token de leitura
- Exibe metadados e a árvore completa de arquivos
- Permite definir uma ordem de leitura personalizada para cada repositório
- Navega para o documento anterior ou seguinte nessa sequência
- Renderiza Markdown em uma área de leitura limpa
- Exibe arquivos de texto e código
- Oferece temas claro e escuro
- Funciona em desktop e dispositivos móveis
- Não exige instalação, build ou dependências

A ordem escolhida é salva localmente no navegador e pode ser restaurada para a ordem alfabética a qualquer momento.

## Uso local

Abra `index.html` no navegador. Para evitar restrições do navegador, você também pode iniciar um servidor local:

```bash
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## Repositórios privados

Crie um fine-grained personal access token no GitHub com estas restrições:

- **Repository access:** somente os repositórios que deseja ler
- **Repository permissions → Contents:** Read-only
- Defina uma data de expiração curta e renove quando necessário

O token é mantido em `sessionStorage`: não entra no código, não é salvo em `localStorage` e é apagado quando a aba é fechada. Desconectar também o remove imediatamente.

Como esta versão é um site estático, o token ainda fica disponível ao JavaScript da própria página durante a sessão. Para uso multiusuário ou autenticação OAuth, será necessário adicionar um backend.

Sem token, a aplicação continua lendo repositórios públicos pela API do GitHub e fica sujeita ao limite de requisições anônimas.

## Publicação

O projeto é estático e pode ser publicado diretamente com GitHub Pages a partir da branch principal.
