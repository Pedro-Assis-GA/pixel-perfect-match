#!/usr/bin/env python3
"""Deterministic consistency checks for quality-manager v1.3 verdicts.

This does not prove whether the tested behavior works. Evidence paths can be forged;
the reviewer must independently inspect command outputs and source artifacts.
"""
import argparse
import json
from pathlib import Path
import sys


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def evidence_file(root, statement):
    # Strict, portable evidence reference, e.g. file:src/foo.ts or log:outputs/test.log.
    # A claim without an artifact path ("lint passed") cannot pass this secondary gate.
    if not isinstance(statement, str) or ':' not in statement:
        return None
    kind, rest = statement.split(':', 1)
    if kind not in ('file', 'log', 'artifact') or not rest.strip():
        return None
    relative = Path(rest.strip().split('#', 1)[0])
    if relative.is_absolute():
        return None
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        return None
    if not path.is_file() or path.stat().st_size == 0:
        return None
    return path


def evaluate(criteria_doc, verdict_doc, root):
    root = root.resolve()
    problems = []
    criteria = criteria_doc.get('criteria', []) if isinstance(criteria_doc, dict) else criteria_doc
    if not isinstance(criteria, list) or not criteria:
        return ['Lista de critérios vazia ou inválida']
    if verdict_doc.get('verdict') != 'APROVADO':
        problems.append(f"Parecer não aprovado: {verdict_doc.get('verdict', '<ausente>')}")
    if verdict_doc.get('blocking_issues'):
        problems.append('Parecer contém bloqueios')
    reported = verdict_doc.get('criteria', [])
    if not isinstance(reported, list):
        return problems + ['Matriz de critérios inválida']
    by_id = {c.get('id'): c for c in reported if isinstance(c, dict)}
    for c in criteria:
        if not isinstance(c, dict) or not c.get('id'):
            problems.append('Critério sem ID na configuração')
            continue
        if not c.get('mandatory', True):
            continue
        item = by_id.get(c['id'])
        if not item:
            problems.append(f"Critério obrigatório não avaliado: {c['id']}")
            continue
        if item.get('status') != 'PASS':
            problems.append(f"Critério obrigatório não passou: {c['id']} = {item.get('status')}")
            continue
        items = item.get('evidence', [])
        if not isinstance(items, list) or not any(evidence_file(root, x) for x in items):
            problems.append(f"Critério sem referência primária localizável: {c['id']}")
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--criteria', required=True)
    ap.add_argument('--review', required=True)
    ap.add_argument('--evidence-root', required=True)
    args = ap.parse_args(argv)
    root = Path(args.evidence_root).resolve()
    if not root.is_dir():
        print('BLOQUEADO: pasta de evidências ausente', file=sys.stderr)
        return 2
    try:
        issues = evaluate(read_json(args.criteria), read_json(args.review), root)
    except (ValueError, OSError, TypeError) as exc:
        print('BLOQUEADO: erro de leitura:', exc, file=sys.stderr)
        return 2
    for issue in issues:
        print('REJEITADO:', issue)
    if issues:
        return 1
    print('GATE DE CONSISTÊNCIA: PASSOU. Ainda exige revisão semântica independente.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
