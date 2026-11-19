const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const sendEmail = async ({ to, subject, text, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error(`[Email] Provider returned HTTP ${response.status}; notification was not sent.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Notification failed before delivery.');
    return false;
  }
};

export const notifyApplicationSubmitted = async (application) => {
  const title = escapeHtml(application.job?.title || 'the position');
  const company = escapeHtml(application.job?.company || 'the employer');
  const notifications = [
    sendEmail({
      to: application.candidateEmail,
      subject: `Application received: ${application.job?.title || 'JobOrbit'}`,
      text: `Your application for ${application.job?.title || 'the position'} at ${application.job?.company || 'the employer'} was received.`,
      html: `<p>Your application for <strong>${title}</strong> at <strong>${company}</strong> was received.</p>`,
    }),
    sendEmail({
      to: application.job?.recruiterEmail,
      subject: `New application: ${application.job?.title || 'JobOrbit'}`,
      text: `${application.candidateName} applied for ${application.job?.title || 'the position'} at ${application.job?.company || 'your company'}.`,
      html: `<p><strong>${escapeHtml(application.candidateName)}</strong> applied for <strong>${title}</strong> at <strong>${company}</strong>.</p>`,
    }),
  ];
  await Promise.all(notifications);
};

export const notifyApplicationStatus = (application) => {
  const title = escapeHtml(application.job?.title || 'the position');
  const company = escapeHtml(application.job?.company || 'the employer');
  const candidateName = escapeHtml(application.candidateName || 'there');
  const status = escapeHtml(application.status);
  const nextSteps = {
    'Under Review': 'The hiring team is reviewing your application. We will contact you if they need more information.',
    Shortlisted: 'Your application has advanced to the shortlist. Please watch your email for interview details or follow-up questions.',
    Interview: 'Your application has advanced to the interview stage. The hiring team will share scheduling details separately.',
    Rejected: 'The hiring team will not be moving forward with this application. You can continue exploring other open roles on JobOrbit.',
    Hired: 'The hiring team has marked your application as hired. Please follow up with the employer for offer and onboarding details.',
  }[application.status] || 'Sign in to JobOrbit to review your application and any next steps from the hiring team.';
  const safeNextSteps = escapeHtml(nextSteps);
  return sendEmail({
    to: application.candidateEmail,
    subject: `Application update: ${application.job?.title || 'JobOrbit'}`,
    text: `Hello ${application.candidateName || 'there'}, your application for ${application.job?.title || 'the position'} at ${application.job?.company || 'the employer'} is now ${application.status}. ${nextSteps}`,
    html: `<p>Hello ${candidateName},</p><p>Your application for <strong>${title}</strong> at <strong>${company}</strong> is now <strong>${status}</strong>.</p><p>${safeNextSteps}</p>`,
  });
};

export const notifyInterviewScheduled = (application) => {
  const title = escapeHtml(application.job?.title || 'the position');
  const company = escapeHtml(application.job?.company || 'the employer');
  const candidateName = escapeHtml(application.candidateName || 'there');
  const scheduledAt = new Date(application.interview.scheduledAt).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  const meetingDetails = application.interview.meetingDetails || 'Meeting details will be provided by the recruiter.';
  return sendEmail({
    to: application.candidateEmail,
    subject: `Interview scheduled: ${application.job?.title || 'JobOrbit'}`,
    text: `Hello ${application.candidateName || 'there'}, your application for ${application.job?.title || 'the position'} at ${application.job?.company || 'the employer'} has advanced to Interview. The interview is scheduled for ${scheduledAt} UTC. ${meetingDetails}`,
    html: `<p>Hello ${candidateName},</p><p>Your application for <strong>${title}</strong> at <strong>${company}</strong> has advanced to <strong>Interview</strong>. The interview is scheduled for <strong>${escapeHtml(scheduledAt)} UTC</strong>.</p><p>${escapeHtml(meetingDetails)}</p>`,
  });
};