import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageAt } from './validate.mjs';

function fixture(t, overrides = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'acre-thing-test-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'thing'); mkdirSync(dir);
  const thing = { name: 'Test', description: 'Fixture', icon: 'ship', color: '#123456', author: 'test_user', license: 'MIT', ...overrides.thing };
  const manifest = { size: { w: 100, h: 100 }, ...overrides.manifest };
  writeFileSync(join(dir, 'thing.json'), JSON.stringify(thing));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'code.html'), overrides.code ?? '<p>hello</p>');
  return { base, dir };
}

test('accepts a valid package and returns the checked manifest', t => {
  const { dir } = fixture(t);
  const result = packageAt(dir);
  assert.equal(result.thing.author, 'test_user');
  assert.equal(result.code, '<p>hello</p>');
  assert.deepEqual(result.manifest.size, { w: 100, h: 100 });
});

test('rejects malformed author handles and invalid thing identifiers', t => {
  const { dir } = fixture(t, { thing: { author: 'Not a handle' } });
  assert.throws(() => packageAt(dir), /author must be your Acre handle/);
  const second = fixture(t, { thing: { id: 'not-a-uuid' } });
  assert.throws(() => packageAt(second.dir), /id must be a published Acre thing UUID/);
});

test('rejects unsafe external resources and unknown manifest fields', t => {
  const external = fixture(t, { code: '<img src="https://example.com/x.png">' });
  assert.throws(() => packageAt(external.dir), /external resources and frames are blocked/);
  const extra = fixture(t, { manifest: { surprise: true } });
  assert.throws(() => packageAt(extra.dir), /Unknown manifest field/);
});

test('rejects a symlink in package input', t => {
  const { dir, base } = fixture(t);
  const target = join(base, 'outside.html'); writeFileSync(target, '<p>outside</p>');
  rmSync(join(dir, 'code.html'));
  // Symlinks are rejected even when their target is a regular file.
  symlinkSync(target, join(dir, 'code.html'));
  assert.throws(() => packageAt(dir), /use a regular file/);
});

test('publisher checks author attribution against the authenticated profile before writes', t => {
  const { dir } = fixture(t);
  const mock = join(tmpdir(), `acre-fetch-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(mock, `
    globalThis.fetch = async (url) => ({
      ok: true, status: 200,
      json: async () => String(url).includes('/auth/v1/user') ? { id: 'user-1' } : [{ handle: 'someone_else' }]
    });
  `);
  t.after(() => rmSync(mock, { force: true }));
  const run = spawnSync(process.execPath, ['--import', mock, 'scripts/publish.mjs', dir], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
    env: { ...process.env, ACRE_URL: 'https://acre.example', ACRE_ANON_KEY: 'public', ACRE_ACCESS_TOKEN: 'token' },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Sign in as the author declared in thing\.json/);
});
