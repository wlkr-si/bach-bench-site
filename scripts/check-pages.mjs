import { glob, readFile } from 'node:fs/promises';
import { parse } from 'parse5';

const forbidden = [
  ['Piece data', /\b(?:src|href|data-(?:clip|poster)) https:\/\/vault\.bach\.wlkr\.si\/pieces\/|\bid (?:bach-data|sleeve-data)\b|\bdata-(?:stage|tile|result)\b/i],
  ['attempt count', /\b(?:attempt[\s_-]*counts?|attempt[\s_-]*totals?|(?:number|count|total) of (?:failed )?attempts|(?:total|failed) attempts|attempts\s*[:=]\s*\d|\d[\d,]*\s+(?:failed\s+)?(?:attempts?|retries|tries))\b/i],
  ['music ranking', /\b(?:leaderboards?|rankings?\s+(?:of|for)\s+(?:the\s+)?(?:music|pieces|clips)|(?:music|piece|clip|overall|quality|artistic)[\s_-]*rank(?:ings?)?|best[\s_-]+(?:music|piece|clip)|(?:winning|top-ranked)[\s_-]+(?:piece|clip))\b/i],
];

function publishedText(node) {
  if (node.tagName === 'style') return '';
  if (node.tagName === 'script' &&
      !node.attrs.some(({ name, value }) => name === 'type' && value === 'application/json')) return '';
  const attributes = node.attrs?.map(({ name, value }) => name + ' ' + value) ?? [];
  return [...attributes, node.value, ...(node.childNodes ?? []).map(publishedText)].join(' ');
}

let pages = 0;
for await (const page of glob('dist/**/*.html')) {
  pages++;
  const content = publishedText(parse(await readFile(page, 'utf8')))
    .replace(/\s+/g, ' ')
    .replace(/There is no overall ranking\./g, '');
  for (const [label, pattern] of forbidden) {
    const match = content.match(pattern);
    if (!match) continue;
    console.error(`${page}: found ${label} (${match[0]})`);
    process.exitCode = 1;
  }
}
if (!pages) {
  console.error('No built HTML pages to check.');
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log(`Checked ${pages} built HTML pages for Piece data, attempt counts and music rankings.`);
}

for await (const asset of glob('dist/client/**/*')) {
  if (!/^dist\/client\/(?:analytics|charts|derived|p|pieces)\//.test(asset) &&
      !/\.(?:mp4|webm|jpe?g)$/i.test(asset)) continue;
  console.error(`${asset}: unexpected bundled Piece asset`);
  process.exitCode = 1;
}
