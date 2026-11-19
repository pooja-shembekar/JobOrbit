import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageSource = await readFile(new URL('./MyApplications.jsx', import.meta.url), 'utf8');

describe('My Applications resume visibility', () => {
  it('does not render an uploaded-resume download action and retains application tracking', () => {
    assert.doesNotMatch(pageSource, /Download Resume/);
    assert.match(pageSource, /Current status:/);
    assert.match(pageSource, /aria-label="Application status history"/);
  });

  it('renders the current status returned by the applications API', () => {
    assert.match(pageSource, /Current status: \{STATUS_LABELS\[app\.status\] \|\| app\.status\}/);
    for (const status of ['Applied', 'Under Review', 'Shortlisted', 'Interview', 'Rejected', 'Hired']) {
      assert.match(pageSource, new RegExp(`'${status}':`));
    }
  });
});
