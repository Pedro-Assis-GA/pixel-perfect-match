import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_verdict import evaluate


class TestVerdict(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'evidence.log').write_text('lint exit 0; 71 tests passed\n', encoding='utf-8')
        self.criteria = {'criteria': [{'id': 'C1', 'mandatory': True}, {'id': 'optional', 'mandatory': False}]}
        self.valid = {'verdict': 'APROVADO', 'blocking_issues': [], 'criteria': [
            {'id': 'C1', 'status': 'PASS', 'evidence': ['log:evidence.log'], 'finding': 'independent check'}]}

    def test_valid(self):
        self.assertEqual(evaluate(self.criteria, self.valid, self.root), [])

    def test_nonapproved(self):
        sample = {**self.valid, 'verdict': 'INCONCLUSIVO'}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_missing_criterion(self):
        sample = {**self.valid, 'criteria': []}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_fail(self):
        sample = {**self.valid, 'criteria': [{**self.valid['criteria'][0], 'status': 'FAIL'}]}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_fictitious_evidence(self):
        sample = {**self.valid, 'criteria': [{**self.valid['criteria'][0], 'evidence': ['O executor disse que passou']} ]}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_missing_artifact(self):
        sample = {**self.valid, 'criteria': [{**self.valid['criteria'][0], 'evidence': ['log:fantasma.log']} ]}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_outside_path(self):
        sample = {**self.valid, 'criteria': [{**self.valid['criteria'][0], 'evidence': ['log:../fora.log']} ]}
        self.assertTrue(evaluate(self.criteria, sample, self.root))

    def test_blocking_issue(self):
        sample = {**self.valid, 'blocking_issues': ['P0 não resolvido']}
        self.assertTrue(evaluate(self.criteria, sample, self.root))


if __name__ == '__main__':
    unittest.main()
