# Security Policy

## Supported versions

This repository currently supports the latest `main` branch for security fixes.

## Deployment boundary

Relaybox is a self-hosted, single-admin application. Production operators should:

- terminate TLS before the application
- enable secure cookies
- use a unique admin password and a random 32+ character session secret
- add login rate limiting at the reverse proxy when internet-facing
- grant AWS credentials only the DynamoDB, S3, and SES permissions required by
  the configured provider

## Reporting a vulnerability

Do not open public GitHub issues for security vulnerabilities.

Report vulnerabilities privately to the maintainers with:

- a description of the issue
- affected area and version
- reproduction steps or proof of concept
- impact assessment

If the issue involves credentials or cloud resources:

- rotate any exposed keys immediately
- include only the minimum evidence needed to reproduce safely

## Secrets and test data

- Never commit real AWS credentials, tokens, or private inbox data.
- Demo fixtures and public screenshots must use synthetic data only.
- Treat old local credentials as compromised if they were ever copied into development files that may have been shared.
