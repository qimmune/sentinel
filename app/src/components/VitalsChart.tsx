// A small hand-rolled SVG line chart.
//
// No chart library: nothing suitable is installed, and CLAUDE.md is explicit
// that we don't npm install at the venue unless something is genuinely broken.
// This is ~150 lines and does exactly what the demo needs.
import { Box, Group, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { VitalsPoint } from '../fhir/vitals';
import { computeGeometry } from './chartScale';

export interface ChartSeries {
  label: string;
  /** A Mantine color name, e.g. 'red'. */
  color: string;
  points: VitalsPoint[];
}

export interface VitalsChartProps {
  title: string;
  unit: string;
  series: ChartSeries[];
  /** A clinical threshold to draw across the plot, e.g. the 38 °C fever line. */
  referenceLine?: { value: number; label: string };
  decimals?: number;
  height?: number;
}

const WIDTH = 720;
const MARGIN = { top: 12, right: 16, bottom: 24, left: 46 };

export function VitalsChart({
  title,
  unit,
  series,
  referenceLine,
  decimals = 0,
  height = 160,
}: VitalsChartProps): JSX.Element {
  const withData = series.filter((s) => s.points.length > 0);

  if (withData.length === 0) {
    return (
      <Box>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          No readings yet.
        </Text>
      </Box>
    );
  }

  const { x, y, gridValues, hourTicks, maxTime } = computeGeometry(
    withData.flatMap((s) => s.points),
    referenceLine ? [referenceLine.value] : [],
    WIDTH,
    height,
    MARGIN
  );

  return (
    <Box>
      <Group justify="space-between" align="baseline" mb={2}>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Group gap="sm">
          {withData.map((s) => (
            <Group key={s.label} gap={4}>
              <Box
                w={8}
                h={8}
                style={{ borderRadius: '50%', background: `var(--mantine-color-${s.color}-6)` }}
              />
              <Text size="xs" c="dimmed">
                {s.label} {s.points.at(-1)?.value.toFixed(decimals)} {unit}
              </Text>
            </Group>
          ))}
        </Group>
      </Group>

      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" height={height} role="img" aria-label={title}>
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--mantine-color-default-border)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={y(value) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--mantine-color-dimmed)"
            >
              {value.toFixed(decimals)}
            </text>
          </g>
        ))}

        {hourTicks.map((hours) => {
          const tickTime = new Date(maxTime - hours * 3_600_000).toISOString();
          return (
            <text
              key={hours}
              x={x(tickTime)}
              y={height - 6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--mantine-color-dimmed)"
            >
              {hours === 0 ? 'now' : `−${hours}h`}
            </text>
          );
        })}

        {referenceLine && (
          <g>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(referenceLine.value)}
              y2={y(referenceLine.value)}
              stroke="var(--mantine-color-red-6)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.8}
            />
            <text
              x={WIDTH - MARGIN.right}
              y={y(referenceLine.value) - 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--mantine-color-red-6)"
            >
              {referenceLine.label}
            </text>
          </g>
        )}

        {withData.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.points.map((p) => `${x(p.time)},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={`var(--mantine-color-${s.color}-6)`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p) => (
              <circle key={p.time} cx={x(p.time)} cy={y(p.value)} r={2} fill={`var(--mantine-color-${s.color}-6)`}>
                <title>{`${s.label} ${p.value.toFixed(decimals)} ${unit} · ${new Date(p.time).toLocaleString()}`}</title>
              </circle>
            ))}
            {/* Emphasise the most recent reading — that's the one triage used. */}
            <circle
              cx={x(s.points[s.points.length - 1].time)}
              cy={y(s.points[s.points.length - 1].value)}
              r={4}
              fill={`var(--mantine-color-${s.color}-6)`}
              stroke="var(--mantine-color-body)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
    </Box>
  );
}
