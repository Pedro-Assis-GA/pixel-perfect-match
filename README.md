# Skin Scope

**Painel de consulta e comparação de preços do mercado de skins de Counter-Strike 2 (CS2).**

O Skin Scope é um projeto de portfólio desenvolvido para reunir informações públicas de mercado, facilitar pesquisas de itens e apresentar diferenças entre fontes de preços com transparência sobre origem e atualização dos dados.

> **Status:** projeto em desenvolvimento. Os preços são informativos, não constituem recomendação de investimento e não substituem a conferência do anúncio na plataforma de origem.

## Funcionalidades

- **Dashboard:** visão geral dos itens e anúncios encontrados na fonte de catálogo, distribuição por categorias, itens mais ofertados e possíveis oportunidades segundo critérios definidos no código.
- **Pesquisa de skins:** busca por nome, filtros por categoria, exterior, faixa de preço, versões Normal/StatTrak™/Souvenir, ordenação e paginação.
- **Página do item:** preços de referência, comparação entre fontes, indicação dos horários de atualização, outros marketplaces e itens relacionados.
- **Lista de observação:** favoritos salvos localmente no navegador, sem necessidade de criar conta.
- **Tratamento de indisponibilidade:** exibição de estados de erro, dados ausentes ou desatualizados sem inventar valores quando uma fonte falha.

## Fontes de dados

| Fonte | Uso no projeto | Observações |
| --- | --- | --- |
| **Skinport** | Preços e dados agregados de catálogo; histórico agregado quando disponível | Acesso direto pode falhar ou ser bloqueado (por exemplo, HTTP 403). |
| **Steam Community Market** | Consulta direta de preço, mediana, volume e imagem quando disponíveis | Pode limitar requisições (por exemplo, HTTP 429). O saldo da Steam não equivale a dinheiro sacável. |
| **OpenSkin** | Fonte agregadora alternativa para dados de preços, inclusive valores atribuídos a outros marketplaces | Os dados são reportados pelo agregador, não representam integrações diretas com todos os marketplaces listados. |

A cobertura e a disponibilidade dependem das APIs externas. Quando uma fonte direta não fornece informação válida, o projeto pode apresentar informação agregada identificada como tal. **Preços agregados não são anúncios individuais verificáveis**, e os horários de atualização podem variar entre fontes.

**Moeda exibida:** dólar americano (USD). O sistema sinaliza dados desatualizados e evita mostrar uma comparação percentual quando não há pelo menos dois preços diretos válidos.

## Tecnologias

- React e TypeScript
- TanStack Start, TanStack Router e TanStack Query
- Vite
- Tailwind CSS e componentes Radix UI
- Recharts para gráficos
- Zod para validação
- Vitest para testes automatizados
- ESLint e Prettier para qualidade e formatação

O projeto teve seu escopo inicial criado com [Lovable](https://lovable.dev/) e recebeu desenvolvimento, testes e correções adicionais localmente.

## Executar localmente

**Pré-requisitos:** Node.js e npm instalados.

```bash
git clone https://github.com/Pedro-Assis-GA/pixel-perfect-match.git
cd pixel-perfect-match
npm ci
npm run dev
```

Abra **http://localhost:8080/** no navegador, ou utilize o endereço indicado pelo terminal caso a porta seja diferente.

### Verificações de qualidade

```bash
npm run test
npm run build
npx tsc --noEmit
npm run lint
npm audit
```

Na versão validada localmente em **30/10/2026**, os **65 testes automatizados** passaram, o build e a checagem de TypeScript foram concluídos, o ESLint registrou **0 erros e 6 avisos**, e o `npm audit` reportou **0 vulnerabilidades**. Esses resultados refletem o ambiente testado e não garantem disponibilidade contínua das APIs externas.

**Gerenciador validado:** npm com `package-lock.json`. O repositório também contém um `bun.lock` herdado do fluxo original; ele precisa ser atualizado ou revisado antes de utilizar Bun para uma instalação reproduzível.

## Limitações atuais

- Os preços de catálogo e de agregadores são **dados agregados**; nem sempre há acesso a anúncios individuais.
- Não há integração direta de anúncios detalhados com CSFloat, Buff163, YouPin ou outros marketplaces exibidos pela OpenSkin.
- Filtros por **float exato, paint seed, pattern, adesivos aplicados e fase Doppler** ainda não estão implementados com dados por anúncio.
- O histórico de vendas da Skinport pode ficar indisponível quando a consulta à fonte falha; o sistema não inventa séries históricas.
- A lista de observação é local ao navegador; não há contas, sincronização entre dispositivos ou alertas automáticos.
- Custos e taxas exibidos são estimativas baseadas em regras configuradas no projeto. Sempre confira as condições atuais de cada plataforma.
- O funcionamento das APIs em produção ainda deve ser validado após a hospedagem pública.

## Próximas melhorias

- Revisar documentação e compatibilidade dos arquivos de dependências.
- Melhorar a observabilidade de falhas e os testes de integração com APIs reais.
- Avaliar fontes autorizadas de anúncios individuais e histórico de preços, respeitando limites e termos de uso.
- Preparar publicação gratuita e realizar testes no ambiente hospedado.

## Aviso

O Skin Scope é uma ferramenta independente de **consulta informativa**. Não é afiliado oficialmente à Valve, Steam, Skinport, OpenSkin ou aos demais marketplaces mencionados. Marcas e nomes de itens pertencem a seus respectivos titulares.

## Desenvolvimento

Repositório: [Pedro-Assis-GA/pixel-perfect-match](https://github.com/Pedro-Assis-GA/pixel-perfect-match)

Criado inicialmente com [Lovable](https://lovable.dev/).
