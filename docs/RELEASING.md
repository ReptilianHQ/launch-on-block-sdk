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

## Live deployment verification

Live compatibility verification is a separate read-only diagnostic; package builds and publishing
continue to use committed inputs without network reads. After installing dependencies:

```sh
npm run verify:deployment
SDK_RELEASE_CHAIN_ID=46630 npm run verify:deployment
```

`SDK_RELEASE_CHAIN_ID` defaults to `4663`. Set `VERIFY_RPC` in your environment to select an alternate
RPC for that chain. Keep credential-bearing endpoints out of logs and committed files.

The command checks the SDK's pinned identity and wiring at a numbered `safe` block. If the provider
returns `metadata is not found` or `missing trie node`, it retries twice, waiting two seconds between
attempts and selecting a safe block again. Other failures, including wrong chain, bytecode, and
pointer mismatches, fail immediately. Exhausted retries exit nonzero with `VERIFY_RPC` guidance.

If safe-state availability still fails, use an endpoint retaining state at the required height or
retry later. Do not interpret the failure as a passed check, repin contracts to make it pass, or
automatically replace safe with `latest - N`. Provider state retention and safe lag can change
independently. The runtime SDK helpers leave retries and explicit block selection to callers.

The unit tests cover retry exhaustion and immediate mismatch failures without network dependencies;
the audit's [RPC probe](audit-2026-09-08/README.md) captures timestamped evidence for provider incidents.
See [deployment metadata corrections](DEPLOYMENT_METADATA.md) for the independent offline provenance
guard and the manual review boundary for corrected internal metadata.
