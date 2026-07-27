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

Pull requests should explain the integration need, compatibility impact, tests, and provenance of any
generated artifact. Public ABI or deployment changes must include reviewed compatibility evidence and
must pass the immutable-artifact checks.

Report security issues through private vulnerability reporting as described in [`SECURITY.md`](SECURITY.md),
not through a public issue.
