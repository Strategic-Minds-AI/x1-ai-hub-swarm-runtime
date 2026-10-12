"""Secret-free deterministic packet compiler. No network, deployment or shell execution."""
import argparse, hashlib, json, re
from pathlib import Path
def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def validate(m):
    if not isinstance(m,dict):raise ValueError('MANIFEST_OBJECT_REQUIRED')
    required=['schema','project_id','tenant_id','name','project_type','template','visual','variables','batch','accounts','mode','social_mode','approved_actions','acceptance']
    if any(k not in m for k in required):raise ValueError('MANIFEST_FIELDS_REQUIRED')
    if m['schema']!='x1.project.v1' or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,80}',m['project_id']):raise ValueError('IDENTITY_INVALID')
    if m['mode']!='PREVIEW_ONLY' or m['social_mode']!='DRAFT_ONLY':raise ValueError('LIVE_ACTION_BLOCKED')
    if m['project_type'] not in ['website','webapp','pwa','desktop','mobile','system']:raise ValueError('PROFILE_INVALID')
    b=m['batch']
    for k in ['quantity','approved_max','concurrency']:
        if type(b.get(k)) is not int:raise ValueError('BATCH_INTEGER_REQUIRED')
    if b['quantity']<0 or b['approved_max']<b['quantity'] or b['concurrency']<1:raise ValueError('BATCH_SCOPE_INVALID')
    if type(b.get('budget_usd')) not in (int,float) or not 0<=b['budget_usd']<float('inf'):raise ValueError('BUDGET_INVALID')
    if not isinstance(m['acceptance'],list) or not m['acceptance'] or len(set(m['acceptance']))!=len(m['acceptance']):raise ValueError('ACCEPTANCE_REQUIRED')
    if not isinstance(m['template'],dict) or not isinstance(m['visual'],dict) or not isinstance(m['accounts'],dict):raise ValueError('BINDING_OBJECT_REQUIRED')
    t=m['template'];v=m['visual']
    if t.get('sha') is not None and not re.fullmatch('[0-9a-f]{40}',t['sha']):raise ValueError('SOURCE_SHA_INVALID')
    if t.get('path') is not None and (t['path'].startswith(('/','\\')) or '..' in t['path'].split('/') or '\\' in t['path']):raise ValueError('TEMPLATE_PATH_INVALID')
    if v.get('parity_target')!=0.99:raise ValueError('VISUAL_TARGET_LOCKED')
    if v.get('sha256') is not None and not re.fullmatch('[0-9a-f]{64}',v['sha256']):raise ValueError('VISUAL_HASH_INVALID')
    encoded=json.dumps(m).lower()
    if any(k in encoded for k in ['"password"','"api_key"','"access_token"','"service_role_key"','"private_key"']):raise ValueError('SECRETS_FORBIDDEN')
    missing=[]
    for prefix,obj,keys in [('template',t,['repo','sha','path','key']),('visual',v,['reference','sha256']),('accounts',m['accounts'],['drive','supabase','vercel'])]:
        missing.extend(prefix+'.'+k for k in keys if not obj.get(k))
    return {'status':'BLOCKED_BINDINGS' if missing else 'PACKET_READY_NOT_DEPLOYED','missing':missing,'manifest_hash':digest(m),'quantity':b['quantity']}
def generate(m,out):
    result=validate(m);out=Path(out)
    if out.exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
    out.mkdir(parents=True)
    (out/'project.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8')
    (out/'preflight.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    tasks=[]
    for i in range(m['batch']['quantity']):
        tasks.append({'ordinal':i,'project_id':m['project_id'],'tenant_id':m['tenant_id'],'manifest_hash':result['manifest_hash'],'idempotency_key':digest([m['project_id'],result['manifest_hash'],i]),'state':'BLOCKED' if result['missing'] else 'PREPARED','provider_calls':0})
    (out/'tasks.json').write_text(json.dumps(tasks,indent=2)+'\n',encoding='utf-8')
    source=Path(__file__).resolve().parents[1]/'01_Builder_Docs'
    for path in sorted(source.glob('*.md')):
        target=out/'01_Builder_Docs'/path.name;target.parent.mkdir(exist_ok=True)
        target.write_text(path.read_text(encoding='utf-8')+'\nProject: '+m['project_id']+'\nManifest hash: '+result['manifest_hash']+'\nExecution status: UNKNOWN\n',encoding='utf-8')
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['validate','generate']);p.add_argument('manifest');p.add_argument('output',nargs='?');a=p.parse_args()
    try:
        m=json.loads(Path(a.manifest).read_text(encoding='utf-8'));r=validate(m) if a.action=='validate' else generate(m,a.output)
        print(json.dumps(r,indent=2))
    except (ValueError,TypeError,KeyError,OSError) as e:
        print(json.dumps({'status':'FAIL','reason':str(e)}));raise SystemExit(1)
