// Shared presentation for triage output, so the cohort board and the patient
// drill-down can never disagree about what amber means.
import { Box, Group, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { RiskTier, TriageReason, TriageTier } from '../clinical/triage';

export const TIER_COLOR: Record<TriageTier, string> = {
  EMERGENT: 'red',
  URGENT: 'orange',
  ROUTINE: 'teal',
};

export const TIER_MEANING: Record<TriageTier, string> = {
  EMERGENT: 'Go in now',
  URGENT: 'Care team contacts today',
  ROUTINE: 'Log it, keep watching',
};

export const RISK_COLOR: Record<RiskTier, string> = {
  high: 'grape',
  elevated: 'indigo',
  standard: 'gray',
};

/**
 * The audit trail. Every escalation cites the readings behind it, so a
 * clinician can overrule it in five seconds.
 */
export function ReasonList({ reasons }: { reasons: TriageReason[] }): JSX.Element {
  if (reasons.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing to act on.
      </Text>
    );
  }

  return (
    <Stack gap={4}>
      {reasons.map((reason) => (
        <Group key={reason.code} gap="xs" wrap="nowrap" align="flex-start">
          <Box
            w={6}
            h={6}
            mt={7}
            style={{
              borderRadius: '50%',
              flexShrink: 0,
              background: `var(--mantine-color-${TIER_COLOR[reason.tier]}-6)`,
            }}
          />
          <Text size="sm" c={reason.kind === 'context' ? 'dimmed' : undefined}>
            {reason.detail}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
