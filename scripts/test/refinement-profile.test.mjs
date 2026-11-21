// The example in feature-intake's refinement-profile.md is what org authors copy, so it must carry every field of
// the publish-file contract, and the doc must keep pointing at the resolver that finds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const doc = fs.readFileSync(path.join(root, 'skills/feature-intake/references/refinement-profile.md'), 'utf8');

test('the profile example parses and has every contract field', () => {
  const [, json] = /## Example[\s\S]*?```json\n([\s\S]*?)\n```/.exec(doc);
  const p = JSON.parse(json);
  assert.deepEqual(Object.keys(p).sort(), ['doc', 'estimate', 'language', 'team', 'tracker', 'vocabulary']);
  assert.deepEqual(Object.keys(p.doc).sort(), ['destination', 'examples', 'template']);
  assert.deepEqual(Object.keys(p.tracker).sort(), ['assigneeRequired', 'epicLinkField', 'project', 'storyType', 'taskType']);
  assert.deepEqual(Object.keys(p.estimate).sort(), ['emptyRowFor', 'references', 'teams', 'unit']);
  assert.ok(Array.isArray(p.doc.examples) && Array.isArray(p.estimate.teams) && Array.isArray(p.estimate.references) && Array.isArray(p.vocabulary));
  assert.equal(typeof p.tracker.assigneeRequired, 'boolean');
  assert.ok(p.estimate.teams.includes(p.estimate.emptyRowFor), 'emptyRowFor is one of the estimate teams');
});

test('the resolver the doc links to exists and exports resolveOrg', () => {
  const rel = /\]\((\.\.\/\.\.\/design-doc\/scripts\/org\.mjs)\)/.exec(doc)?.[1];
  assert.ok(rel, 'link to org.mjs');
  const target = path.join(root, 'skills/feature-intake/references', rel);
  assert.match(fs.readFileSync(target, 'utf8'), /export function resolveOrg/);
});
