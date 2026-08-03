import { SendEmailCommand, type SESClient } from "@aws-sdk/client-ses";
import { logger } from "./logger.js";

export function getAppBaseUrl(): string {
  return process.env["APP_URL"] ?? "http://localhost:3000";
}

export async function sendInviteEmail(
  ses: SESClient,
  opts: {
    fromAddress: string;
    toEmail: string;
    userName: string;
    orgName: string;
    inviteToken: string;
  },
): Promise<void> {
  const inviteUrl = `${getAppBaseUrl()}/invite/${opts.inviteToken}`;
  const subject = `You're invited to ${opts.orgName} on FissionDocs`;
  const text = [
    `Hi ${opts.userName},`,
    "",
    `You've been invited to join ${opts.orgName} on FissionDocs.`,
    "",
    `Accept your invitation and set your password here:`,
    inviteUrl,
    "",
    `This link expires in 7 days.`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(opts.userName)},</p>
    <p>You've been invited to join <strong>${escapeHtml(opts.orgName)}</strong> on FissionDocs.</p>
    <p><a href="${inviteUrl}">Accept invitation and set your password</a></p>
    <p>This link expires in 7 days.</p>
  `.trim();

  if (process.env["NODE_ENV"] === "development") {
    logger.info(`Invite email for ${opts.toEmail}: ${inviteUrl}`);
  }

  try {
    await ses.send(
      new SendEmailCommand({
        Source: opts.fromAddress,
        Destination: { ToAddresses: [opts.toEmail] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: text },
            Html: { Data: html },
          },
        },
      }),
    );
  } catch (err) {
    // Invite row/token are already created — never fail the invite API on mail outage.
    // Admin can copy inviteUrl from the response / pending invites list.
    logger.warn(`Failed to send invite email to ${opts.toEmail}: ${String(err)}`, {
      inviteUrl,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
