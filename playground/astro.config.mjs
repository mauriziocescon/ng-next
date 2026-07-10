import { defineConfig } from 'astro/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

function llmsTxt() {
  const root = resolve(import.meta.dirname, '..');
  const base = 'https://mauriziocescon.github.io/ng-next';

  const sections = [
    { file: 'readme.md', title: 'Proposal narrative, syntax, and examples', lang: 'md' },
    { file: 'types/ng-ast.ts', title: 'Template AST type definitions', lang: 'ts' },
    { file: 'types/ng-types.ts', title: 'Core runtime type contracts', lang: 'ts' },
    { file: 'types/ng-types.spec.ts', title: 'Type-level test suite (usage examples)', lang: 'ts' },
    { file: 'types/ng-dsl-type-checking-spec.md', title: 'DSL type-checking specification', lang: 'md' },
  ];

  const disclaimer =
    '> ⚠️ DISCLAIMER: This is NOT an official Angular proposal, RFC, or roadmap item.\n' +
    '> Useful as explorative material when discussing ideas about Angular\'s future template\n' +
    '> layer.';

  const preamble = [
    '# ng-next',
    '',
    '> Personal exploration of Angular template ideas — explicit contracts, typed',
    '> template surfaces, and structures easier to reason about for humans, tooling,',
    '> and AI agents.',
    '',
    disclaimer,
  ].join('\n');

  return {
    name: 'llms-txt',
    hooks: {
      'astro:build:start': async () => {
        // --- llms.txt (index) ---
        const index = [
          preamble,
          '',
          '## Docs',
          '',
          `- [Full content](${base}/llms-full.txt): All source files concatenated for single-pass ingestion.`,
          '',
          '## Source files',
          '',
          ...sections.map(({ file, title }) =>
            `- [${file}](https://github.com/mauriziocescon/ng-next/blob/main/${file}): ${title}`
          ),
          '',
          '## Links',
          '',
          `- [Interactive Playground](${base}/)`,
          '- [GitHub Repository](https://github.com/mauriziocescon/ng-next)',
          '',
        ].join('\n');

        writeFileSync(resolve(import.meta.dirname, 'public', 'llms.txt'), index);

        // --- llms-full.txt (expanded content) ---
        const header = [
          preamble,
          '',
          'Source: https://github.com/mauriziocescon/ng-next',
          '',
        ].join('\n');

        const body = sections.map(({ file, title, lang }) => {
          const content = readFileSync(resolve(root, file), 'utf-8');
          const meta = `---\ntitle: "${title}"\nsource: "${file}"\n---\n\n`;
          const wrapped = lang === 'ts'
            ? `\`\`\`ts\n${content}\n\`\`\``
            : content;
          return `${meta}${wrapped}\n`;
        }).join('\n');

        writeFileSync(resolve(import.meta.dirname, 'public', 'llms-full.txt'), header + body);
      },
    },
  };
}

export default defineConfig({
  site: 'https://mauriziocescon.github.io',
  base: '/ng-next',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap(), llmsTxt()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },
});
