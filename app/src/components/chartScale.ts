/**
 * Chart geometry, kept separate from the markup so it can be unit-tested.
 *
 * The failure mode this guards against is silent: a NaN coordinate or an
 * inverted axis renders as an empty or nonsensical plot, with no error
 * anywhere. Flat series (a patient whose SpO₂ never moves) and single-point
 * series are the usual culprits.
 */

import type { VitalsPoint } from '../fhir/vitals';

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartGeometry {
  /** ISO instant -> horizontal pixel. */
  x: (time: string) => number;
  /** Value -> vertical pixel. Inverted: larger values sit higher. */
  y: (value: number) => number;
  minValue: number;
  maxValue: number;
  minTime: number;
  maxTime: number;
  /** Values to draw horizontal gridlines at. */
  gridValues: number[];
  /** Whole hours before the newest reading that fall inside the window. */
  hourTicks: number[];
}

const TICK_HOURS = [24, 18, 12, 6, 0];

export function computeGeometry(
  points: VitalsPoint[],
  extraValues: number[],
  width: number,
  height: number,
  margin: Margin
): ChartGeometry {
  const times = points.map((p) => new Date(p.time).getTime());
  const values = [...points.map((p) => p.value), ...extraValues];

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // Pad so lines never sit on the frame. A flat series has zero range, so fall
  // back to a proportional pad — otherwise every point divides by zero.
  const range = rawMax - rawMin;
  const pad = range > 0 ? range * 0.15 : Math.abs(rawMax) * 0.02 || 1;
  const minValue = rawMin - pad;
  const maxValue = rawMax + pad;

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const x = (time: string): number => {
    const t = new Date(time).getTime();
    // A single reading, or all readings at the same instant: pin to the right,
    // where "now" is.
    const ratio = maxTime === minTime ? 1 : (t - minTime) / (maxTime - minTime);
    return margin.left + ratio * plotWidth;
  };

  const y = (value: number): number =>
    margin.top + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight;

  return {
    x,
    y,
    minValue,
    maxValue,
    minTime,
    maxTime,
    gridValues: [minValue, (minValue + maxValue) / 2, maxValue],
    hourTicks: TICK_HOURS.filter((h) => maxTime - h * 3_600_000 >= minTime - 60_000),
  };
}
