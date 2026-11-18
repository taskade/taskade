// Triage for new issues. No AI, no secret, no external call.
//
// An issue form writes each answer under a "### <label>" heading. This file
// reads the answer to "Which part of Taskade?" and adds its area label, and it
// adds the type label of the form. .github/workflows/triage.yml calls runTriage().

export const AREA_HEADING = 'Which part of Taskade?';

// Each value is an option of the "area" dropdown in product_bug.yml.
// "Other" gets no area label.
export const AREA_LABELS = Object.freeze({
  'Taskade Genesis apps': 'area:genesis-apps',
  'AI agents': 'area:agents',
  'Automations and integrations': 'area:automations',
  'Projects and views': 'area:projects',
  'Sharing and publishing': 'area:sharing',
  'Billing page display': 'area:billing-page',
  'Mobile app': 'area:mobile',
  'Desktop app': 'area:desktop',
  'MCP server and AI clients': 'area:mcp',
  Other: null,
});

// One heading that only that form has, and the type label of the form.
export const FORM_TYPES = Object.freeze([
  { heading: AREA_HEADING, label: 'bug' },
  { heading: 'What problem do you want to solve?', label: 'enhancement' },
  { heading: 'What kit do you want?', label: 'app-kit-request' },
  { heading: 'What is wrong or missing?', label: 'documentation' },
]);

/** The answer under "### <heading>", or null when the heading is not there. */
export function readAnswer(body, heading) {
  if (typeof body !== 'string') return null;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === `### ${heading}`);
  if (start === -1) return null;
  const answer = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('### ')) break;
    answer.push(line);
  }
  const text = answer.join('\n').trim();
  return text === '' || text === '_No response_' ? null : text;
}

/** The labels for an issue body: the form type, then the area. */
export function labelsFor(body) {
  const labels = [];
  const form = FORM_TYPES.find(({ heading }) => readAnswer(body, heading) !== null);
  if (form) labels.push(form.label);
  const area = readAnswer(body, AREA_HEADING);
  if (area && AREA_LABELS[area]) labels.push(AREA_LABELS[area]);
  return labels;
}

export async function runTriage({ github, context, core }) {
  const { owner, repo } = context.repo;
  const issue = context.payload.issue;
  const labels = labelsFor(issue.body);
  if (labels.length === 0) {
    core.info('No issue form answer found. No label added.');
    return [];
  }
  await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels });
  core.info(`Added labels: ${labels.join(', ')}.`);
  return labels;
}
