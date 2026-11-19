import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageSource = await readFile(new URL('./RecruiterDashboard.jsx', import.meta.url), 'utf8');

describe('Recruiter resume preview', () => {
  it('fetches DOCX through the authorized inline resume endpoint and renders locally', () => {
    assert.match(pageSource, /apiFetch\(`\$\{application\.resumeDownloadPath\}\?disposition=inline`\)/);
    assert.match(pageSource, /await import\('docx-preview'\)/);
    assert.match(pageSource, /await renderAsync\(file, container, container/);
    assert.match(pageSource, /renderAltChunks: false/);
  });

  it('keeps PDF preview and original-file download actions available', () => {
    assert.match(pageSource, /if \(\/\\\.docx\$\/i\.test\(application\.resumeFileName \|\| ''\)\) return 'docx'/);
    assert.match(pageSource, /getResumePreviewType\(app\) === 'pdf'/);
    assert.match(pageSource, /View Resume/);
    assert.match(pageSource, /Download Resume/);
    assert.match(pageSource, /link\.download = application\.resumeFileName/);
  });
});

describe('Recruiter applicant cards', () => {
  it('keeps loaded application cards visible when an action fails', () => {
    assert.match(pageSource, /\{appsError && \(/);
    assert.match(pageSource, /\{!appsLoading && applications\.length > 0 && \(/);
    assert.doesNotMatch(pageSource, /\{!appsLoading && !appsError && applications\.length > 0 && \(/);
  });

  it('shows the scheduling form only for statuses accepted by the backend guard', () => {
    assert.match(pageSource, /const INTERVIEW_SCHEDULABLE_STATUSES = \['Applied', 'Submitted', 'Under Review', 'Shortlisted', 'Interview'\];/);
    assert.match(pageSource, /\{INTERVIEW_SCHEDULABLE_STATUSES\.includes\(app\.status\) && \(\s*<form/);
    const allowlist = pageSource.match(/const INTERVIEW_SCHEDULABLE_STATUSES = \[([^\]]+)\]/)[1];
    assert.doesNotMatch(allowlist, /'Hired'|'Rejected'/);
  });

  it('provides separate date and time pickers and submits multiline interview instructions', () => {
    assert.match(pageSource, /name="interviewDate"\s+type="date"\s+required/);
    assert.match(pageSource, /name="interviewTime"\s+type="time"\s+required/);
    assert.match(pageSource, /<textarea\s+name="meetingDetails"[\s\S]*?rows=\{5\}[\s\S]*?maxLength=\{1000\}/);
    assert.match(pageSource, /Interview Details \/ Instructions/);
    assert.match(pageSource, /formData\.get\('interviewDate'\)[\s\S]*?formData\.get\('interviewTime'\)/);
    assert.match(pageSource, /meetingDetails: formData\.get\('meetingDetails'\)/);
  });

  it('keeps terminal application cards and details while showing scheduled interview details read-only', () => {
    assert.match(pageSource, /\{app\.interview\?\.scheduledAt && !INTERVIEW_SCHEDULABLE_STATUSES\.includes\(app\.status\) && \(/);
    assert.match(pageSource, /Interview cancelled/);
    assert.match(pageSource, /\{app\.candidateName\}/);
    assert.match(pageSource, /\{app\.status\}/);
    assert.match(pageSource, /View Resume/);
    assert.match(pageSource, /Download Resume/);
    assert.match(pageSource, /app\.coverLetter/);
    assert.match(pageSource, /app\.relevantExperience/);
  });

  it('merges interview data returned by a status update', () => {
    const handler = pageSource.slice(
      pageSource.indexOf('const handleStatusUpdate'),
      pageSource.indexOf('const handleResumeDownload')
    );
    assert.match(handler, /interview: data\.application\.interview/);
  });

  it('offers only backend-permitted transitions in the per-application status dropdown', () => {
    assert.match(pageSource, /import \{ statusOptionsFor \} from '\.\.\/lib\/applicationStatus'/);
    assert.match(pageSource, /\{statusOptionsFor\(app\.status\)\.map\(\(s\) => \(/);
    assert.doesNotMatch(pageSource, /\{APP_STATUSES\.map\(\(s\) => \(/);
  });

  it('shows the server message on a rejected status update without changing the stored status', () => {
    const handler = pageSource.slice(
      pageSource.indexOf('const handleStatusUpdate'),
      pageSource.indexOf('const handleResumeDownload')
    );
    const catchBlock = handler.slice(handler.indexOf('catch (err) {'), handler.indexOf('finally {'));
    assert.match(catchBlock, /setAppsError\(err\.message/);
    assert.doesNotMatch(catchBlock, /setApplications\(/);
    assert.match(handler, /status: data\.application\.status/);
  });
});
