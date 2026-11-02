import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const serviceName="project-zero-preview";
const supabaseUrl=Deno.env.get("SUPABASE_URL")!;

function json(status:number, body:unknown){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
}

function secretKey():string{
  const map=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(map){
    const parsed=JSON.parse(map) as Record<string,string>;
    if(parsed.default) return parsed.default;
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  throw new Error("SUPABASE_SECRET_KEY_UNAVAILABLE");
}

async function admin(path:string, init:RequestInit={}){
  const key=secretKey();
  const res=await fetch(`${supabaseUrl.replace(/\/$/,"")}/rest/v1/${path}`,{
    ...init,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "content-type":"application/json",
      accept:"application/json",
      ...(init.headers||{}),
    },
  });
  const text=await res.text();
  let body:unknown=null;
  try{body=text?JSON.parse(text):null;}catch{body=text;}
  return {ok:res.ok,status:res.status,body};
}

function canonicalize(value:unknown):string{
  if(Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if(value && typeof value==="object"){
    const entries=Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,child])=>`${JSON.stringify(key)}:${canonicalize(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function hmacHex(keyText:string,value:string){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"],
  );
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function workerCredentialAuthorized(digest:string){
  const result=await admin("rpc/x1_match_worker_auth",{
    method:"POST",
    body:JSON.stringify({
      p_service_name:serviceName,
      p_token_sha256:digest,
    }),
  });
  return result.ok && typeof result.body==="string" && result.body.length>0;
}

async function bearerAuthorized(token:string){
  if(!token) return false;
  const digest=await sha256Hex(token);
  const q=`x1_service_auth_hashes?select=token_sha256&service_name=eq.${encodeURIComponent(serviceName)}&active=eq.true&limit=1`;
  const legacy=await admin(q,{method:"GET"});
  if(
    legacy.ok &&
    Array.isArray(legacy.body) &&
    legacy.body.length===1 &&
    String((legacy.body[0] as Record<string,unknown>).token_sha256||"")===digest
  ){
    return true;
  }
  return workerCredentialAuthorized(digest);
}

type Requirement={id:string;mechanism?:string;description?:string};

Deno.serve(async(req:Request)=>{
  if(req.method==="GET") return json(200,{ok:true,service:"project-zero-authorize"});
  if(req.method!=="POST") return json(405,{ok:false,code:"METHOD_NOT_ALLOWED"});

  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!(await bearerAuthorized(token))) return json(401,{ok:false,code:"UNAUTHORIZED"});

  let input:Record<string,unknown>;
  try{input=await req.json();}catch{return json(400,{ok:false,code:"INVALID_JSON"});}

  const taskId=String(input.taskId||"");
  const agentId=String(input.agentId||"");
  const tenantId=String(input.tenantId||"");
  const requestedAction=String(input.requestedAction||"");
  const required=Array.isArray(input.requiredCapabilities)?input.requiredCapabilities as Requirement[]:[];
  if(!taskId||!agentId||!tenantId||!requestedAction||required.length===0){
    return json(400,{ok:false,code:"INVALID_AUTHORIZATION_REQUEST"});
  }

  const ids=required.map(x=>String(x.id||"")).filter(Boolean);
  const quoted=ids.map(id=>`"${id.replace(/"/g,'\\\"')}"`).join(",");
  const path=`x1_capability_registry?select=capability_id,available,authorized,fresh,validated,platform_gated,source,capability_version,last_verified_at&tenant_id=eq.${encodeURIComponent(tenantId)}&capability_id=in.(${encodeURIComponent(quoted)})`;
  const lookup=await admin(path,{method:"GET"});
  if(!lookup.ok || !Array.isArray(lookup.body)) return json(500,{ok:false,code:"CAPABILITY_LOOKUP_FAILED"});
  const rows=lookup.body as Record<string,unknown>[];
  const byId=new Map(rows.map(row=>[String(row.capability_id),row]));

  const resolved:string[]=[];
  const sources:Record<string,string>={};
  const blockers:{capabilityId:string;state:string;closure:string;detail:string}[]=[];

  for(const requirement of required){
    const id=String(requirement.id||"");
    const row=byId.get(id);
    if(!row){
      blockers.push({capabilityId:id,state:"MISSING",closure:"REGISTER_CAPABILITY",detail:"Capability not present in registry."});
      continue;
    }
    const bad:string[]=[];
    if(!row.available) bad.push("UNAVAILABLE");
    if(!row.authorized) bad.push("UNAUTHORIZED");
    if(!row.fresh) bad.push("STALE");
    if(!row.validated) bad.push("UNVALIDATED");
    if(row.platform_gated) bad.push("PLATFORM_GATED");
    if(bad.length){
      blockers.push({capabilityId:id,state:bad.join("+"),closure:"RESOLVE_CAPABILITY_STATE",detail:`Capability blocked by: ${bad.join(", ")}`});
      continue;
    }
    resolved.push(id);
    sources[id]=String(row.source||"x1_capability_registry");
  }

  const now=new Date();
  const unsigned={
    authorization_id:`auth_${crypto.randomUUID()}`,
    task_id:taskId,
    agent_id:agentId,
    tenant_id:tenantId,
    requested_action:requestedAction,
    capabilities_required:ids,
    capabilities_resolved:resolved,
    capability_sources:sources,
    policy_version:"project-zero-1.0.0",
    registry_version:(await sha256Hex(canonicalize(rows.map(row=>({
      capability_id:row.capability_id,
      available:row.available,
      authorized:row.authorized,
      fresh:row.fresh,
      validated:row.validated,
      capability_version:row.capability_version??null,
      last_verified_at:row.last_verified_at??null,
    }))))).slice(0,16),
    issued_at:now.toISOString(),
    expires_at:new Date(now.getTime()+300000).toISOString(),
    allowed:blockers.length===0,
    blockers,
    receipt_id:`receipt_${crypto.randomUUID()}`,
  };

  const derivedSigningKey=await sha256Hex(`project-zero-bootstrap-signing-v1:${token}`);
  const signatureValue=await hmacHex(derivedSigningKey,canonicalize(unsigned));
  const authorization={...unsigned,signature:{algorithm:"HMAC-SHA256",value:signatureValue}};

  const authRow={
    authorization_id:authorization.authorization_id,
    task_id:authorization.task_id,
    agent_id:authorization.agent_id,
    tenant_id:authorization.tenant_id,
    requested_action:authorization.requested_action,
    capabilities_required:authorization.capabilities_required,
    capabilities_resolved:authorization.capabilities_resolved,
    capability_sources:authorization.capability_sources,
    policy_version:authorization.policy_version,
    registry_version:authorization.registry_version,
    issued_at:authorization.issued_at,
    expires_at:authorization.expires_at,
    allowed:authorization.allowed,
    blockers:authorization.blockers,
    receipt_id:authorization.receipt_id,
    signature_algorithm:authorization.signature.algorithm,
    signature_value:authorization.signature.value,
  };
  const authPersist=await admin("x1_bootstrap_authorizations",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(authRow)});
  if(!authPersist.ok) return json(500,{ok:false,code:"AUTHORIZATION_PERSIST_FAILED"});

  const contentHash=await sha256Hex(canonicalize(unsigned));
  const receiptRow={
    receipt_id:authorization.receipt_id,
    authorization_id:authorization.authorization_id,
    task_id:authorization.task_id,
    tenant_id:authorization.tenant_id,
    agent_id:authorization.agent_id,
    allowed:authorization.allowed,
    blocker_count:authorization.blockers.length,
    content_hash:contentHash,
    created_at:authorization.issued_at,
  };
  const receiptPersist=await admin("x1_bootstrap_receipts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(receiptRow)});
  if(!receiptPersist.ok) return json(500,{ok:false,code:"RECEIPT_PERSIST_FAILED"});

  return json(authorization.allowed?200:403,{authorization});
});
