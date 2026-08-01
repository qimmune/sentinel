// The voice check-in, and the audit trail it produces.
//
// The three panels at the end are the demo: what the patient said, what was
// extracted from it, and what tier that produced. A clinician can see the whole
// chain and overrule it in five seconds.
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Progress,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconMicrophone,
  IconPlayerSkipForward,
  IconVolume,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Task } from '@medplum/fhirtypes';
import { ICE_ASSESSABLE_POINTS } from '../clinical/thresholds';
import { explainTriage, type TriageResult } from '../clinical/triage';
import { IncomingCheckIn } from '../components/IncomingCheckIn';
import { ReasonList, TIER_COLOR, TIER_MEANING } from '../components/triageDisplay';
import { findCheckInRequest } from '../agent/agent';
import { buildCheckInResponse } from '../fhir/checkin';
import { SENTINEL_IDENTIFIER_SYSTEM } from '../fhir/codes';
import { loadCohort, type CohortEntry } from '../fhir/cohort';
import { getPatientCity } from '../fhir/patient';
import { CHECK_IN_SCRIPT, RECORDED_STEPS } from '../voice/checkInScript';
import {
  getDeepgramApiKey,
  isMicrophoneSupported,
  startRecording,
  transcribeAudio,
  type Recorder,
} from '../voice/capture';
import { extractFeatures, type CheckInAnswer, type ExtractionResult } from '../voice/extract';
import { CALL_GREETING, preloadSpeech, speak } from '../voice/speak';
import type { SymptomFeatures } from '../voice/features';

type Phase = 'idle' | 'briefing' | 'speaking' | 'recording' | 'transcribing' | 'review';

const INTRO = CHECK_IN_SCRIPT.find((step) => step.kind === 'statement');

const FEATURE_LABELS: Partial<Record<keyof SymptomFeatures, string>> = {
  fever: 'Feels feverish',
  confusion: 'Confusion',
  wordFinding: 'Word-finding difficulty',
  seizure: 'Seizure',
  motorWeakness: 'Focal weakness',
  tremor: 'Tremor',
  headache: 'Headache',
  dizziness: 'Dizziness',
  dizzinessOnStanding: 'Dizziness on standing',
  drowsiness: 'Drowsiness',
};

export function CheckIn(): JSX.Element {
  const medplum = useMedplum();
  const [cohort, setCohort] = useState<CohortEntry[]>();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<CheckInAnswer[]>([]);
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [triageResult, setTriageResult] = useState<TriageResult>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<Recorder | undefined>(undefined);
  /** The agent's off-schedule request, when it has raised one. */
  const [incoming, setIncoming] = useState<Task>();
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    loadCohort(medplum)
      .then((entries) => {
        setCohort(entries);
        setPatientId((current) => current ?? entries[0]?.patient.id ?? null);
      })
      .catch((err: unknown) => setError(normalizeErrorString(err)));
  }, [medplum]);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  useEffect(() => {
    preloadSpeech([CALL_GREETING, INTRO?.prompt ?? '', ...RECORDED_STEPS.map((s) => s.prompt)], getDeepgramApiKey());
  }, []);

  /**
   * Poll for the agent asking to speak to this patient.
   *
   * Polling rather than WebSocket subscriptions on purpose: five seconds is
   * indistinguishable on stage and there is no socket lifecycle to go wrong in
   * a room with bad wifi.
   */
  useEffect(() => {
    if (!patientId || phase !== 'idle') {
      return;
    }
    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const task = await findCheckInRequest(medplum, patientId);
        if (!cancelled && task && !dismissed.includes(task.id as string)) {
          setIncoming(task);
        }
      } catch {
        // A failed poll is not worth interrupting the patient for.
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [medplum, patientId, phase, dismissed]);

  const entry = cohort?.find((candidate) => candidate.patient.id === patientId);
  const step = RECORDED_STEPS[stepIndex];

  /** Score everything collected so far and run the rules over it. */
  const finish = useCallback(
    (collected: CheckInAnswer[]) => {
      if (!entry) {
        return;
      }
      const result = extractFeatures(collected, {
        now: new Date(),
        expectedCity: getPatientCity(entry.patient),
      });
      console.log('[Sentinel] extracted features', result.features);

      setExtraction(result);
      setTriageResult(explainTriage(result.features, entry.vitals, entry.riskTier));
      setPhase('review');
    },
    [entry]
  );

  /**
   * Ask the question out loud, then listen. Strictly sequential — recording
   * while the agent is speaking captures its own voice.
   */
  const askThenRecord = useCallback(async (prompt?: string) => {
    try {
      if (prompt) {
        setPhase('speaking');
        await speak(prompt, getDeepgramApiKey());
      }
      recorderRef.current = await startRecording();
      setPhase('recording');
    } catch (err) {
      setError(
        `${normalizeErrorString(err)} — if you denied the microphone prompt, re-enable it in the browser's site settings and reload.`
      );
      setPhase('idle');
    }
  }, []);

  const start = useCallback(() => {
    setError(undefined);
    setAnswers([]);
    setExtraction(undefined);
    setTriageResult(undefined);
    setSaved(false);
    setStepIndex(0);
    setPhase('briefing');
  }, []);

  /** Stop the current answer, transcribe it, and move on. */
  const next = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !step) {
      return;
    }
    setPhase('transcribing');
    try {
      const audio = await recorder.stop();
      recorderRef.current = undefined;
      const result = await transcribeAudio(audio, getDeepgramApiKey());
      const collected = [...answers, { stepId: step.id, transcript: result.transcript }];
      setAnswers(collected);

      if (stepIndex + 1 < RECORDED_STEPS.length) {
        setStepIndex(stepIndex + 1);
        await askThenRecord(RECORDED_STEPS[stepIndex + 1].prompt);
      } else {
        finish(collected);
      }
    } catch (err) {
      setError(normalizeErrorString(err));
      setPhase('idle');
    }
  }, [answers, askThenRecord, finish, step, stepIndex]);

  /** Leave this answer unrecorded. It stays 'unknown', never false. */
  const skip = useCallback(async () => {
    recorderRef.current?.cancel();
    recorderRef.current = undefined;
    if (stepIndex + 1 < RECORDED_STEPS.length) {
      setStepIndex(stepIndex + 1);
      await askThenRecord(RECORDED_STEPS[stepIndex + 1].prompt);
    } else {
      finish(answers);
    }
  }, [answers, askThenRecord, finish, stepIndex]);

  const save = useCallback(async () => {
    if (!entry || !extraction) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const transcript = answers
        .map((answer) => {
          const prompt = RECORDED_STEPS.find((candidate) => candidate.id === answer.stepId)?.prompt ?? answer.stepId;
          return `Q: ${prompt}\nA: ${answer.transcript || '(no answer)'}`;
        })
        .join('\n\n');

      const response = buildCheckInResponse(
        { reference: `Patient/${entry.patient.id}` },
        extraction.features,
        new Date().toISOString(),
        transcript
      );
      await medplum.createResource({
        ...response,
        identifier: { system: SENTINEL_IDENTIFIER_SYSTEM, value: `checkin-${entry.patient.id}-${Date.now()}` },
      });
      setSaved(true);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSaving(false);
    }
  }, [answers, entry, extraction, medplum]);

  /** The patient answered. Claim the Task and go straight into the questions. */
  const acceptIncoming = useCallback(async () => {
    const task = incoming;
    setIncoming(undefined);
    if (task?.id) {
      try {
        await medplum.updateResource({ ...task, status: 'in-progress' });
      } catch {
        // Losing the status update must not stop the check-in itself.
      }
    }
    start();
    // The patient picked up — greet them, give the recall words, then begin.
    void (async () => {
      await speak(CALL_GREETING, getDeepgramApiKey());
      if (INTRO?.prompt) {
        await speak(INTRO.prompt, getDeepgramApiKey());
      }
      await askThenRecord(RECORDED_STEPS[0].prompt);
    })();
  }, [askThenRecord, incoming, medplum, start]);

  /** "Not now" — leave the Task open so the care team still sees it pending. */
  const declineIncoming = useCallback(() => {
    if (incoming?.id) {
      setDismissed((current) => [...current, incoming.id as string]);
    }
    setIncoming(undefined);
  }, [incoming]);

  const busy = phase === 'recording' || phase === 'transcribing' || phase === 'briefing' || phase === 'speaking';

  return (
    <Box p="lg">
      {incoming && entry && (
        <IncomingCheckIn
          patientName={entry.name}
          reason={incoming.description}
          onAccept={() => void acceptIncoming()}
          onDecline={declineIncoming}
        />
      )}

      <Title order={1} size="h2">
        Voice check-in
      </Title>
      <Text size="sm" c="dimmed" mt={4} mb="md">
        Fixed questions, spoken answers, deterministic scoring. No language model anywhere in this pipeline.
      </Text>

      {!isMicrophoneSupported() && (
        <Alert mb="md" color="orange" icon={<IconAlertTriangle size={16} />} title="No microphone API">
          This browser doesn't expose MediaRecorder. Microphone capture also needs a secure context — localhost
          counts, a plain-http LAN address does not.
        </Alert>
      )}

      {error && (
        <Alert mb="md" color="red" icon={<IconAlertTriangle size={16} />} title="Check-in failed">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md" padding="md" mb="md">
        <Group align="flex-end" gap="md">
          <Select
            label="Patient"
            placeholder={cohort ? 'Select a patient' : 'Loading…'}
            data={(cohort ?? []).map((candidate) => ({
              value: candidate.patient.id as string,
              label: `${candidate.name}${candidate.dayPostInfusion !== undefined ? ` — day +${candidate.dayPostInfusion}` : ''}`,
            }))}
            value={patientId}
            onChange={setPatientId}
            disabled={busy}
            w={280}
          />
          <Button
            leftSection={<IconMicrophone size={16} />}
            onClick={start}
            disabled={!patientId || busy || !isMicrophoneSupported()}
          >
            {phase === 'review' ? 'Start again' : 'Start check-in'}
          </Button>
        </Group>
      </Card>

      {phase === 'briefing' && INTRO && (
        <Card withBorder radius="md" padding="lg" mb="md">
          <Text size="lg" mb="md">
            “{INTRO.prompt}”
          </Text>
          <Button onClick={() => void askThenRecord(RECORDED_STEPS[0].prompt)}>Ready — first question</Button>
        </Card>
      )}

      {(phase === 'recording' || phase === 'transcribing' || phase === 'speaking') && step && (
        <Card withBorder radius="md" padding="lg" mb="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Question {stepIndex + 1} of {RECORDED_STEPS.length}
            </Text>
            {phase === 'speaking' && (
              <Group gap={6}>
                <IconVolume size={16} />
                <Text size="sm" c="dimmed">
                  Sentinel is speaking…
                </Text>
              </Group>
            )}
            {phase === 'recording' && (
              <Group gap={6}>
                <Box
                  w={10}
                  h={10}
                  style={{
                    borderRadius: '50%',
                    background: 'var(--mantine-color-red-6)',
                    animation: 'sentinel-pulse 1s ease-in-out infinite',
                  }}
                />
                <Text size="sm" c="dimmed">
                  Listening
                </Text>
              </Group>
            )}
          </Group>

          <Progress value={((stepIndex + 1) / RECORDED_STEPS.length) * 100} size="xs" mb="md" />

          <Text size="xl" mb="lg">
            “{step.prompt}”
          </Text>

          <Group>
            <Button
              leftSection={<IconCheck size={16} />}
              onClick={() => void next()}
              loading={phase === 'transcribing'}
              disabled={phase === 'speaking'}
            >
              {stepIndex + 1 === RECORDED_STEPS.length ? 'Finish' : 'Next question'}
            </Button>
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconPlayerSkipForward size={16} />}
              onClick={() => void skip()}
              disabled={phase === 'transcribing'}
            >
              Skip
            </Button>
          </Group>

          <style>{`@keyframes sentinel-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.25 } }`}</style>
        </Card>
      )}

      {phase === 'transcribing' && (
        <Group gap="xs" mb="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Transcribing…
          </Text>
        </Group>
      )}

      {phase === 'review' && extraction && triageResult && entry && (
        <Grid gutter="md">
          {/* 1 — what she said */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card withBorder radius="md" padding="md" h="100%">
              <Text fw={600} mb={2}>
                What she said
              </Text>
              <Text size="xs" c="dimmed" mb="sm">
                Transcribed by Deepgram nova-2
              </Text>
              <Stack gap="sm">
                {RECORDED_STEPS.map((candidate) => {
                  const answer = answers.find((item) => item.stepId === candidate.id);
                  return (
                    <Box key={candidate.id}>
                      <Text size="xs" c="dimmed">
                        {candidate.prompt}
                      </Text>
                      {answer ? (
                        <Text size="sm">“{answer.transcript || '(silence)'}”</Text>
                      ) : (
                        <Text size="sm" c="dimmed" fs="italic">
                          skipped
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Card>
          </Grid.Col>

          {/* 2 — what was extracted */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card withBorder radius="md" padding="md" h="100%">
              <Text fw={600} mb={2}>
                What was extracted
              </Text>
              <Text size="xs" c="dimmed" mb="sm">
                Deterministic scoring — no model, no inference
              </Text>

              <Group gap={6} mb="md">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const value = extraction.features[key as keyof SymptomFeatures];
                  if (value === 'unknown') {
                    return (
                      <Tooltip key={key} label="Not asked or not answered">
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
              </Group>

              <Group justify="space-between" align="baseline" mb={4}>
                <Text size="sm" fw={600}>
                  ICE score
                </Text>
                <Badge
                  color={extraction.features.iceScore === ICE_ASSESSABLE_POINTS ? 'teal' : 'orange'}
                  variant="light"
                >
                  {extraction.features.iceScore === 'unknown'
                    ? 'incomplete'
                    : `${extraction.features.iceScore} / ${ICE_ASSESSABLE_POINTS}`}
                </Badge>
              </Group>
              <Stack gap={2} mb="xs">
                {extraction.iceItems.map((item) => (
                  <Group key={item.stepId} justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {item.prompt}
                    </Text>
                    <Text size="xs" fw={600} c={item.earned === item.possible ? undefined : 'orange'}>
                      {item.earned}/{item.possible}
                    </Text>
                  </Group>
                ))}
              </Stack>
              <Text size="xs" c="dimmed">
                Out of {ICE_ASSESSABLE_POINTS}, not 10 — following commands and writing can't be assessed by voice.
              </Text>
            </Card>
          </Grid.Col>

          {/* 3 — what tier it produced */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card withBorder radius="md" padding="md" h="100%">
              <Group justify="space-between" align="flex-start" mb={2}>
                <Text fw={600}>What tier it produced</Text>
                <Tooltip label={TIER_MEANING[triageResult.tier]}>
                  <Badge color={TIER_COLOR[triageResult.tier]} size="lg" variant="filled">
                    {triageResult.tier}
                  </Badge>
                </Tooltip>
              </Group>
              <Text size="xs" c="dimmed" mb="sm">
                triage() over these features plus {entry.name}'s latest vitals
              </Text>

              {triageResult.riskTierApplied && (
                <Badge color="grape" variant="outline" size="sm" mb="sm">
                  ↑ raised from {triageResult.baseTier} — Q-Immune {entry.riskTier} risk
                </Badge>
              )}

              <ReasonList reasons={triageResult.reasons} />

              <Group mt="md">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDeviceFloppy size={14} />}
                  onClick={() => void save()}
                  loading={saving}
                  disabled={saved}
                >
                  {saved ? 'Saved to FHIR' : 'Save check-in'}
                </Button>
              </Group>
            </Card>
          </Grid.Col>
        </Grid>
      )}
    </Box>
  );
}
