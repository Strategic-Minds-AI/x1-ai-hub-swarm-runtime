import hashlib,json,sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
manifest=json.loads((root/'MANIFEST.json').read_text(encoding='utf-8'));errors=[]
for item in manifest['files']:
    p=root/item['path']
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:errors.append(item['path'])
print(json.dumps({'status':'FAIL' if errors else 'PASS','verified_files':len(manifest['files']),'errors':errors}))
raise SystemExit(bool(errors))
