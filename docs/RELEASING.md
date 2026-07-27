# Releasing the SDK

SDK publication is independent from contract deployment and activation. Publishing reads only reviewed,
committed public inputs—never an upstream checkout or RPC endpoint.

## Trusted publishing boundary

The npm trusted publisher is active for GitHub organization `ReptilianHQ`, repository
`launch-on-block-sdk`, workflow `publish.yml`, and environment `npm`. Releases `0.4.2` and later prove
tokenless publication with npm provenance. No npm token belongs in GitHub Actions or repository secrets.

The protected `npm` environment requires human approval. The publishing workflow additionally proves
that the release tag, package version, release commit, public repository, and prerelease state agree.

## Normal release

1. Update `CHANGELOG.md`, `package.json`, and `package-lock.json` to the same version.
2. Run `npm ci && npm test` on Node 24; CI repeats the suite on Node 22 and 24.
3. Merge to `main`, create an exact `v<version>` tag, and publish a matching GitHub Release. Mark it as a
   prerelease exactly when the semver contains a prerelease component.
4. `.github/workflows/publish.yml` verifies the tag and release identity, rebuilds and tests the package,
   then publishes through npm OIDC with provenance.

5. Wait for the verify job to reproduce the tarball and match its integrity to the npm registry.

The `npm` GitHub environment remains the human approval boundary for every publication.
