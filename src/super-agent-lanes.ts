export const SUPER_AGENT_LANES = [
  "orchestrator",
  "growth_operator",
  "code_architect",
  "social_strategist",
  "sales_engine",
  "brand_guardian",
  "replicator",
  "swarm",
] as const;

export type SuperAgentLane = typeof SUPER_AGENT_LANES[number];

export function parseSuperAgentLane(value: string | undefined): SuperAgentLane | undefined {
  if(!value) return undefined;
  return (SUPER_AGENT_LANES as readonly string[]).includes(value)
    ? value as SuperAgentLane
    : undefined;
}

export function requireSuperAgentLane(value: string | undefined): SuperAgentLane {
  const lane=parseSuperAgentLane(value);
  if(!lane) throw new Error("X1_AGENT_LANE_INVALID");
  return lane;
}
