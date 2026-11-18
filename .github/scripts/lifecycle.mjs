// Lifecycle for issues that wait for the author.
//
// A maintainer adds "needs-info" when a report needs more details. Then:
// - When the author replies, the label goes away. If the issue was closed for
//   no reply, it opens again.
// - When the author does not reply for 14 days, the issue closes with a kind comment.
// No other issue closes, and no issue is locked.
// .github/workflows/lifecycle.yml calls runSweep() and runAuthorReply().

export const NEEDS_INFO_LABEL = 'needs-info';
export const NEEDS_INFO_DAYS = 14;
export const CLOSE_MARKER = '<!-- lifecycle-needs-info -->';
const DAY_MS = 24 * 60 * 60 * 1000;

export function closeMessage(days = NEEDS_INFO_DAYS) {
  return [
    CLOSE_MARKER,
    `We close this issue for now, because we asked for more details ${days} days ago and did not get a reply.`,
    '',
    'This is not a judgment of your report. To open it again, add a comment with the details that we asked for. The issue then opens again, and a maintainer reads it.',
  ].join('\n');
}

/**
 * True when the label is older than the limit and the author did not comment after it.
 * labeledAt and every reply time are Date values.
 */
export function shouldClose({ labeledAt, authorReplies, now, days = NEEDS_INFO_DAYS }) {
  if (!(labeledAt instanceof Date) || Number.isNaN(labeledAt.getTime())) return false;
  if (now.getTime() - labeledAt.getTime() < days * DAY_MS) return false;
  return !authorReplies.some((reply) => reply.getTime() > labeledAt.getTime());
}

/** The time of the last "labeled needs-info" event, or null. */
export function lastLabeledAt(events, label = NEEDS_INFO_LABEL) {
  const times = events
    .filter((event) => event.event === 'labeled' && event.label && event.label.name === label)
    .map((event) => new Date(event.created_at));
  return times.length === 0 ? null : times[times.length - 1];
}

function hasLabel(issue, name) {
  return (issue.labels || []).some((label) => (typeof label === 'string' ? label : label.name) === name);
}

export async function runSweep({ github, context, core, now = new Date() }) {
  const { owner, repo } = context.repo;
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'open',
    labels: NEEDS_INFO_LABEL,
    per_page: 100,
  });
  const closed = [];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const events = await github.paginate(github.rest.issues.listEvents, {
      owner,
      repo,
      issue_number: issue.number,
      per_page: 100,
    });
    const labeledAt = lastLabeledAt(events);
    if (!labeledAt) continue;
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issue.number,
      since: labeledAt.toISOString(),
      per_page: 100,
    });
    const authorReplies = comments
      .filter((comment) => comment.user && comment.user.login === issue.user.login)
      .map((comment) => new Date(comment.created_at));
    if (!shouldClose({ labeledAt, authorReplies, now })) continue;

    await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: closeMessage() });
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'not_planned',
    });
    closed.push(issue.number);
    core.info(`Closed #${issue.number}: no reply ${NEEDS_INFO_DAYS} days after needs-info.`);
  }
  core.info(`Checked ${issues.length} issue(s) with needs-info. Closed ${closed.length}.`);
  return closed;
}

// Open an issue again only when this workflow closed it, not when a maintainer did.
async function closedByLifecycle({ github, owner, repo, issue }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issue.number,
    per_page: 100,
  });
  return comments.some(
    (comment) => comment.user && comment.user.type === 'Bot' && (comment.body || '').startsWith(CLOSE_MARKER),
  );
}

export async function runAuthorReply({ github, context, core }) {
  const { owner, repo } = context.repo;
  const { issue, comment } = context.payload;
  if (issue.pull_request) return 'skipped';
  if (!comment.user || !issue.user || comment.user.login !== issue.user.login) return 'skipped';
  if (!hasLabel(issue, NEEDS_INFO_LABEL)) return 'skipped';

  try {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: issue.number, name: NEEDS_INFO_LABEL });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (issue.state === 'closed' && (await closedByLifecycle({ github, owner, repo, issue }))) {
    await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: 'open' });
    core.info(`The author replied. Opened #${issue.number} again.`);
    return 'reopened';
  }
  core.info(`The author replied. Removed needs-info from #${issue.number}.`);
  return 'unlabeled';
}
