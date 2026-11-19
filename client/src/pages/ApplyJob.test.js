import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageSource = await readFile(new URL('./ApplyJob.jsx', import.meta.url), 'utf8');

describe('application phone field', () => {
  it('defaults to +91 and shows the Indian mobile placeholder', () => {
    assert.match(pageSource, /phone:\s+'\+91 '/);
    assert.match(pageSource, /placeholder="\+91 98765 43210"/);
  });

  it('validates Indian numbers before submission with a clear error message', () => {
    assert.match(pageSource, /isValidIndianMobileNumber\(phone\)/);
    assert.match(pageSource, /Enter a valid Indian mobile number with 10 digits, optionally prefixed by \+91\./);
  });
});
