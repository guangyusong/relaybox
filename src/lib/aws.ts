import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { appConfig } from "@/lib/config";

function getCredentials() {
  if (!appConfig.aws.accessKeyId || !appConfig.aws.secretAccessKey) {
    return undefined;
  }

  return {
    accessKeyId: appConfig.aws.accessKeyId,
    secretAccessKey: appConfig.aws.secretAccessKey,
  };
}

export function getAwsSdkConfig() {
  return {
    region: appConfig.aws.region,
    ...(getCredentials() && {
      credentials: getCredentials(),
    }),
  };
}

export function requireAwsValue(
  value: string | undefined,
  label: string
): string {
  if (!value) {
    throw new Error(`${label} is required when MAIL_PROVIDER=aws`);
  }

  return value;
}

const sdkConfig = getAwsSdkConfig();

export const dynamo = new DynamoDBClient(sdkConfig);
export const ddb = DynamoDBDocumentClient.from(dynamo);
export const s3 = new S3Client(sdkConfig);
export const ses = new SESClient(sdkConfig);
