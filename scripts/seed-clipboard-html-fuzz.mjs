import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const directory = resolve('build/fuzz/clipboard-html-corpus');
await mkdir(directory, { recursive: true });
function record(body, context = true, selection = false) {
  const lines = [
    'Version:1.0',
    'StartHTML:0000000000',
    'EndHTML:0000000000',
    'StartFragment:0000000000',
    'EndFragment:0000000000',
    ...(selection
      ? ['StartSelection:0000000000', 'EndSelection:0000000000']
      : []),
    'SourceURL:https://example.invalid/not-fetched',
  ];
  let header = lines.join('\r\n') + '\r\n';
  const start = Buffer.byteLength(header);
  for (const [name, value] of [
    ['StartHTML', context ? start : -1],
    ['EndHTML', context ? start + body.length : -1],
    ['StartFragment', start],
    ['EndFragment', start + body.length],
    ...(selection
      ? [
          ['StartSelection', start],
          ['EndSelection', start + body.length],
        ]
      : []),
  ])
    header = header.replace(
      name + ':0000000000',
      name + ':' + String(value).padStart(10, value < 0 ? ' ' : '0'),
    );
  return Buffer.concat([Buffer.from(header), body, Buffer.from([0])]);
}
const fragment = Buffer.from('<p>HTML <b>\u0416\u4e2d\ud83d\ude00</b>\r\n</p>');
const good = record(fragment);
const seeds = [
  fragment,
  good,
  record(fragment, false),
  record(fragment, true, true),
  record(Buffer.alloc(0), false),
  Buffer.from(good.toString('utf8').replace('StartFragment:', 'StartHTML:')),
  Buffer.from(
    good.toString('utf8').replace('EndHTML:0000000', 'EndHTML:9999999'),
  ),
  record(Buffer.from([0x3c, 0x62, 0x3e, 0xed, 0xa0, 0x80])),
  Buffer.from(
    'Version:1.0\r\nStartHTML:-1\r\nEndHTML:-1\r\nStartFragment:0\r\nEndFragment:0\r\n',
  ),
];
for (let index = 0; index < seeds.length; index++)
  await writeFile(join(directory, 'seed-' + index), seeds[index]);
console.log(JSON.stringify({ clipboardHtmlFuzzSeeds: seeds.length }));
