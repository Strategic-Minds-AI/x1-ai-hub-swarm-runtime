/**
 * Read-only independent GitHub Actions evidence validator. Results are
 * not a release approval and never imply identity/model quality parity.
 */
export interface CIValidation {
  status:"PASS"|"FAIL"|"BLOCKED";
  repo:string;commitSha:string;workflow:string;
  runId?:number; runUrl?:string;reason:string;
}
export interface CIInput {
  repo:"Strategic-Minds-AI/X1-OPERATING-SYSTEM";
  commitSha:string;
  workflowName:string;
  token:string;
  fetchImpl?:typeof fetch;
}
export async function validateGitHubCI(config:CIInput):Promise<CIValidation> {
  if(!/^[0-9a-f]{40}$/.test(config.commitSha)||!config.token)throw new Error("X1_CI_PROOF_CONFIG_INVALID");
  if(config.workflowName.length<3||config.workflowName.length>100)throw new Error("X1_CI_WORKFLOW_INVALID");
  const f=config.fetchImpl??fetch;
  const url=`https://api.github.com/repos/${config.repo}/actions/runs?head_sha=${config.commitSha}&per_page=50`;
  const res=await f(url,{headers:{"Authorization":"Bearer "+config.token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(25_000)});
  if(!res.ok)return {status:"BLOCKED",repo:config.repo,commitSha:config.commitSha,workflow:config.workflowName,reason:"GITHUB_EVIDENCE_UNAVAILABLE"};
  const payload=await res.json() as {workflow_runs?:Array<{id:number,name:string,head_sha:string,status:string,conclusion:string|null,html_url:string,event:string}>};
  const runs=(payload.workflow_runs??[]).filter(r=>r.head_sha===config.commitSha && r.name===config.workflowName &&
     ["pull_request","push","workflow_dispatch"].includes(r.event));
  const latest=runs.sort((a,b)=>b.id-a.id)[0];
  if(!latest)return {status:"BLOCKED",repo:config.repo,commitSha:config.commitSha,workflow:config.workflowName,reason:"NO_EXACT_SHA_WORKFLOW_RECEIPT"};
  if(latest.status!=="completed")return {status:"BLOCKED",repo:config.repo,commitSha:config.commitSha,workflow:config.workflowName,runId:latest.id,runUrl:latest.html_url,reason:"CI_PENDING"};
  return {status:latest.conclusion==="success"?"PASS":"FAIL",repo:config.repo,commitSha:config.commitSha,workflow:config.workflowName,
    runId:latest.id,runUrl:latest.html_url,reason:latest.conclusion==="success"?"EXACT_SHA_WORKFLOW_SUCCESS":"EXACT_SHA_WORKFLOW_FAILED"};
}
