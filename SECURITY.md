# Security Policy

## Supported versions

Only the npm `latest` version receives security fixes. Superseded versions are unsupported and may be
withdrawn from the registry; historical Git tags remain available for provenance and license records.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** flow on the repository Security tab. Private vulnerability
reporting is enabled, and reports are visible only to repository maintainers until coordinated disclosure.
Do not open a public issue for a vulnerability that could cause consumers to submit incorrect
transactions, trust an incompatible deployment, or accept forged receipt evidence.

The SDK does not hold keys or submit transactions. Its builders return transaction requests for callers
to review and submit, and its compatibility checks prove deployment identity rather than operational
health.
