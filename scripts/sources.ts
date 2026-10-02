// What a thing's manifest may say about sources, and how one of its requests
// is built: the one copy of these rules. The `sources` function checks every
// request against them; the MCP and the app's builder use them to say what's
// wrong before anything is published. Plain TypeScript with no imports and
// nothing of Deno's, so all three can load it.
//
// A thing's code is public, so nothing here trusts it: the owner's base URL
// and token stay on the server, and a page can only name a read or an action
// its manifest declared, and fill an action's {placeholders}.

export type SourceAuth = 'bearer' | 'none' | { header: string };
export type SourceRequest = { path: string; query?: Record<string, string>; about?: string };
/** One field an action's body may carry, and what it may hold. */
export type BodyLeaf =
  | { type: 'string'; max?: number; enum?: string[]; format?: 'date' | 'datetime'; nullable?: boolean }
  | { type: 'number'; min?: number; max?: number; integer?: boolean; nullable?: boolean }
  | { type: 'boolean'; nullable?: boolean };
export type BodyField = BodyLeaf | { type: 'object'; fields: Record<string, BodyLeaf>; nullable?: boolean };
export type SourceAction = SourceRequest & { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: Record<string, BodyField> };
export type SourceDefinition = {
  label: string;
  /** A base URL to suggest; the owner enters their own. */
  url?: string;
  auth?: SourceAuth;
  reads?: Record<string, SourceRequest>;
  actions?: Record<string, SourceAction>;
};
export type Sources = Record<string, SourceDefinition>;

/** Names of sources, reads, actions and placeholders. */
export const NAME = /^[a-z][a-z0-9_]{0,31}$/;
/** What a page may fill a placeholder with. */
export const PARAM = /^[A-Za-z0-9_-]{1,128}$/;
const PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;
const PLACEHOLDER = /\{([a-z][a-z0-9_]{0,31})\}/g;
const QUERY_KEY = /^[A-Za-z0-9._~-]{1,64}$/;
const HEADER = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
const HEADERS_NOT_ALLOWED = ['host', 'cookie', 'content-length', 'content-type', 'transfer-encoding', 'connection', 'origin', 'referer', 'user-agent', 'accept', 'accept-encoding'];
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
/** Hosts that only mean something inside a network. */
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

export const LIMITS = { sources: 4, reads: 16, actions: 16, label: 40, url: 300, path: 300, query: 16, value: 300, token: 4096, about: 80, fields: 16, string: 2000, enum: 32, choice: 100, body: 8192 };
/** Names of body fields: as an API spells them (camelCase too), never one that means something to an object. */
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const RESERVED = ['__proto__', 'constructor', 'prototype'];
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_MAX = 300;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A record's own entry, never one inherited (so `__proto__` and `constructor` are just names). */
export const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

// MARK: Manifests

/** What's wrong with a request's path and query, if anything. */
function requestProblem(where: string, request: unknown, placeholders: boolean): string | null {
  if (!isObject(request)) return `${where} must be an object with a "path".`;
  const { path, query, about } = request;
  if (about !== undefined && (typeof about !== 'string' || !about.trim() || about.length > LIMITS.about)) return `${where}.about must be 1 to ${LIMITS.about} characters.`;
  if (typeof path !== 'string' || !path.startsWith('/')) return `${where}.path must start with "/".`;
  if (path.length > LIMITS.path) return `${where}.path is longer than ${LIMITS.path} characters.`;
  if (!placeholders && path.includes('{')) return `${where}.path can't have {placeholders}: only an action's can.`;
  const plain = path.replace(PLACEHOLDER, 'x');
  if (!PATH.test(plain)) return `${where}.path has a character a path can't: use letters, digits and - . _ ~ ! $ & ' ( ) * + , ; = : @ % /.`;
  if (plain.includes('//')) return `${where}.path can't have "//".`;
  if (plain.split('/').some((segment) => segment === '.' || segment === '..')) return `${where}.path can't have "." or ".." segments.`;
  if (/%(2e|2f|5c)/i.test(plain)) return `${where}.path can't encode ".", "/" or "\\".`;
  if (/%(?![0-9A-Fa-f]{2})/.test(plain)) return `${where}.path has a "%" that isn't followed by two hex digits.`;
  if (query !== undefined) {
    if (!isObject(query)) return `${where}.query must be an object of strings.`;
    const keys = Object.keys(query);
    if (keys.length > LIMITS.query) return `${where}.query has more than ${LIMITS.query} keys.`;
    for (const key of keys) {
      if (!QUERY_KEY.test(key)) return `${where}.query key "${key}" can only use letters, digits and - . _ ~.`;
      const value = query[key];
      if (typeof value !== 'string' || value.length > LIMITS.value) return `${where}.query.${key} must be a string of at most ${LIMITS.value} characters.`;
    }
  }
  return null;
}

/** What's wrong with one source's declaration, if anything. */
export function sourceProblem(name: string, source: unknown): string | null {
  const where = `sources.${name}`;
  if (!NAME.test(name)) return `Source "${name}" needs a name of lowercase letters, digits and _, starting with a letter.`;
  if (!isObject(source)) return `${where} must be an object.`;
  const { label, url, auth, reads, actions } = source;
  if (typeof label !== 'string' || !label.trim() || label.length > LIMITS.label) return `${where}.label must be 1 to ${LIMITS.label} characters.`;
  if (url !== undefined) {
    const checked = checkBaseUrl(url);
    if (checked.problem) return `${where}.url: ${checked.problem}`;
  }
  if (auth !== undefined && auth !== 'bearer' && auth !== 'none') {
    const header = isObject(auth) ? auth.header : undefined;
    if (typeof header !== 'string' || !HEADER.test(header)) return `${where}.auth is "bearer", "none" or { "header": "X-Api-Key" }.`;
    const lower = header.toLowerCase();
    if (HEADERS_NOT_ALLOWED.includes(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-')) return `${where}.auth can't use the ${header} header.`;
  }
  if (reads !== undefined && !isObject(reads)) return `${where}.reads must be an object.`;
  if (actions !== undefined && !isObject(actions)) return `${where}.actions must be an object.`;
  const readNames = Object.keys(reads ?? {});
  const actionNames = Object.keys(actions ?? {});
  if (readNames.length === 0 && actionNames.length === 0) return `${where} needs at least one read or action.`;
  if (readNames.length > LIMITS.reads) return `${where} has more than ${LIMITS.reads} reads.`;
  if (actionNames.length > LIMITS.actions) return `${where} has more than ${LIMITS.actions} actions.`;
  for (const read of readNames) {
    if (!NAME.test(read)) return `${where}.reads: "${read}" needs a name of lowercase letters, digits and _.`;
    if (Object.hasOwn((reads as Record<string, object>)[read] ?? {}, 'body')) return `${where}.reads.${read} can't have a body: a read is a GET.`;
    const problem = requestProblem(`${where}.reads.${read}`, (reads as Record<string, unknown>)[read], false);
    if (problem) return problem;
  }
  for (const action of actionNames) {
    if (!NAME.test(action)) return `${where}.actions: "${action}" needs a name of lowercase letters, digits and _.`;
    const request = (actions as Record<string, unknown>)[action];
    const problem = requestProblem(`${where}.actions.${action}`, request, true);
    if (problem) return problem;
    const method = (request as Record<string, unknown>).method;
    if (typeof method !== 'string' || !METHODS.includes(method)) return `${where}.actions.${action}.method is POST, PUT, PATCH or DELETE.`;
    const body = (request as Record<string, unknown>).body;
    if (body !== undefined) {
      if (method === 'DELETE') return `${where}.actions.${action} can't have a body: a DELETE sends none.`;
      const problem = bodyProblem(`${where}.actions.${action}.body`, body, true);
      if (problem) return problem;
    }
  }
  return null;
}

const LEAF_KEYS: Record<string, string[]> = {
  string: ['type', 'max', 'enum', 'format', 'nullable'],
  number: ['type', 'min', 'max', 'integer', 'nullable'],
  boolean: ['type', 'nullable'],
  object: ['type', 'fields', 'nullable'],
};

/** What's wrong with a declared body (or, one level down, an object field's fields), if anything. */
function bodyProblem(where: string, body: unknown, top: boolean): string | null {
  if (!isObject(body)) return `${where} must be an object of fields.`;
  const names = Object.keys(body);
  if (names.length === 0) return `${where} needs at least one field.`;
  if (names.length > LIMITS.fields) return `${where} has more than ${LIMITS.fields} fields.`;
  for (const name of names) {
    if (!FIELD.test(name) || RESERVED.includes(name)) return `${where}: "${name}" needs a name of letters, digits and _, starting with a letter.`;
    const at = `${where}.${name}`;
    const spec = body[name];
    if (!isObject(spec) || typeof spec.type !== 'string' || !Object.hasOwn(LEAF_KEYS, spec.type)) return `${at}.type is string, number, boolean or object.`;
    for (const key of Object.keys(spec)) if (!LEAF_KEYS[spec.type].includes(key)) return `${at} can't have "${key}".`;
    if (spec.nullable !== undefined && typeof spec.nullable !== 'boolean') return `${at}.nullable is true or false.`;
    if (spec.type === 'string') {
      if (spec.max !== undefined && !(Number.isInteger(spec.max) && (spec.max as number) >= 1 && (spec.max as number) <= LIMITS.string)) return `${at}.max is a whole number from 1 to ${LIMITS.string}.`;
      if (spec.format !== undefined && spec.format !== 'date' && spec.format !== 'datetime') return `${at}.format is "date" or "datetime".`;
      if (spec.enum !== undefined) {
        const list = spec.enum;
        if (!Array.isArray(list) || list.length === 0 || list.length > LIMITS.enum) return `${at}.enum is a list of 1 to ${LIMITS.enum} strings.`;
        if (list.some((choice) => typeof choice !== 'string' || !choice || choice.length > LIMITS.choice)) return `${at}.enum's values are strings of 1 to ${LIMITS.choice} characters.`;
      }
    }
    if (spec.type === 'number') {
      for (const key of ['min', 'max'] as const) if (spec[key] !== undefined && !Number.isFinite(spec[key])) return `${at}.${key} is a finite number.`;
      if (typeof spec.min === 'number' && typeof spec.max === 'number' && spec.min > spec.max) return `${at}.min is more than its max.`;
      if (spec.integer !== undefined && typeof spec.integer !== 'boolean') return `${at}.integer is true or false.`;
    }
    if (spec.type === 'object') {
      if (!top) return `${at} can't be an object: a body is one level deep.`;
      const problem = bodyProblem(`${at}.fields`, spec.fields, false);
      if (problem) return problem;
    }
  }
  return null;
}

/** Whether a string is a real calendar day, written YYYY-MM-DD. */
function isDate(value: string) {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!found) return false;
  const day = new Date(Date.UTC(Number(found[1]), Number(found[2]) - 1, Number(found[3])));
  return day.toISOString().slice(0, 10) === value;
}

/** Whether a string is an ISO 8601 moment the regex allows and that a Date reads back. */
function isDatetime(value: string) {
  return DATETIME.test(value) && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

/** Why one value doesn't fit its field, or null. */
function leafProblem(spec: BodyLeaf, value: unknown): string | null {
  if (value === null) return spec.nullable ? null : 'can’t be null';
  if (spec.type === 'boolean') return typeof value === 'boolean' ? null : 'must be true or false';
  if (spec.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number';
    if (spec.integer && !Number.isInteger(value)) return 'must be a whole number';
    if (spec.min !== undefined && value < spec.min) return `must be at least ${spec.min}`;
    if (spec.max !== undefined && value > spec.max) return `must be at most ${spec.max}`;
    return null;
  }
  if (typeof value !== 'string') return 'must be text';
  // Counted in code points, so an emoji is one character, as a person counts it.
  if ([...value].length > (spec.max ?? DEFAULT_MAX)) return `must be at most ${spec.max ?? DEFAULT_MAX} characters`;
  if (spec.enum && !spec.enum.includes(value)) return `must be one of ${spec.enum.join(', ')}`;
  if (spec.format === 'date' && !isDate(value)) return 'must be a date, YYYY-MM-DD';
  if (spec.format === 'datetime' && !isDatetime(value)) return 'must be a date and time in ISO 8601';
  return null;
}

/**
 * The body an action may send, built from its declaration and the page's
 * values: only declared fields, in the declaration's order, into objects with
 * no prototype. It walks the declaration, never the page's keys, so nothing
 * the page names reaches the result except as a value. A field that doesn't
 * fit is a problem naming the field (never its value); fields the page sent
 * that aren't declared are only named, in `dropped`.
 */
export function cleanBody(declared: Record<string, BodyField> | undefined, sent: unknown): { body?: Record<string, unknown>; dropped: string[]; problem?: string } {
  if (sent === undefined) return { body: declared ? Object.create(null) : undefined, dropped: [] };
  if (!isObject(sent)) return { dropped: [], problem: 'The body must be an object.' };
  const dropped = Object.keys(sent).filter((key) => !declared || !Object.hasOwn(declared, key));
  if (!declared) return { dropped };
  const body: Record<string, unknown> = Object.create(null);
  for (const name of Object.keys(declared)) {
    if (!Object.hasOwn(sent, name)) continue;
    const spec = declared[name];
    const value = sent[name];
    if (spec.type === 'object') {
      if (value === null) {
        if (!spec.nullable) return { dropped, problem: `"${name}" can’t be null.` };
        body[name] = null;
        continue;
      }
      if (!isObject(value)) return { dropped, problem: `"${name}" must be an object.` };
      const inner: Record<string, unknown> = Object.create(null);
      for (const key of Object.keys(value)) if (!Object.hasOwn(spec.fields, key)) dropped.push(`${name}.${key}`);
      for (const field of Object.keys(spec.fields)) {
        if (!Object.hasOwn(value, field)) continue;
        const problem = leafProblem(spec.fields[field], value[field]);
        if (problem) return { dropped, problem: `"${name}.${field}" ${problem}.` };
        inner[field] = value[field];
      }
      body[name] = inner;
      continue;
    }
    const problem = leafProblem(spec, value);
    if (problem) return { dropped, problem: `"${name}" ${problem}.` };
    body[name] = value;
  }
  return { body, dropped };
}

/** Every source checked: the first problem, or the sources as declared. */
export function checkSources(value: unknown): { sources?: Sources; problem?: string } {
  if (value === undefined) return { sources: {} };
  if (!isObject(value)) return { problem: 'sources must be an object: { "name": { … } }.' };
  const names = Object.keys(value);
  if (names.length > LIMITS.sources) return { problem: `A thing can have at most ${LIMITS.sources} sources.` };
  for (const name of names) {
    const problem = sourceProblem(name, value[name]);
    if (problem) return { problem };
  }
  return { sources: value as Sources };
}

/** One line per request a source can make, as the owner is shown them. */
export function describeRequests(source: SourceDefinition): string[] {
  const lines: string[] = [];
  // The request itself is always there: an `about` is the author's words, so it's shown beside it, never instead.
  const line = (method: string, request: SourceRequest & { body?: Record<string, BodyField> }) => {
    const query = new URLSearchParams(request.query ?? {}).toString();
    const body = request.body ? ` {${fieldList(request.body)}}` : '';
    const about = typeof request.about === 'string' && request.about.trim() ? ` (${request.about.trim()})` : '';
    lines.push(`${method} ${request.path}${query ? `?${query}` : ''}${body}${about}`);
  };
  for (const read of Object.keys(source.reads ?? {})) line('GET', source.reads![read]);
  for (const action of Object.keys(source.actions ?? {})) line(source.actions![action].method, source.actions![action]);
  return lines;
}

/** A body's fields as a line shows them: `title, props{status, projectId}`. */
function fieldList(body: Record<string, BodyField>): string {
  return Object.keys(body).map((name) => {
    const spec = body[name];
    return spec.type === 'object' && isObject(spec.fields) ? `${name}{${Object.keys(spec.fields).join(', ')}}` : name;
  }).join(', ');
}

/** JSON with every object's keys in order, so two declarations compare as equal however they're written. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    isObject(inner) ? Object.fromEntries(Object.keys(inner).sort().map((key) => [key, inner[key]])) : inner
  );
}

// MARK: Addresses

/** An IPv4 address as a number, or null. */
function ipv4(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((sum, part) => sum * 256 + Number(part), 0);
}

const V4_PRIVATE: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function publicV4(value: number) {
  return V4_PRIVATE.every(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) !== Math.floor(ipv4(base)! / 2 ** (32 - bits)));
}

/** An IPv6 address as eight 16-bit groups, or null. */
function ipv6(address: string): number[] | null {
  let text = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (text.includes('%')) return null;
  // A trailing dotted IPv4 becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const v4 = ipv4(dotted[1]);
    if (v4 === null) return null;
    text = `${text.slice(0, -dotted[1].length)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

/** Whether an address (IPv4, or IPv6 with or without brackets) is out on the public internet. */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4(address);
  if (v4 !== null) return publicV4(v4);
  const g = ipv6(address);
  if (!g) return false;
  const embedded = (high: number, low: number) => publicV4(high * 65536 + low);
  // ::/96 (with :: and ::1), ::ffff:0:0/96, 64:ff9b::/96: an IPv4 address inside.
  if (g.slice(0, 6).every((x) => x === 0)) return embedded(g[6], g[7]) && !(g[6] === 0 && g[7] <= 1);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(g[6], g[7]);
  // 6to4 carries one in its second and third groups.
  if (g[0] === 0x2002) return embedded(g[1], g[2]);
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return false; // link and site local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

/** A URL's host as an address or name: no brackets, no trailing dot. */
export function hostOf(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** Whether a host is an IP address rather than a name. */
export const isAddress = (host: string) => ipv4(host) !== null || host.includes(':');

/**
 * A base URL an owner may give a source, or why not. Parsed as browsers do
 * first, so `127.1`, `0x7f000001` and `LOCALHOST.` are seen for what they are.
 * The host's addresses are checked by the function, every time it's used.
 */
export function checkBaseUrl(raw: unknown): { url?: URL; problem?: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { problem: 'A base URL, please.' };
  if (raw.length > LIMITS.url) return { problem: `The base URL is longer than ${LIMITS.url} characters.` };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { problem: 'That isn’t a URL.' };
  }
  if (url.protocol !== 'https:') return { problem: 'It has to be https.' };
  if (url.username || url.password) return { problem: 'It can’t have a name or password in it.' };
  if (url.port && url.port !== '443') return { problem: 'It can only use the usual https port.' };
  if (url.search || url.hash || raw.includes('?') || raw.includes('#')) return { problem: 'It can’t have a query or a #fragment.' };
  const host = hostOf(url);
  // One spelling of a name: "example.com." is kept as "example.com".
  if (url.hostname.endsWith('.')) url.hostname = url.hostname.slice(0, -1);
  if (isAddress(host)) {
    if (!isPublicAddress(host)) return { problem: 'That address is on a private network.' };
    return { url };
  }
  if (!host.includes('.') || host === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { problem: 'That name only means something inside a network.' };
  }
  return { url };
}

// MARK: Requests

/**
 * The URL of one declared request on an owner's base: their path prefix,
 * then the declared path with its placeholders filled, then the declared
 * query. It never leaves the base's origin or its path.
 */
export function requestUrl(base: URL, request: SourceRequest, params: Record<string, string> = {}): { url?: string; problem?: string } {
  const wanted = new Set<string>();
  for (const found of request.path.matchAll(PLACEHOLDER)) wanted.add(found[1]);
  for (const key of Object.keys(params)) if (!wanted.has(key)) return { problem: `"${key}" isn’t one of this action’s placeholders.` };
  let path = request.path;
  for (const name of wanted) {
    const value = own(params, name);
    if (typeof value !== 'string' || !PARAM.test(value)) return { problem: `"${name}" must be 1 to 128 letters, digits, - or _.` };
    path = path.split(`{${name}}`).join(value);
  }
  const prefix = base.pathname.replace(/\/+$/, '');
  const query = new URLSearchParams(request.query ?? {}).toString();
  let built: URL;
  try {
    built = new URL(`${base.origin}${prefix}${path}${query ? `?${query}` : ''}`);
  } catch {
    return { problem: 'That request isn’t a URL.' };
  }
  if (built.origin !== base.origin || !built.pathname.startsWith(`${prefix}/`)) return { problem: 'That request would leave the base URL.' };
  return { url: built.href };
}
