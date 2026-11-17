# Atualização Quality Manager v1.3 — somente esta Skill

Data: 11/11/2026. **Não substitua** AGENTS.md, technical-journal nem os arquivos do orquestrador que o Codex começou a preparar. A Skill anterior, v1.2, deve ficar arquivada fora da pasta ativa se desejar rollback.

1. Localize `%USERPROFILE%\.agents\skills\quality-manager`.
2. Faça cópia de segurança da pasta atual em `Documentos\Backups_IA\quality-manager-v1.2` ou outro local **fora** da pasta `skills` (para evitar Skills duplicadas).
3. Copie para a pasta ativa somente os arquivos desta atualização: `SKILL.md`, `references/review-rubric.md`, `references/verdict-template.md` e o opcional `scripts/validate_verdict.py`. `review.schema.json` e `scripts/quality_loop.py` são mantidos byte a byte.
4. Reinicie a sessão do Codex para recarregar a Skill. Confirme que a Skill se identifica como v1.3 e mantém o JSON compatível. Só retome a orquestração interrompida depois de revisar o diff dessa atualização.
5. O teste automatizado do validador é opcional e executa sem acesso ao projeto: `python -m unittest discover -s tests -v` dentro desta pasta de Skill.

A atualização fortalece os critérios de revisão e **não instala um acionador automático**: orquestração real requer configuração própria e validação no Codex do notebook.
