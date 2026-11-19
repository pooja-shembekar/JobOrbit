import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidIndianMobileNumber } from './indianMobile.js';

describe('Indian mobile number validation', () => {
  it('accepts 10-digit numbers with or without the +91 prefix', () => {
    assert.equal(isValidIndianMobileNumber('9876543210'), true);
    assert.equal(isValidIndianMobileNumber('+919876543210'), true);
    assert.equal(isValidIndianMobileNumber('+91 98765 43210'), true);
  });

  it('rejects invalid lengths, prefixes, and country codes', () => {
    for (const phone of ['987654321', '1234567890', '+1 98765 43210', '+91 1234567890']) {
      assert.equal(isValidIndianMobileNumber(phone), false, phone);
    }
  });
});
