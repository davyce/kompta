import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { SubscriptionPanel } from "./SubscriptionPanel";

/**
 * SubscriptionGate — overlay plein écran quand l'entreprise est SUSPENDUE.
 * Bloque l'usage de l'app et propose de régler l'abonnement pour réactiver.
 * (Le backend bloque déjà les routes métier en 402 ; ceci est la couche UX.)
 */
export function SubscriptionGate() {
  const { user } = useAuth();
  const me = useQuery({
    queryKey: ["mySubscription"],
    queryFn: api.mySubscription,
    enabled: !!user && user.role !== "super_admin",
    refetchInterval: 60_000,
  });

  if (!user || user.role === "super_admin") return null;
  if (me.data?.status !== "suspended") return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10">
        <div className="rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#15181d]">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-100 dark:bg-rose-500/20">
              <Lock size={22} className="text-rose-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#17211f] dark:text-white">Accès suspendu</h2>
              <p className="text-sm text-[#717182]">
                Votre abonnement KOMPTA est suspendu. Réglez-le pour réactiver immédiatement votre espace.
              </p>
            </div>
          </div>
          <SubscriptionPanel compact />
        </div>
      </div>
    </div>
  );
}
