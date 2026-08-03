# Public Alpha Release Checklist

Relaybox v0.1 is a self-hosted, single-tenant inbox workspace for AI agents.
It is intentionally not a managed, multi-tenant email service.

## Included

- signed single-admin sessions
- inbox, mailbox, message, label, reply, forward, and compose flows
- safe fixture-backed demo mode
- generic AWS SES, S3, and DynamoDB provider path
- indexed message reads
- Docker setup
- unit, build, browser, and secret-scanning CI
- MIT license and contributor/security documentation

## Operator responsibilities

- configure a unique 12+ character admin password
- configure a random 32+ character session secret
- terminate TLS and enable secure cookies in production
- add reverse-proxy login rate limiting when internet-facing
- use least-privilege AWS credentials
- keep real mailbox data and infrastructure identifiers out of source control

## Public alpha limitations

- one administrator and no role-based access control
- no managed domain provisioning, billing, quotas, or abuse control plane
- no distributed application-level login rate limiter
- no HTML email rendering or attachment download flow
- no Postgres provider

## Verification

Before release:

```bash
npm ci
npm audit
npm run check:release
```

Run Gitleaks against both the working tree and reachable Git history. The public
repository should be created from the sanitized release tree so private
development history is not exposed.
