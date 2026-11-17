"""Local quality gate. Native agents supply records; CLI agents are optional.

Only APROVADO plus successful checks plus a verified journal write releases work.
Simulation belongs to the tests and never releases an actual project task.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports" / "quality"
SKILLS = Path.home() / ".agents" / "skills"
QUALITY_SKILL = ROOT / "tools" / "quality-manager-v1.3"
CHECKS = {
    "lint": ["npm", "run", "lint"],
    "test": ["npm", "run", "test"],
    "build": ["npm", "run", "build"],
    "types": ["npx", "--no-install", "tsc", "--noEmit"],
}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def workspace_fingerprint(repo=ROOT):
    result = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                            cwd=repo, capture_output=True, check=True)
    paths = sorted(set(result.stdout.decode("utf-8").split("\0")) - {""})
    values = []
    for name in paths:
        path = Path(name)
        if path.parts[0] in {"reports", "node_modules", ".output", ".wrangler", ".git"} or "__pycache__" in path.parts:
            continue
        target = Path(repo) / path
        values.append((name, digest(target) if target.is_file() else "DELETED"))
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode("utf-8")).hexdigest()


def run_command(argv, repo, prompt=None, timeout=900):
    executable = shutil.which(argv[0]) or argv[0]
    environment = os.environ.copy()
    if Path(argv[0]).stem.lower() == "codex" and not environment.get("CODEX_HOME"):
        profile = environment.get("USERPROFILE")
        if profile and (Path(profile) / ".codex").is_dir():
            environment["CODEX_HOME"] = str(Path(profile) / ".codex")
    try:
        result = subprocess.run([executable, *argv[1:]], cwd=repo, input=prompt,
                                env=environment,
                                capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=timeout)
        return result.returncode, result.stdout + result.stderr
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, str(exc)


def run_checks(repo, folder):
    results = []
    for name, argv in CHECKS.items():
        code, output = run_command(argv, repo)
        log = folder / (name + ".log")
        log.write_text(output, encoding="utf-8")
        results.append({"id": name, "argv": argv, "exit_code": code,
                        "log": str(log.resolve()), "sha256": digest(log)})
    return results


def review_evidence_problems(criteria, review):
    path = QUALITY_SKILL / "scripts" / "validate_verdict.py"
    spec = importlib.util.spec_from_file_location("skin_scope_validate_verdict", path)
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    return validator.evaluate([{"id": criterion} for criterion in criteria], review, ROOT)


def approved(record):
    """Fixed acceptance criteria cannot be removed from a submitted review."""
    if record.get("executor_exit") != 0 or record.get("simulation"):
        return False
    review = record.get("review", {})
    if review.get("verdict") != "APROVADO" or review.get("independent") is not True or review.get("blocking_issues"):
        return False
    if record.get("workspace") != workspace_fingerprint():
        return False
    criteria = record.get("criteria", [])
    if not criteria or len(set(criteria)) != len(criteria):
        return False
    submitted = review.get("criteria", [])
    if any(entry.get("status") != "PASS" or not isinstance(entry.get("evidence"), list)
           or not entry["evidence"]
           or any(not isinstance(value, str) or not value.strip() for value in entry["evidence"])
           for entry in submitted):
        return False
    if len({entry.get("id") for entry in submitted}) != len(submitted):
        return False
    if review_evidence_problems(criteria, review):
        return False
    checks = record.get("checks", [])
    if len(checks) != len(CHECKS) or {item.get("id") for item in checks} != set(CHECKS):
        return False
    for item in checks:
        if item.get("exit_code") != 0 or item.get("argv") != CHECKS[item["id"]]:
            return False
        path = Path(item.get("log", ""))
        if not path.is_file() or digest(path) != item.get("sha256"):
            return False
    return True


def journal_module():
    folder = SKILLS / "technical-journal" / "scripts"
    sys.path.insert(0, str(folder))
    spec = importlib.util.spec_from_file_location("skin_scope_journal", folder / "journal.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def import_history(source, destination=REPORTS):
    """Explicit one-time copy of the existing journal, with source hashes."""
    source = Path(source).resolve()
    destination = Path(destination)
    if (destination / "journal_state.json").exists():
        raise ValueError("Destination already has a journal")
    journal = journal_module()
    state = load(source / "journal_state.json")
    journal.validate_state(state)
    destination.mkdir(parents=True, exist_ok=True)
    files = [source / "journal_state.json", source / state["pdf_name"]]
    provenance = {}
    for path in files:
        shutil.copy2(path, destination / path.name)
        provenance[str(path)] = digest(path)
    if (source / "archives").is_dir():
        shutil.copytree(source / "archives", destination / "archives")
    write_json(destination / "migration.json", {"source": str(source), "hashes": provenance})


class ReportPermissionError(OSError):
    """The content was replaced but its permissions require recovery."""


def replace_report(source, destination):
    """Preserve the existing Windows DACL when publishing a staged report."""
    if os.name != "nt":
        os.replace(source, destination)
        return
    import ctypes
    from ctypes import wintypes

    security = ctypes.WinDLL("advapi32", use_last_error=True)
    get_security = security.GetFileSecurityW
    get_security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID,
                            wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    get_security.restype = wintypes.BOOL
    destination = str(Path(destination).resolve())
    required = wintypes.DWORD()
    get_security(destination, 4, None, 0, ctypes.byref(required))
    if not required.value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = ctypes.create_string_buffer(required.value)
    if not get_security(destination, 4, descriptor, required, ctypes.byref(required)):
        raise ctypes.WinError(ctypes.get_last_error())
    control = wintypes.WORD()
    revision = wintypes.DWORD()
    get_control = security.GetSecurityDescriptorControl
    get_control.argtypes = [wintypes.LPVOID, ctypes.POINTER(wintypes.WORD), ctypes.POINTER(wintypes.DWORD)]
    if not get_control(descriptor, ctypes.byref(control), ctypes.byref(revision)):
        raise ctypes.WinError(ctypes.get_last_error())
    get_dacl = security.GetSecurityDescriptorDacl
    get_dacl.argtypes = [wintypes.LPVOID, ctypes.POINTER(wintypes.BOOL),
                        ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.BOOL)]
    get_dacl.restype = wintypes.BOOL

    def dacl_bytes(value):
        present, defaulted = wintypes.BOOL(), wintypes.BOOL()
        pointer = wintypes.LPVOID()
        if not get_dacl(value, ctypes.byref(present), ctypes.byref(pointer), ctypes.byref(defaulted)):
            raise ctypes.WinError(ctypes.get_last_error())
        # ACL header: revision (byte), reserved (byte), total size (WORD).
        size = ctypes.c_ushort.from_address(pointer.value + 2).value if pointer.value else 0
        return bool(present.value), ctypes.string_at(pointer, size) if pointer.value else None

    original_dacl = dacl_bytes(descriptor)
    # ReplaceFile preserves ACEs but may change SE_DACL_PROTECTED.
    protection = 0x80000000 if control.value & 0x1000 else 0x20000000
    replace = ctypes.WinDLL("kernel32", use_last_error=True).ReplaceFileW
    replace.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
                        wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
    replace.restype = wintypes.BOOL
    if not replace(str(Path(destination).resolve()), str(Path(source).resolve()),
                   None, 0, None, None):
        raise ctypes.WinError(ctypes.get_last_error())
    set_security = security.SetFileSecurityW
    set_security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID]
    set_security.restype = wintypes.BOOL
    if not set_security(destination, 4 | protection, descriptor):
        raise ReportPermissionError(str(ctypes.WinError(ctypes.get_last_error())))
    current = ctypes.create_string_buffer(required.value + 4096)
    current_control = wintypes.WORD()
    if (not get_security(destination, 4, current, len(current), ctypes.byref(required))
            or not get_control(current, ctypes.byref(current_control), ctypes.byref(revision))
            or (current_control.value & 0x1000) != (control.value & 0x1000)):
        raise ReportPermissionError("Could not verify restored DACL protection")
    try:
        if dacl_bytes(current) != original_dacl:
            raise ReportPermissionError("Restored DACL differs from the original")
    except OSError as error:
        raise ReportPermissionError(str(error)) from error


def append_journal(event, folder=REPORTS):
    """Stage both artifacts before replacing either; lock and rollback on failure.

    An interrupted commit leaves .journal.lock, requiring inspection of snapshots.
    Such an interruption never creates a successful completion record.
    """
    folder = Path(folder)
    journal = journal_module()
    lock = folder / ".journal.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(descriptor)
    remove_lock = True
    try:
        state_path = folder / "journal_state.json"
        previous = load(state_path)
        journal.validate_state(previous)
        journal.validate_event(event)
        if event["id"] in {item["id"] for item in previous["events"]}:
            raise ValueError("Event ID already exists")
        updated = copy.deepcopy(previous)
        updated["version"] += 1
        updated["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        updated["events"].append(event)
        journal.validate_state(updated)
        pdf = folder / previous["pdf_name"]
        with tempfile.TemporaryDirectory(prefix="staging-", dir=folder) as temporary:
            stage = Path(temporary)
            staged_state = stage / state_path.name
            staged_pdf = stage / pdf.name
            write_json(staged_state, updated)
            journal.make_pdf(updated, staged_pdf)
            from pypdf import PdfReader
            reader = PdfReader(staged_pdf)
            if not reader.pages or event["id"] not in "\n".join(page.extract_text() for page in reader.pages):
                raise ValueError("Rendered PDF does not contain the event")
            if load(staged_state) != updated:
                raise ValueError("JSON readback failed")
            archive = folder / "archives"
            archive.mkdir(exist_ok=True)
            version = previous["version"]
            backups = [(state_path, archive / f"journal_state_v{version:03d}.json"),
                       (pdf, archive / f"{pdf.stem}_v{version:03d}.pdf")]
            for target, backup in backups:
                if backup.exists() and digest(backup) != digest(target):
                    raise ValueError("Conflicting snapshot")
                if not backup.exists():
                    shutil.copy2(target, backup)
            expected = {state_path: digest(staged_state), pdf: digest(staged_pdf)}
            try:
                replace_report(staged_pdf, pdf)
                replace_report(staged_state, state_path)
                if any(digest(path) != value for path, value in expected.items()):
                    raise ValueError("Journal write verification failed")
            except Exception as error:
                if isinstance(error, ReportPermissionError):
                    remove_lock = False
                try:
                    for target, backup in backups:
                        shutil.copy2(backup, target)
                except Exception:
                    remove_lock = False
                    raise
                raise
        return {str(path): value for path, value in expected.items()}
    finally:
        if remove_lock:
            lock.unlink()


def finish(task, history, folder, journal_folder=REPORTS, details=None):
    passed = bool(history) and approved(history[-1])
    status = "APROVADO" if passed else "BLOQUEADO"
    event = {
        "id": "SS-" + uuid.uuid4().hex,
        "date": dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat(),
        "kind": "update", "title": task, "status": status,
        "scope": "Fluxo local de qualidade", "summary": "Resultado documentado do executor e gerente independente.",
        "steps": [{"action": f"Ciclo {index}", "result": record["review"]["verdict"],
                   "evidence": str(folder / f"cycle-{index}.json")} for index, record in enumerate(history, 1)],
        "verified": ["Parecer e logs conferidos pelo gate local."] if passed else [],
        "unverified": ["A veracidade das evidências depende da revisão independente; o gate valida estrutura e logs."],
        "main_path": ["Conferir os registros e manter os critérios nas próximas tarefas."],
        "alternatives": ["Em bloqueio, resolver a pendência registrada antes de iniciar outra execução."],
    }
    for key, value in (details or {}).items():
        if key not in {"scope", "summary", "before", "after", "unverified", "questions", "main_path", "alternatives", "references"}:
            raise ValueError(f"Unsupported journal detail: {key}")
        event[key] = value
    event["tests"] = [{"command": " ".join(check["argv"]),
                       "result": f"Ciclo {cycle}, exit {check['exit_code']}",
                       "provenance": check["log"]}
                      for cycle, record in enumerate(history, 1) for check in record.get("checks", [])]
    event["references"] = event.get("references", []) + [
        f"Ciclo {cycle}: {item.get('id')}: {item.get('status')}; {item.get('finding', '')}; {item.get('evidence', [])}"
        for cycle, record in enumerate(history, 1) for item in record["review"].get("criteria", [])]
    result = {"status": "BLOQUEADO", "task": task, "cycles": len(history), "journal": None}
    try:
        result["journal"] = append_journal(event, journal_folder)
        result["status"] = status
    except Exception as exc:
        result["error"] = f"Journal failed: {exc}"
    write_json(folder / "result.json", result)
    return result


def loop(task, criteria, execute, check, review, folder, journal_folder=REPORTS):
    """Agent callbacks are separate roles. Tests inject fictional agents here."""
    history = []
    feedback = ""
    for cycle in range(1, 5):
        cycle_folder = folder / f"cycle-{cycle}"
        cycle_folder.mkdir()
        try:
            executor_exit = execute(task, feedback, cycle_folder)
            checks = check(cycle_folder)
            workspace = workspace_fingerprint()
            verdict = review(task, criteria, checks, cycle_folder) if executor_exit == 0 else {
                "verdict": "INCONCLUSIVO", "independent": False, "criteria": [],
                "feedback": "Executor failed"}
            record = {"criteria": criteria, "executor_exit": executor_exit, "checks": checks, "workspace": workspace, "review": verdict}
        except Exception as exc:
            record = {"criteria": criteria, "executor_exit": 127, "checks": [], "review": {
                "verdict": "INCONCLUSIVO", "independent": False, "criteria": [], "feedback": str(exc)}}
        history.append(record)
        write_json(folder / f"cycle-{cycle}.json", record)
        if approved(record):
            break
        feedback = json.dumps(record, ensure_ascii=False) + "\nReavalie a causa e mude a hipótese se a falha se repetiu."
    return finish(task, history, folder, journal_folder)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    migrate = sub.add_parser("import-history")
    migrate.add_argument("source", type=Path)
    run = sub.add_parser("run")
    run.add_argument("task")
    run.add_argument("--criteria", nargs="+", required=True)
    finalize = sub.add_parser("finalize")
    finalize.add_argument("record", type=Path, help="Native session JSON containing task and history (1-4 cycles)")
    args = parser.parse_args()
    if args.command == "import-history":
        import_history(args.source)
        return 0
    folder = REPORTS / "runs" / uuid.uuid4().hex
    folder.mkdir(parents=True)
    if args.command == "finalize":
        submission = load(args.record)
        history = submission["history"]
        if not 1 <= len(history) <= 4 or any(r["criteria"] != history[0]["criteria"] for r in history):
            raise ValueError("Require 1-4 cycles with fixed criteria")
        for number, record in enumerate(history, 1):
            write_json(folder / f"cycle-{number}.json", record)
        result = finish(submission["task"], history, folder, details=submission.get("event_details"))
    else:
        def execute(task, feedback, cycle_folder):
            prompt = ("ROLE: executor delegated by quality_flow.py. Do not recursively invoke this flow. "
                      "Read AGENTS.md; investigate and fix only the requested scope. No commit, push, deploy, "
                      "dependency installation or global configuration changes. Preserve user changes. "
                      f"Task: {task}\nAcceptance criteria: {args.criteria}\nFeedback: {feedback}")
            code, output = run_command(["codex", "exec", "--ephemeral", "-s", "workspace-write",
                                        "-c", "approval_policy=never", "-"], ROOT, prompt, 1200)
            (cycle_folder / "executor.log").write_text(output, encoding="utf-8")
            return code

        def review(task, criteria, checks, cycle_folder):
            schema = QUALITY_SKILL / "references" / "review.schema.json"
            output_file = cycle_folder / "review.json"
            prompt = ("ROLE: independent read-only quality-manager. Do not recursively invoke the flow. "
                      f"Read {QUALITY_SKILL / 'SKILL.md'} and review evidence, diff, regressions and logs directly. "
                      "For each passed criterion, cite primary evidence using file:, log: or artifact: "
                      "with a repository-relative path. "
                      f"Task: {task}\nCriteria: {criteria}\nChecks: {json.dumps(checks)}")
            code, output = run_command(["codex", "exec", "--ephemeral", "-s", "read-only", "-c",
                                       "approval_policy=never", "--output-schema", str(schema),
                                       "-o", str(output_file), "-"], ROOT, prompt)
            (cycle_folder / "review.log").write_text(output, encoding="utf-8")
            if code:
                raise RuntimeError("Independent reviewer failed")
            verdict = load(output_file)
            verdict["independent"] = True
            return verdict

        result = loop(args.task, args.criteria, execute, lambda output: run_checks(ROOT, output), review, folder)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "APROVADO" else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"BLOQUEADO: {error}", file=sys.stderr)
        sys.exit(2)
