// A thing's manifest as the MCP server takes it: its size, its settings and
// its sources, checked before anything is saved. Kept apart from index.ts so
// it can be tested on its own; the sources rules are the shared ones.

import { LIMITS, sourceProblem } from './sources.ts';

type Json = Record<string, unknown>;

/** A problem to report back to whoever's building, in words. */
export class Problem extends Error {}

/** Everything wrong with a manifest, one line each (empty when it's fine). */
export function manifestProblems(manifest: unknown): string[] {
  try {
    checkManifest(manifest, { sources: false });
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const sources = (manifest as Json | null | undefined)?.sources;
  if (sources === undefined) return [];
  if (typeof sources !== 'object' || sources === null || Array.isArray(sources)) return ['manifest.sources must be an object: { "name": { … } }.'];
  const names = Object.keys(sources);
  const problems = names.length > LIMITS.sources ? [`A thing can have at most ${LIMITS.sources} sources.`] : [];
  for (const name of names) {
    const problem = sourceProblem(name, (sources as Json)[name]);
    if (problem) problems.push(problem);
  }
  return problems;
}

/** The manifest as it's kept: size, settings and sources, each checked, or the first problem with it. */
export function checkManifest(manifest: unknown, { sources = true }: { sources?: boolean } = {}): Json {
  if (manifest === undefined || manifest === null) return {};
  if (typeof manifest !== 'object' || Array.isArray(manifest)) throw new Problem('manifest must be an object.');
  const out: Json = {};
  const m = manifest as Json;
  if (m.game !== undefined) {
    if (m.game !== 'battleship') throw new Problem('manifest.game must be battleship.');
    out.game = m.game;
  }
  if (m.size !== undefined) {
    const size = m.size as { w?: unknown; h?: unknown };
    const w = Number(size?.w);
    const h = Number(size?.h);
    if (!(w >= 60 && w <= 1000 && h >= 60 && h <= 2160)) throw new Problem('manifest.size needs w between 60 and 1000 and h between 60 and 2160.');
    out.size = { w: Math.round(w), h: Math.round(h) };
  }
  if (m.settings !== undefined) {
    if (!Array.isArray(m.settings)) throw new Problem('manifest.settings must be a list.');
    for (const setting of m.settings as Json[]) {
      if (typeof setting?.key !== 'string' || typeof setting?.label !== 'string') throw new Problem('Each setting needs a "key" and a "label".');
      if (!['text', 'number', 'toggle', 'choice', 'color'].includes(String(setting.type))) throw new Problem(`Setting "${setting.key}" has an unknown type.`);
      if (setting.type === 'choice' && !Array.isArray(setting.options)) throw new Problem(`Setting "${setting.key}" needs "options".`);
    }
    out.settings = m.settings;
  }
  if (sources && m.sources !== undefined) {
    const problem = manifestProblems({ sources: m.sources })[0];
    if (problem) throw new Problem(problem);
    out.sources = m.sources;
  }
  if (JSON.stringify(out).length > 20_000) throw new Problem('manifest is too big.');
  return out;
}
