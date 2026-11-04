import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: {
    userId?: string;
    type?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookBody = {
  events: LineEvent[];
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret || !signature || !isValidSignature(rawBody, signature, channelSecret)) {
    console.error(
      !channelSecret
        ? "LINE_CHANNEL_SECRET is not configured"
        : "Received LINE webhook with an invalid signature; events were ignored",
    );
    return NextResponse.json({ ok: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isLineWebhookBody(payload)) {
    return NextResponse.json({ error: "Invalid LINE webhook payload" }, { status: 400 });
  }

  // วนลูปจัดการทุก Event ที่ส่งเข้ามา
  for (const event of payload.events) {
    if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
      const userText = event.message.text;
      const replyToken = event.replyToken;

      // ตัวอย่าง: ตอบกลับข้อความสะท้อนกลับไปหาผู้ใช้
      const replyMessage = `คุณพิมพ์มาว่า: "${userText}" (ระบบรับทราบแล้วครับ!)`;
      await sendLineReply(replyToken, replyMessage);
    }
  }

  return NextResponse.json({ ok: true });
}

// ฟังก์ชันสำหรับส่งข้อความตอบกลับผ่าน LINE Messaging API
async function sendLineReply(replyToken: string, text: string) {
  const accessToken = process.env.CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("CHANNEL_ACCESS_TOKEN is not configured");
    return;
  }

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [
        {
          type: "text",
          text: text,
        },
      ],
    }),
  });
}

function isValidSignature(body: string, signature: string, channelSecret: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;

  const expected = createHmac("sha256", channelSecret).update(body).digest();
  const received = Buffer.from(signature, "base64");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isLineWebhookBody(value: unknown): value is LineWebhookBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "events" in value &&
    Array.isArray(value.events) &&
    value.events.every(isLineEvent)
  );
}

function isLineEvent(value: unknown): value is LineEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;

  return (
    (event.type === undefined || typeof event.type === "string") &&
    (event.replyToken === undefined || typeof event.replyToken === "string") &&
    (event.source === undefined ||
      (typeof event.source === "object" &&
        event.source !== null &&
        (!("userId" in event.source) || typeof event.source.userId === "string") &&
        (!("type" in event.source) || typeof event.source.type === "string"))) &&
    (event.message === undefined ||
      (typeof event.message === "object" &&
        event.message !== null &&
        (!("type" in event.message) || typeof event.message.type === "string") &&
        (!("text" in event.message) || typeof event.message.text === "string")))
  );
}