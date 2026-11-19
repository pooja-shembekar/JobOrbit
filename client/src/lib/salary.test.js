import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatSalary } from './salary.js';

describe('INR salary formatting', () => {
  it('formats salary ranges with Indian digit grouping', () => {
    assert.equal(formatSalary(300000, 600000), '₹3,00,000 – ₹6,00,000');
  });

  it('preserves optional minimum-only and maximum-only ranges', () => {
    assert.equal(formatSalary(300000, null), 'From ₹3,00,000');
    assert.equal(formatSalary(null, 600000), 'Up to ₹6,00,000');
  });

  it('returns null when no salary is specified', () => {
    assert.equal(formatSalary(null, null), null);
  });
});
