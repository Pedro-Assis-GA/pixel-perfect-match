# Padrões de qualidade e critérios de aceite - Skin Scope

## Requisitos estáveis
- Moeda exibida: USD, sem conversão fictícia.
- Não inventar dados, resultados de teste, preços, descontos ou timestamps.
- Evitar dependências pagas e preservar recursos e filtros existentes.
- Respeitar histórico do Git e mudanças do usuário.
- Não considerar API externa validada quando apenas mocks passaram.

## Critérios para uma correção
- O erro original é reproduzível ou sua reprodução é explicitamente impossível, com motivo.
- Existe explicação coerente de causa raiz, ou hipótese classificada como tal.
- Teste relevante falha na versão anterior, quando viável, e passa depois da correção.
- Todos os scripts obrigatórios disponíveis no repositório passam ou o trabalho permanece bloqueado/inconclusivo.
- Não se introduziu regressão conhecida em busca, filtros, dashboard, itens, moeda e interface.
- O gerente cita evidência primária por teste, diff, linha ou log, não apenas relatório do executor.
- Integrações externas não são anunciadas como reparadas sem verificação real externa.

## Parecer do gerente
- APROVADO: todos os critérios obrigatórios satisfatoriamente comprovados.
- REPROVADO: há critério obrigatório com falha demonstrada.
- INCONCLUSIVO: falta evidência relevante, ferramenta, recurso ou acesso.
- BLOQUEADO: tentativas prudentes esgotadas ou dependência externa impede continuar; não é aprovação.

## Escopo do primeiro exercício
- Demonstrar tratamento de HTTP 403 em código fictício REPRESENTATIVO com Node.js.
- A demonstração não confirma correção do adaptador Skinport real.
