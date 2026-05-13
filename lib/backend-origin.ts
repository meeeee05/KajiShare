const withHttps = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

export const backendOrigin = () =>
  withHttps(process.env.FRONTEND_URL) ||
  withHttps(process.env.AUTH_URL) ||
  withHttps(process.env.NEXTAUTH_URL) ||
  withHttps(process.env.NEXT_PUBLIC_APP_URL) ||
  withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  withHttps(process.env.VERCEL_URL) ||
  "http://localhost:3000";
