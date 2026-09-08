# Contributing

Thanks for improving the Launch On Block SDK. Keep contributions focused on the reviewed public
integration boundary: ABIs, deployment metadata, deterministic builders, verification, indexing assets,
runtime-neutral arithmetic, documentation, and release safety.

## Before opening a pull request

1. Open an issue for new public APIs, deployment fields, or indexing semantics so the boundary can be
   reviewed before implementation.
2. Do not copy private contract sources, private repository history, Foundry build output, credentials,
   keyed RPC URLs, wallet material, or unreviewed deployment attempts into this repository.
3. Use Node.js 24 and the npm version declared by `packageManager`.
4. Run `npm ci` and `npm test`.
5. Update `CHANGELOG.md` for consumer-visible changes.

For consumer documentation, edit the prose and `examples/consumer/*.ts`, then run
`npm run generate:docs` and `npm test`. Generated API signatures and example blocks should not be
edited by hand. `check:docs` checks reference drift, error-code coverage, and repository links;
the package check compiles the examples and README TypeScript snippets against an extracted tarball
and executes the offline example. It never invokes the wallet submission example. Live quickstart
checks remain separate, read-only provider checks; record their chain/block and outcome when run.

Pull requests should explain the integration need, compatibility impact, tests, and provenance of any
generated artifact. Public ABI or deployment changes must include reviewed compatibility evidence and
must pass the immutable-artifact checks.

Report security issues through private vulnerability reporting as described in [`SECURITY.md`](SECURITY.md),
not through a public issue.
