import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

async function getTwilioConfig(orgId: string): Promise<TwilioConfig | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("sms_settings")
    .select("twilio_account_sid, twilio_auth_token_ciphertext, twilio_phone_number")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const authToken = decryptSecret(pgByteaToBuffer(data.twilio_auth_token_ciphertext as unknown as string));
  return {
    accountSid: data.twilio_account_sid as string,
    authToken,
    phoneNumber: data.twilio_phone_number as string,
  };
}

export async function sendSms(params: {
  orgId: string;
  to: string;
  text: string;
}): Promise<{ messageId?: string }> {
  const config = await getTwilioConfig(params.orgId);
  if (!config) throw new Error("Twilio not configured for this org");

  const body = new URLSearchParams({
    To: params.to,
    From: config.phoneNumber,
    Body: params.text,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      },
      body: body.toString(),
    },
  );

  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio send failed: ${json.message ?? res.statusText}`);
  return { messageId: json.sid };
}

export interface InboundSmsMessage {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

export function parseTwilioWebhook(body: URLSearchParams): InboundSmsMessage | null {
  const from = body.get("From");
  const to = body.get("To");
  const text = body.get("Body");
  const sid = body.get("MessageSid");
  if (!from || !to || !text) return null;
  return { from, to, body: text, messageSid: sid ?? "" };
}
