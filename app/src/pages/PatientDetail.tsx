// Patient drill-down: the simulated vitals stream, the check-in that produced
// the symptom features, and the reasoning behind the current triage tier.
import { Alert, Anchor, Badge, Box, Card, Grid, Group, Loader, Stack, Text, Title, Tooltip } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { FEVER_C, HYPOTENSION_SBP, HYPOXIA_SPO2 } from '../clinical/thresholds';
import { VitalsChart } from '../components/VitalsChart';
import { RISK_COLOR, ReasonList, TIER_COLOR, TIER_MEANING } from '../components/triageDisplay';
import { loadPatientDetail, type CohortEntry } from '../fhir/cohort';
import { toVitalsSeries } from '../fhir/vitals';
import type { SymptomFeatures } from '../voice/features';

const FEATURE_LABELS: { key: keyof SymptomFeatures; label: string }[] = [
  { key: 'fever', label: 'Feels feverish' },
  { key: 'confusion', label: 'Confusion' },
  { key: 'wordFinding', label: 'Word-finding difficulty' },
  { key: 'seizure', label: 'Seizure' },
  { key: 'motorWeakness', label: 'Focal weakness' },
  { key: 'tremor', label: 'Tremor' },
  { key: 'headache', label: 'Headache' },
  { key: 'dizziness', label: 'Dizziness' },
  { key: 'dizzinessOnStanding', label: 'Dizziness on standing' },
  { key: 'drowsiness', label: 'Drowsiness' },
];

/**
 * What the LLM pulled out of the transcript. Shown next to the patient's own
 * words so a clinician can check the extraction, not just trust it.
 */
function ExtractedFeatures({ features }: { features: SymptomFeatures }): JSX.Element {
  return (
    <Group gap={6}>
      {FEATURE_LABELS.map(({ key, label }) => {
        const value = features[key];
        if (value === 'unknown') {
          return (
            <Tooltip key={key} label="Not mentioned in the check-in">
              <Badge variant="outline" color="gray" size="sm" style={{ opacity: 0.5 }}>
                {label} ?
              </Badge>
            </Tooltip>
          );
        }
        return (
          <Badge key={key} variant={value ? 'filled' : 'light'} color={value ? 'blue' : 'gray'} size="sm">
            {label}
          </Badge>
        );
      })}
      <Badge variant="light" color="gray" size="sm">
        Consciousness: {features.consciousness}
      </Badge>
      <Badge variant="light" color="gray" size="sm">
        Coherence: {features.coherence}
      </Badge>
    </Group>
  );
}

export function PatientDetail(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [entry, setEntry] = useState<CohortEntry>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setError(undefined);
    try {
      setEntry(await loadPatientDetail(medplum, id));
    } catch (err) {
      setError(normalizeErrorString(err));
    }
  }, [medplum, id]);

  useEffect(() => {
    load().catch((err: unknown) => setError(normalizeErrorString(err)));
  }, [load]);

  if (error) {
    return (
      <Box p="lg">
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Could not load this patient">
          {error}
        </Alert>
      </Box>
    );
  }

  if (!entry) {
    return (
      <Box p="lg">
        <Loader />
      </Box>
    );
  }

  const { result } = entry;
  const series = toVitalsSeries(entry.observations);

  return (
    <Box p="lg">
      <Anchor size="sm" onClick={() => navigate('/')} mb="sm" style={{ display: 'inline-block' }}>
        <Group gap={4}>
          <IconArrowLeft size={14} />
          Back to cohort
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" mb="md">
        <Box>
          <Title order={1} size="h2">
            {entry.name}
          </Title>
          <Group gap="xs" mt={6}>
            <Text size="sm" c="dimmed">
              {entry.dayPostInfusion !== undefined ? `Day +${entry.dayPostInfusion} post-infusion` : 'Infusion date unknown'}
            </Text>
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
        </Box>
        <Tooltip label={TIER_MEANING[result.tier]}>
          <Badge color={TIER_COLOR[result.tier]} size="xl" variant="filled">
            {result.tier}
          </Badge>
        </Tooltip>
      </Group>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder radius="md" padding="md">
            <Group justify="space-between" align="center" mb="sm">
              <Text fw={600}>Vitals — last 24 hours</Text>
              <Tooltip label="Scripted synthetic time series. In production this streams from a wearable or a home cuff.">
                <Badge size="sm" variant="light" color="gray">
                  simulated
                </Badge>
              </Tooltip>
            </Group>

            <Stack gap="lg">
              <VitalsChart
                title="Temperature"
                unit="°C"
                decimals={1}
                series={[{ label: 'Temp', color: 'red', points: series.temperature }]}
                referenceLine={{ value: FEVER_C, label: `fever ${FEVER_C} °C` }}
              />
              <VitalsChart
                title="Heart rate"
                unit="bpm"
                series={[{ label: 'HR', color: 'grape', points: series.heartRate }]}
              />
              <VitalsChart
                title="Blood pressure"
                unit="mmHg"
                series={[
                  { label: 'Systolic', color: 'blue', points: series.systolic },
                  { label: 'Diastolic', color: 'cyan', points: series.diastolic },
                ]}
                referenceLine={{ value: HYPOTENSION_SBP, label: `hypotension ${HYPOTENSION_SBP}` }}
              />
              <VitalsChart
                title="Oxygen saturation"
                unit="%"
                series={[{ label: 'SpO₂', color: 'teal', points: series.spo2 }]}
                referenceLine={{ value: HYPOXIA_SPO2, label: `hypoxia ${HYPOXIA_SPO2}%` }}
              />
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            <Card withBorder radius="md" padding="md">
              <Text fw={600} mb="xs">
                Why {result.tier}
              </Text>
              <ReasonList reasons={result.reasons} />
            </Card>

            <Card withBorder radius="md" padding="md">
              <Group justify="space-between" align="baseline" mb="xs">
                <Text fw={600}>Latest check-in</Text>
                {entry.lastCheckIn && (
                  <Text size="xs" c="dimmed">
                    {new Date(entry.lastCheckIn).toLocaleString()}
                  </Text>
                )}
              </Group>

              {entry.transcript ? (
                <Text size="sm" fs="italic" mb="sm">
                  “{entry.transcript}”
                </Text>
              ) : (
                <Text size="sm" c="dimmed" mb="sm">
                  No transcript on file.
                </Text>
              )}

              <Text size="xs" c="dimmed" mb={6}>
                Extracted features — the model's only output
              </Text>
              <ExtractedFeatures features={entry.features} />
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
