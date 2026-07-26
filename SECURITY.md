# Security Policy

Please report vulnerabilities privately through GitHub's security-advisory flow for this repository.
Do not open a public issue for a vulnerability that could cause consumers to submit incorrect
transactions, trust an incompatible deployment, or accept forged receipt evidence.

The SDK does not hold keys or submit transactions. Its builders return transaction requests for callers
to review and submit, and its compatibility checks prove deployment identity rather than operational
health.
