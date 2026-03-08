"use client";

type Props = {
  initialName?: string | null;
  initialEmail?: string | null;
};

export default function AccountEditableFields({
  initialName,
  initialEmail,
}: Props) {
  const values: Record<"name" | "email", string> = {
    name: initialName ?? "",
    email: initialEmail ?? "",
  };

  const rows: Array<{ key: "name" | "email"; label: string }> = [
    { key: "name", label: "名前" },
    { key: "email", label: "メール" },
  ];

  return (
    <div className="not-prose mt-8 space-y-6">
      {rows.map((row) => {
        return (
          <div
            key={row.key}
            className="grid grid-cols-[140px_1fr] items-center gap-3 text-base sm:text-lg"
          >
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {row.label}
            </span>
            <span className="font-medium break-all">
              {values[row.key] || "未設定"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
