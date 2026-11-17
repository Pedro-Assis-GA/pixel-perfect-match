"""Fictional agent scenarios; these tests never repair or approve site code."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import quality_flow as flow


class QualityFlowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.folder = Path(self.temporary.name)
        self.addCleanup(self.temporary.cleanup)
        root = patch.object(flow, "ROOT", self.folder)
        root.start()
        self.addCleanup(root.stop)
        (self.folder / "evidence.log").write_text("SIMULATION", encoding="utf-8")

    def checks(self, folder):
        values = []
        for name, argv in flow.CHECKS.items():
            log = folder / (name + ".log")
            log.write_text("SIMULATION: fictional successful check", encoding="utf-8")
            values.append({"id": name, "argv": argv, "exit_code": 0,
                           "log": str(log), "sha256": flow.digest(log)})
        return values

    def scenario(self, verdicts, journal_error=None):
        counter = iter(verdicts)
        feedbacks = []

        def execute(task, feedback, folder):
            feedbacks.append(feedback)
            return 0

        def review(task, criteria, checks, folder):
            verdict = next(counter)
            status = {"APROVADO": "PASS", "REPROVADO": "FAIL", "INCONCLUSIVO": "UNKNOWN"}[verdict]
            return {"verdict": verdict, "independent": True,
                    "criteria": [{"id": "scope", "status": status,
                                  "evidence": ["log:evidence.log"], "finding": "SIMULATION"}],
                    "blocking_issues": [], "feedback": "SIMULATION"}

        with patch.object(flow, "append_journal", side_effect=journal_error,
                          return_value={"journal": "SIMULATION"}) as journal:
            result = flow.loop("SIMULATION", ["scope"], execute, self.checks, review, self.folder)
            self.assertEqual(journal.call_count, 1)
        return result, feedbacks

    def test_a_first_round_approval(self):
        result, feedbacks = self.scenario(["APROVADO"])
        self.assertEqual((result["status"], result["cycles"]), ("APROVADO", 1))
        self.assertEqual(feedbacks, [""])

    def test_b_rejection_then_approval(self):
        result, feedbacks = self.scenario(["REPROVADO", "APROVADO"])
        self.assertEqual((result["status"], result["cycles"]), ("APROVADO", 2))
        self.assertIn("REPROVADO", feedbacks[1])

    def test_c_four_inconclusive_rounds(self):
        result, feedbacks = self.scenario(["INCONCLUSIVO"] * 4)
        self.assertEqual((result["status"], len(feedbacks)), ("BLOQUEADO", 4))

    def test_d_journal_failure_blocks_release(self):
        for extension in ("PDF", "JSON"):
            with self.subTest(extension=extension):
                folder = self.folder / extension
                folder.mkdir()
                original = self.folder
                self.folder = folder
                result, _ = self.scenario(["APROVADO"], OSError(extension + " write failed"))
                self.assertEqual(result["status"], "BLOQUEADO")
                self.assertIsNone(result["journal"])
                self.assertIn(extension, result["error"])
                self.folder = original

    def test_failing_missing_or_tampered_checks_are_rejected(self):
        record = {"workspace": flow.workspace_fingerprint(), "executor_exit": 0, "criteria": ["scope"], "checks": self.checks(self.folder),
                  "review": {"verdict": "APROVADO", "independent": True,
                             "criteria": [{"id": "scope", "status": "PASS", "evidence": ["log:evidence.log"]}]}}
        self.assertTrue(flow.approved(record))
        stale = copy.deepcopy(record)
        stale["workspace"] = "outdated"
        self.assertFalse(flow.approved(stale))
        blocker = copy.deepcopy(record)
        blocker["review"]["blocking_issues"] = ["unresolved"]
        self.assertFalse(flow.approved(blocker))
        extra = copy.deepcopy(record)
        extra["review"]["criteria"].append({"id": "extra", "status": "FAIL", "evidence": ["failure"]})
        self.assertFalse(flow.approved(extra))
        extra["review"]["criteria"][-1]["status"] = "UNKNOWN"
        self.assertFalse(flow.approved(extra))
        missing = copy.deepcopy(record)
        missing["checks"].pop()
        self.assertFalse(flow.approved(missing))
        failing = copy.deepcopy(record)
        failing["checks"][0]["exit_code"] = 1
        self.assertFalse(flow.approved(failing))
        Path(record["checks"][0]["log"]).write_text("modified", encoding="utf-8")
        self.assertFalse(flow.approved(record))

    def test_e_missing_review_evidence_blocks_approval(self):
        record = {"workspace": flow.workspace_fingerprint(), "executor_exit": 0,
                  "criteria": ["scope"], "checks": self.checks(self.folder),
                  "review": {"verdict": "APROVADO", "independent": True,
                             "criteria": [{"id": "scope", "status": "PASS", "evidence": []}]}}
        for evidence in ([], [""], ["   "], "unsupported claim", None,
                         ["unsupported claim"], ["log:missing.log"], ["log:../outside.log"],
                         [f"log:{self.folder / 'evidence.log'}"]):
            with self.subTest(evidence=evidence):
                record["review"]["criteria"][0]["evidence"] = evidence
                self.assertFalse(flow.approved(record))
        record["review"]["criteria"][0]["evidence"] = ["log:evidence.log"]
        self.assertTrue(flow.approved(record))
        record["simulation"] = True
        self.assertFalse(flow.approved(record))

    def test_journal_rollback_and_history_preservation(self):
        """Real PDF generation, then a failure during the second artifact commit."""
        journal = flow.journal_module()
        state = {"schema_version": 1, "project": "SIMULATION", "version": 1,
                 "created_at": "2026-11-11", "updated_at": "2026-11-11",
                 "pdf_name": "test.pdf", "events": []}
        flow.write_json(self.folder / "journal_state.json", state)
        journal.make_pdf(state, self.folder / "test.pdf")
        original_pdf = (self.folder / "test.pdf").read_bytes()
        event = {"id": "TEST-001", "date": "2026-11-11", "kind": "audit",
                 "title": "SIMULATION", "status": "BLOQUEADO", "summary": "Test event"}
        replace = flow.replace_report

        def fail_state_commit(source, target):
            if Path(target) == self.folder / "journal_state.json":
                raise OSError("Simulated JSON commit failure")
            return replace(source, target)

        with patch.object(flow, "replace_report", side_effect=fail_state_commit):
            with self.assertRaises(OSError):
                flow.append_journal(event, self.folder)
        self.assertEqual(flow.load(self.folder / "journal_state.json"), state)
        self.assertEqual((self.folder / "test.pdf").read_bytes(), original_pdf)
        flow.append_journal(event, self.folder)
        self.assertEqual(flow.load(self.folder / "journal_state.json")["events"], [event])
        self.assertEqual(flow.load(self.folder / "archives/journal_state_v001.json"), state)
        self.assertEqual((self.folder / "archives/test_v001.pdf").read_bytes(), original_pdf)
        event2 = dict(event, id="TEST-002")
        with patch.object(journal, "make_pdf", side_effect=OSError("PDF render failure")):
            with patch.object(flow, "journal_module", return_value=journal):
                with self.assertRaises(OSError):
                    flow.append_journal(event2, self.folder)
        self.assertEqual(flow.load(self.folder / "journal_state.json")["events"], [event])
        flow.append_journal(event2, self.folder)
        cumulative = flow.load(self.folder / "journal_state.json")
        self.assertEqual(cumulative["events"], [event, event2])
        self.assertEqual(cumulative["version"], 3)
        self.assertEqual(flow.load(self.folder / "archives/journal_state_v002.json")["events"], [event])

        # A post-replacement security failure restores content but must retain
        # the recovery lock: copying snapshots cannot certify ACL recovery.
        before_state = (self.folder / "journal_state.json").read_bytes()
        before_pdf = (self.folder / "test.pdf").read_bytes()
        def fail_security(source, target):
            replace(source, target)
            if Path(target).suffix == '.json':
                raise flow.ReportPermissionError('Simulated DACL restoration failure')
        with patch.object(flow, 'replace_report', side_effect=fail_security):
            with self.assertRaises(flow.ReportPermissionError):
                flow.append_journal(dict(event, id='TEST-003'), self.folder)
        self.assertEqual((self.folder / 'journal_state.json').read_bytes(), before_state)
        self.assertEqual((self.folder / 'test.pdf').read_bytes(), before_pdf)
        self.assertTrue((self.folder / '.journal.lock').exists())
        self.assertEqual((self.folder / 'archives/journal_state_v003.json').read_bytes(), before_state)
        self.assertEqual((self.folder / 'archives/test_v003.pdf').read_bytes(), before_pdf)
        with self.assertRaises(FileExistsError):
            flow.append_journal(dict(event, id='TEST-004'), self.folder)


if __name__ == "__main__":
    unittest.main(verbosity=2)
