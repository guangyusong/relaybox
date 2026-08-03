# Contributing

## Scope

Relaybox is the OSS core of a broader product. Contributions should improve the self-hosted, single-tenant inbox workspace rather than assume hosted SaaS features.

## Before you open a PR

1. Open an issue or reference an existing one for larger changes.
2. Keep changes focused. Avoid bundling unrelated refactors with feature work.
3. Prefer generic configuration over provider- or company-specific defaults.
4. Do not commit secrets, private fixtures, or real credentials.

## Local setup

```bash
cp .env.example .env.local
# Set a unique APP_ADMIN_PASSWORD and APP_SESSION_SECRET.
npm install
npm run check:release
```

Demo mode is the default and is the expected path for most contributors.

## Coding expectations

- Keep the OSS/SaaS boundary intact.
- Add tests for behavior changes.
- Update README or docs when setup, architecture, or public behavior changes.
- Preserve provider seams rather than hardcoding direct infrastructure calls into app routes.

## Pull requests

Use the PR template. Include:

- what changed
- why it changed
- how you validated it
- any follow-up work or limitations
