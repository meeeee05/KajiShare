import HelpContactForm from "@/components/help-contact-form";

export default function HelpPage() {
  return (
    <div className="prose max-w-none p-6">
      <div className="mb-2 flex items-center justify-center gap-0">
        <span className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
          Kaji
        </span>
        <span className="text-5xl font-extrabold tracking-tight text-blue-600 leading-none ml-0.4">
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

      <h2 className="mt-40 font-extrabold">お問い合わせ</h2>
      <p>ご質問やご意見がある場合は、以下のフォームからご連絡ください。</p>
      <div className="not-prose max-w-xl">
        <HelpContactForm />
      </div>
    </div>
  );
}
