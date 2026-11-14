import type { SafeCodingDispatch } from "./coding-agent-contract.js";
import type { Proposal } from "./autobuild-pipeline.js";

export interface GatewayCodingConfig {
  model: string;
  apiKey?: string;
  authorizationReceiptId?: string;
  enabled?: boolean;
  approvedMaxTokens?: number;
  fetchImpl?: typeof fetch;
}
const API = "https://ai-gateway.vercel.sh/v1/chat/completions";
const SYSTEM = [
  "You are a bounded X1 engineering proposal generator. Return ONLY one JSON object.",
  "Output schema: { \"summary\": string, \"changes\": [{ \"path\": string, \"content\": string, \"explanation\": string }] }.",
  "All file paths must be within exactly the allowed path set; never alter workflow, secrets, protected branches, CI settings or deployment code.",
  "Produce original code only. Never claim a test was run and never invent validation evidence.",
  "If task cannot be safely fulfilled, return empty changes with a reason; the controller will block it."
].join("\n");
function isProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== "object") return false;
  const v=value as Record<string,unknown>;
  return typeof v.summary==="string" && Array.isArray(v.changes)
    && v.changes.every((c:unknown)=>!!c&&typeof c==="object"
      && typeof (c as Record<string,unknown>).path==="string"
      && typeof (c as Record<string,unknown>).content==="string"
      && typeof (c as Record<string,unknown>).explanation==="string");
}
export function createGatewayCodingProposer(config: GatewayCodingConfig) {
  return async (packet:SafeCodingDispatch, retryContext:string[]):Promise<Proposal> => {
    // Costing is governed by X1 budgets before this adapter is enabled.
    // This module cannot enforce provider invoices or grant its own approval.
    if (!config.enabled || !config.authorizationReceiptId || !config.apiKey) {
      throw new Error("X1_GATEWAY_CODING_DISABLED_OR_UNAUTHORIZED");
    }
    const model=config.model;
    if (typeof model!=="string" || !/^[a-z][a-z0-9_-]*\/[a-z0-9._-]+$/i.test(model)) {
      throw new Error("X1_GATEWAY_MODEL_INVALID");
    }
    const max=Math.min(config.approvedMaxTokens ?? 2048,4096);
    if (!Number.isInteger(max) || max < 128) throw new Error("X1_GATEWAY_TOKEN_CAP_INVALID");
    if (retryContext.length > 10) throw new Error("X1_GATEWAY_REPAIR_CONTEXT_TOO_LONG");
    const fetchFn=config.fetchImpl??fetch;
    const prompt=JSON.stringify({
      objective:packet.objective,sourceSha:packet.sourceSha,repo:packet.repo,branch:packet.branch,
      allowedPaths:packet.allowedPaths,acceptanceChecks:packet.validation,
      forbiddenActions:packet.prohibited,previousIndependentFailures:retryContext,
    });
    const res=await fetchFn(API,{
      method:"POST",
      headers:{"Authorization":"Bearer "+config.apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:prompt}],
        temperature:0,max_completion_tokens:max,stream:false}),
      signal:AbortSignal.timeout(45_000),
    });
    if(!res.ok) throw new Error("X1_GATEWAY_CODING_HTTP_ERROR");
    const json=await res.json() as {choices?:Array<{message?:{content?:unknown}}>} ;
    const raw=json.choices?.[0]?.message?.content;
    if(typeof raw!=="string" || raw.length>400_000) throw new Error("X1_GATEWAY_CODING_BAD_RESPONSE");
    let parsed:unknown;
    try{parsed=JSON.parse(raw)}catch{throw new Error("X1_GATEWAY_CODING_NON_JSON");}
    if(!isProposal(parsed))throw new Error("X1_GATEWAY_CODING_WRONG_SCHEMA");
    return parsed;
  };
}
