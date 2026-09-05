"use server";

import nodemailer from "nodemailer";
import { auth } from "@/auth";
import { backendOrigin } from "@/lib/backend-origin";
import { backendServerHeaders } from "@/lib/backend-server-headers";
import {
  GUEST_EXPIRED_REDIRECT_PATH,
  isGuestSessionExpiredStatus,
  isGuestSessionUser,
} from "@/lib/guest-session";

type ActionResult<T = unknown> = {
  ok: boolean;
  status: number;
  payload: T | null;
  error?: string;
  redirectTo?: string;
};

type BackendMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const pickErrorMessage = (
  payload: unknown,
  fallback: string,
  status: number,
) => {
  const data = asRecord(payload);
  const message = data?.error ?? data?.message;
  return typeof message === "string" && message.trim()
    ? message
    : `${fallback}(status: ${status})`;
};

const backendBase = () => {
  const apiUrl = process.env.API_URL?.replace(/\/+$/, "");
  return apiUrl
    ? apiUrl.endsWith("/api/v1")
      ? apiUrl
      : `${apiUrl}/api/v1`
    : undefined;
};

export async function backendAction<T = unknown>({
  method,
  path,
  body,
  fallbackError,
}: {
  method: BackendMethod;
  path: string;
  body?: unknown;
  fallbackError: string;
}): Promise<ActionResult<T>> {
  const session = await auth();
  const idToken = (session?.user as { idToken?: string } | undefined)?.idToken;
  const base = backendBase();

  if (!session || !idToken) {
    return { ok: false, status: 401, payload: null, error: "認証情報がありません" };
  }
  if (!base) {
    return {
      ok: false,
      status: 500,
      payload: null,
      error: "API_URL is not configured",
    };
  }

  const endpoint = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        Origin: backendOrigin(),
        ...backendServerHeaders(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await res.json().catch(() => null);

    if (
      isGuestSessionUser(session.user) &&
      isGuestSessionExpiredStatus(res.status)
    ) {
      return {
        ok: false,
        status: res.status,
        payload,
        redirectTo: GUEST_EXPIRED_REDIRECT_PATH,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        payload,
        error: pickErrorMessage(payload, fallbackError, res.status),
      };
    }

    return { ok: true, status: res.status, payload: payload as T };
  } catch {
    return { ok: false, status: 502, payload: null, error: fallbackError };
  }
}

const backendActionWithPutFallback = async (
  request: Parameters<typeof backendAction>[0],
) => {
  const result = await backendAction(request);
  return result.ok || result.redirectTo
    ? result
    : backendAction({ ...request, method: "PUT" });
};

export async function createTaskAction(input: {
  groupId: string;
  name: string;
  point: number;
  description: string | null;
}) {
  const taskResult = await backendAction({
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/tasks`,
    body: {
      task: {
        name: input.name,
        point: input.point,
        description: input.description,
      },
    },
    fallbackError: "タスク作成に失敗しました。",
  });

  if (!taskResult.ok || taskResult.redirectTo) {
    return taskResult;
  }

  const createdTaskId = extractCreatedTaskId(taskResult.payload);
  if (!createdTaskId) {
    return {
      ok: false,
      status: 200,
      payload: taskResult.payload,
      error: "タスクは作成されましたが task_id を取得できませんでした。",
    };
  }

  return backendAction({
    method: "POST",
    path: `/tasks/${encodeURIComponent(createdTaskId)}/assignments`,
    body: { assignment: { status: "not_started" } },
    fallbackError: "タスク作成後の割り振り作成に失敗しました。",
  });
}

export async function updateGroupFieldAction(input: {
  groupId: string;
  field: "name" | "assign_mode" | "balance_type";
  value: string;
}) {
  return backendActionWithPutFallback({
    method: "PATCH",
    path: `/groups/${encodeURIComponent(input.groupId)}`,
    body: { group: { [input.field]: input.value } },
    fallbackError: "グループの更新に失敗しました。",
  });
}

export async function leaveGroupAction(input: {
  groupId?: string;
  shareKey?: string;
}) {
  let targetGroupId = input.groupId;

  if (!targetGroupId && input.shareKey) {
    const groups = await backendAction({
      method: "GET",
      path: "/groups",
      fallbackError: "グループ一覧の取得に失敗しました。",
    });
    if (!groups.ok || groups.redirectTo) {
      return groups;
    }
    targetGroupId = findGroupIdByShareKey(groups.payload, input.shareKey);
  }

  if (!targetGroupId) {
    return {
      ok: false,
      status: 400,
      payload: null,
      error: "退会対象のグループIDを取得できませんでした。",
    };
  }

  return backendAction({
    method: "DELETE",
    path: `/groups/${encodeURIComponent(targetGroupId)}/leave`,
    fallbackError: "退会に失敗しました。時間をおいて再度お試しください。",
  });
}

export async function updateAssignmentStatusAction(input: {
  assignmentId: string;
  status: "not_started" | "in_progress" | "completed";
  completedDate: string | null;
}) {
  return backendActionWithPutFallback({
    method: "PATCH",
    path: `/assignments/${encodeURIComponent(input.assignmentId)}`,
    body: {
      assignment: {
        completed_date: input.completedDate,
        status: input.status,
      },
    },
    fallbackError: "ステータス更新に失敗しました。",
  });
}

export async function deleteTaskResourceAction(input: {
  taskId: string;
  resourceType?: "task" | "recurring";
}) {
  const label = input.resourceType === "recurring" ? "周期タスク" : "タスク";
  const resourcePath =
    input.resourceType === "recurring" ? "recurring_tasks" : "tasks";
  return backendAction({
    method: "DELETE",
    path: `/${resourcePath}/${encodeURIComponent(input.taskId)}`,
    fallbackError: `${label}削除に失敗しました。`,
  });
}

export async function createEvaluationAction(input: {
  assignmentId: string;
  score: number;
  comment: string;
}) {
  return backendAction({
    method: "POST",
    path: `/assignments/${encodeURIComponent(input.assignmentId)}/evaluations`,
    body: { evaluation: { score: input.score, comment: input.comment } },
    fallbackError: "評価の登録に失敗しました。",
  });
}

export async function createGroupAction(input: { name: string }) {
  return backendAction({
    method: "POST",
    path: "/groups",
    body: { group: { name: input.name } },
    fallbackError:
      "グループの登録に失敗しました。時間をおいて再度お試しください。",
  });
}

export async function joinGroupAction(input: { shareKey: string }) {
  return backendAction({
    method: "POST",
    path: "/groups/join",
    body: { share_key: input.shareKey },
    fallbackError: "グループ参加に失敗しました。招待IDをご確認ください。",
  });
}

export async function getNotificationsAction(input?: {
  limit?: number;
  debug?: boolean;
}) {
  const params = new URLSearchParams({
    limit: String(input?.limit ?? 100),
  });
  if (input?.debug) {
    params.set("debug", "1");
  }
  return backendAction({
    method: "GET",
    path: `/notifications?${params.toString()}`,
    fallbackError: "通知の取得に失敗しました",
  });
}

export async function getRecurringTaskAction(input: { id: string }) {
  return backendAction({
    method: "GET",
    path: `/recurring_tasks/${encodeURIComponent(input.id)}`,
    fallbackError: "周期タスク詳細の取得に失敗しました。",
  });
}

export async function saveRecurringTaskAction(input: {
  groupId: string;
  editingId?: string | null;
  body: unknown;
}) {
  return backendAction({
    method: input.editingId ? "PATCH" : "POST",
    path: input.editingId
      ? `/recurring_tasks/${encodeURIComponent(input.editingId)}`
      : `/groups/${encodeURIComponent(input.groupId)}/recurring_tasks`,
    body: input.body,
    fallbackError: "周期タスクの保存に失敗しました。",
  });
}

export async function deleteRecurringTaskAction(input: { id: string }) {
  return backendAction({
    method: "DELETE",
    path: `/recurring_tasks/${encodeURIComponent(input.id)}`,
    fallbackError: "周期タスク削除に失敗しました。",
  });
}

export async function deleteAccountAction() {
  const session = await auth();
  const userId = (session?.user as { id?: string | number } | undefined)?.id;

  const first = await backendAction({
    method: "DELETE",
    path: "/users/me",
    fallbackError: "アカウント削除に失敗しました。",
  });
  if (first.ok || first.redirectTo || !userId) {
    return first;
  }

  return backendAction({
    method: "DELETE",
    path: `/users/${encodeURIComponent(String(userId))}`,
    fallbackError: "アカウント削除に失敗しました。",
  });
}

export async function sendContactAction(input: {
  name: string;
  email: string;
  message: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (!name || !email || !message) {
    return {
      ok: false,
      status: 400,
      payload: null,
      error: "名前・メールアドレス・問い合わせ内容は必須です。",
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      status: 400,
      payload: null,
      error: "メールアドレスの形式が正しくありません。",
    };
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = (process.env.SMTP_SECURE ?? "false") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  const to = process.env.CONTACT_TO;

  if (!host || !port || !user || !pass || !from || !to) {
    return {
      ok: false,
      status: 500,
      payload: null,
      error: "メール送信設定が不足しています。",
    };
  }

  try {
    await nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    }).sendMail({
      from,
      to,
      replyTo: email,
      subject: `【KajiShare お問い合わせ】${name} 様`,
      text: `名前: ${name}\nメール: ${email}\n\n問い合わせ内容:\n${message}`,
    });

    return { ok: true, status: 200, payload: { ok: true } };
  } catch {
    return {
      ok: false,
      status: 500,
      payload: null,
      error: "メール送信に失敗しました。",
    };
  }
}

const extractCreatedTaskId = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const taskFromData = asRecord(data?.task);
  const task = asRecord(root?.task) ?? data ?? taskFromData;
  const source = task ?? root;
  const id = source?.id ?? source?.task_id;

  if (typeof id === "string" && id.trim()) {
    return id;
  }
  if (typeof id === "number") {
    return String(id);
  }
  return undefined;
};

const findGroupIdByShareKey = (
  payload: unknown,
  shareKey: string,
): string | undefined => {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : [];

  for (const row of rows) {
    const record = asRecord(row);
    const source =
      asRecord(record?.group) ?? asRecord(record?.data) ?? asRecord(record);
    const candidate = source?.share_key ?? source?.shareKey;
    if (candidate === shareKey) {
      const id = source?.id;
      return id == null ? undefined : String(id);
    }
  }

  return undefined;
};
