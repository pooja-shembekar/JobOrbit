const compareSkills = (jobSkills = [], candidateSkills = []) => {
  const required = [...new Set(jobSkills.map((skill) => skill.trim()).filter(Boolean))];
  const candidateSet = new Set(candidateSkills.map((skill) => skill.trim().toLowerCase()).filter(Boolean));
  const matchedSkills = required.filter((skill) => candidateSet.has(skill.toLowerCase()));
  const missingSkills = required.filter((skill) => !candidateSet.has(skill.toLowerCase()));
  const score = required.length ? Math.round((matchedSkills.length / required.length) * 100) : 0;
  return { required, matchedSkills, missingSkills, score };
};

const buildMatch = (comparison, matches, method, notice) => {
  const matchedSkills = matches.map((match) => match.jobSkill);
  const missingSkills = comparison.required.filter((skill) => !matchedSkills.includes(skill));
  const score = comparison.required.length
    ? Math.round((matchedSkills.length / comparison.required.length) * 100)
    : 0;
  const semanticMatches = matches.filter((match) => match.jobSkill.toLowerCase() !== match.candidateSkill.toLowerCase());

  return {
    score,
    matchedSkills,
    missingSkills,
    explanation: comparison.required.length
      ? `${matchedSkills.length} of ${comparison.required.length} listed job skills matched${semanticMatches.length ? `, including equivalent skills ${semanticMatches.map((match) => `${match.jobSkill} and ${match.candidateSkill}`).join('; ')}.` : '.'}`
      : 'This job does not list required skills, so a skills-overlap score cannot be calculated.',
    method,
    ...(notice ? { notice } : {}),
    disclaimer: 'This comparison is informational and does not make or recommend a hiring decision.',
  };
};

const deterministicMatch = (comparison, notice) => buildMatch(
  comparison,
  comparison.required
    .filter((skill) => comparison.matchedSkills.includes(skill))
    .map((jobSkill) => ({ jobSkill, candidateSkill: jobSkill })),
  'deterministic',
  notice
);

export const matchCandidateSkills = async (jobSkills, candidateSkills, jobDescription = '') => {
  const comparison = compareSkills(jobSkills, candidateSkills);
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) return deterministicMatch(comparison);

  try {
    const response = await fetch(process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Find semantic skill equivalents between the supplied jobSkills and candidateSkills. Return JSON with a matches array of objects containing jobSkill and candidateSkill, copied exactly from their respective supplied arrays. Only return defensible direct skill equivalents. Do not invent skill names, scores, experience, qualifications, or hiring suitability.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              jobSkills: comparison.required,
              jobDescription: jobDescription.slice(0, 5000),
              candidateSkills,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    const result = JSON.parse(content);
    if (!Array.isArray(result.matches) || result.matches.length > comparison.required.length) {
      throw new Error('AI provider response did not match the expected schema.');
    }

    const canonical = (skills, requested) => skills.find(
      (skill) => skill.trim().toLowerCase() === requested.trim().toLowerCase()
    );
    const usedJobSkills = new Set();
    const usedCandidateSkills = new Set();
    const matches = result.matches.map((match) => {
      if (!match || typeof match.jobSkill !== 'string' || typeof match.candidateSkill !== 'string') {
        throw new Error('AI provider returned an invalid skill pair.');
      }
      const jobSkill = canonical(comparison.required, match.jobSkill);
      const candidateSkill = canonical(candidateSkills, match.candidateSkill);
      if (!jobSkill || !candidateSkill || usedJobSkills.has(jobSkill.toLowerCase())
        || usedCandidateSkills.has(candidateSkill.toLowerCase())) {
        throw new Error('AI provider returned skills that were not present in the supplied profiles.');
      }
      usedJobSkills.add(jobSkill.toLowerCase());
      usedCandidateSkills.add(candidateSkill.toLowerCase());
      return { jobSkill, candidateSkill };
    });

    return buildMatch(comparison, matches, 'ai');
  } catch (error) {
    console.warn('[AI] Skill match provider unavailable; using deterministic fallback.');
    return deterministicMatch(comparison, 'AI matching was unavailable; this result uses deterministic exact-skill overlap.');
  }
};