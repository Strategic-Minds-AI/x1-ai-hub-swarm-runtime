import copy, importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('compiler',ROOT/'tools/x1_packet.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class PacketTest(unittest.TestCase):
    def setUp(self):self.m=json.loads((ROOT/'examples/project.preview.json').read_text())
    def test_unresolved_is_blocked(self):self.assertEqual(c.validate(self.m)['status'],'BLOCKED_BINDINGS')
    def test_stable_hash(self):self.assertEqual(c.digest(self.m),c.digest(dict(reversed(list(self.m.items())))))
    def test_zero_has_no_tasks(self):
        with tempfile.TemporaryDirectory() as d:
            c.generate(self.m,Path(d)/'out');self.assertEqual(json.loads((Path(d)/'out/tasks.json').read_text()),[])
    def test_repeat_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'out';c.generate(self.m,out)
            with self.assertRaises(ValueError):c.generate(self.m,out)
    def test_reject_unbounded_batch(self):
        for value in [-1,True,1.5]:
            m=copy.deepcopy(self.m);m['batch']['quantity']=value
            with self.assertRaises(ValueError):c.validate(m)
    def test_reject_production(self):
        self.m['mode']='LIVE'
        with self.assertRaises(ValueError):c.validate(self.m)
    def test_reject_secret(self):
        self.m['api_key']='test-value'
        with self.assertRaises(ValueError):c.validate(self.m)
    def test_reject_traversal(self):
        self.m['template']['path']='../outside'
        with self.assertRaises(ValueError):c.validate(self.m)
    def test_idempotency_distinct_and_stable(self):
        self.m['batch'].update(quantity=2,approved_max=2)
        with tempfile.TemporaryDirectory() as d:
            c.generate(self.m,Path(d)/'a');c.generate(self.m,Path(d)/'b')
            a=json.loads((Path(d)/'a/tasks.json').read_text());b=json.loads((Path(d)/'b/tasks.json').read_text())
            self.assertEqual(a,b);self.assertNotEqual(a[0]['idempotency_key'],a[1]['idempotency_key'])
    def test_required_docs_present(self):self.assertEqual(len(list((ROOT/'01_Builder_Docs').glob('*.md'))),20)
