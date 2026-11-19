import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clearResumeSelection } from './resumeSelection.js';

describe('clearResumeSelection', () => {
  it('clears the native file input and returns an empty selection for React state', () => {
    const fileInput = { value: 'C:\\fakepath\\resume.pdf' };

    assert.equal(clearResumeSelection(fileInput), null);
    assert.equal(fileInput.value, '');
  });

  it('handles a file input that is not mounted', () => {
    assert.equal(clearResumeSelection(null), null);
  });
});