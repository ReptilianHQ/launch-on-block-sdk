# Changelog

## Unreleased

- Require signed contract artifact handoffs and validate generated modules structurally.
- Re-authenticate committed schema-v2 artifacts in CI and pin legacy provenance to its bootstrap bytes.
- Roll back the complete generated-source import if any staged replacement fails.

## 0.4.0

- Establish the public Launch On Block SDK in its dedicated repository.
- Publish runtime-neutral contract interfaces, deployment metadata, and transaction verification tools.
- Verify generated inputs through opaque, hash-bound producer provenance.
- Support Node.js 22 consumers while using Node.js 24 for development and CI.
- Gate public npm releases through protected OIDC publishing and exact tarball verification.
