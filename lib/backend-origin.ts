export const backendOrigin = () =>
  process.env.FRONTEND_URL ||
  process.env.AUTH_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";
