// The clinician cohort board: every monitored patient, colored by triage tier,
// worst first. This is the Tier 1 demo surface.
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconBolt, IconDatabasePlus, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import type { Vitals } from '../clinical/triage';
import { FEVER_C, HYPOTENSION_SBP, HYPOXIA_SPO2, LOW_GRADE_TEMP_C } from '../clinical/thresholds';
import { RISK_COLOR, ReasonList, TIER_COLOR, TIER_MEANING } from '../components/triageDisplay';
import { runAgent, type AgentOutcome } from '../agent/agent';
import { loadCohort, type CohortEntry } from '../fhir/cohort';
import { seedDemoData } from '../fhir/seed';

/** One vital, flagged when it is outside the range triage() cares about. */
function VitalStat({ label, value, abnormal }: { label: string; value: string; abnormal: boolean }): JSX.Element {
  return (
    <Box>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={abnormal ? 700 : 500} c={abnormal ? 'red' : undefined}>
        {value}
      </Text>
    </Box>
  );
}

function VitalsRow({ vitals }: { vitals: Vitals }): JSX.Element {
  const bp =
    vitals.systolicBP !== undefined && vitals.diastolicBP !== undefined
      ? `${vitals.systolicBP}/${vitals.diastolicBP}`
      : '—';

  return (
    <Group gap="lg" wrap="nowrap">
      <VitalStat
        label="Temp"
        value={vitals.tempC !== undefined ? `${vitals.tempC.toFixed(1)} °C` : '—'}
        abnormal={vitals.tempC !== undefined && vitals.tempC >= LOW_GRADE_TEMP_C}
      />
      <VitalStat
        label="HR"
        value={vitals.heartRate !== undefined ? `${vitals.heartRate}` : '—'}
        abnormal={vitals.restingHrTrendingUp === true}
      />
      <VitalStat
        label="BP"
        value={bp}
        abnormal={vitals.systolicBP !== undefined && vitals.systolicBP < HYPOTENSION_SBP}
      />
      <VitalStat
        label="SpO₂"
        value={vitals.spo2 !== undefined ? `${vitals.spo2}%` : '—'}
        abnormal={vitals.spo2 !== undefined && vitals.spo2 < HYPOXIA_SPO2}
      />
    </Group>
  );
}

function PatientCard({ entry, onOpen }: { entry: CohortEntry; onOpen: () => void }): JSX.Element {
  const { result } = entry;
  const color = TIER_COLOR[result.tier];

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      onClick={onOpen}
      style={{
        cursor: 'pointer',
        borderLeft: `5px solid var(--mantine-color-${color}-6)`,
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Box>
            <Text fw={600} size="lg">
              {entry.name}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.dayPostInfusion !== undefined ? `Day +${entry.dayPostInfusion} post-infusion` : 'Infusion date unknown'}
            </Text>
          </Box>
          <Tooltip label={TIER_MEANING[result.tier]}>
            <Badge color={color} size="lg" variant="filled">
              {result.tier}
            </Badge>
          </Tooltip>
        </Group>

        <Group gap="xs">
          <Tooltip label="Q-Immune pre-infusion risk prediction">
            <Badge color={RISK_COLOR[entry.riskTier]} variant="light" size="sm">
              Q-Immune risk: {entry.riskTier}
            </Badge>
          </Tooltip>
          {result.riskTierApplied && (
            <Tooltip label={`The rules alone said ${result.baseTier}. The high-risk profile shifted it one tier.`}>
              <Badge color="grape" variant="outline" size="sm">
                ↑ raised from {result.baseTier}
              </Badge>
            </Tooltip>
          )}
        </Group>

        <VitalsRow vitals={entry.vitals} />

        <ReasonList reasons={result.reasons} />
      </Stack>
    </Card>
  );
}

export function CohortBoard(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CohortEntry[]>();
  const [error, setError] = useState<string>();
  const [seeding, setSeeding] = useState<string>();
  const [agentRunning, setAgentRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<AgentOutcome[]>();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    setError(undefined);
    try {
      setEntries(await loadCohort(medplum));
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }, [medplum]);

  useEffect(() => {
    refresh().catch((err: unknown) => setError(normalizeErrorString(err)));
  }, [refresh]);

  /**
   * Keep the board live. A phone call finishing on the server has to change
   * this screen without anyone touching it — that is the whole point of the
   * escalation landing in FHIR. Five seconds is invisible on stage and costs
   * one search per patient.
   */
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const timer = setInterval(() => {
      if (!seeding && !agentRunning) {
        void refresh();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, refresh, seeding, agentRunning]);

  const seed = useCallback(async () => {
    setError(undefined);
    setSeeding('Starting…');
    try {
      await seedDemoData(medplum, (progress) => setSeeding(progress.message));
      await refresh();
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSeeding(undefined);
    }
  }, [medplum, refresh]);

  /**
   * Run the agent over the cohort. This is the identical function the Medplum
   * Bot runs — see src/bots/triageBot.ts. Only the trigger differs.
   */
  const runTheAgent = useCallback(async () => {
    setAgentRunning(true);
    setError(undefined);
    try {
      const results = await runAgent(medplum);
      setOutcomes(results);
      await refresh();
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setAgentRunning(false);
    }
  }, [medplum, refresh]);

  const acted = outcomes?.filter((outcome) => outcome.escalated || outcome.checkInRequested) ?? [];

  return (
    <Box p="lg">
      <Group justify="space-between" align="flex-end" mb="md">
        <Box>
          <Title order={1} size="h2">
            Monitored cohort
          </Title>
          <Group gap="xs" mt={4}>
            <Text size="sm" c="dimmed">
              Outpatient CAR-T · triage from ASTCT-derived rules
            </Text>
            <Badge size="xs" variant="light" color="gray">
              simulated data
            </Badge>
          </Group>
        </Box>
        <Group gap="xs">
          <Tooltip label={autoRefresh ? 'Live — polling every 5s' : 'Paused'}>
            <Button
              variant={autoRefresh ? 'light' : 'default'}
              color={autoRefresh ? 'teal' : undefined}
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => setAutoRefresh((on) => !on)}
              disabled={seeding !== undefined}
            >
              {autoRefresh ? 'Live' : 'Paused'}
            </Button>
          </Tooltip>
          <Button
            size="xs"
            leftSection={<IconBolt size={14} />}
            onClick={() => void runTheAgent()}
            loading={agentRunning}
            disabled={seeding !== undefined || !entries || entries.length === 0}
          >
            Run agent
          </Button>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconDatabasePlus size={14} />}
            onClick={() => void seed()}
            loading={seeding !== undefined}
          >
            {entries && entries.length > 0 ? 'Re-seed' : 'Seed demo cohort'}
          </Button>
        </Group>
      </Group>

      {seeding && (
        <Alert mb="md" color="blue" title="Seeding">
          {seeding}
        </Alert>
      )}

      {error && (
        <Alert mb="md" color="red" icon={<IconAlertTriangle size={16} />} title="Something went wrong">
          {error}
        </Alert>
      )}

      {outcomes && (
        <Alert
          mb="md"
          color={acted.length > 0 ? 'orange' : 'gray'}
          variant="light"
          title={`Agent run complete — ${acted.length} of ${outcomes.length} patients needed action`}
        >
          <Stack gap={4}>
            {outcomes.map((outcome) => (
              <Text key={outcome.patientId} size="sm">
                <strong>{outcome.name}</strong> {outcome.previousTier ?? 'new'} → {outcome.tier}
                {outcome.escalated && ' · Flag + Task raised'}
                {outcome.checkInRequested && ' · check-in requested'}
                {outcome.drift.drifting &&
                  ` · drifting (+${outcome.drift.tempRiseC?.toFixed(1)} °C, +${Math.round(outcome.drift.heartRateRiseBpm ?? 0)} bpm over ${outcome.drift.windowHours}h)`}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      {entries === undefined && !error && <Loader />}

      {entries?.length === 0 && (
        <Alert color="blue" title="No patients enrolled yet">
          Click <strong>Seed demo cohort</strong> to write the five synthetic patients, their vitals and their
          check-ins into Medplum as FHIR.
        </Alert>
      )}

      {entries && entries.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
          {entries.map((entry) => (
            <PatientCard
              key={entry.patient.id}
              entry={entry}
              onOpen={() => navigate(`/Patient/${entry.patient.id}`)}
            />
          ))}
        </SimpleGrid>
      )}

      <Text size="xs" c="dimmed" mt="xl">
        Fever threshold {FEVER_C} °C · hypotension below {HYPOTENSION_SBP} mmHg systolic · hypoxia below {HYPOXIA_SPO2}%
        SpO₂. Tiers are computed by <code>triage()</code>, never by a language model.
      </Text>
    </Box>
  );
}
