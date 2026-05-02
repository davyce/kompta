import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Lock, MessageSquarePlus, PlusCircle } from "lucide-react";

import { SelectInput, TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import type { Task } from "../types/domain";

const STATUS_FLOW: Record<string, string> = {
  todo: "doing",
  doing: "done",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "À faire",
  doing: "En cours",
  done: "Terminé",
};

export function WorkPage() {
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const channels = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const channelId = channels.data?.[0]?.id;
  const messages = useQuery({
    queryKey: ["messages", channelId],
    queryFn: () => api.messages(channelId!),
    enabled: Boolean(channelId),
  });
  const [taskForm, setTaskForm] = useState({ title: "", assignee_name: "", priority: "normal" });
  const [message, setMessage] = useState("");

  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      setTaskForm({ title: "", assignee_name: "", priority: "normal" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.updateTask(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(channelId!, body),
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
    },
  });

  const grouped = useMemo(() => {
    const source = tasks.data ?? [];
    return {
      todo: source.filter((t) => t.status === "todo"),
      doing: source.filter((t) => t.status === "doing"),
      done: source.filter((t) => t.status === "done"),
    };
  }, [tasks.data]);

  function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    createTask.mutate(taskForm);
  }

  function submitMessage(e: FormEvent) {
    e.preventDefault();
    if (message.trim()) send.mutate(message);
  }

  function advanceTask(task: Task) {
    const next = STATUS_FLOW[task.status];
    if (next) updateTask.mutate({ id: task.id, status: next });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Travail, chat et orchestration</p>
        <h1 className="text-3xl font-black text-ink">Actions et conversations</h1>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Board opérations">
          <div className="grid gap-3 md:grid-cols-3">
            {(["todo", "doing", "done"] as const).map((key) => (
              <div key={key} className="rounded-lg bg-stone-50 p-3">
                <p className="mb-3 text-sm font-bold text-[#17211f]">{STATUS_LABEL[key]}</p>
                <div className="space-y-3">
                  {grouped[key].map((task) => (
                    <article
                      key={task.id}
                      className={`rounded-lg border p-3 ${
                        task.assigned_to_me
                          ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100"
                          : task.can_update
                            ? "border-black/[0.06] bg-white"
                            : "border-black/[0.04] bg-white opacity-70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink text-sm">{task.title}</p>
                        <StatusBadge
                          label={task.priority === "high" ? "Haute" : task.priority === "low" ? "Basse" : "Normal"}
                          tone={task.priority === "high" ? "red" : "neutral"}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[#717182]">{task.assignee_name || "Non assigné"}</p>
                      {task.source && (
                        <p className="mt-1 text-xs text-stone-400">{task.source}</p>
                      )}
                      {task.assigned_to_me && (
                        <p className="mt-2 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          À traiter par moi
                        </p>
                      )}
                      {!task.can_update && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-stone-400">
                          <Lock size={12} /> Lecture seule
                        </p>
                      )}
                      {STATUS_FLOW[task.status] && (
                        <button
                          onClick={() => advanceTask(task)}
                          disabled={updateTask.isPending || !task.can_update}
                          className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-800 disabled:text-stone-400"
                        >
                          {task.status === "doing" ? (
                            <><CheckCircle2 size={12} /> Marquer terminé</>
                          ) : (
                            <><ArrowRight size={12} /> Démarrer</>
                          )}
                        </button>
                      )}
                    </article>
                  ))}
                  {grouped[key].length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-4">Aucune tâche</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Nouvelle tâche">
            <form onSubmit={submitTask} className="space-y-3">
              <TextInput
                label="Titre"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                required
              />
              <TextInput
                label="Responsable"
                value={taskForm.assignee_name}
                onChange={(e) => setTaskForm({ ...taskForm, assignee_name: e.target.value })}
              />
              <SelectInput
                label="Priorité"
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              >
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="low">Basse</option>
              </SelectInput>
              <button
                type="submit"
                disabled={createTask.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:bg-stone-300"
              >
                <PlusCircle size={18} />
                {createTask.isPending ? "Ajout…" : "Ajouter la tâche"}
              </button>
              {createTask.error && (
                <p className="text-sm text-red-600">{createTask.error.message}</p>
              )}
            </form>
          </Panel>

          <Panel title={`Chat · ${channels.data?.[0]?.name ?? "Opérations"}`}>
            <div className="mb-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {messages.data?.map((item) => (
                <div key={item.id} className="rounded-lg bg-stone-50 p-3">
                  <p className="text-sm text-stone-800">{item.body}</p>
                  {item.ai_suggestion && (
                    <p className="mt-2 text-xs font-medium text-emerald-600">💡 {item.ai_suggestion}</p>
                  )}
                  {item.mentions && (
                    <p className="mt-1 text-xs text-[#717182]">@{item.mentions}</p>
                  )}
                </div>
              ))}
              {!messages.data?.length && (
                <p className="text-sm text-stone-400 text-center py-4">Aucun message.</p>
              )}
            </div>
            <form onSubmit={submitMessage} className="space-y-3">
              <TextArea
                label="Message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                type="submit"
                disabled={send.isPending || !message.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white disabled:bg-stone-300"
              >
                <MessageSquarePlus size={18} />
                {send.isPending ? "Envoi…" : "Envoyer"}
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
