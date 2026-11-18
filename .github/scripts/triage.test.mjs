// Tests for triage.mjs and lifecycle.mjs. Run: node --test .github/scripts/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AREA_LABELS, labelsFor, readAnswer, runTriage } from './triage.mjs';
import { CLOSE_MARKER, lastLabeledAt, runAuthorReply, runSweep, shouldClose } from './lifecycle.mjs';

const productBody = [
  '### What did you do?',
  '',
  '1. I clicked Publish.',
  '',
  '### Which part of Taskade?',
  '',
  'AI agents',
  '',
  '### Your plan',
  '',
  'Pro',
].join('\n');

test('readAnswer reads the answer under a heading', () => {
  assert.equal(readAnswer(productBody, 'Which part of Taskade?'), 'AI agents');
  assert.equal(readAnswer(productBody, 'Missing heading'), null);
  assert.equal(readAnswer('### Which part of Taskade?\n\n_No response_\n', 'Which part of Taskade?'), null);
});

test('a product bug gets bug and its area label', () => {
  assert.deepEqual(labelsFor(productBody), ['bug', 'area:agents']);
});

test('the answer "Other" gets no area label', () => {
  assert.deepEqual(labelsFor('### Which part of Taskade?\n\nOther\n'), ['bug']);
});

test('each other form gets its type label', () => {
  assert.deepEqual(labelsFor('### What problem do you want to solve?\n\nReports'), ['enhancement']);
  assert.deepEqual(labelsFor('### What kit do you want?\n\nA CRM'), ['app-kit-request']);
  assert.deepEqual(labelsFor('### Which page?\n\nx\n\n### What is wrong or missing?\n\nA link'), ['documentation']);
});

test('a free-form issue gets no label', () => {
  assert.deepEqual(labelsFor('The board is slow.'), []);
  assert.deepEqual(labelsFor(null), []);
});

test('every area option in product_bug.yml has a mapping', () => {
  const form = readFileSync(new URL('../ISSUE_TEMPLATE/product_bug.yml', import.meta.url), 'utf8');
  const block = form.split('id: area')[1].split('validations:')[0];
  const options = [...block.matchAll(/^\s+- (.+)$/gm)].map((match) => match[1].trim());
  assert.ok(options.length >= 10);
  assert.deepEqual(options.sort(), Object.keys(AREA_LABELS).sort());
});

test('every label that the scripts add is in labels.yml', () => {
  const file = readFileSync(new URL('../labels.yml', import.meta.url), 'utf8');
  const names = new Set([...file.matchAll(/^- name: "?([^"\n]+)"?$/gm)].map((match) => match[1]));
  const used = ['bug', 'enhancement', 'app-kit-request', 'documentation', 'needs-info', 'privacy-hold'];
  for (const label of [...used, ...Object.values(AREA_LABELS).filter(Boolean)]) {
    assert.ok(names.has(label), `missing label ${label}`);
  }
});

test('runTriage adds the labels in one call', async () => {
  const calls = [];
  const github = { rest: { issues: { addLabels: async (args) => calls.push(args) } } };
  const context = { repo: { owner: 'taskade', repo: 'taskade' }, payload: { issue: { number: 3, body: productBody } } };
  await runTriage({ github, context, core: { info() {} } });
  assert.deepEqual(calls, [{ owner: 'taskade', repo: 'taskade', issue_number: 3, labels: ['bug', 'area:agents'] }]);
});

// ---- Lifecycle ----

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-12-01T00:00:00Z');

test('shouldClose is true after 14 days with no reply from the author', () => {
  const labeledAt = new Date(now.getTime() - 15 * day);
  assert.equal(shouldClose({ labeledAt, authorReplies: [], now }), true);
});

test('shouldClose is false before 14 days', () => {
  const labeledAt = new Date(now.getTime() - 13 * day);
  assert.equal(shouldClose({ labeledAt, authorReplies: [], now }), false);
});

test('shouldClose is false when the author replied after the label', () => {
  const labeledAt = new Date(now.getTime() - 20 * day);
  const reply = new Date(now.getTime() - 19 * day);
  assert.equal(shouldClose({ labeledAt, authorReplies: [reply], now }), false);
});

test('lastLabeledAt takes the last needs-info label event', () => {
  const events = [
    { event: 'labeled', label: { name: 'needs-info' }, created_at: '2026-11-01T00:00:00Z' },
    { event: 'labeled', label: { name: 'bug' }, created_at: '2026-11-05T00:00:00Z' },
    { event: 'labeled', label: { name: 'needs-info' }, created_at: '2026-11-10T00:00:00Z' },
  ];
  assert.equal(lastLabeledAt(events).toISOString(), '2026-11-10T00:00:00.000Z');
  assert.equal(lastLabeledAt([]), null);
});

function sweepGithub({ issues, events, comments }) {
  const calls = [];
  const github = {
    rest: {
      issues: {
        listForRepo: 'listForRepo',
        listEvents: 'listEvents',
        listComments: 'listComments',
        createComment: async (args) => calls.push({ name: 'createComment', args }),
        update: async (args) => calls.push({ name: 'update', args }),
        removeLabel: async (args) => calls.push({ name: 'removeLabel', args }),
      },
    },
    paginate: async (method, args) => {
      if (method === 'listForRepo') return issues;
      if (method === 'listEvents') return events[args.issue_number] || [];
      return comments[args.issue_number] || [];
    },
  };
  return { github, calls };
}

test('runSweep closes only the issue with no reply', async () => {
  const old = new Date(now.getTime() - 20 * day).toISOString();
  const issues = [
    { number: 1, user: { login: 'amy' }, labels: [{ name: 'needs-info' }] },
    { number: 2, user: { login: 'bob' }, labels: [{ name: 'needs-info' }] },
  ];
  const events = {
    1: [{ event: 'labeled', label: { name: 'needs-info' }, created_at: old }],
    2: [{ event: 'labeled', label: { name: 'needs-info' }, created_at: old }],
  };
  const comments = { 2: [{ user: { login: 'bob' }, created_at: new Date(now.getTime() - day).toISOString() }] };
  const { github, calls } = sweepGithub({ issues, events, comments });
  const closed = await runSweep({ github, context: { repo: { owner: 'o', repo: 'r' } }, core: { info() {} }, now });
  assert.deepEqual(closed, [1]);
  assert.ok(calls[0].args.body.startsWith(CLOSE_MARKER));
  assert.equal(calls[1].args.state, 'closed');
});

test('runAuthorReply removes the label and opens an issue that the sweep closed', async () => {
  const { github, calls } = sweepGithub({
    issues: [],
    events: {},
    comments: { 4: [{ user: { type: 'Bot' }, body: `${CLOSE_MARKER}\nWe close this issue` }] },
  });
  const context = {
    repo: { owner: 'o', repo: 'r' },
    payload: {
      issue: { number: 4, state: 'closed', user: { login: 'amy' }, labels: [{ name: 'needs-info' }] },
      comment: { user: { login: 'amy' } },
    },
  };
  assert.equal(await runAuthorReply({ github, context, core: { info() {} } }), 'reopened');
  assert.deepEqual(
    calls.map((call) => call.name),
    ['removeLabel', 'update'],
  );
});

test('runAuthorReply ignores a comment from someone else', async () => {
  const { github, calls } = sweepGithub({ issues: [], events: {}, comments: {} });
  const context = {
    repo: { owner: 'o', repo: 'r' },
    payload: {
      issue: { number: 5, state: 'open', user: { login: 'amy' }, labels: [{ name: 'needs-info' }] },
      comment: { user: { login: 'zed' } },
    },
  };
  assert.equal(await runAuthorReply({ github, context, core: { info() {} } }), 'skipped');
  assert.deepEqual(calls, []);
});
