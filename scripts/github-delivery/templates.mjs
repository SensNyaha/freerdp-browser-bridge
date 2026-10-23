import { adapters, fail } from './manifest.mjs';

// Resolved from the official GitHub action repositories on 2026-10-23.
const checkout = '3d3c42e5aac5ba805825da76410c181273ba90b1'; // checkout v7.0.1
const setupNode = '949feb2413d6458794dcd2491c4babbbce0c15c1'; // setup-node v7
const expression = (text) => '${{ ' + text + ' }}';
export function npmWorkflow(kind) {
  if (kind !== 'core' && !adapters.includes(kind))
    fail('DELIVERY_KIND_INVALID');
  const checks =
    kind === 'core'
      ? `
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - run: pnpm build
      - run: node release-tools/native-smoke.mjs
`
      : `
      - run: npm ci --ignore-scripts --no-audit --no-fund --logs-max=0
      - run: npm run build
      - run: npm run check:types
      - run: npm test
      - run: node release-tools/compare-compiled.mjs
`;
  const tooling =
    'npm install --global npm@11.19.0' +
    (kind === 'core' ? ' pnpm@10.11.0' : '') +
    ' --ignore-scripts --no-audit --no-fund --logs-max=0';
  return `name: Publish accepted npm archives
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      tag:
        description: Existing release tag (for example v0.2.4)
        required: true
        type: string
permissions:
  contents: read
concurrency:
  group: npm-${expression('github.repository')}-${expression('github.event.release.tag_name || inputs.tag')}
  cancel-in-progress: false
env:
  DELIVERY_TAG: ${expression('github.event.release.tag_name || inputs.tag')}
jobs:
  validate:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04, windows-2025]
    runs-on: ${expression('matrix.os')}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@${checkout} # v7.0.1
        with:
          ref: ${expression('github.event.release.tag_name || inputs.tag')}
          persist-credentials: false
      - uses: actions/setup-node@${setupNode} # v7
        with:
          node-version: '24.21.0'
          package-manager-cache: false
      - run: ${tooling}
      - run: node --test release-tools/guards.test.mjs
      - run: node release-tools/run.mjs fetch
${checks}
      - run: node release-tools/run.mjs verify
  publish:
    needs: validate
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@${checkout} # v7.0.1
        with:
          ref: ${expression('github.event.release.tag_name || inputs.tag')}
          persist-credentials: false
      - uses: actions/setup-node@${setupNode} # v7
        with:
          node-version: '24.21.0'
          package-manager-cache: false
      - run: npm install --global npm@11.19.0 --ignore-scripts --no-audit --no-fund --logs-max=0
      - run: node release-tools/run.mjs fetch
      - run: node release-tools/run.mjs publish
`;
}
