import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { STATUS_TRANSITIONS, normalizeStatus, statusOptionsFor } from './applicationStatus.js';

const backendSource = await readFile(
  new URL('../../../server/src/controllers/applicationController.js', import.meta.url),
  'utf8'
);

const extractObjectLiteral = (source, name) => {
  const match = source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `expected the backend controller to declare ${name}`);
  return new Function(`return {${match[1]}};`)();
};

describe('recruiter status transitions', () => {
  it('mirrors the transitions the backend controller allows', () => {
    const backendTransitions = extractObjectLiteral(backendSource, 'allowedTransitions');
    assert.deepEqual(STATUS_TRANSITIONS, backendTransitions);
  });

  it('keeps the backend rule that a direct "Interview" write is always rejected', () => {
    assert.match(backendSource, /nextStatus === 'Interview' \|\| !allowedTransitions\[currentStatus\]/);
    for (const options of Object.values(STATUS_TRANSITIONS)) {
      assert.ok(!options.includes('Interview'));
    }
  });

  it('offers only permitted next statuses for a stored status', () => {
    assert.deepEqual(statusOptionsFor('Applied'), ['Applied', 'Under Review', 'Shortlisted', 'Rejected']);
    assert.deepEqual(statusOptionsFor('Under Review'), ['Under Review', 'Shortlisted', 'Rejected', 'Hired']);
    assert.deepEqual(statusOptionsFor('Shortlisted'), ['Shortlisted', 'Rejected', 'Hired']);
    assert.deepEqual(statusOptionsFor('Interview'), ['Interview', 'Rejected', 'Hired']);
  });

  it('keeps hired terminal and offers permitted reconsideration statuses for rejected applications', () => {
    assert.deepEqual(statusOptionsFor('Hired'), ['Hired']);
    assert.deepEqual(statusOptionsFor('Rejected'), ['Rejected', 'Under Review', 'Shortlisted']);
  });

  it('keeps the current status listed so the card shows the confirmed value', () => {
    for (const status of ['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired']) {
      assert.equal(statusOptionsFor(status)[0], status);
    }
  });

  it('treats the legacy "Submitted" status like the backend "Applied" status', () => {
    assert.equal(normalizeStatus('Submitted'), 'Applied');
    assert.deepEqual(statusOptionsFor('Submitted'), ['Submitted', 'Under Review', 'Shortlisted', 'Rejected']);
  });
});
