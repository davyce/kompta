import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { useAuth } from "../app/AuthContext";

export function ActivationPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const activate = useMutation({
    mutationFn: api.firstLoginChangePassword,
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      // Redirection selon le rôle
      if (updatedUser.role === "membre_groupe") {
        navigate("/groups", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const temporary = currentPassword.trim();
    const nextPassword = newPassword.trim();
    const confirmation = confirmPassword.trim();
    if (!temporary) {
      setError("Colle le mot de passe temporaire fourni par l'entreprise.");
      return;
    }
    if (nextPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (nextPassword !== confirmation) {
      setError("Les deux nouveaux mots de passe doivent être identiques.");
      return;
    }
    activate.mutate({ current_password: temporary, new_password: nextPassword });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/25">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#17211f]">Activation du compte</h1>
          <p className="mt-1 text-sm text-[#717182]">
            Bienvenue {user?.full_name?.split(" ")[0]} — choisis ton mot de passe personnel.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            <p>Ton accès a été créé par l'organisation. Ce mot de passe est personnel et remplace le code temporaire.</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#17211f] mb-1.5">Code temporaire reçu</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                placeholder="Le code fourni par l'admin"
                className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#17211f] mb-1.5">Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={8}
                required
                placeholder="Minimum 8 caractères"
                className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#17211f] mb-1.5">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                placeholder="Répète ton nouveau mot de passe"
                className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {(error || activate.error) && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error || activate.error?.message}
              </p>
            )}

            <button
              type="submit"
              disabled={activate.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 px-4 py-3 font-bold text-white transition disabled:opacity-50"
            >
              <KeyRound size={17} />
              {activate.isPending ? "Activation en cours…" : "Activer mon compte"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#aaaabc]">KOMPTA · v2.0 · Sécurisé</p>
      </div>
    </div>
  );
}
