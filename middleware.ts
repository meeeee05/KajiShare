//リクエストを送る前の制限
export { auth as middleware} from "@/auth";

//正規表現の許可
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
}