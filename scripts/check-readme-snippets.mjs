#!/usr/bin/env node
/**
 * Type-checks the ```ts code blocks in readme.md against types/ng-types.ts.
 *
 * The readme is a design document, so its snippets are not plain modules. This
 * script normalises the conventions it uses, compiles what remains, and maps
 * every diagnostic back to a readme line number:
 *
 *   - `@{ ... }` markup literals            -> a `TemplateMarkup` stand-in
 *   - `/** ... **\/` elisions               -> `undefined as any`
 *   - repeated / phantom imports            -> one rewired header
 *   - `// -- Name ---` "second file" markers -> segments reordered so
 *                                              definitions precede uses
 *   - names the readme never defines        -> stubbed, and reported
 *
 * Every generated line carries its readme line number, so transforms that add,
 * drop, or reorder lines cannot desynchronise the mapping.
 *
 * Blocks that cannot be checked are reported with a reason. The script fails if
 * nothing was checked, so "0 errors" can never mean "0 blocks compiled".
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(ROOT, 'readme.md');
const OUT = join(ROOT, 'node_modules', '.readme-snippets');

/** Provided by this proposal rather than by @angular/core. */
const DSL = [
  'component', 'directive', 'derivation', 'fragment',
  'ref', 'refMany', 'inject', 'provide', 'injectionToken',
];

/** Always available, so blocks that omit their imports still compile. */
const CORE = [
  'signal', 'computed', 'linkedSignal', 'input', 'model', 'output',
  'afterNextRender', 'afterRenderEffect', 'DestroyRef', 'Renderer2',
  'LOCALE_ID', 'InjectionToken',
];
const CORE_TYPES = ['Signal', 'WritableSignal', 'Provider', 'InputSignal'];

const isPhantom = (m) =>
  m.startsWith('@mylib/') || m.endsWith('.ng') ||
  m.startsWith('@angular/material') || m.startsWith('@angular/cdk') ||
  m.startsWith('@angular/aria');

const IMPORT_RE = /^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';?\s*$/;
const SEGMENT_RE = /^\s*\/\/\s*--\s+.*?-{2,}\s*$/;

// ── extract blocks, each line tagged with its readme line number ───
function extractBlocks(src) {
  const lines = src.split('\n');
  const out = [];
  let open = null;
  lines.forEach((text, i) => {
    const n = i + 1;
    if (open === null && text.trim() === '```ts') open = { first: n + 1, lines: [] };
    else if (open !== null && text.trim() === '```') {
      out.push({ first: open.first, last: n - 1, lines: open.lines });
      open = null;
    } else if (open !== null) open.lines.push({ text, readmeLine: n });
  });
  return out;
}

/** Replace each `@{ ... }` with `tmpl`; extra lines become tagged blanks. */
function stripMarkup(entries) {
  const joined = entries.map((e) => e.text).join('\n');
  if (!joined.includes('@{')) return entries;

  const result = [];
  let depth = 0;
  for (const e of entries) {
    if (depth > 0) {
      for (const ch of e.text) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) break;
      }
      // inside (or just closed) a markup literal: keep the slot, drop the text
      const tail = depth === 0 ? e.text.slice(e.text.lastIndexOf('}') + 1) : '';
      result.push({ text: tail, readmeLine: e.readmeLine });
      continue;
    }
    const at = e.text.indexOf('@{');
    if (at === -1) {
      result.push(e);
      continue;
    }
    const before = e.text.slice(0, at);
    let rest = e.text.slice(at + 1); // from '{'
    depth = 0;
    let closedAt = -1;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '{') depth++;
      else if (rest[i] === '}') {
        depth--;
        if (depth === 0) { closedAt = i; break; }
      }
    }
    if (closedAt === -1) {
      result.push({ text: `${before}tmpl`, readmeLine: e.readmeLine });
    } else {
      result.push({
        text: `${before}tmpl${rest.slice(closedAt + 1)}`,
        readmeLine: e.readmeLine,
      });
      depth = 0;
    }
  }
  return result;
}

function stripElisions(entries) {
  return entries.map((e) => ({
    ...e,
    text: e.text
      .replace(/\(\s*\/\*\*[^*]*\*\*\/\s*\)/g, '(undefined as any)')
      .replace(/=>\s*\/\*\*[^*]*\*\*\//g, '=> (undefined as any)')
      .replace(/^(\s*)\.\.\.(\s*)$/g, '$1$2'),
  }));
}

/** Reorder `// -- Name ---` segments so later "files" come first. */
function reorderSegments(entries) {
  const segs = [[]];
  for (const e of entries) {
    if (SEGMENT_RE.test(e.text)) segs.push([]);
    segs[segs.length - 1].push(e);
  }
  if (segs.length === 1) return entries;
  return segs.reverse().flat();
}

function declaredNames(entries) {
  const src = entries.map((e) => e.text).join('\n');
  const names = new Set();
  const re =
    /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|class|interface|enum|type|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

function collectImports(entries, declared) {
  const core = new Set(CORE);
  const coreTypes = new Set(CORE_TYPES);
  const real = new Map();
  const stubs = new Set();
  const kept = entries.map((e) => {
    const m = e.text.match(IMPORT_RE);
    if (!m) return e;
    const [, namesRaw, mod] = m;
    for (const raw of namesRaw.split(',')) {
      const n = raw.trim().replace(/^type\s+/, '');
      if (!n) continue;
      if (mod === '@angular/core') {
        if (!DSL.includes(n)) core.add(n);
      } else if (isPhantom(mod)) {
        if (!declared.has(n)) stubs.add(n);
      } else {
        if (!real.has(mod)) real.set(mod, new Set());
        real.get(mod).add(n);
      }
    }
    return { text: '', readmeLine: e.readmeLine };
  });
  for (const t of coreTypes) core.delete(t);
  return { kept, core, coreTypes, real, stubs };
}

function buildHeader({ core, coreTypes, real, stubs }, extraStubs) {
  const parts = [
    `import { ${DSL.join(', ')} } from '${join(ROOT, 'types/ng-types')}';`,
    `import type { TemplateMarkup } from '${join(ROOT, 'types/ng-types')}';`,
    `import { ${[...core].join(', ')} } from '@angular/core';`,
    `import type { ${[...coreTypes].join(', ')} } from '@angular/core';`,
    'declare const tmpl: TemplateMarkup;',
  ];
  for (const [mod, names] of real)
    parts.push(`import { ${[...names].join(', ')} } from '${mod}';`);
  // Imports from packages that do not exist: a class gives both a value and an
  // instance type, so `inject(Phantom)` still yields something usable.
  for (const n of stubs) parts.push(`declare class ${n} { [k: string]: any; }`);
  // Names the readme never defines at all: kept as `any` so `typeof X` works
  // where the snippet writes `ref<typeof X>()`.
  for (const n of extraStubs)
    if (!stubs.has(n)) parts.push(`declare const ${n}: any; type ${n} = any;`);
  return parts.join(' ');
}

// ── main ───────────────────────────────────────────────────────────
const src = readFileSync(README, 'utf8');
const srcLines = src.split('\n');
const appendixAt =
  srcLines.findIndex((l) => l.startsWith('## Appendix: Consuming decorator-based classes')) + 1;

const blocks = extractBlocks(src);
const prepared = [];
const skipped = [];

for (const b of blocks) {
  if (appendixAt && b.first > appendixAt) {
    skipped.push({ b, reason: 'decorator appendix (sketch — deliberately outside the spec)' });
    continue;
  }
  const joined = b.lines.map((e) => e.text).join('\n');
  if (!/^\s*(?:export\s+)?(?:abstract\s+)?(?:const|class|interface|enum|function)\s/m.test(joined)) {
    skipped.push({ b, reason: 'illustrative fragment, not a module' });
    continue;
  }
  let entries = stripElisions(stripMarkup(b.lines));
  entries = reorderSegments(entries);
  prepared.push({ b, entries });
}

if (!prepared.length) {
  console.error('readme snippets: nothing to check — refusing to report success');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const allDeclared = new Set();
for (const p of prepared) for (const n of declaredNames(p.entries)) allDeclared.add(n);

function emit(extraStubsByBlock) {
  const files = [];
  for (const p of prepared) {
    const declared = declaredNames(p.entries);
    const imports = collectImports(p.entries, declared);
    const header = buildHeader(imports, extraStubsByBlock.get(p.b.first) ?? []);
    const body = imports.kept;
    const file = join(OUT, `block-${p.b.first}.ts`);
    writeFileSync(file, [header, ...body.map((e) => e.text)].join('\n') + '\n');
    files.push({ file, first: p.b.first, map: body.map((e) => e.readmeLine) });
  }
  return files;
}

function compile(files) {
  try {
    execFileSync(
      'npx',
      ['tsc', '--noEmit', '--strict', '--target', 'es2022', '--moduleResolution', 'bundler',
       '--module', 'esnext', '--skipLibCheck', ...files.map((f) => f.file)],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return [];
  } catch (e) {
    const raw = (e.stdout || '') + (e.stderr || '');
    return raw.split('\n').flatMap((line) => {
      const m = line.match(/block-(\d+)\.ts\((\d+),(\d+)\):\s*(error TS(\d+): )?(.*)$/);
      if (!m) return [];
      return [{ first: Number(m[1]), row: Number(m[2]), col: Number(m[3]), code: m[5], msg: m[6] }];
    });
  }
}

// pass 1..3: stub names the readme never defines, then recompile
const extraStubs = new Map();
const stubbed = new Set();
let files = emit(extraStubs);
let diags = compile(files);

for (let pass = 0; pass < 3 && diags.length; pass++) {
  let added = false;
  for (const d of diags) {
    const m = d.msg.match(/Cannot find name '([A-Za-z_$][\w$]*)'/);
    if (!m) continue;
    const name = m[1];
    const list = extraStubs.get(d.first) ?? [];
    if (!list.includes(name)) {
      list.push(name);
      extraStubs.set(d.first, list);
      stubbed.add(name);
      added = true;
    }
  }
  if (!added) break;
  files = emit(extraStubs);
  diags = compile(files);
}

// ── report ─────────────────────────────────────────────────────────
console.log(`readme snippets: ${prepared.length} checked, ${skipped.length} skipped`);
for (const s of skipped) console.log(`  skipped  L${s.b.first}-${s.b.last}: ${s.reason}`);
if (stubbed.size)
  console.log(`  stubbed undefined names: ${[...stubbed].sort().join(', ')}`);

if (diags.length) {
  console.error(`\n${diags.length} error(s):`);
  for (const d of diags) {
    const f = files.find((x) => x.first === d.first);
    const readmeLine = f?.map[d.row - 2] ?? d.first;
    console.error(`  readme.md:${readmeLine}  ${d.msg}`);
  }
  process.exit(1);
}
console.log('all checked snippets compile');
rmSync(OUT, { recursive: true, force: true });
