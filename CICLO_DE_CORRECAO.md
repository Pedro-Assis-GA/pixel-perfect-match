# Ciclo executor - gerente - diario

1. Executor recebe relato e critérios de aceite; lê repo e estado Git.
2. Reproduz falha antes da correção e salva evidência.
3. Corrige código e roda testes compatíveis com a stack real.
4. Gerente, preferencialmente em sessão separada e read-only, confronta afirmações com arquivos, diff e reexecução de checks.
5. Se gerente REPROVADO / INCONCLUSIVO: devolver pontos objetivos, nova hipótese e repetir sem liberar conclusão (máximo inicial quatro ciclos).
6. APROVADO: liberar resumo e evidências; BLOQUEADO: informar impedimento sem declarar a tarefa concluída.
7. Diário registra histórico e atualiza PDF/JSON na pasta dedicada de relatórios, sem modificar código.

**Atenção:** AGENTS.md e Skills orientam este processo, mas não constituem um orquestrador. Para execução automática real, usar uma rotina CLI testada e revisada separadamente; o usuário pode começar com prompts sequenciais no Codex.
