import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type ContactPayload = {
  name?: string;
  email?: string;
  message?: string;
};

// メールアドレスのバリデーション
const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export async function POST(req: Request) {
  let body: ContactPayload;

  try {
    body = (await req.json()) as ContactPayload;
  } catch {
    return NextResponse.json(
      { error: "リクエスト形式が不正です。" },
      { status: 400 },
    );
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "名前・メールアドレス・問い合わせ内容は必須です。" },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "メールアドレスの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = (process.env.SMTP_SECURE ?? "false") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  const to = process.env.CONTACT_TO;

  if (!host || !port || !user || !pass || !from || !to) {
    return NextResponse.json(
      {
        error:
          "メール送信設定が不足しています。SMTP と CONTACT_TO を設定してください。",
      },
      { status: 500 },
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from,
      to,
      replyTo: email,
      subject: `【KajiShare お問い合わせ】${name} 様`,
      text: `名前: ${name}\nメール: ${email}\n\n問い合わせ内容:\n${message}`,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Send contact mail error", error);
    return NextResponse.json(
      { error: "メール送信に失敗しました。" },
      { status: 500 },
    );
  }
}
