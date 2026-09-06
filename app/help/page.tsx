import HelpContactForm from "./_components/help-contact-form";
import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="prose max-w-none p-4 sm:p-6">
      <div className="mb-2 flex items-center justify-center gap-0">
        <span className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none sm:text-5xl">
          Kaji
        </span>
        <span className="ml-0.5 text-4xl font-extrabold tracking-tight leading-none text-blue-600 sm:text-5xl">
          Share
        </span>
      </div>
      <p className="mt-10 text-center">
        KajiShareは、家事や毎日のタスクをみんなで分担・共有するためのアプリです。
      </p>
      <p className="mt-4 text-sm text-center">
        グループを作成することで、家族やルームメイトとタスクの進捗を共有できます。
      </p>
      <p className="mt-2 text-sm text-center">
        タスクの完了状況をリアルタイムで確認できるため、効率的に家事を分担することが可能です。
      </p>

      <h2 className="mt-16 font-extrabold sm:mt-32">お問い合わせ</h2>
      <p>ご質問やご意見がある場合は、以下のフォームからご連絡ください。</p>
      <div className="not-prose w-full max-w-[390px] sm:max-w-xl">
        <HelpContactForm />
      </div>

      <p className="mt-10 text-sm">
        個人情報の取り扱いについては、
        <Link href="/privacy">プライバシーポリシー</Link>
        をご確認ください。
      </p>
    </div>
  );
}
