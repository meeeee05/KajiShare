export const backendServerHeaders = (): Record<string, string> => {
  const secret = process.env.FRONTEND_API_SECRET?.trim();

  if (!secret) {
    return {};
  }

  return {
    "X-Frontend-Api-Secret": secret,
  };
};
