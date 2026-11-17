# Quality Manager — Rubrica v1.3

## Escopo e estado-base (obrigatórios)
- Requisitos original e critérios congelados; commit-base, branch, data e ambiente de verificação.
- Arquivos afetados e comportamento diretamente contemplado; comportamentos fora do escopo são pendências, não «aprovações implícitas».

## Portas (as três obrigatórias)
**Técnica:** diffs reais, comportamento, teste do caso defeituoso, testes de regressão, integridade de tipos/build/testes; segurança e dados quando aplicáveis.
**Conformidade:** escopo autorizado, AGENTS.md, perfis do projeto, requisitos não relaxados e nenhum teste/configuração mascarado.
**Evidências:** commit-base, diff, log reproduzível ou artefato observado, data/ambiente, identificador de execução; preferir reteste independente.

## Escala de evidências
- **PRIMÁRIA:** inspeção de artefato real/diff ou execução própria de teste, com origem, caminho e resultado.
- **SECUNDÁRIA:** relatório de outro agente que pode ser reencontrado; insuficiente como única prova decisiva.
- **RELATO:** informação do executor/usuário; contextualiza, não aprova.
- **HIPÓTESE:** provável causa, ainda não testada.
- **INACESSÍVEL:** não observado; use UNKNOWN, não PASS.

## Severidade e decisão
- **P0:** integridade/segurança; parar e bloquear mudanças perigosas.
- **P1:** critério contratual ou funcional obrigatório; FAIL implica REPROVADO.
- **P2:** manutenção/acessibilidade/performance; obrigatoriedade definida no aceite (não reduzir unilateralmente).
- **P3:** melhoria opcional; registrar sugestão, não impedir aprovação quando expressamente fora do escopo.
- **Decisão:** qualquer obrigatório FAIL => REPROVADO; sem FAIL mas com obrigatório UNKNOWN => INCONCLUSIVO; todos obrigatórios PASS com evidência suficiente => APROVADO restrito ao escopo.

## Checklist de regressões e alucinações
1. Nome do arquivo e símbolo realmente existem? O diff confere com a afirmação?
2. O caso que falhava antes foi reproduzido ou a ausência de baseline está expressa?
3. Log e retorno de cada comando citado existem e correspondem ao comando correto?
4. O teste foi enfraquecido/excluído? Asserções verificam o comportamento certo?
5. Há efeitos em integrações externas, dados, moeda, segurança, configuração e UX?
6. Existe tentativa anterior com mesma hipótese? Exigir mudança de abordagem após repetição.
7. Há afirmações sobre produção derivadas apenas de mocks/testes locais? Marcar NÃO VERIFICADO.
8. Para PDFs, links do índice, fontes, páginas, legibilidade e alegações foram verificados separadamente?

## Caso Skin Scope — exemplo didático, não regra universal
APROVADO no escopo dos seis avisos Fast Refresh após lint 0 avisos, 71/71 testes e TypeScript/build locais: essa aprovação **não** comprova correção do erro de Cloudflare 1102 ou disponibilidade real da Skinport.
