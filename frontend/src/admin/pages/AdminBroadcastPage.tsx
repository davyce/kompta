import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Bell, Building2, CheckCircle, Info, Megaphone, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";
import i18n from "../../i18n";

type BroadcastType = "info" | "warning" | "critical";

type BroadcastRecord = {
  id: number;
  title: string;
  message: string;
  type: BroadcastType;
  target: string;
  sentAt: string;
  userCount: number;
};

const LS_KEY = "kompta_admin_broadcasts";

function loadBroadcasts(): BroadcastRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as BroadcastRecord[];
  } catch {
    return [];
  }
}

function saveBroadcasts(items: BroadcastRecord[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 5)));
  } catch {}
}

const TYPE_STYLES: Record<BroadcastType, { labelTk: string; icon: typeof Info; cardClass: string; badgeClass: string; iconClass: string }> = {
  info: {
    labelTk: "admin.broadcast.typeInfo",
    icon: Info,
    cardClass: "border-indigo-200 bg-indigo-50 dark:border-indigo-400/40 dark:bg-gradient-to-br dark:from-indigo-500/15 dark:to-indigo-500/10",
    badgeClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
    iconClass: "text-indigo-600 dark:text-indigo-300",
  },
  warning: {
    labelTk: "admin.broadcast.typeWarning",
    icon: AlertTriangle,
    cardClass: "border-indigo-200 bg-amber-50 dark:border-indigo-500/40 dark:bg-gradient-to-br dark:from-indigo-600/15 dark:to-indigo-600/10",
    badgeClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-200",
    iconClass: "text-indigo-600 dark:text-indigo-300",
  },
  critical: {
    labelTk: "admin.broadcast.typeCritical",
    icon: AlertTriangle,
    cardClass: "border-rose-200 bg-rose-50 dark:border-rose-400/40 dark:bg-gradient-to-br dark:from-rose-500/15 dark:to-red-500/10",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    iconClass: "text-rose-600 dark:text-rose-300",
  },
};

export function AdminBroadcastPage() {
  const { t: tr } = useTranslation();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<BroadcastType>("info");
  const [targetAll, setTargetAll] = useState(true);
  const [targetCompanyId, setTargetCompanyId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>(() => loadBroadcasts());

  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });

  const sendBroadcast = useMutation({
    mutationFn: () =>
      api.adminBroadcast({
        title,
        message,
        type,
        target_company_id: targetAll ? undefined : targetCompanyId ?? undefined,
      }),
    onSuccess: (data) => {
      const record: BroadcastRecord = {
        id: Date.now(),
        title,
        message,
        type,
        target: targetAll
          ? tr("admin.broadcast.allCompanies")
          : companies.data?.find((c) => c.id === targetCompanyId)?.name ?? tr("admin.broadcast.companyNumber", { id: targetCompanyId }),
        sentAt: new Date().toISOString(),
        userCount: data.user_count ?? 0,
      };
      const next = [record, ...broadcasts].slice(0, 5);
      setBroadcasts(next);
      saveBroadcasts(next);
      setSuccessMsg(tr("admin.broadcast.sentSuccess", { count: data.user_count ?? 0 }));
      setTitle("");
      setMessage("");
      setType("info");
      setTimeout(() => setSuccessMsg(null), 5000);
    },
  });

  const typeStyle = TYPE_STYLES[type];
  const TypeIcon = typeStyle.icon;

  const targetLabel = targetAll
    ? tr("admin.broadcast.allCompanies")
    : companies.data?.find((c) => c.id === targetCompanyId)?.name ?? tr("admin.broadcast.selectCompany");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{tr("admin.broadcast.eyebrow")}</p>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">{tr("admin.broadcast.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{tr("admin.broadcast.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.55fr]">
        {/* Form */}
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="font-black text-slate-900 dark:text-white">{tr("admin.broadcast.compose")}</h2>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              {tr("admin.broadcast.fieldTitle")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("admin.broadcast.titlePlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/35"
            />
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              {tr("admin.broadcast.fieldMessage")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={tr("admin.broadcast.messagePlaceholder")}
              rows={5}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/35"
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              {tr("admin.broadcast.messageType")}
            </label>
            <div className="flex flex-wrap gap-2">
              {(["info", "warning", "critical"] as BroadcastType[]).map((t) => {
                const s = TYPE_STYLES[t];
                const Icon = s.icon;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                      type === t
                        ? `${s.cardClass} border-current`
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                  >
                    <Icon size={15} className={type === t ? s.iconClass : ""} />
                    {tr(s.labelTk)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">
              {tr("admin.broadcast.target")}
            </label>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTargetAll(true)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                    targetAll
                      ? "border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  <Megaphone size={15} /> {tr("admin.broadcast.allCompanies")}
                </button>
                <button
                  onClick={() => setTargetAll(false)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${
                    !targetAll
                      ? "border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  <Building2 size={15} /> {tr("admin.broadcast.specificCompany")}
                </button>
              </div>
              {!targetAll && (
                <select
                  value={targetCompanyId ?? ""}
                  onChange={(e) => setTargetCompanyId(Number(e.target.value) || null)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{tr("admin.broadcast.selectCompany")}</option>
                  {(companies.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Send */}
          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <CheckCircle size={16} /> {successMsg}
            </div>
          )}
          {sendBroadcast.isError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              <AlertTriangle size={16} /> {tr("admin.broadcast.sendError")}
            </div>
          )}
          <button
            disabled={!title.trim() || !message.trim() || (!targetAll && !targetCompanyId) || sendBroadcast.isPending}
            onClick={() => sendBroadcast.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Send size={16} />
            {sendBroadcast.isPending ? tr("admin.broadcast.sending") : tr("admin.broadcast.send")}
          </button>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">{tr("admin.broadcast.preview")}</p>
            <div className={`rounded-xl border p-5 space-y-3 text-slate-900 dark:text-white ${typeStyle.cardClass}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70 dark:bg-black/20`}>
                  <TypeIcon size={18} className={typeStyle.iconClass} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${typeStyle.badgeClass}`}>
                      {tr(typeStyle.labelTk)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-white/40">→ {targetLabel}</span>
                  </div>
                  <p className="mt-1.5 font-black leading-snug">
                    {title || <span className="text-slate-400 dark:text-white/30 italic">{tr("admin.broadcast.titlePlaceholder")}</span>}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-white/70 leading-6 whitespace-pre-wrap">
                    {message || <span className="text-slate-400 dark:text-white/25 italic">{tr("admin.broadcast.messagePlaceholder")}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-slate-200 dark:border-white/10 text-xs text-slate-400 dark:text-white/35">
                <Bell size={11} /> KOMPTA Platform · {new Date().toLocaleDateString(i18n.language)}
              </div>
            </div>
          </div>

          {/* History */}
          {broadcasts.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/45">{tr("admin.broadcast.recent")}</p>
              <div className="space-y-2">
                {broadcasts.map((b) => {
                  const s = TYPE_STYLES[b.type];
                  const Icon = s.icon;
                  return (
                    <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon size={13} className={s.iconClass} />
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{b.title}</p>
                        </div>
                        <button
                          onClick={() => {
                            const next = broadcasts.filter((x) => x.id !== b.id);
                            setBroadcasts(next);
                            saveBroadcasts(next);
                          }}
                          className="shrink-0 text-slate-400 hover:text-rose-500 dark:text-white/30 dark:hover:text-rose-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-white/45">{b.message}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-white/30">
                        <span>{b.target}</span>
                        <span>·</span>
                        <span>{tr("admin.broadcast.usersCount", { count: b.userCount })}</span>
                        <span>·</span>
                        <span>{shortDate(b.sentAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
