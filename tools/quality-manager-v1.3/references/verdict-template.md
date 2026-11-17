# Modelo de parecer — Quality Manager v1.3

**Tarefa e escopo explícito:**
**Pedido e critérios congelados:**
**Ambiente, branch e commit-base:**
**Ciclo:**
**Veredito do schema:** APROVADO | REPROVADO | INCONCLUSIVO
**Estado do coordenador, se preciso:** BLOQUEADO (não é valor do schema)

| Porta | Critério obrigatório | PASS/FAIL/UNKNOWN | Evidência primária | Falta / próxima ação |
|---|---|---|---|---|
| Técnica | | | | |
| Conformidade | | | | |
| Integridade de evidência | | | | |

**Mudanças reais (arquivos/diff):**
**Testes reexecutados pelo revisor (comando, ambiente, log e código de saída):**
**Regressões encontradas:**
**Afirmações não comprovadas / diferenças entre relato e código:**
**Histórico: tentativa anterior, hipótese, por que falhou, hipótese nova:**
**Limitações: ambiente local versus produção:**
**Recomendação ao executor se rejeitado:**
**Critérios de parada/bloqueio:**

**Regra:** não liberar uma entrega marcada REPROVADO ou INCONCLUSIVO. Somente liberação APROVADA **para o escopo escrito**, após verificar evidências. O diário preserva também as rejeições e pendências.

## JSON para o orquestrador
Preservar apenas as chaves definidas em `review.schema.json`, para manter compatibilidade. O texto acima é documentação complementar, não um formato JSON novo.
