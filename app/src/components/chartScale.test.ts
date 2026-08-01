/**
 * The chart renders as SVG with no runtime errors when the geometry is wrong —
 * a NaN coordinate just silently draws nothing. These pin the maths.
 */

import { describe, expect, it } from 'vitest';
import type { VitalsPoint } from '../fhir/vitals';
import { computeGeometry, type Margin } from './chartScale';

const WIDTH = 720;
const HEIGHT = 160;
const MARGIN: Margin = { top: 12, right: 16, bottom: 24, left: 46 };

function points(values: number[], startHoursAgo = 24): VitalsPoint[] {
  const step = values.length > 1 ? startHoursAgo / (values.length - 1) : 0;
  return values.map((value, i) => ({
    time: new Date(Date.now() - (startHoursAgo - i * step) * 3_600_000).toISOString(),
    value,
  }));
}

function geometry(values: number[], extra: number[] = []) {
  return computeGeometry(points(values), extra, WIDTH, HEIGHT, MARGIN);
}

describe('computeGeometry', () => {
  it('inverts the y axis — higher values sit higher on screen', () => {
    const { y } = geometry([36.9, 37.4, 38.4]);
    expect(y(38.4)).toBeLessThan(y(36.9));
  });

  it('keeps every point inside the plot area', () => {
    const { x, y } = geometry([36.9, 37.4, 38.4]);
    const series = points([36.9, 37.4, 38.4]);

    for (const point of series) {
      expect(x(point.time)).toBeGreaterThanOrEqual(MARGIN.left);
      expect(x(point.time)).toBeLessThanOrEqual(WIDTH - MARGIN.right);
      expect(y(point.value)).toBeGreaterThanOrEqual(MARGIN.top);
      expect(y(point.value)).toBeLessThanOrEqual(HEIGHT - MARGIN.bottom);
    }
  });

  it('maps the oldest reading to the left edge and the newest to the right', () => {
    const series = points([80, 90, 104]);
    const { x } = computeGeometry(series, [], WIDTH, HEIGHT, MARGIN);

    expect(x(series[0].time)).toBeCloseTo(MARGIN.left, 5);
    expect(x(series[series.length - 1].time)).toBeCloseTo(WIDTH - MARGIN.right, 5);
  });

  it('produces finite coordinates for a completely flat series', () => {
    // Aisha's SpO₂ never moves. Zero range must not divide by zero.
    const { y, minValue, maxValue } = geometry([99, 99, 99]);

    expect(Number.isFinite(y(99))).toBe(true);
    expect(minValue).toBeLessThan(maxValue);
  });

  it('produces finite coordinates for a series of zeroes', () => {
    const { y } = geometry([0, 0]);
    expect(Number.isFinite(y(0))).toBe(true);
  });

  it('produces finite coordinates for a single reading', () => {
    const { x, y } = geometry([37.2]);
    const only = points([37.2])[0];

    expect(Number.isFinite(x(only.time))).toBe(true);
    expect(Number.isFinite(y(only.value))).toBe(true);
  });

  it('widens the domain to fit a reference line above the data', () => {
    // Walter never reaches 38 °C, but the fever line still has to be visible.
    const { y, maxValue } = geometry([37.1, 37.2, 37.6], [38.0]);

    expect(maxValue).toBeGreaterThan(38.0);
    expect(y(38.0)).toBeGreaterThanOrEqual(MARGIN.top);
    expect(y(38.0)).toBeLessThanOrEqual(HEIGHT - MARGIN.bottom);
  });

  it('widens the domain to fit a reference line below the data', () => {
    const { y, minValue } = geometry([118, 116, 112], [90]);

    expect(minValue).toBeLessThan(90);
    expect(y(90)).toBeLessThanOrEqual(HEIGHT - MARGIN.bottom);
  });

  it('puts gridlines at the bottom, middle and top of the domain', () => {
    const { gridValues, minValue, maxValue } = geometry([80, 90, 104]);

    expect(gridValues).toHaveLength(3);
    expect(gridValues[0]).toBe(minValue);
    expect(gridValues[2]).toBe(maxValue);
    expect(gridValues[1]).toBeCloseTo((minValue + maxValue) / 2, 10);
  });

  it('only offers hour ticks that fall inside the window', () => {
    const full = geometry([1, 2, 3], []);
    expect(full.hourTicks).toEqual([24, 18, 12, 6, 0]);

    // A six-hour window has no -24h or -18h tick to show.
    const short = computeGeometry(points([1, 2, 3], 6), [], WIDTH, HEIGHT, MARGIN);
    expect(short.hourTicks).toEqual([6, 0]);
  });
});
