# Local checks and candidate packaging

Use Node 24 and pnpm 10.34.7. Install the frozen lockfile from the standard npm registry with lifecycle scripts disabled, then run:

```sh
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
node ci/run-checks.mjs ci/commands.json
python3 ci/build-candidate.py
```

The explicit list covers existing syntax, model, native-VM and WebView unit tests. Companion-addon comparisons are workspace-only and excluded from this independent checkout. The ordinary workflow does not fetch addon updates, change versions, publish, upload, deploy or install plugins.

The candidate wrapper regenerates the existing overview-demo preview for its local test and runs the existing addon builder in a disposable source copy, checks ZIP integrity, addon identity, version, complete dist-to-package parity and packaged JavaScript syntax, and preserves a local archive under `artifacts/`. Dependency lifecycle scripts remain disabled. Source and package checks do not establish native device behavior; pending Mac, iPad or iPhone acceptance remains open after a pull request merge.
