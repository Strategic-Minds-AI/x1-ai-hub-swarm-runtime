import {advanceWorkspace, assertSandboxOperation, SandboxGuardError, type Workspace, type OwnedResource, type SandboxPrincipal} from "./ephemeral-sandbox-fleet.js";

export interface BuiltArtifact {
  artifactSha256: string;
  sourceSha: string;
  previewUrl: string;
}
export interface ValidationProof {
  artifactSha256: string;
  validatorId: string;
  passed: boolean;
  desktopPassed: boolean;
  mobilePassed: boolean;
  routesPassed: boolean;
  syntheticLeadPassed: boolean;
  detail?: string;
}
export interface ArchiveProof {
  artifactSha256: string;
  archiveReceiptId: string;
  verified: boolean;
}
export interface SandboxBuilderAdapter {
  identity: string;
  build(workspace: Workspace): Promise<BuiltArtifact>;
  repair(workspace: Workspace, artifact: BuiltArtifact, proof: ValidationProof): Promise<BuiltArtifact>;
}
export interface SandboxValidatorAdapter {
  identity: string;
  validate(workspace: Workspace, artifact: BuiltArtifact): Promise<ValidationProof>;
}
export interface SandboxArchiveAdapter {
  write(workspace: Workspace, artifact: BuiltArtifact, proof: ValidationProof): Promise<ArchiveProof>;
}
export interface SandboxRunResult {
  status: "ARCHIVED" | "FAILED";
  workspace: Workspace;
  attempts: number;
  reason: string;
  artifact?: BuiltArtifact;
  proof?: ValidationProof;
  archive?: ArchiveProof;
}
export interface SandboxRunContext {
  workspace: Workspace;
  actor: SandboxPrincipal;
  resource: OwnedResource;
  builder: SandboxBuilderAdapter;
  validator: SandboxValidatorAdapter;
  archive: SandboxArchiveAdapter;
  clock: () => Date;
  maxRepairs?: number;
}

const HEX64 = /^[0-9a-f]{64}$/i;

export async function runSandboxPreview(ctx: SandboxRunContext): Promise<SandboxRunResult> {
  if (ctx.workspace.state !== "REQUESTED") throw new SandboxGuardError("WORKSPACE_NOT_REQUESTED");
  if (!ctx.builder.identity || !ctx.validator.identity || ctx.builder.identity === ctx.validator.identity) {
    throw new SandboxGuardError("INDEPENDENT_VALIDATOR_REQUIRED");
  }
  const repairs = ctx.maxRepairs ?? 2;
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > 3) throw new SandboxGuardError("REPAIR_LIMIT_INVALID");

  let workspace=ctx.workspace;
  function move(state: Workspace["state"], archiveVerified = false) {
    workspace=advanceWorkspace(workspace,{
      eventId:"sandbox_event_" + String(workspace.revision+1).padStart(8,"0"),
      expectedRevision:workspace.revision,
      nextState:state,
      ...(archiveVerified ? {archivesVerified:true} : {})
    });
  }
  move("LEASED");
  assertSandboxOperation(workspace,ctx.actor,"WRITE_WORKTREE",ctx.resource,ctx.clock());
  move("BUILDING");
  let artifact=await ctx.builder.build(workspace);
  if (!HEX64.test(artifact.artifactSha256) || artifact.sourceSha !== workspace.sourceSha || !/^https:\/\/\S+$/.test(artifact.previewUrl)) {
    throw new SandboxGuardError("BUILD_ARTIFACT_INVALID");
  }
  move("TESTING");

  for(let attempt=0;attempt<=repairs;attempt++){
    assertSandboxOperation(workspace,ctx.actor,"RUN_TESTS",ctx.resource,ctx.clock());
    const proof=await ctx.validator.validate(workspace,artifact);
    const accepted=proof.validatorId === ctx.validator.identity &&
      proof.artifactSha256 === artifact.artifactSha256 &&
      proof.passed && proof.desktopPassed && proof.mobilePassed &&
      proof.routesPassed && proof.syntheticLeadPassed;
    if(accepted){
      move("VERIFIED");
      const archive=await ctx.archive.write(workspace,artifact,proof);
      if (!archive.verified || archive.artifactSha256 !== artifact.artifactSha256 || !archive.archiveReceiptId) {
        throw new SandboxGuardError("ARCHIVE_INTEGRITY_FAILED");
      }
      move("ARCHIVED",true);
      return {status:"ARCHIVED",workspace,attempts:attempt+1,reason:"INDEPENDENT_VALIDATION_AND_ARCHIVE_VERIFIED",artifact,proof,archive};
    }
    if(attempt===repairs){
      move("FAILED");
      return {status:"FAILED",workspace,attempts:attempt+1,reason:"VALIDATION_REPAIR_EXHAUSTED",artifact,proof};
    }
    move("REPAIRING");
    assertSandboxOperation(workspace,ctx.actor,"REPLACE_GENERATED_ASSET",ctx.resource,ctx.clock());
    artifact=await ctx.builder.repair(workspace,artifact,proof);
    if (!HEX64.test(artifact.artifactSha256) || artifact.sourceSha !== workspace.sourceSha) {
      throw new SandboxGuardError("REPAIR_ARTIFACT_INVALID");
    }
    move("TESTING");
  }
  throw new SandboxGuardError("UNREACHABLE_STATE");
}
