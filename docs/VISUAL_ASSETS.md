# Visual Skin Scope

## Fontes e atualização

- `public/images/cs2-hero.jpg`: arte pública de Counter-Strike 2 distribuída pela Valve em
  `https://cdn.akamai.steamstatic.com/steam/apps/730/library_hero.jpg`.
- `public/images/catalog/*.json`: índice de URLs de imagens obtidas do catálogo comunitário
  [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API), endpoint
  `https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json`.
  Imagens e marcas de Counter-Strike pertencem aos seus respectivos titulares.
  O catálogo é uma referência visual não oficial; não fornece preços ao Skin Scope.

Snapshot em 17/11/2026: 28.262 nomes normalizados em 256 fragmentos (7.353.248 bytes
de JSON sem compressão). A interface solicita apenas os fragmentos necessários e reutiliza
as promessas no navegador. Não importa o índice completo no Worker. As imagens são carregadas
diretamente das URLs HTTPS da fonte, com lazy loading e fallback para erros ou nomes ausentes.
O índice não contém preços, credenciais ou dados de usuários.

`image-key.ts` remove apenas prefixos StatTrak/Souvenir e o desgaste do nome para compartilhar
a arte da mesma skin. Acabamentos diferentes permanecem separados. Novos itens podem exigir
novo snapshot. Não substituir uma imagem ausente pela de outra skin.

## Comportamento

A faixa usa cinco skins reais selecionadas para a apresentação. Só consulta uma cotação
agregada por item ao interagir, com cache React Query de cinco minutos. Não carrega catálogos
no dashboard nem no item para alimentar a faixa. Preço aparece em hover, foco ou toque, com
origem e idade do preço.
Não há série de variação diária disponível: percentuais decorativos das referências não
foram fabricados. O movimento pausa em hover/foco, pode ser pausado pelo botão e respeita
`prefers-reduced-motion`. No modo reduzido, a faixa fica estática e quebra em linhas, sem recortar os painéis de cotação.

As referências visuais orientam composição, cores e hierarquia. Dados, quantidade de cards,
nomes, mensagens de indisponibilidade e gráficos dependem das fontes atuais. A arte pública
usada no banner é diferente da montagem exata da referência. Recursos existentes de comparação,
filtros, paginação, histórico e variantes são preservados.


## Ajuste da arte e cores — 18/11/2026

O banner ativo é `public/images/cs2-reference-hero.png`: reconstrução com a ferramenta
ImageGen embutida a partir da print de referência fornecida pelo usuário. Preserva a
composição de dois soldados azuis com viseiras douradas, luz amarelo/azul e faixas diagonais.
Textos, números e elementos da interface da print foram removidos. A imagem não é o arquivo
original da referência e não há promessa de igualdade pixel por pixel.
O prompt completo utilizado fica em `reports/quality/hero-colors/image-prompt.txt`.
A arte pública anterior `cs2-hero.jpg` continua preservada como alternativa, sem uso no banner.
O gradiente da aplicação ficou mais saturado; painéis e textos mantêm contraste escuro/claro.
Seleção/conversão de moedas não foi implementada nesta etapa: cotações continuam em USD.
