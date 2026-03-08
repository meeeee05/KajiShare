"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

export default function HelpContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      setError("名前・メールアドレス・問い合わせ内容を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/e-mail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          message: trimmedMessage,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          (data as any)?.error ??
            "送信に失敗しました。時間をおいて再度お試しください。",
        );
        return;
      }

      setSuccess("お問い合わせを送信しました。ありがとうございます。");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setError(
        "送信中にエラーが発生しました。時間をおいて再度お試しください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <div className="space-y-1">
        <label htmlFor="contact-name" className="text-sm font-medium">
          名前
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="山田 太郎"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="contact-email" className="text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="example@example.com"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="contact-message" className="text-sm font-medium">
          問い合わせ内容
        </label>
        <textarea
          id="contact-message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="お問い合わせ内容を入力してください"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "送信中..." : "送信"}
      </Button>
    </form>
  );
}
