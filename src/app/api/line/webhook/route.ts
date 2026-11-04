import { createHmac, timingSafeEqual } from "node:crypto";
import { BetStatus, BetTarget, Prisma, RoundStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  countdownFlex,
  flexMessage,
  pushLine,
  replyLine,
  resultFlex,
  statusFlex,
  welcomeFlex,
} from "@/lib/line";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type LineEvent = {
  type: string;
  replyToken?: string;
  webhookEventId?: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; text?: string };
};

const targetNames: Record<BetTarget, string> = {
  BANKER: "เจ้ามือ",
  PLAYER_1: "ขา 1",
  PLAYER_2: "ขา 2",
  PLAYER_3: "ขา 3",
  PLAYER_4: "ขา 4",
  PLAYER_5: "ขา 5",
  PLAYER_6: "ขา 6",
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  const secret = process.env.LINE_CHANNEL_SECRET;

  if (!secret || !signature || !isValidSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid LINE signature" }, { status: 401 });
  }

  let events: LineEvent[];
  try {
    const payload: unknown = JSON.parse(rawBody);
    if (!isRecord(payload) || !Array.isArray(payload.events)) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    events = payload.events as LineEvent[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    for (const event of events) await handleEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to process LINE webhook event", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

function isValidSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function handleEvent(event: LineEvent): Promise<void> {
  const userId = event.source?.userId;
  if (event.type === "follow" && event.replyToken && userId) {
    const name = await fetchDisplayName(userId);
    await replyLine(event.replyToken, [welcomeFlex(name)]);
    return;
  }

  if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) {
    return;
  }
  await handleText(event, event.message.text?.trim() ?? "");
}

async function fetchDisplayName(userId: string): Promise<string> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`LINE profile API returned ${response.status}: ${await response.text()}`);
  }
  const profile: unknown = await response.json();
  if (!isRecord(profile) || typeof profile.displayName !== "string") {
    throw new Error("LINE profile response did not contain a display name");
  }
  return profile.displayName;
}

async function handleText(event: LineEvent, text: string): Promise<void> {
  const replyToken = event.replyToken!;
  const userId = event.source?.userId;
  const admins = new Set(
    (process.env.LINE_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const isAdmin = Boolean(userId && admins.has(userId));

  if (text === "c" || text === "C") {
    if (!userId) return replyLine(replyToken, [textMessage("ไม่พบ LINE user ID")]);
    const user = await prisma.user.findUnique({ where: { lineUserId: userId } });
    return replyLine(replyToken, [
      textMessage(
        user
          ? `เครดิตคงเหลือ ${user.credits.toLocaleString()}`
          : "ยังไม่ได้ลงทะเบียน กรุณากดลงทะเบียนจากข้อความต้อนรับ",
      ),
    ]);
  }

  if (/^[123]$/.test(text)) {
    if (!isAdmin) return replyLine(replyToken, [textMessage("คำสั่งนี้สำหรับแอดมินเท่านั้น")]);
    if (event.source?.type !== "group") {
      return replyLine(replyToken, [textMessage("คำสั่งนี้ใช้ได้เฉพาะในกลุ่ม")]);
    }
    if (text === "3") {
      const openRound = await prisma.gameRound.findFirst({
        where: { status: RoundStatus.OPEN },
      });
      if (!openRound) await prisma.gameRound.create({ data: {} });
    }
    return replyLine(replyToken, [countdownFlex(Number(text))]);
  }

  if (text.toUpperCase() === "A") {
    if (!isAdmin) return replyLine(replyToken, [textMessage("คำสั่งนี้สำหรับแอดมินเท่านั้น")]);
    if (event.source?.type !== "group") {
      return replyLine(replyToken, [textMessage("คำสั่งนี้ใช้ได้เฉพาะในกลุ่ม")]);
    }
    const round = await prisma.gameRound.findFirst({
      where: { status: RoundStatus.OPEN },
      orderBy: { createdAt: "desc" },
    });
    if (!round) return replyLine(replyToken, [statusFlex("ปิดรับเดิมพัน", "ไม่มีรอบที่เปิดรับอยู่")]);
    await prisma.gameRound.update({
      where: { id: round.id },
      data: { status: RoundStatus.CLOSED, closedAt: new Date() },
    });
    return replyLine(replyToken, [statusFlex("ปิดรับเดิมพัน", "รอบนี้ปิดรับเดิมพันแล้ว")]);
  }

  const scoreMatch = /^S\s*(\d+(?:\s*,\s*\d+){6})$/i.exec(text);
  if (scoreMatch) {
    if (!isAdmin) return replyLine(replyToken, [textMessage("คำสั่งนี้สำหรับแอดมินเท่านั้น")]);
    if (event.source?.type !== "group") {
      return replyLine(replyToken, [textMessage("คำสั่งนี้ใช้ได้เฉพาะในกลุ่ม")]);
    }
    const rawScores = scoreMatch[1].split(",").map((score) => Number(score.trim()));
    if (!rawScores.every(Number.isSafeInteger)) {
      return replyLine(replyToken, [textMessage("แต้มไพ่ต้องเป็นจำนวนเต็มที่ถูกต้อง")]);
    }
    const scores = rawScores.map((score) => score % 10);
    let result: Awaited<ReturnType<typeof settleRound>>;
    try {
      result = await settleRound(scores);
    } catch (error) {
      if (error instanceof Error && error.message === "NO_CLOSED_ROUND") {
        return replyLine(replyToken, [textMessage("ไม่มีรอบที่ปิดรับเดิมพันเพื่อสรุปผล")]);
      }
      throw error;
    }
    return replyLine(replyToken, [resultFlex(scores, result.payoutsByTarget)]);
  }

  const betMatch = /^(จ|[1-6])\s*\/\s*(\d+)$/i.exec(text);
  if (betMatch) {
    if (event.source?.type !== "group") {
      return replyLine(replyToken, [textMessage("วางเดิมพันได้เฉพาะในกลุ่ม")]);
    }
    if (!userId) return replyLine(replyToken, [textMessage("ไม่พบ LINE user ID")]);
    const amount = Number(betMatch[2]);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return replyLine(replyToken, [textMessage("จำนวนเครดิตต้องเป็นจำนวนเต็มมากกว่า 0")]);
    }
    const user = await prisma.user.findUnique({ where: { lineUserId: userId } });
    if (!user) {
      return replyLine(replyToken, [textMessage("กรุณาลงทะเบียนก่อนวางเดิมพัน")]);
    }
    const round = await prisma.gameRound.findFirst({
      where: { status: RoundStatus.OPEN },
      orderBy: { createdAt: "desc" },
    });
    if (!round) return replyLine(replyToken, [textMessage("ขณะนี้ไม่มีรอบที่เปิดรับเดิมพัน")]);

    const target = betMatch[1] === "จ"
      ? BetTarget.BANKER
      : `PLAYER_${betMatch[1]}` as BetTarget;
    try {
      await prisma.$transaction(async (tx) => {
        const debited = await tx.user.updateMany({
          where: { id: user.id, credits: { gte: amount } },
          data: { credits: { decrement: amount } },
        });
        if (debited.count !== 1) throw new Error("INSUFFICIENT_CREDITS");
        await tx.bet.create({
          data: {
            userId: user.id,
            roundId: round.id,
            target,
            amount,
            lineEventId: event.webhookEventId,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
        return replyLine(replyToken, [textMessage("เครดิตไม่เพียงพอ")]);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return replyLine(replyToken, [textMessage("รับรายการนี้แล้ว")]);
      }
      throw error;
    }
    return replyLine(replyToken, [
      textMessage(`รับเดิมพัน${targetNames[target]} ${amount.toLocaleString()} เครดิตแล้ว`),
    ]);
  }
}

async function settleRound(scores: number[]) {
  const [banker, ...players] = scores;
  return prisma.$transaction(async (tx) => {
    const round = await tx.gameRound.findFirst({
      where: { status: RoundStatus.CLOSED },
      orderBy: { createdAt: "desc" },
      include: { bets: true },
    });
    if (!round) throw new Error("NO_CLOSED_ROUND");

    const claimed = await tx.gameRound.updateMany({
      where: { id: round.id, status: RoundStatus.CLOSED },
      data: {
        status: RoundStatus.SETTLED,
        bankerScore: banker,
        player1Score: players[0],
        player2Score: players[1],
        player3Score: players[2],
        player4Score: players[3],
        player5Score: players[4],
        player6Score: players[5],
        settledAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new Error("รอบนี้ถูกสรุปผลไปแล้ว");

    const totals = new Map<BetTarget, number>();
    for (const bet of round.bets) {
      let status: BetStatus;
      let payout: number;
      if (bet.target === BetTarget.BANKER) {
        const tie = players.some((score) => score === banker);
        const won = banker > Math.max(...players);
        status = tie ? BetStatus.PUSH : won ? BetStatus.WON : BetStatus.LOST;
        payout = tie ? bet.amount : won ? bet.amount * 2 : 0;
      } else {
        const playerIndex = Number(bet.target.slice("PLAYER_".length)) - 1;
        const playerScore = players[playerIndex];
        status =
          playerScore === banker
            ? BetStatus.PUSH
            : playerScore > banker
              ? BetStatus.WON
              : BetStatus.LOST;
        payout = status === BetStatus.PUSH ? bet.amount : status === BetStatus.WON ? bet.amount * 2 : 0;
      }

      await tx.bet.update({
        where: { id: bet.id },
        data: { status, payout, settledAt: new Date() },
      });
      if (payout > 0) {
        await tx.user.update({
          where: { id: bet.userId },
          data: { credits: { increment: payout } },
        });
      }
      totals.set(bet.target, (totals.get(bet.target) ?? 0) + payout);
    }

    return {
      payoutsByTarget: [...totals.entries()].map(([target, payout]) => ({
        target: targetNames[target],
        payout,
      })),
    };
  });
}

function textMessage(text: string) {
  return flexMessage(text, {
    type: "bubble",
    body: { type: "box", layout: "vertical", contents: [{ type: "text", text, wrap: true }] },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
