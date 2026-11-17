# Fluxo local de qualidade

O agente principal recebe o relato e aplica AGENTS.md. Executa a investigação,
correção e verificações, solicita um subagente independente em modo somente leitura
e repete até quatro ciclos. As Skills são selecionadas pelo agente a partir das
instruções do projeto. O usuário pode escrever apenas o problema.

## Estado comprovado em 12/11/2026

Estado geral PARCIAL. Um experimento real de leitura utilizou dois subagentes
nativos: um executor inspecionou o fluxo e outro revisor conferiu o resultado
independentemente. Ambos responderam sem executar a CLI. Isso comprova a
coordenação nativa de uma tarefa controlada. O experimento não executou
`finalize` nem gravou uma nova atualização do diário.

O caminho `finalize` usa os registros da sessão nativa. Em 13/11/2026, a correção
de permissões de relatórios Windows foi finalizada com revisão independente e
gravação do diário (execução `5b7ed957ea9d4982b45b265c9eccc2bc`). As chamadas a
`codex exec` pertencem a `run`. A entrada pelo chat depende do cumprimento de
AGENTS.md pelo agente. Não há gatilho externo ativo comprovado.

## Operação nativa

`scripts/quality_flow.py` fornece `run_checks(repo, folder)` para executar os quatro
comandos locais e registrar saída, exit code e SHA-256 dos logs. O diretório deve
existir. O agente monta um JSON com `task` e `history`, uma lista de 1 a 4 registros.
Cada registro contém `executor_exit`, `criteria` (IDs fixos), `workspace` (retorno de
`workspace_fingerprint()` após os testes e antes da revisão), `checks` (retorno de
run_checks) e `review`. A revisão contém `verdict`, `independent: true` e `criteria`,
com objetos `id`, `status` e `evidence`. Apenas um parecer realmente emitido por um
revisor independente pode receber esse marcador. Cada critério obrigatório
precisa ter ao menos uma referência primária localizável e não vazia no
repositório, por exemplo `file:scripts/quality_flow.py#L91`,
`log:reports/quality/run.log` ou `artifact:reports/quality/result.json`.
O validador da v1.3 aceita caminhos relativos à raiz e confere o arquivo.
A revisão independente confere o conteúdo e a pertinência da evidência.

Após a aprovação, o agente executa com Python que tenha ReportLab e pypdf disponíveis

```text
python scripts/quality_flow.py finalize reports/quality/submission.json
```

O gate verifica todos os critérios, os quatro comandos e a integridade dos logs.
Também exige que o fingerprint do workspace ainda corresponda à versão revisada.
`event_details` opcional no JSON permite scope, summary, before, after, unverified,
questions, main_path, alternatives e references para contextualizar o diário.
Registra o resultado em um diretório exclusivo em `reports/quality/runs`.
Só retorna exit 0 e APROVADO depois de gravar e reler JSON e PDF. Uma falha no
diário produz BLOQUEADO e exit 2, mesmo se a revisão do código aprovou.
Os registros fornecidos pelo agente são evidências declaradas. Este utilitário
não autentica a identidade do revisor nem substitui a inspeção independente.

## Diário e recuperação

O diário local canônico reside em `reports/quality`. O comando de importação copia
o histórico existente e seus arquivos em `archives`, preservando a origem e os
hashes em `migration.json`. O original em Documentos permanece como origem histórica.

```text
python scripts/quality_flow.py import-history CAMINHO_DA_PASTA_ANTERIOR
```

Cada atualização gera os dois arquivos em staging, valida o PDF e o JSON, guarda
snapshots e só então substitui os arquivos canônicos. Falhas de escrita fazem
rollback. Um encerramento abrupto pode deixar `.journal.lock`. Nesse caso o agente
deve conferir a versão atual e os snapshots antes de remover esse marcador e
repetir a operação. O processo bloqueia atualizações simultâneas.

No Windows, a publicação dos arquivos PDF e JSON existentes usa `ReplaceFileW`
sem ignorar erros de mesclagem de ACL. Isso preserva a DACL do destino, incluindo
as permissões de leitura já concedidas. A reprodução em arquivos temporários
confirmou perda da ACL com `os.replace` e preservação com `replace_report`.
Esse mecanismo preserva permissões existentes; um destino já inacessível precisa
de correção de ACL antes da atualização. A Skill pessoal continua intacta.

## CLI opcional

```text
python scripts/quality_flow.py run "Descrição do problema" --criteria "Comportamento esperado" "Regressões preservadas"
```

Esse modo chama executor e gerente em processos Codex distintos, com sandbox
workspace-write e read-only, respectivamente. Nenhuma permissão global é alterada.
Na verificação de 12/11/2026, Codex CLI `0.167.0-alpha.4.1` falhou ao descobrir
seu diretório inicial apesar de USERPROFILE estar definido. Informar HOME ao
processo filho manteve o erro. Informar CODEX_HOME eliminou o erro de descoberta.
O wrapper agora resolve CODEX_HOME a partir de USERPROFILE/.codex quando essa
pasta existe e CODEX_HOME está ausente, somente para o processo filho Codex.
Um valor já configurado é preservado. A causa interna da descoberta automática
permanece sem confirmação.

Três verificações direcionadas passaram (fallback Codex, outros comandos e valor
explícito), preservando o ambiente pai. A execução mínima real pelo wrapper
retornou exit 1 com acesso negado ao estado da CLI, incluindo memories_1.sqlite
e inicialização do app-server. Portanto, a execução CLI continua bloqueada nas
permissões atuais. Nenhuma resposta de modelo ou consumo de tokens foi observado.
O fluxo nativo usa os subagentes da sessão. Um diretório de estado no workspace
exigiria configuração e autenticação próprias, ainda sem validação nesta tarefa.

O projeto não instala hooks. A entrada pelo chat depende de o agente cumprir
AGENTS.md. As simulações verificam a máquina de estados e falhas do diário, sem
comprovar uma correção real do site ou execução do CLI.

## Testes

```text
python -B scripts/test_quality_flow.py
```

Os cenários cobrem aprovação inicial, reprovação e aprovação, quatro rodadas
inconclusivas, falhas de PDF/JSON, checks ausentes/falhos/adulterados e rollback.
Os agentes e resultados dos testes do site são fictícios. A renderização do PDF
e a verificação de preservação de snapshots são reais, em diretório temporário.

Essa descrição refere-se às simulações da suíte do orquestrador. Separadamente,
os comandos reais `npm run lint`, `npm run test`, `npm run build` e
`npx --no-install tsc --noEmit` terminaram com exit 0 na implementação anterior;
o Vitest passou com 71 testes em 10 arquivos. Seus logs e hashes estão em
`reports/quality/implementation-checks/checks.json`. Esses comandos antecedem os
ajustes posteriores em Python e não constituem uma nova execução de testes.

Os sete testes do orquestrador foram reexecutados e aprovados em 12/11/2026,
incluindo revisão independente, antes do ajuste posterior de CODEX_HOME.
Esse ajuste recebeu três verificações direcionadas de ambiente e uma tentativa
real mínima da CLI, descritas acima. O parecer em
`reports/quality/review-automation.json` registra aprovação do escopo local e
classificação geral PARCIAL, relativa ao fingerprint daquela revisão.

A suíte contém sete testes. O cenário E exige bloqueio quando a revisão apresenta
evidência ausente, vazia ou em formato inválido. Também verifica o bloqueio de um
registro marcado como simulação. O teste cumulativo grava dois eventos, confirma
a preservação do primeiro e confere os snapshots das versões anteriores.

O projeto usa `tools/quality-manager-v1.3`. O `review.schema.json` e o
`quality_loop.py` da cópia local são idênticos aos da v1.2 pessoal, preservada
como referência. O schema do parecer admite APROVADO, REPROVADO e INCONCLUSIVO.
`independent` é um campo do registro do orquestrador acrescentado após o parecer.
O portão existente usa `validate_verdict.py` da v1.3 para conferir as referências.
A cópia local normaliza a raiz das evidências na interface Python para aceitar
o caminho curto do Windows também ao chamar o validador diretamente.
A CLI opcional aponta para a cópia local da Skill e do schema. O gerador
Technical Journal instalado continua sendo usado para PDF e JSON.
