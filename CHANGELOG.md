# Changelog

## 0.7.1

- Align public documentation and release metadata with the supported npm line.
- Make generated indexing examples reproducible with committed lockfiles.
- Refresh verified tooling dependencies and consolidate automated update noise.

## 0.7.0

- Remove operational deployment fields from public types and runtime manifests.
- Make packaged source maps self-contained for consumer debugging and editor navigation.
- Complete public repository security, contribution, and release-readiness guardrails.

This intentionally breaking pre-1.0 release replaces exact generated manifest types with stable public
interfaces. Consumers must stop reading `writes_enabled`, `release_authorities`, `deployer_address`,
`max_managed_native`, and `chain_data` from `deploymentManifest`.

## 0.6.0

- Relicense the SDK under Apache-2.0 for proprietary and open-source integrations.
- Preserve the explicit patent grant and attribution terms in the published package.
- Keep releases through 0.5.0 available under their original GPL-3.0-only terms.

## 0.5.0

- Clarify public ABI boundaries while retaining internal deployment compatibility checks.
- Add verified read-only launch escrow reconciliation without valuation semantics.
- Publish neutral indexing assets and runnable Graph and Envio integration examples.

## 0.4.3

- Isolate registry integrity verification in a retryable post-publish job and tolerate npm propagation delay.
- Prove the corrected trusted-publishing workflow through a no-API-change release.

## 0.4.2

- Verify tokenless npm trusted publishing through the protected GitHub Actions release workflow.
- Publish npm provenance bound to the public repository, workflow, and release commit.

## 0.4.1

- Remove transitional cross-repository handoff metadata from the published package boundary.
- Pin all GitHub Actions used by CI and release-candidate workflows.

## 0.4.0

- Establish the public Launch On Block SDK in its dedicated repository.
- Publish runtime-neutral contract interfaces, deployment metadata, and transaction verification tools.
- Pin the initial reviewed ABI and deployment inputs by SHA-256 provenance.
- Support Node.js 22 consumers while using Node.js 24 for development and CI.
- Gate public npm releases through protected OIDC publishing and exact tarball verification.
