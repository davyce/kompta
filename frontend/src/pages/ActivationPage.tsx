import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
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
      navigate("/");
    }
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
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Activation du compte</p>
        <h1 className="text-3xl font-black text-ink">Changer le mot de passe temporaire</h1>
      </div>
      <Panel title="Securisation obligatoire">
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck size={20} />
          <p>
            Bienvenue {user?.full_name}. Ton acces a ete cree par l'entreprise. Choisis un mot de passe personnel avant
            d'entrer dans ton espace.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <TextInput
            label="Mot de passe temporaire"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <TextInput
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
          <TextInput
            label="Confirmer"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
          />
          <p className="text-xs font-medium text-stone-500">
            Minimum 8 caractères. Exemple : `Kompta2026!`
          </p>
          {error || activate.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || activate.error?.message}</p>
          ) : null}
          <button
            type="submit"
            disabled={activate.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white disabled:bg-stone-300"
          >
            <KeyRound size={18} />
            {activate.isPending ? "Activation…" : "Activer mon compte"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
