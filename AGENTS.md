<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep item-only source selection and notice severity in the pure item-presentation module; this allows testing presentation decisions without changing API clients or cache behavior.

## Objetivo e escopo

- Skin Scope é um projeto de portfólio para análise e consulta do mercado de skins de Counter-Strike 2. Priorize funcionamento verificável, estabilidade, manutenção, experiência de uso, testes, documentação e custo zero. Evite serviços pagos, dependências desnecessárias e retrabalho.
- Mantenha cotações e comparações em USD. Use dados de mercado verificáveis e evite conversões para BRL sem fonte.
- Confirme a stack, os scripts e o gerenciador de pacotes no `package.json` e no lockfile antes de trabalhar no código.

## Autoridade e responsabilidades

- A partir do erro relatado e do comportamento esperado, investigue, corrija, teste e reteste autonomamente dentro do escopo autorizado. Preserve alterações preexistentes do usuário. Consulte diretamente os logs acessíveis.
- Para revisão independente, invoque `$quality-manager` quando disponível e permitido. O revisor examina código, diff, logs e testes em modo somente leitura. O executor faz as correções.
- Para manter o diário, invoque `$technical-journal` quando disponível e permitido. A Skill consulta o código em modo somente leitura e grava JSON, PDF ou snapshots apenas na pasta de relatórios destinada a esse fim.
- As permissões e a política de aprovações vêm da sessão. Quando houver escolha, prefira `workspace-write` e aprovações sob demanda. As instruções deste arquivo orientam o fluxo dentro dessas permissões. A revisão por subagente depende de autorização aplicável.

## Correção de falhas

1. Confirme a raiz do repositório, rode `git status` e examine a configuração, os scripts e os arquivos pertinentes.
2. Registre o comportamento esperado e o observado, como reproduzir a falha e os critérios de aceite mensuráveis. Distinga observação direta, relato do usuário, hipótese e causa comprovada.
3. Localize o ponto da falha. Quando viável, crie ou mantenha um teste de regressão e capture a falha antes da correção, se for seguro.
4. Faça a menor correção sustentável. Preserve recursos, valores e interfaces fora do escopo.
5. Rode as verificações pertinentes, investigue falhas e reteste. Revise o `git diff` e avalie regressões, segurança, acessibilidade, estados de carregamento e erro e contratos dos dados.
6. Aplique a rubrica de qualidade antes de declarar a conclusão. Solicite a revisão independente prevista acima e registre se ela pôde ser realizada.
7. Em caso de REPROVADO ou INCONCLUSIVO, devolva ao executor as evidências e uma nova hipótese para outra tentativa. Após o limite inicial de quatro ciclos, informe BLOQUEADO se o problema persistir. Se houver um impedimento externo, registre a evidência faltante e a ação mínima necessária.
8. Registre no diário, quando disponível e autorizado, as etapas observadas, a data, as evidências de antes e depois, os testes e os caminhos relevantes.

## Verificações

- Escolha os comandos existentes e pertinentes à estrutura do projeto. Com npm, considere `npm run lint`, `npm run test` e `npm run build`. Use a checagem de tipos apropriada aos projetos TypeScript configurados, com o compilador local quando disponível.
- Registre nome, comando, saída e código de retorno de cada verificação. Use PASSOU apenas para verificações executadas com êxito. Informe separadamente verificações ausentes, falhas, interrompidas ou não executadas.
- Preserve a capacidade de detectar regressões. Evite remover testes, suprimir erros TypeScript, adicionar `any` ou desabilitar regras para obter aprovação.

## Integrações externas

- Verifique o comportamento real da integração. Para HTTP 403 em Skinport ou outros mercados, examine a resposta, os limites, a autenticação, os termos e o ponto da falha. Informe a indisponibilidade sem fabricar preços ou quantidades, contornar bloqueios, usar chaves sem autorização ou apresentar dados simulados como cotações reais.
- Para erro 1102, identifique o provedor e a origem. Em Cloudflare Workers, investigue consumo de CPU e memória, logs e requisições repetidas.
- Distinga correções locais, falhas de rede, ambientes de teste e incidentes em produção. Baseie conclusões sobre a integração em evidências do ambiente afetado.

## Segurança e preservação

- Antes de mudanças amplas, confirme que há um ponto de recuperação no Git ou em backup. Siga as regras do Lovable acima ao trabalhar com histórico publicado e com a branch conectada.
- Push, deploy, exclusões destrutivas, alterações de segredos, compras, autenticação de terceiros e mudanças fora do repositório exigem autorização explícita.
- Omita tokens, cookies, conteúdo de `.env` e outros dados confidenciais de logs e relatórios. Masque segredos que apareçam nas evidências.
- Preserve os critérios de aceite durante as tentativas de correção.

## Acionamento do fluxo de qualidade

- Ao receber um relato de problema que autorize correção, iniciar o fluxo Executor -> Quality Manager -> Technical Journal nesta sessão, sem exigir que o usuário cite Skills. Pedidos somente de inspeção continuam somente leitura.
- O agente principal coordena o trabalho e usa subagente independente para a revisão quando disponível. Para Quality Manager, usar a cópia local `tools/quality-manager-v1.3/SKILL.md`; para Technical Journal, usar a Skill instalada. A Skill pessoal Quality Manager v1.2 permanece preservada. O revisor trabalha somente em leitura e devolve critérios, evidências e parecer.
- Seguir `docs/QUALITY_AUTOMATION.md` e os comandos de `scripts/quality_flow.py`. Registrar tarefa e critérios antes das alterações, capturar verificações reais, devolver REPROVADO ou INCONCLUSIVO ao executor e limitar a quatro ciclos. Uma falha repetida exige nova hipótese. Impedimento externo comprovado permite BLOQUEADO antes do limite.
- Usar `reports/quality` como pasta de relatórios deste fluxo dentro do workspace autorizado. Preservar os eventos importados e as versões anteriores. A origem externa do diário deve constar da migração. Atualizações futuras usam o mesmo PDF e JSON locais.
- Finalizar somente após revisão APROVADA, verificações exigidas aprovadas e confirmação de gravação do diário. Falha do diário impede declarar o fluxo concluído e deve registrar pendência recuperável. Simulações devem ser identificadas e mantidas fora do histórico real de correções.
- Estas instruções acionam a coordenação pelo agente durante a tarefa. Hooks e processos externos dependem de disponibilidade e validação próprias. Não chamar recursivamente o fluxo quando já estiver atuando como executor ou revisor de uma rodada.

## Documentos e entrega

- Consulte `QUALITY_STANDARDS.md` para a rubrica de qualidade, `AUDIT_LOG.md` para o histórico de defeitos e reincidências e `CICLO_DE_CORRECAO.md` para o fluxo de correção. Procure cada documento em `docs/` e use a cópia da raiz se o caminho em `docs/` estiver ausente.
- Declare CONCLUÍDO somente quando todos os critérios obrigatórios estiverem comprovados. Informe a causa confirmada ou a hipótese, os arquivos alterados, os resultados reais das verificações, os riscos remanescentes, o resultado da revisão independente e a situação do diário, conforme aplicável.
- Em resultado inconclusivo ou bloqueado, informe a evidência faltante e os caminhos principal e alternativo, quando houver.
