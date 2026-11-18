// Tests for privacy-guard.mjs. Run: node --test .github/scripts/
//
// Every fake secret is built at run time from parts, so that this file holds
// no string in the format of a real secret.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND,
  HOLD_LABEL,
  NOTICE_MARKER,
  TOKEN_SETTINGS_URL,
  scan,
  redact,
  buildNotice,
  kindsFromNotice,
  runGuard,
} from './privacy-guard.mjs';

// 36 mixed characters with no word in them.
const MIX = ['Q7wE2r', 'T9yU4i', 'O1pA6s', 'D3fG8h', 'J5kL0z', 'XcVbNm'].join('');
const fake = {
  taskade: () => ['tsk', 'dp_', MIX.slice(0, 24)].join(''),
  ghp: () => ['gh', 'p_', MIX].join(''),
  gho: () => ['gh', 'o_', MIX].join(''),
  pat: () => ['github', '_pat_', MIX, '_', MIX.slice(0, 20)].join(''),
  sk: () => ['s', 'k-', 'proj-', MIX].join(''),
  stripe: () => ['sk', '_live_', MIX.slice(0, 24)].join(''),
  aws: () => ['AK', 'IA', 'Q7WE2RT9YU4IO1PA'].join(''),
  slack: () => ['xo', 'xb-', '1234567890-', MIX.slice(0, 20)].join(''),
  jwt: () => ['ey', 'JhbGciOiJIUzI1NiJ9', '.', 'ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0', '.', MIX.slice(0, 20)].join(''),
  keyBlock: () =>
    ['-----BEGIN ', 'RSA PRIVATE KEY-----', '\n', MIX, '\n', MIX, '\n', '-----END ', 'RSA PRIVATE KEY-----'].join(''),
};

function kinds(text) {
  return scan(text).map((hit) => hit.kind);
}

function assertFlags(text, kind) {
  const found = kinds(text);
  assert.ok(found.includes(kind), `expected "${kind}", got ${JSON.stringify(found)}`);
}

function assertClean(text) {
  assert.deepEqual(kinds(text), [], `expected no hit in: ${text}`);
}

// ---- Must flag ----

test('flags a Taskade token', () => {
  assertFlags(`My token is ${fake.taskade()} and it fails.`, KIND.taskadeToken);
});

test('flags a GitHub classic token', () => {
  assertFlags(`token=${fake.ghp()}`, KIND.secret);
});

test('flags a GitHub OAuth token', () => {
  assertFlags(fake.gho(), KIND.secret);
});

test('flags a GitHub fine-grained token', () => {
  assertFlags(`GH_TOKEN=${fake.pat()}`, KIND.secret);
});

test('flags an sk- key', () => {
  assertFlags(`OPENAI_API_KEY=${fake.sk()}`, KIND.secret);
});

test('flags a Stripe live key', () => {
  assertFlags(`stripe key: ${fake.stripe()}`, KIND.secret);
});

test('flags an AWS access key id', () => {
  assertFlags(`aws_access_key_id = ${fake.aws()}`, KIND.secret);
});

test('flags a Slack token', () => {
  assertFlags(`SLACK=${fake.slack()}`, KIND.secret);
});

test('flags a JWT', () => {
  assertFlags(`cookie: session=${fake.jwt()}`, KIND.secret);
});

test('flags a private key block', () => {
  assertFlags(`Here is my key:\n${fake.keyBlock()}\nThanks`, KIND.privateKey);
});

test('flags an Authorization: Bearer value', () => {
  assertFlags('curl -H "Authorization: Bearer abc123def456ghi789jkl"', KIND.secret);
});

test('flags an email address', () => {
  assertFlags('Please write to jane.doe+work@gmail.com about it.', KIND.email);
});

test('flags an international phone number', () => {
  assertFlags('Call me at +1 (415) 555-0134 today.', KIND.phone);
  assertFlags('WhatsApp +44 20 7946 0958', KIND.phone);
});

test('flags a North American phone number', () => {
  assertFlags('My number is 415-555-0134.', KIND.phone);
  assertFlags('Office: (415) 555-0134', KIND.phone);
});

for (const [name, url] of [
  ['a workspace link', 'https://www.taskade.com/spaces/aBc123XyZ'],
  ['a project link', 'https://www.taskade.com/p/aBc123XyZ'],
  ['a document link', 'https://www.taskade.com/d/aBc123XyZ'],
  ['an /e/ link', 'https://www.taskade.com/e/aBc123XyZ'],
  ['a /v/ link', 'https://www.taskade.com/v/aBc123XyZ'],
  ['a link without www', 'https://taskade.com/p/aBc123XyZ'],
  ['a link without the scheme', 'see www.taskade.com/spaces/aBc123XyZ/apps'],
  ['a link inside Markdown', '[my project](https://www.taskade.com/p/aBc123XyZ)'],
]) {
  test(`flags ${name}`, () => {
    assertFlags(url, KIND.privateLink);
  });
}

// ---- Must not flag ----

test('does not flag a public share link or public pages', () => {
  assertClean('My app: https://www.taskade.com/share/apps/aBc123XyZ');
  assertClean(
    'See https://www.taskade.com/apps, https://www.taskade.com/create, https://www.taskade.com/docs, ' +
      'https://www.taskade.com/learn, https://www.taskade.com/blog and https://www.taskade.com/pricing.',
  );
});

test('does not flag the public Taskade addresses', () => {
  assertClean('Write to security@taskade.com, support@taskade.com or hello@taskade.com.');
  assertClean('[email us](mailto:Security@Taskade.com)');
});

test('does not flag a GitHub noreply address or an example address', () => {
  assertClean('Signed-off-by: Jane <12345+jane@users.noreply.github.com>');
  assertClean('Use you@example.com in the sign-in form.');
});

test('does not flag version strings', () => {
  assertClean('Web app v6.313.0 on macOS 15.1, Chrome 142.0.7444.60, npx @taskade/mcp-server@1.4.2');
});

test('does not flag dates and times', () => {
  assertClean('It broke on 2026-11-18 at 10:42, or 18/11/2026, or 2026-11-18T10:00:00+05:30.');
});

test('does not flag a hex colour', () => {
  assertClean('The button is #ff2d60 and the text is #1A1A1A.');
});

test('does not flag a git SHA', () => {
  assertClean('Fixed in commit 452703bd72c4e1f0a9b8d7c6e5f4a3b2c1d0e9f8.');
});

test('does not flag a normal sentence about a token', () => {
  assertClean('I created a token in Settings, but the token does not work and I get a 401.');
  assertClean('Send it as a Bearer token on every request.');
});

test('does not flag a Markdown link to the docs', () => {
  assertClean('[Personal access tokens](https://www.taskade.com/docs/getting-started/personal-tokens)');
});

test('does not flag placeholders that the docs use', () => {
  assertClean('export TASKADE_TOKEN="tskdp_your_token_here"');
  assertClean('-H "Authorization: Bearer $TASKADE_TOKEN"');
  assertClean(['gh', 'p_', 'x'.repeat(36)].join(''));
});

test('does not flag a file name with @2x or a social handle', () => {
  assertClean('![logo](media/logo@2x.png)');
  assertClean('https://www.youtube.com/@%D0%A0%D0%B0%D1%81');
});

test('does not flag large numbers and ids', () => {
  assertClean('I have +100.000.000 credits, order 1234567890, and issue #30.');
  assertClean('id 9f8e7d6c-5b4a-3210-fedc-ba9876543210');
});

// ---- Redaction ----

test('redact replaces each hit and keeps the rest', () => {
  const input = `Mail jane@acme.io and use ${fake.taskade()} please.`;
  const { text, hits } = redact(input);
  assert.equal(hits.length, 2);
  assert.equal(
    text,
    'Mail [removed: looked like an email address] and use [removed: looked like a Taskade token] please.',
  );
});

test('redacted text has no hit on a second pass', () => {
  const once = redact(`${fake.keyBlock()} ${fake.ghp()} +1 415 555 0134 https://www.taskade.com/p/x1`).text;
  assert.deepEqual(scan(once), []);
});

test('a Bearer header with a Taskade token gives one Taskade token hit', () => {
  const hits = scan(`Authorization: Bearer ${fake.taskade()}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, KIND.taskadeToken);
});

test('a key block with no end line is removed to the end of the text', () => {
  const input = 'key:\n' + ['-----BEGIN ', 'PRIVATE KEY-----'].join('') + '\n' + MIX;
  assert.equal(redact(input).text, 'key:\n[removed: looked like a private key]');
});

// ---- Notice ----

test('the notice names the kinds and never a value', () => {
  const notice = buildNotice([KIND.taskadeToken, KIND.email]);
  assert.ok(notice.startsWith(NOTICE_MARKER));
  assert.ok(notice.includes('- a Taskade token'));
  assert.ok(notice.includes(TOKEN_SETTINGS_URL));
  assert.ok(notice.includes('notification emails'));
  assert.ok(notice.includes('edit history'));
  assert.deepEqual(kindsFromNotice(notice), [KIND.taskadeToken, KIND.email]);
  assert.deepEqual(scan(notice), []);
});

test('the notice has no token step when no token was found', () => {
  assert.ok(!buildNotice([KIND.email]).includes(TOKEN_SETTINGS_URL));
});

// ---- runGuard with a fake GitHub client ----

function fakeGithub({ issue, comment, permission = 'read', comments = [] }) {
  const calls = [];
  const record = (name) => async (args) => {
    calls.push({ name, args });
    return { data: {} };
  };
  const github = {
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission, role_name: permission } }),
      },
      issues: {
        get: async () => ({ data: issue }),
        getComment: async () => ({ data: comment }),
        update: record('update'),
        updateComment: record('updateComment'),
        addLabels: record('addLabels'),
        createComment: record('createComment'),
        listComments: async () => ({ data: comments }),
      },
    },
    paginate: async () => comments,
  };
  return { github, calls };
}

function fakeCore() {
  const secrets = [];
  const lines = [];
  return {
    secrets,
    lines,
    setSecret: (value) => secrets.push(value),
    info: (line) => lines.push(line),
  };
}

function issueContext(issue) {
  return {
    eventName: 'issues',
    repo: { owner: 'taskade', repo: 'taskade' },
    payload: { action: 'opened', issue },
  };
}

test('runGuard removes a hit, adds the label, posts one notice and masks the value', async () => {
  const email = 'jane@acme.io';
  const issue = {
    number: 7,
    title: 'Login fails',
    body: `My account is ${email}.`,
    user: { login: 'jane', type: 'User' },
    author_association: 'NONE',
  };
  const { github, calls } = fakeGithub({ issue });
  const core = fakeCore();
  const status = await runGuard({ github, context: issueContext(issue), core });

  assert.equal(status, 'redacted');
  assert.deepEqual(core.secrets, [email]);
  assert.ok(core.lines.every((line) => !line.includes(email)));
  const update = calls.find((call) => call.name === 'update');
  assert.equal(update.args.body, 'My account is [removed: looked like an email address].');
  assert.equal(update.args.title, undefined);
  assert.deepEqual(calls.find((call) => call.name === 'addLabels').args.labels, [HOLD_LABEL]);
  const notice = calls.find((call) => call.name === 'createComment').args.body;
  assert.ok(notice.includes('an email address'));
  assert.ok(!notice.includes(email));
});

test('runGuard makes no change on a clean issue', async () => {
  const issue = {
    number: 8,
    title: 'Board view is slow',
    body: 'It takes 10 seconds on v6.313.0.',
    user: { login: 'sam', type: 'User' },
    author_association: 'NONE',
  };
  const { github, calls } = fakeGithub({ issue });
  assert.equal(await runGuard({ github, context: issueContext(issue), core: fakeCore() }), 'clean');
  assert.deepEqual(calls, []);
});

test('runGuard skips a bot', async () => {
  const issue = { number: 9, title: 'x', body: 'jane@acme.io', user: { login: 'renovate[bot]', type: 'Bot' } };
  const { github, calls } = fakeGithub({ issue });
  assert.equal(await runGuard({ github, context: issueContext(issue), core: fakeCore() }), 'skipped-bot');
  assert.deepEqual(calls, []);
});

test('runGuard skips a maintainer with write access', async () => {
  const issue = {
    number: 10,
    title: 'Pattern list',
    body: 'The guard removes text like jane@acme.io.',
    user: { login: 'maintainer', type: 'User' },
    author_association: 'MEMBER',
  };
  const { github, calls } = fakeGithub({ issue, permission: 'write' });
  assert.equal(await runGuard({ github, context: issueContext(issue), core: fakeCore() }), 'skipped-maintainer');
  assert.deepEqual(calls, []);
});

test('runGuard scans an org member who has only read access', async () => {
  const issue = {
    number: 11,
    title: 'x',
    body: 'jane@acme.io',
    user: { login: 'reader', type: 'User' },
    author_association: 'MEMBER',
  };
  const { github } = fakeGithub({ issue, permission: 'read' });
  assert.equal(await runGuard({ github, context: issueContext(issue), core: fakeCore() }), 'redacted');
});

test('runGuard edits a comment and adds a new kind to the existing notice', async () => {
  const comment = {
    id: 55,
    body: 'Call me on +44 20 7946 0958',
    user: { login: 'jane', type: 'User' },
    author_association: 'NONE',
  };
  const earlier = {
    id: 99,
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: buildNotice([KIND.email]),
  };
  const { github, calls } = fakeGithub({ comment, comments: [earlier] });
  const context = {
    eventName: 'issue_comment',
    repo: { owner: 'taskade', repo: 'taskade' },
    payload: { action: 'created', issue: { number: 12 }, comment },
  };
  assert.equal(await runGuard({ github, context, core: fakeCore() }), 'redacted');
  const edits = calls.filter((call) => call.name === 'updateComment');
  assert.equal(edits[0].args.comment_id, 55);
  assert.equal(edits[0].args.body, 'Call me on [removed: looked like a phone number]');
  assert.equal(edits[1].args.comment_id, 99);
  assert.deepEqual(kindsFromNotice(edits[1].args.body), [KIND.email, KIND.phone]);
  assert.equal(calls.filter((call) => call.name === 'createComment').length, 0);
});

test('runGuard does not overrule a maintainer who edits the text of a reporter', async () => {
  const issue = {
    number: 13,
    title: 'x',
    body: 'Restored text: call 415-555-0134',
    user: { login: 'jane', type: 'User' },
    author_association: 'NONE',
  };
  const { github, calls } = fakeGithub({ issue, permission: 'admin' });
  const context = issueContext(issue);
  context.payload.action = 'edited';
  context.payload.sender = { login: 'maintainer', type: 'User' };
  assert.equal(await runGuard({ github, context, core: fakeCore() }), 'skipped-maintainer-edit');
  assert.deepEqual(calls, []);
});

test('runGuard still scans when the reporter edits their own issue', async () => {
  const issue = {
    number: 14,
    title: 'x',
    body: 'New detail: call 415-555-0134',
    user: { login: 'jane', type: 'User' },
    author_association: 'NONE',
  };
  const { github } = fakeGithub({ issue, permission: 'read' });
  const context = issueContext(issue);
  context.payload.action = 'edited';
  context.payload.sender = { login: 'jane', type: 'User' };
  assert.equal(await runGuard({ github, context, core: fakeCore() }), 'redacted');
});
