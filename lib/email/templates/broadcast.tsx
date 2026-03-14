import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type BroadcastPayload = {
  subject: string;
  bodyHtml: string;
  unsubscribeUrl: string;
};

export function getSubject(payload: BroadcastPayload) {
  return payload.subject;
}

export default function BroadcastEmail({ subject, bodyHtml, unsubscribeUrl }: BroadcastPayload) {
  return (
    <EmailLayout preview={subject} unsubscribeUrl={unsubscribeUrl}>
      <Preview>{subject}</Preview>
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </EmailLayout>
  );
}
