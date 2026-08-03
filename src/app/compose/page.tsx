import { ComposeForm } from "@/components/compose-form";
import { Shell } from "@/components/shell";
import { requirePageAuth } from "@/lib/auth";
import { listSenderIdentities } from "@/lib/mail-service";

type ComposeSearchParams = Promise<{
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  inReplyTo?: string;
}>;

export default async function ComposePage({
  searchParams,
}: {
  searchParams: ComposeSearchParams;
}) {
  await requirePageAuth();

  const params = await searchParams;
  const senderOptions = await listSenderIdentities();
  const initialFrom =
    params.from && senderOptions.includes(params.from)
      ? params.from
      : senderOptions[0] ?? "";

  return (
    <Shell title="Compose" back="/">
      <ComposeForm
        senderOptions={senderOptions}
        initialValues={{
          from: initialFrom,
          to: params.to ?? "",
          cc: params.cc ?? "",
          subject: params.subject ?? "",
          body: params.body ?? "",
          inReplyTo: params.inReplyTo ?? "",
        }}
      />
    </Shell>
  );
}
