# AGENTS.md

This repository owns the public Launch On Block integration boundary: generated contract ABIs,
deployment metadata, deterministic transaction builders, receipt verification, compatibility checks,
and runtime-neutral protocol arithmetic.

The private Launch On Block contract repository is the source and deployment authority. It must hand
artifacts into this repository through a versioned, hash-bound manifest. This repository must never
read a sibling checkout, private Git branch, Foundry output directory, RPC secret, wallet key, or
application environment at build time.

Keep the SDK runtime-neutral:

- do not select wallets, RPC transports, gas policies, nonce policies, or application authorization;
- do not add Reptilian, Foundation, or Launch On Block application API clients;
- expose narrow subpath exports and stable machine-readable error codes;
- pin every published deployment to its chain ID, release identity, start block, ABI revision, and
  compatibility evidence;
- treat generated ABI and deployment files as immutable producer inputs, verified by
  `npm run check:artifacts`;
- run `npm test` before shipping.

Support consumers on Node.js 22 or newer. Use Node.js 24 and npm with the committed lockfile for
repository development and releases, and keep CI coverage for both Node.js 22 and 24. Never commit credentials, RPC URLs that
contain API keys, unreviewed deployment attempts, or generated Foundry artifacts containing bytecode and
compiler metadata.
