type LineMessage = Record<string, unknown>;

const lineApi = "https://api.line.me/v2/bot";

export async function replyLine(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  await sendLine(`${lineApi}/message/reply`, { replyToken, messages });
}

export async function pushLine(
  to: string,
  messages: LineMessage[],
): Promise<void> {
  await sendLine(`${lineApi}/message/push`, { to, messages });
}

async function sendLine(url: string, body: unknown): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`LINE API returned ${response.status}: ${details}`);
  }
}

export function flexMessage(altText: string, contents: unknown): LineMessage {
  return { type: "flex", altText, contents };
}

export function welcomeFlex(displayName: string): LineMessage {
  const loginUrl = process.env.LINE_LOGIN_URL;
  if (!loginUrl) throw new Error("LINE_LOGIN_URL is not configured");
  if (!URL.canParse(loginUrl)) throw new Error("LINE_LOGIN_URL must be an absolute URL");

  return flexMessage("ยินดีต้อนรับสู่ป๊อกเด้งนักเรียน", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `สวัสดีคุณ ${displayName}`, weight: "bold", size: "xl" },
        {
          type: "text",
          text: "ลงทะเบียนเพื่อรับเครดิตเริ่มต้น 10,000",
          wrap: true,
          margin: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          action: { type: "uri", label: "ลงทะเบียนด้วย LINE", uri: loginUrl },
        },
      ],
    },
  });
}

export function inviteFlex(): LineMessage {
  return flexMessage("เข้าร่วมกลุ่มป๊อกเด้งนักเรียน", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "ลงทะเบียนสำเร็จ!", weight: "bold", size: "xl" },
        { type: "text", text: "เข้ากลุ่มเพื่อเริ่มเล่นเกมจำลอง", wrap: true, margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          action: {
            type: "uri",
            label: "เข้ากลุ่ม",
            uri: "https://line.me/R/ti/g/B-8neXVuxK",
          },
        },
      ],
    },
  });
}

export function countdownFlex(number: number): LineMessage {
  return flexMessage(`นับถอยหลัง ${number}`, {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "เตรียมตัว", align: "center", size: "lg" },
        {
          type: "text",
          text: String(number),
          align: "center",
          size: "5xl",
          weight: "bold",
          color: "#D32F2F",
        },
      ],
    },
  });
}

export function statusFlex(title: string, detail: string): LineMessage {
  return flexMessage(title, {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: title, weight: "bold", size: "xl" },
        { type: "text", text: detail, wrap: true, margin: "md" },
      ],
    },
  });
}

export function resultFlex(
  scores: number[],
  payoutsByTarget: { target: string; payout: number }[],
): LineMessage {
  const labels = ["เจ้ามือ", "ขา 1", "ขา 2", "ขา 3", "ขา 4", "ขา 5", "ขา 6"];
  const scoreRows = labels.map((label, index) => ({
    type: "text",
    text: `${label}: ${scores[index]}`,
    size: "sm",
  }));
  const payoutRows = payoutsByTarget.map(({ target, payout }) => ({
    type: "text",
    text: `${target}: จ่าย ${payout.toLocaleString()} เครดิต`,
    size: "sm",
  }));

  return flexMessage("ตารางสรุปผล", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: "ตารางสรุปผล", weight: "bold", size: "xl" },
        ...scoreRows,
        { type: "separator", margin: "md" },
        { type: "text", text: "เงินรางวัลรวม", weight: "bold", margin: "md" },
        ...(payoutRows.length
          ? payoutRows
          : [{ type: "text", text: "ไม่มีการเดิมพัน", size: "sm" }]),
      ],
    },
  });
}
