# Repo Reader

Uma interface web minimalista e somente leitura para explorar repositórios públicos do GitHub.

## Funcionalidades

- Abre um repositório por URL ou `owner/repo`
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

## Limites da primeira versão

A aplicação usa a API pública do GitHub sem autenticação. Por isso, lê apenas repositórios públicos e está sujeita ao limite de requisições anônimas da API. Tokens pessoais não são solicitados nem armazenados no navegador.

## Publicação

O projeto é estático e pode ser publicado diretamente com GitHub Pages a partir da branch principal.
