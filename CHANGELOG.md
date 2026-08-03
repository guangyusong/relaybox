# Changelog

## 0.1.0 - 2026-08-03

- renamed the project to Relaybox
- replaced the prototype auth flow with signed sessions
- introduced provider seams for inbound mailboxes, message storage, and outbound sending
- added safe demo mode with fixture-backed mailboxes and messages
- removed mailbox/message read paths that scanned raw object storage on each request
- added tests, CI, Playwright browser smoke coverage, and public release documentation
- removed deployment-specific addresses and infrastructure identifiers
- required strong authentication configuration and added secure cookie controls
- updated dependencies to remediate known vulnerabilities
