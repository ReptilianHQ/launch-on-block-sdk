# Changelog

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
