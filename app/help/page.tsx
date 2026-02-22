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
      <p>
        KajiShareは、家事や毎日のタスクをみんなでゆるく分担・共有できるサービスです。誰が何をやるか、今どこまで進んでいるかがパッとわかるので、「気づいたら一人に負担が偏っていた…」みたいな状態を防ぎやすくなります。家族や同居人、パートナーとのやり取りをもっとスムーズにして、毎日の家事を少しラクにするためのツールです。
      </p>

      <h2>お問い合わせ</h2>
      <p>ご質問やご意見がある場合は、以下のフォームからご連絡ください。</p>
      <div className="not-prose max-w-xl">
        <HelpContactForm />
      </div>
    </div>
  );
}
