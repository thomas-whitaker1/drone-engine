// What a blow throws off (gt#115): the sparks. Held to the one law every
// generated thing on this board is held to — nothing is randomised at
// runtime — and to being a spray rather than a fan.

import { describe, expect, it } from 'vitest';
import { SPARKS, sparkSpray } from '../src/tokens/impact';

describe('the sparks off the anvil', () => {
  it('throws the same spray for the same blow, every time', () => {
    for (let spray = 0; spray < SPARKS.sprays; spray++) {
      const first = sparkSpray(spray);
      expect(sparkSpray(spray), String(spray)).toBe(first);
      expect(JSON.stringify(sparkSpray(spray)), String(spray)).toBe(JSON.stringify(first));
      expect(first).toHaveLength(SPARKS.count);
    }
  });

  it('throws a different one on the next blow, and comes round again', () => {
    const drawn = Array.from({ length: SPARKS.sprays }, (_, spray) => JSON.stringify(sparkSpray(spray)));
    expect(new Set(drawn).size).toBe(SPARKS.sprays);
    expect(SPARKS.sprays).toBeGreaterThan(2);
    // A count of blows is taken as it comes and wrapped.
    expect(sparkSpray(SPARKS.sprays)).toBe(sparkSpray(0));
    expect(sparkSpray(SPARKS.sprays * 3 + 2)).toBe(sparkSpray(2));
    expect(sparkSpray(-1)).toBe(sparkSpray(SPARKS.sprays - 1));
  });

  it('throws as many one way as the other', () => {
    for (let spray = 0; spray < SPARKS.sprays; spray++) {
      const sides = sparkSpray(spray).map((spark) => spark.side);
      expect(sides.filter((side) => side === -1)).toHaveLength(SPARKS.count / 2);
      expect(sides.filter((side) => side === 1)).toHaveLength(SPARKS.count / 2);
    }
    expect(SPARKS.count % 2).toBe(0);
  });

  it('keeps every spark inside what it is thrown to, and leaning the way it goes', () => {
    for (let spray = 0; spray < SPARKS.sprays; spray++) {
      for (const spark of sparkSpray(spray)) {
        expect(spark.reach).toBeGreaterThanOrEqual(SPARKS.minReach);
        expect(spark.reach).toBeLessThanOrEqual(SPARKS.maxReach);
        expect(spark.fall).toBeGreaterThanOrEqual(SPARKS.minFall);
        expect(spark.fall).toBeLessThanOrEqual(SPARKS.maxFall);
        expect(spark.kick).toBeGreaterThanOrEqual(SPARKS.minKick);
        expect(spark.kick).toBeLessThanOrEqual(SPARKS.maxKick);
        expect(spark.ms).toBeGreaterThanOrEqual(SPARKS.minMs);
        expect(spark.ms).toBeLessThanOrEqual(SPARKS.maxMs);
        expect(Number.isInteger(spark.ms)).toBe(true);
        expect(spark.length).toBeGreaterThanOrEqual(SPARKS.minLength);
        expect(spark.length).toBeLessThanOrEqual(SPARKS.maxLength);
        // Outward: a spark going left leans left.
        expect(Math.sign(spark.lean)).toBe(spark.side);
        expect(Math.abs(spark.lean)).toBeGreaterThanOrEqual(SPARKS.minLean);
        expect(Math.abs(spark.lean)).toBeLessThanOrEqual(SPARKS.maxLean);
      }
    }
  });

  it('is a spray and not a fan: most fall short and a few go far', () => {
    const reaches = Array.from({ length: SPARKS.sprays }, (_, spray) => sparkSpray(spray))
      .flat()
      .map((spark) => spark.reach);
    const middle = (SPARKS.minReach + SPARKS.maxReach) / 2;
    const short = reaches.filter((reach) => reach < middle).length;
    expect(short).toBeGreaterThan(reaches.length * 0.55);
    expect(Math.max(...reaches)).toBeGreaterThan(SPARKS.maxReach * 0.8);
    expect(SPARKS.bias).toBeGreaterThan(1);
    // And it is over in well under a second.
    expect(SPARKS.maxMs).toBeLessThan(800);
  });
});
