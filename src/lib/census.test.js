import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { DEMOGRAPHIC_METRICS, loadDemographics, loadLookup } from '../../scripts/lib/census.mjs';

const censusDir = resolve(process.cwd(), 'data/source/census');

describe('census source aggregation', () => {
  it('adds age, housing and population only for seats in the official lookup', () => {
    const seats = JSON.parse(readFileSync(resolve(process.cwd(), 'data/source/constituency.geojson'), 'utf8')).features;
    const codesByCountry = Object.fromEntries(['England', 'Wales', 'Scotland', 'Northern Ireland'].map((country) => [
      country,
      new Set(seats.filter((seat) => seat.properties.Country === country).map((seat) => seat.properties.GSScode)),
    ]));
    const expectedCodes = new Set(seats.map((seat) => seat.properties.GSScode));
    const ewCodes = new Set([...codesByCountry.England, ...codesByCountry.Wales]);
    const lookup = loadLookup(resolve(censusDir, 'msoa-to-pcon.csv'), ewCodes);
    const demographics = loadDemographics(censusDir, lookup, {
      seatCodes: expectedCodes,
      scotlandCodes: codesByCountry.Scotland,
      northernIrelandCodes: codesByCountry['Northern Ireland'],
    });

    expect(demographics.size).toBe(650);
    for (const seat of demographics.values()) {
      expect(seat.population).toBeGreaterThan(0);
      expect(seat.age65Plus).toBeGreaterThanOrEqual(0);
      expect(seat.age65Plus).toBeLessThanOrEqual(1);
      expect(seat.ownerOccupiedShare).toBeGreaterThanOrEqual(0);
      expect(seat.ownerOccupiedShare).toBeLessThanOrEqual(1);
      if (Number.isFinite(seat.TS067)) {
        expect(seat.TS067).toBeGreaterThanOrEqual(0);
        expect(seat.TS067).toBeLessThanOrEqual(1);
      }
    }
    expect([...demographics.values()].filter((seat) => seat.scotlandDegreeShare !== undefined)).toHaveLength(57);
    expect([...demographics.values()].filter((seat) => seat.niLevel4PlusShare !== undefined)).toHaveLength(18);
  }, 15000);

  it('declares provenance and country scope for each displayed measure', () => {
    expect(DEMOGRAPHIC_METRICS.map((metric) => metric.seatKey)).toContain('age65Plus');
    expect(DEMOGRAPHIC_METRICS.map((metric) => metric.seatKey)).toContain('ownerOccupiedShare');
    const age = DEMOGRAPHIC_METRICS.find((metric) => metric.seatKey === 'age65Plus');
    const scotlandEducation = DEMOGRAPHIC_METRICS.find((metric) => metric.seatKey === 'scotlandDegreeShare');
    const northernIrelandEducation = DEMOGRAPHIC_METRICS.find((metric) => metric.seatKey === 'niLevel4PlusShare');
    expect(age.sourceIds).toMatchObject({ England: 'ons-census-2021', Scotland: 'nrs-census-2022', 'Northern Ireland': 'nisra-census-2021' });
    expect(scotlandEducation.definition).toMatch(/not the same threshold as Northern Ireland/);
    expect(northernIrelandEducation.definition).toMatch(/includes HNC\/HND/);
  });
});
