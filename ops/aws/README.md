# AWS Mail Ingest

Relaybox can use AWS SES for inbound mail, S3 for raw MIME storage, and
DynamoDB for indexed mailbox and message records.

## Lambda source

The included `ses_ingest.py` file is a source-controlled Lambda handler. Package
it under the module name used by your Lambda handler configuration.

Configure the Lambda with deployment-specific values:

```text
INBOX_DOMAIN=inbox.example.com
INBOX_DOMAINS=inbox.example.com,inbox.example.org
DIRECT_INBOX_ADDRESSES=agent@example.com,ops@example.com
DELETE_UNMATCHED_RAW=false
```

`INBOX_DOMAIN` is the canonical generated-inbox domain.
`INBOX_DOMAINS` controls which inbound domains the handler accepts.

Use least-privilege IAM permissions for the configured S3 bucket and DynamoDB
tables. Do not place credentials, account identifiers, real mailbox addresses,
or production resource names in this repository.

## Backfill

Existing raw messages can be mirrored into DynamoDB with:

```bash
MAIL_PROVIDER=aws \
AWS_PROFILE=relaybox \
AWS_REGION=us-east-1 \
AWS_MAILBOXES_TABLE=relaybox-mailboxes \
AWS_MESSAGES_TABLE=relaybox-messages \
AWS_MESSAGES_BY_MAILBOX_INDEX=byMailbox \
AWS_S3_BUCKET=relaybox-inbound-example \
APP_INBOUND_ADDRESSES=agent@example.com,ops@example.com \
npm run aws:backfill -- --dry-run
```

Review the dry-run output before removing `--dry-run`.
