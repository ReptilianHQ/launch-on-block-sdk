# Releasing the SDK

SDK publication is independent from contract deployment and activation. Publishing reads only reviewed,
committed public inputs—never an upstream checkout or RPC endpoint.

## One-time npm bootstrap

The npm package does not exist yet, and npm requires an existing package before a trusted publisher can
be configured. A maintainer must:

1. make `ReptilianHQ/launch-on-block-sdk` public so npm provenance can bind to public source;
2. confirm the public npm scope `@reptilianhq` is controlled by ReptilianHQ;
3. publish `@reptilianhq/launch-on-block-sdk@0.4.0` once from this exact clean tag using an interactive,
   2FA-protected maintainer session and `npm publish --access public`; this bootstrap publication is the
   one release that cannot carry CI provenance because npm cannot trust a publisher before the package exists;
4. configure the package's npm trusted publisher for GitHub organization `ReptilianHQ`, repository
   `launch-on-block-sdk`, workflow `publish.yml`, environment `npm`, and allow `npm publish`;
5. disallow token-based publication after the trusted publisher is proven.

No npm token belongs in GitHub Actions. The repository has no npm credentials by design.

## Normal release

1. Update `CHANGELOG.md`, `package.json`, and `package-lock.json` to the same version.
2. Run `npm ci && npm test` on Node 24; CI repeats the suite on Node 22 and 24.
3. Merge to `main`, create an exact `v<version>` tag, and publish a matching GitHub Release. Mark it as a
   prerelease exactly when the semver contains a prerelease component.
4. `.github/workflows/publish.yml` verifies the tag and release identity, rebuilds and tests the package,
   then publishes through npm OIDC with provenance.

The `npm` GitHub environment is the human approval boundary for publication. Protect it with required
reviewers before the first automated release.
