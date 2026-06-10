import type { AcpStopReason } from './types';

const STOP_REASON_NOTICES: Record<string, string> = {
  cancelled: 'The turn was cancelled before completion (cancelled).',
  max_tokens: 'The turn was stopped early: the model hit its token limit (max_tokens).',
  max_turn_requests: 'The turn was stopped early: the per-turn request limit was reached (max_turn_requests). The agent may have detected a loop.',
  refusal: 'The agent refused to continue this turn (refusal).',
};

// end_turn (and absent values) are normal completions; everything else deserves a
// user-visible notice because the agent gives no other signal that work was cut short.
export function describeAcpStopReason(stopReason: AcpStopReason | null | undefined): string | null {
  if (!stopReason || stopReason === 'end_turn') {
    return null;
  }
  return STOP_REASON_NOTICES[stopReason] ?? `The turn ended with stop reason "${stopReason}".`;
}
