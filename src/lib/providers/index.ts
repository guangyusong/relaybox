import "server-only";

import { appConfig } from "@/lib/config";
import { singleAdminAuthProvider } from "@/lib/providers/single-admin-auth";
import { awsInboundProvider } from "@/lib/providers/aws/inbound";
import { awsMessageStore } from "@/lib/providers/aws/message-store";
import { awsOutboundProvider } from "@/lib/providers/aws/outbound";
import { demoInboundProvider } from "@/lib/providers/demo/inbound";
import { demoMessageStore } from "@/lib/providers/demo/message-store";
import { demoOutboundProvider } from "@/lib/providers/demo/outbound";

export const authProvider = singleAdminAuthProvider;

export const inboundProvider =
  appConfig.mailProvider === "aws" ? awsInboundProvider : demoInboundProvider;

export const messageStore =
  appConfig.mailProvider === "aws" ? awsMessageStore : demoMessageStore;

export const outboundProvider =
  appConfig.mailProvider === "aws" ? awsOutboundProvider : demoOutboundProvider;
