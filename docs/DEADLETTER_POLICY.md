# Deadletter Policy

Repository: `Strategic-Minds-AI/x1-ai-hub-swarm-runtime`

## Purpose
This document is a mandatory human-readable contract for the repository role: Railway-oriented swarm runtime for leased tasks, ephemeral agents, budgets, retries, dead letters and worker health.

## Invariants
- Versioned source truth.
- Typed inputs/outputs.
- Explicit allowed/forbidden actions.
- Tenant/security/budget boundaries where applicable.
- Idempotency, timeout, bounded retry and failure state.
- Independent validation and evidence receipt.
- Rollback and exact next action.

## Change rule
Any material edit to this contract must declare changed contract keys and run dependency impact validation before the repository can return to VERIFIED state.
