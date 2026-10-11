/**
 * Dependency-aware, deterministic mission planner. This does not submit work
 * to the DB; the verified X1 controller owns queue insertion and leases.
 */
export interface MissionTask {
  id: string;
  dependsOn: string[];
  kind: "READ_ONLY" | "NON_PRODUCTION_MUTATION" | "PROTECTED_MUTATION" | "PRODUCTION_RELEASE";
  approvalReference?: string;
}
export interface MissionState {
  tasks: MissionTask[];
  completed: string[];
  leased: string[];
  failed: string[];
}
export interface MissionDecision {
  ready: string[];
  protected: string[];
  blocked: { id: string; reason: string }[];
}
export function nextEligibleTasks(state: MissionState): MissionDecision {
  const ids = new Set(state.tasks.map(t=>t.id));
  if (ids.size !== state.tasks.length) throw new Error("X1_MISSION_DUPLICATE_TASK");
  const completed = new Set(state.completed), leased = new Set(state.leased), failed = new Set(state.failed);
  const ready:string[] = [], protectedTasks:string[] = [];
  const blocked:{id:string;reason:string}[]=[];
  for(const task of state.tasks){
    if(!/^[A-Z0-9][A-Z0-9_.-]{2,159}$/.test(task.id)) throw new Error("X1_MISSION_INVALID_TASK_ID");
    for(const dep of task.dependsOn) if(!ids.has(dep) || dep === task.id) throw new Error("X1_MISSION_INVALID_DEPENDENCY");
    if(completed.has(task.id) || leased.has(task.id)) continue;
    if(failed.has(task.id)) {blocked.push({id:task.id,reason:"PRIOR_FAILURE"});continue;}
    if(task.dependsOn.some(d=>failed.has(d))) {blocked.push({id:task.id,reason:"DEPENDENCY_FAILED"});continue;}
    if(task.dependsOn.some(d=>!completed.has(d))) {blocked.push({id:task.id,reason:"DEPENDENCIES_OPEN"});continue;}
    if(task.kind==="PROTECTED_MUTATION" || task.kind==="PRODUCTION_RELEASE") {
      protectedTasks.push(task.id);
      // Even with approval reference, actual signature must be verified externally.
      continue;
    }
    ready.push(task.id);
  }
  return {ready,protected:protectedTasks,blocked};
}
