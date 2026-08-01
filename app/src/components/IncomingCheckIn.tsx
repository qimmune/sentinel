// The agent deciding to ask, rather than waiting for tomorrow's slot.
//
// SPEC.md §4 puts the patient on a PWA, so this is what "Sentinel calls her"
// actually looks like on the patient's phone: a full-screen incoming request
// they accept or decline. See telephony.ts for the seam where a real outbound
// phone call would attach instead.
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconBellRinging, IconPhoneCall, IconPhoneOff, IconVolume, IconVolumeOff } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

export interface IncomingCheckInProps {
  patientName: string;
  /** Why the agent is asking — shown to the patient in plain language. */
  reason?: string;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * A soft two-tone ring, synthesised rather than shipped as an audio file.
 *
 * Browsers block audio until the user has interacted with the page, so this is
 * strictly best-effort: if it's blocked, the overlay is still perfectly usable.
 * Never let a decorative sound break the demo.
 */
function useRingtone(enabled: boolean): void {
  const contextRef = useRef<AudioContext | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    try {
      const context = new AudioContext();
      contextRef.current = context;

      const ring = (): void => {
        if (cancelled || context.state === 'closed') {
          return;
        }
        for (const [index, frequency] of [880, 660].entries()) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;

          const start = context.currentTime + index * 0.28;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.12, start + 0.04);
          gain.gain.linearRampToValueAtTime(0, start + 0.26);

          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.3);
        }
      };

      ring();
      timer = setInterval(ring, 2400);
    } catch {
      // Audio unavailable or blocked. The overlay does the work regardless.
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = undefined;
    };
  }, [enabled]);
}

export function IncomingCheckIn({ patientName, reason, onAccept, onDecline }: IncomingCheckInProps): JSX.Element {
  const [muted, setMuted] = useState(false);
  useRingtone(!muted);

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(160deg, var(--mantine-color-red-9), var(--mantine-color-dark-9))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="xl" px="md" style={{ textAlign: 'center', maxWidth: 560 }}>
        <Box
          style={{
            width: 132,
            height: 132,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'sentinel-ring 1.4s ease-in-out infinite',
          }}
        >
          <IconBellRinging size={64} color="white" />
        </Box>

        <Stack gap={6}>
          <Text c="white" fw={700} size="2rem" lh={1.15}>
            Incoming check-in
          </Text>
          <Text c="white" opacity={0.85} size="lg">
            from your care team
          </Text>
        </Stack>

        <Text c="white" opacity={0.75} size="sm">
          {patientName} — {reason ?? 'Your care team would like to check how you are doing.'}
        </Text>

        <Group gap="lg" mt="md">
          <Button
            size="xl"
            radius="xl"
            color="teal"
            leftSection={<IconPhoneCall size={22} />}
            onClick={onAccept}
          >
            Answer
          </Button>
          <Button
            size="xl"
            radius="xl"
            variant="white"
            color="dark"
            leftSection={<IconPhoneOff size={22} />}
            onClick={onDecline}
          >
            Not now
          </Button>
        </Group>

        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={muted ? <IconVolumeOff size={14} /> : <IconVolume size={14} />}
          onClick={() => setMuted((current) => !current)}
          style={{ color: 'white', opacity: 0.7 }}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </Button>
      </Stack>

      <style>{`
        @keyframes sentinel-ring {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.35); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 28px rgba(255,255,255,0); }
        }
      `}</style>
    </Box>
  );
}
