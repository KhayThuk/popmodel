import { NextRequest, NextResponse } from "next/server";
import { inviteFlex, pushLine } from "@/lib/line";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("line_oauth_state")?.value;
  const expectedNonce = request.cookies.get("line_oauth_nonce")?.value;
  const callbackUrl = process.env.LINE_LOGIN_CALLBACK_URL;
  const clientId = process.env.LINE_LOGIN_CLIENT_ID;
  const clientSecret = process.env.LINE_LOGIN_CLIENT_SECRET;

  if (!code || !state || !expectedState || state !== expectedState || !expectedNonce) {
    return NextResponse.json({ error: "Invalid or expired LINE Login state" }, { status: 400 });
  }
  if (!callbackUrl || !clientId || !clientSecret) {
    return NextResponse.json({ error: "LINE Login is not configured" }, { status: 500 });
  }

  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok) {
    console.error("LINE token exchange failed", tokenResponse.status, await tokenResponse.text());
    return clearStateCookie(
      NextResponse.json({ error: "LINE Login token exchange failed" }, { status: 502 }),
    );
  }

  const tokenPayload: unknown = await tokenResponse.json();
  if (!isRecord(tokenPayload) || typeof tokenPayload.id_token !== "string") {
    return clearStateCookie(
      NextResponse.json({ error: "LINE did not return an ID token" }, { status: 502 }),
    );
  }

  const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: tokenPayload.id_token, client_id: clientId }),
  });
  if (!verifyResponse.ok) {
    console.error("LINE ID token verification failed", verifyResponse.status);
    return clearStateCookie(
      NextResponse.json({ error: "LINE ID token verification failed" }, { status: 502 }),
    );
  }

  const identity: unknown = await verifyResponse.json();
  if (
    !isRecord(identity) ||
    typeof identity.sub !== "string" ||
    typeof identity.name !== "string" ||
    identity.nonce !== expectedNonce
  ) {
    return clearStateCookie(
      NextResponse.json({ error: "LINE ID token is missing profile claims" }, { status: 502 }),
    );
  }

  const user = await prisma.user.upsert({
    where: { lineUserId: identity.sub },
    create: {
      lineUserId: identity.sub,
      displayName: identity.name,
      credits: 10000,
    },
    update: { displayName: identity.name },
  });

  try {
    await pushLine(user.lineUserId, [inviteFlex()]);
  } catch (error) {
    console.error("Registration succeeded but LINE invite push failed", error);
    return clearStateCookie(
      NextResponse.json(
        { error: "ลงทะเบียนสำเร็จ แต่ส่งข้อความเชิญไม่สำเร็จ กรุณาลองเข้าสู่ระบบอีกครั้ง" },
        { status: 502 },
      ),
    );
  }

  return clearStateCookie(
    NextResponse.json({
      registered: true,
      displayName: user.displayName,
      credits: user.credits,
      message: "ลงทะเบียนสำเร็จ ระบบส่งลิงก์เข้ากลุ่มทาง LINE แล้ว",
    }),
  );
}

function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.set("line_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/line/callback",
    maxAge: 0,
  });
  response.cookies.set("line_oauth_nonce", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/line/callback",
    maxAge: 0,
  });
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
