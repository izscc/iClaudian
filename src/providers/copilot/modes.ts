import type { CopilotApprovalMode } from './settings';

const COPILOT_ACP_AGENT_MODE = 'https://agentclientprotocol.com/protocol/session-modes#agent';
const COPILOT_ACP_AUTOPILOT_MODE = 'https://agentclientprotocol.com/protocol/session-modes#autopilot';
const COPILOT_ACP_PLAN_MODE = 'https://agentclientprotocol.com/protocol/session-modes#plan';

export function permissionModeToCopilotApprovalMode(value: unknown): CopilotApprovalMode {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === COPILOT_ACP_AUTOPILOT_MODE) return 'yolo';
  if (value === COPILOT_ACP_PLAN_MODE) return 'plan';
  return 'default';
}

export function copilotApprovalModeToPermissionMode(value: unknown): string {
  if (value === 'yolo') return 'yolo';
  if (value === 'plan') return 'plan';
  if (value === COPILOT_ACP_AUTOPILOT_MODE) return 'yolo';
  if (value === COPILOT_ACP_PLAN_MODE) return 'plan';
  return 'normal';
}

export function copilotApprovalModeToAcpModeId(value: unknown): string {
  if (value === 'plan') return COPILOT_ACP_PLAN_MODE;
  if (value === 'yolo') return COPILOT_ACP_AUTOPILOT_MODE;
  return COPILOT_ACP_AGENT_MODE;
}
