// Privacy guard for public issues and comments.
//
// The scanner finds text that looks like private data: tokens and keys, email
// addresses, phone numbers and private Taskade links. The workflow
// .github/workflows/privacy-guard.yml calls runGuard(). Everything else in this
// file is a pure function, and .github/scripts/privacy-guard.test.mjs tests it.
//
// Rule for this file: never print a matched value. Log only the kind and the count.

export const HOLD_LABEL = 'privacy-hold';
export const NOTICE_MARKER = '<!-- privacy-guard -->';
export const TOKEN_SETTINGS_URL = 'https://www.taskade.com/settings/api';
export const TOKEN_DOCS_URL = 'https://www.taskade.com/docs/getting-started/personal-tokens';
export const CONTACT_URL = 'https://www.taskade.com/contact';

// The words that go into "[removed: looked like <kind>]".
export const KIND = Object.freeze({
  taskadeToken: 'a Taskade token',
  secret: 'an API key or a token',
  privateKey: 'a private key',
  email: 'an email address',
  phone: 'a phone number',
  privateLink: 'a private Taskade link',
});

// Public addresses that people can write in an issue.
export const PUBLIC_EMAILS = new Set([
  'security@taskade.com',
  'hello@taskade.com',
  'support@taskade.com',
  'git@github.com',
]);

// Domains that never hold a real person: GitHub noreply and the reserved example domains.
const PUBLIC_EMAIL_DOMAINS = [
  /(^|\.)noreply\.github\.com$/,
  /^example\.(com|org|net)$/,
  /\.(example|test|invalid|localhost)$/,
];

// "name@2x.png" is a file name, not an address.
const FILE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico', 'bmp', 'mp4', 'mov', 'webm',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'html', 'json', 'map', 'md', 'txt',
  'pdf', 'zip', 'yml', 'yaml',
]);

// Values that a person writes as an example, not as a real secret.
const PLACEHOLDER = /your|example|placeholder|here|xxxx|redacted|dummy|sample|token_?value|<|>/i;

function hasDigit(value) {
  return /\d/.test(value);
}

function looksLikePlaceholder(value) {
  if (PLACEHOLDER.test(value)) return true;
  // "ghp_xxxxxxxx..." or "sk-0000000..." has almost no variety.
  return new Set(value.replace(/^[A-Za-z]+[-_]/, '')).size <= 3;
}

function realSecret(value) {
  return !looksLikePlaceholder(value);
}

function realSecretWithDigit(value) {
  return hasDigit(value) && !looksLikePlaceholder(value);
}

function publicEmail(address) {
  const lower = address.toLowerCase();
  if (PUBLIC_EMAILS.has(lower)) return true;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  if (PUBLIC_EMAIL_DOMAINS.some((rule) => rule.test(domain))) return true;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return FILE_EXTENSIONS.has(tld);
}

function digitCount(value) {
  return (value.match(/\d/g) || []).length;
}

// Each detector has a global regex. When the regex has a group named "secret",
// only that group is removed. Otherwise the full match is removed.
// The order is the priority when two matches overlap.
export const DETECTORS = Object.freeze([
  {
    id: 'private-key',
    kind: KIND.privateKey,
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  },
  {
    id: 'taskade-token',
    kind: KIND.taskadeToken,
    regex: /(?<![A-Za-z0-9_])tskdp_[A-Za-z0-9_-]{10,}/g,
    accept: realSecret,
  },
  {
    id: 'github-token',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g,
    accept: realSecret,
  },
  {
    id: 'stripe-key',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9_])[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/g,
    accept: realSecret,
  },
  {
    id: 'sk-key',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/g,
    accept: realSecretWithDigit,
  },
  {
    id: 'aws-key',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])/g,
    accept: realSecret,
  },
  {
    id: 'slack-token',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9_])xox[baprs]-[A-Za-z0-9-]{10,}/g,
    accept: realSecret,
  },
  {
    // A JWT has three parts: header.payload.signature. A lone part of 60 or
    // more characters is also removed, because it is often a cut-off token.
    id: 'jwt',
    kind: KIND.secret,
    regex: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*)?)?/g,
    accept: (value) => value.includes('.') || value.length >= 63,
  },
  {
    id: 'auth-header',
    kind: KIND.secret,
    regex: /(?<![A-Za-z])(?:Bearer|Basic)\s+(?<secret>[A-Za-z0-9._~+/=-]{12,})/gi,
    accept: realSecretWithDigit,
  },
  {
    id: 'private-link',
    kind: KIND.privateLink,
    regex: /(?<![\w.@-])(?:https?:\/\/)?(?:www\.)?taskade\.com\/(?:spaces|p|d|e|v)\/[^\s)\]>"'`<]+/gi,
  },
  {
    id: 'email',
    kind: KIND.email,
    regex: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?![A-Za-z0-9-])/g,
    accept: (value) => !publicEmail(value),
  },
  {
    // International form: "+1 415 555 0134", "+44 20 7946 0958". 9 to 15 digits.
    id: 'phone-international',
    kind: KIND.phone,
    regex: /(?<![\w+/.=-])\+\d[\d ().-]{7,22}\d(?![\w])/g,
    accept: (value) => {
      const digits = digitCount(value);
      if (digits < 9 || digits > 15) return false;
      if (/[.-]{2}|\s{2}/.test(value)) return false;
      // "+100.000.000" is a large number with thousands separators.
      return !/^\+\d{1,3}(?:[.,]\d{3})+$/.test(value);
    },
  },
  {
    // North American form: "(415) 555-0134", "415-555-0134", "415.555.0134".
    // A date (2026-11-18), a version (6.313.0) or a hex id does not have this shape.
    id: 'phone-national',
    kind: KIND.phone,
    regex: /(?<![\w./-])(?:\(\d{3}\) ?\d{3}-\d{4}|\d{3}-\d{3}-\d{4}|\d{3}\.\d{3}\.\d{4})(?![\w-]|\.\d)/g,
  },
]);

/**
 * Find private data in a text.
 * Returns a sorted list of { start, end, kind, id, value } with no overlap.
 * The value is for masking only. Never print it.
 */
export function scan(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const found = [];
  DETECTORS.forEach((detector, priority) => {
    for (const match of text.matchAll(detector.regex)) {
      const secret = match.groups?.secret;
      const value = secret ?? match[0];
      if (detector.accept && !detector.accept(value)) continue;
      const start = secret === undefined ? match.index : match.index + match[0].lastIndexOf(secret);
      found.push({ start, end: start + value.length, kind: detector.kind, id: detector.id, priority });
    }
  });
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged = [];
  for (const hit of found) {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) {
      last.end = Math.max(last.end, hit.end);
      if (hit.priority < last.priority) {
        last.kind = hit.kind;
        last.id = hit.id;
        last.priority = hit.priority;
      }
      continue;
    }
    merged.push({ ...hit });
  }
  return merged.map(({ start, end, kind, id }) => ({ start, end, kind, id, value: text.slice(start, end) }));
}

export function placeholderFor(kind) {
  return `[removed: looked like ${kind}]`;
}

/**
 * Replace each hit with "[removed: looked like <kind>]".
 * Returns { text, hits } where hits is the output of scan().
 */
export function redact(text) {
  const hits = scan(text);
  if (hits.length === 0) return { text, hits };
  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    out += text.slice(cursor, hit.start) + placeholderFor(hit.kind);
    cursor = hit.end;
  }
  out += text.slice(cursor);
  return { text: out, hits };
}

/** A safe summary for a log line: kinds and counts, never values. */
export function summarize(hits) {
  const counts = new Map();
  for (const hit of hits) counts.set(hit.id, (counts.get(hit.id) || 0) + 1);
  return [...counts].map(([id, count]) => `${id} x${count}`).join(', ');
}

/** The ordered list of kinds that a notice names. */
export function kindsOf(hits) {
  const order = Object.values(KIND);
  return [...new Set(hits.map((hit) => hit.kind))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Read the kinds that an earlier notice named, from its hidden line. */
export function kindsFromNotice(body) {
  const line = /<!-- privacy-guard-kinds: ([^>]*) -->/.exec(body || '');
  if (!line) return [];
  const known = new Set(Object.values(KIND));
  return line[1].split('|').filter((kind) => known.has(kind));
}

/** The calm comment that the guard posts on a hit. */
export function buildNotice(kinds) {
  const list = kinds.map((kind) => `- ${kind}`).join('\n');
  const steps = [
    '- The rest of your report is still here, and we will still read it.',
    '- The original text can still be in the notification emails that GitHub already sent.',
    '- A maintainer will remove the old text from the edit history of this issue.',
  ];
  if (kinds.includes(KIND.taskadeToken)) {
    steps.push(
      `- Revoke the Taskade token now. Open [Settings, then API](${TOKEN_SETTINGS_URL}), find **Personal access tokens**, and revoke the token. Then create a new one. The [token guide](${TOKEN_DOCS_URL}) shows each step.`,
    );
  }
  if (kinds.includes(KIND.secret) || kinds.includes(KIND.privateKey)) {
    steps.push('- If the key or the token is real, revoke it in the service that made it, and create a new one.');
  }
  return [
    NOTICE_MARKER,
    `<!-- privacy-guard-kinds: ${kinds.join('|')} -->`,
    'Thank you for your report. This issue is public, so we removed text that looked like private data:',
    '',
    list,
    '',
    'What happens next:',
    '',
    ...steps,
    '',
    `If we removed something by mistake, reply here and a maintainer will help. For a question about your own account, use [taskade.com/contact](${CONTACT_URL}). That form is private.`,
  ].join('\n');
}

export function isBot(user) {
  if (!user) return true;
  return user.type === 'Bot' || /\[bot\]$/i.test(user.login || '');
}

const MAINTAINER_PERMISSIONS = new Set(['admin', 'maintain', 'write']);
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * True when the user has write access to the repository.
 * When the association is known and is not trusted, no API call is made.
 * An error counts as "not a maintainer", so the guard scans the text.
 */
export async function isMaintainer({ github, owner, repo, user, association }) {
  if (association !== undefined && !TRUSTED_ASSOCIATIONS.has(association)) return false;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: user.login });
    return MAINTAINER_PERMISSIONS.has(data.permission) || MAINTAINER_PERMISSIONS.has(data.role_name);
  } catch {
    return false;
  }
}

/**
 * The workflow entry point. It receives the objects of actions/github-script.
 * It returns a short status string for the tests.
 */
export async function runGuard({ github, context, core }) {
  const { owner, repo } = context.repo;
  const payload = context.payload;
  const isComment = context.eventName === 'issue_comment';
  const issueNumber = payload.issue.number;
  const record = isComment ? payload.comment : payload.issue;
  const author = record.user;

  if (isBot(author)) {
    core.info('Skipped: a bot wrote this text.');
    return 'skipped-bot';
  }
  if (await isMaintainer({ github, owner, repo, user: author, association: record.author_association })) {
    core.info('Skipped: a maintainer wrote this text.');
    return 'skipped-maintainer';
  }
  // A maintainer who edits the text of someone else, for example to restore
  // text that the guard removed by mistake, is not overruled.
  const sender = payload.sender;
  if (payload.action === 'edited' && sender && sender.login !== author.login) {
    if (await isMaintainer({ github, owner, repo, user: sender })) {
      core.info('Skipped: a maintainer edited this text.');
      return 'skipped-maintainer-edit';
    }
  }

  // Read the current text, not the text in the event. A later edit wins.
  let title = '';
  let body = '';
  if (isComment) {
    const { data } = await github.rest.issues.getComment({ owner, repo, comment_id: record.id });
    body = data.body || '';
  } else {
    const { data } = await github.rest.issues.get({ owner, repo, issue_number: issueNumber });
    title = data.title || '';
    body = data.body || '';
  }

  const titleResult = isComment ? { text: title, hits: [] } : redact(title);
  const bodyResult = redact(body);
  const hits = [...titleResult.hits, ...bodyResult.hits];
  for (const hit of hits) core.setSecret(hit.value);

  if (hits.length === 0) {
    core.info('No private data found.');
    return 'clean';
  }
  core.info(`Found ${hits.length} item(s): ${summarize(hits)}.`);

  if (isComment) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: record.id, body: bodyResult.text });
  } else {
    const update = { owner, repo, issue_number: issueNumber };
    if (titleResult.hits.length > 0) update.title = titleResult.text;
    if (bodyResult.hits.length > 0) update.body = bodyResult.text;
    await github.rest.issues.update(update);
  }

  await github.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [HOLD_LABEL] });

  // One notice for each issue. A later hit adds its kind to the same notice.
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const earlier = comments.find((comment) => isBot(comment.user) && (comment.body || '').startsWith(NOTICE_MARKER));
  const previousKinds = earlier ? kindsFromNotice(earlier.body) : [];
  const kinds = kindsOf([...previousKinds.map((kind) => ({ kind })), ...hits]);
  const notice = buildNotice(kinds);
  if (!earlier) {
    await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: notice });
  } else if (earlier.body !== notice) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: earlier.id, body: notice });
  }

  core.info('Removed the items, added the label and posted the notice.');
  return 'redacted';
}
