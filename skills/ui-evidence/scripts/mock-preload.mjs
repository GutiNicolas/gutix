// Local-only mock for screenshot runs: answers matching fetch() calls of a Node server from a fixtures file and
// passes everything else to the real fetch. Keep it and the fixtures outside the target repo; never commit them.
//   MOCK_FIXTURES=<fixtures.json> node --import <path>/mock-preload.mjs ./server.js
// Fixtures: { "routes": [ { "match": "<regex on the URL>", "method"?: "GET", "status"?: 200, "body": <json> } ] }
// The first matching route wins. See fixtures.example.json.
import fs from 'node:fs';
import { mockBody, mockRoute, validateFixtures } from './lib.mjs';

const fixturesPath = process.env.MOCK_FIXTURES;
if (!fixturesPath) throw new Error('mock-preload: set MOCK_FIXTURES=/path/to/fixtures.json');
let fixtures;
try { fixtures = validateFixtures(JSON.parse(fs.readFileSync(fixturesPath, 'utf8'))); } catch (error) {
  throw new Error(`mock-preload: cannot use ${fixturesPath} (${error.message})`);
}
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
  const hit = mockRoute(fixtures, url, method);
  if (hit) return new Response(mockBody(hit), { status: hit.status, headers: { 'content-type': 'application/json' } });
  return realFetch(input, init);
};

console.log(`mock-preload: ${fixtures.routes.length} routes from ${fixturesPath}`);
