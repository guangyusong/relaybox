export function mailboxCandidates(
  mailboxAddress: string,
  hashKey: string
): string[] {
  const candidates = [mailboxAddress];

  if (hashKey === "inbox_id" && mailboxAddress.includes("@")) {
    const [localPart, domain] = mailboxAddress.split("@");

    if (domain) {
      candidates.push(domain);
    }

    if (localPart) {
      candidates.push(localPart);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}
