import CustomLink from "@/components/custom-link";
import { auth } from "@/auth";

export default async function Home() {
  //セッション取得
  const session = await auth();

  const apiUrl = process.env.API_URL;
  let apiResponseBody: unknown = null;

  if (session?.user?.idToken && apiUrl) {
    try {
      const response = await fetch(`${apiUrl}/users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.user.idToken}`,
        },
      });
      const rawBody = await response.text();
      console.log("API Response status", response.status);
      console.log("API Response body", rawBody);

      try {
        apiResponseBody = JSON.parse(rawBody);
      } catch {
        apiResponseBody = rawBody;
      }
    } catch (error) {
      console.error("API call failed", error);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">🚀NextAuth.js Tutorial</h1>
      <div>
        <CustomLink href="/server-example" className="underline">
          サーバー
        </CustomLink>
        と
        <CustomLink href="/client-example" className="underline">
          クライアント
        </CustomLink>
        の例を見て、ページを保護してセッションデータを取得する方法を確認してください。
      </div>
      <div className="flex flex-col rounded-md bg-neutral-100">
        <div className="p-4 font-bold rounded-t-md bg-neutral-200">
          Current Session
        </div>
        <pre className="py-6 px-4 whitespace-pre-wrap break-all">
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>
      {apiResponseBody ? (
        <div className="flex flex-col rounded-md bg-neutral-100">
          <div className="p-4 font-bold rounded-t-md bg-neutral-200">
            Latest /users API Response
          </div>
          <pre className="py-6 px-4 whitespace-pre-wrap break-all">
            {typeof apiResponseBody === "string"
              ? apiResponseBody
              : JSON.stringify(apiResponseBody, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
