import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ChevronDown, ChevronRight, ExternalLink, LifeBuoy, MessageSquare,
  Plus, Search, Send, Tag, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { shortDate } from "../utils/format";

/* ────────────────────────────────────────────────────────── types */
type Tab = "faq" | "guides" | "tickets" | "contact";

/* ────────────────────────────────────────────────────────── static data */
const FAQ_ITEMS = [
  {
    q: "Comment créer une facture multi-lignes ?",
    a: "Dans l'onglet Facturation, remplissez le nom du client puis cliquez sur « Ajouter » pour insérer autant de lignes que nécessaire. Chaque ligne comporte une description, une quantité et un prix unitaire. Le total HT se calcule automatiquement.",
    tag: "Facturation",
  },
  {
    q: "Comment encaisser une vente au point de vente ?",
    a: "Ouvrez l'onglet Caisse (POS), sélectionnez les produits pour les ajouter au panier, choisissez le mode de paiement (Espèces, Carte, Mobile Money, Zola…) et cliquez sur « Encaisser ». En mode hors-ligne, la vente est sauvegardée et synchronisée à la reconnexion.",
    tag: "POS",
  },
  {
    q: "Comment ajouter un employé et gérer sa paie ?",
    a: "Dans l'onglet Employés, cliquez sur « Nouvel employé » et remplissez les informations (nom, poste, type de contrat, salaire brut). Allez ensuite dans Paie > Lancer un cycle pour générer les bulletins de salaire automatiquement.",
    tag: "RH",
  },
  {
    q: "Qu'est-ce que le score TERAS ?",
    a: "TERAS (Tableau d'Évaluation du Risque et d'Alignement Stratégique) est le moteur de conformité local de KOMPTA. Il analyse la complétude de votre profil, la régularité des déclarations et la santé financière pour attribuer un score sur 100.",
    tag: "Conformité",
  },
  {
    q: "Comment connecter un compte Mobile Money ou Zola ?",
    a: "Dans Paramètres > Paiements, cliquez sur « Ajouter un compte ». Sélectionnez le fournisseur (Zola, Airtel Money, Orange Money…), renseignez le numéro masqué et activez « Utiliser au POS » pour qu'il apparaisse dans la caisse.",
    tag: "Paramètres",
  },
  {
    q: "Comment exporter mes ventes en CSV ?",
    a: "Dans l'onglet Caisse (POS), la barre supérieure propose un export CSV. Sélectionnez la plage de dates souhaitée et cliquez sur « Télécharger CSV ».",
    tag: "POS",
  },
  {
    q: "Comment télécharger une facture en PDF ?",
    a: "Dans Facturation, retrouvez la facture souhaitée et cliquez sur le bouton « PDF » à droite. Le fichier se télécharge automatiquement avec le numéro de facture comme nom de fichier.",
    tag: "Facturation",
  },
  {
    q: "Limule / Grand Sage 1.0 n'est pas disponible. Que faire ?",
    a: "Vérifiez que le backend est démarré et que la clé API DeepSeek est configurée dans le fichier .env (DEEPSEEK_API_KEY). Si le problème persiste, ouvrez un ticket de support — notre équipe vous assistera.",
    tag: "IA",
  },
];

const GUIDES = [
  {
    title: "Démarrage rapide en 5 étapes",
    desc: "De la création du compte à la première facture envoyée.",
    steps: ["Remplir le profil entreprise", "Ajouter vos employés", "Configurer les comptes de paiement", "Créer votre premier produit ou service", "Émettre et encaisser votre première facture"],
    tag: "Démarrage",
    icon: "🚀",
  },
  {
    title: "Configurer le cycle de paie",
    desc: "Lancer un cycle mensuel, générer les bulletins et déclencher les versements.",
    steps: ["Vérifier les données employés (salaire, type contrat)", "Paie > Nouveau cycle > sélectionner le mois", "Vérifier les anomalies détectées par Limule", "Valider les bulletins et télécharger les PDF", "Enregistrer les versements"],
    tag: "Paie",
    icon: "💼",
  },
  {
    title: "Gérer les stocks et alertes IA",
    desc: "Surveiller les niveaux de stock et réapprovisionner en un clic.",
    steps: ["Stocks > onglet Alertes IA", "Consulter les produits sous le seuil de réapprovisionnement", "Cliquer sur « Agir » pour commander la quantité recommandée", "Suivre les mouvements dans l'onglet Mouvements"],
    tag: "Stocks",
    icon: "📦",
  },
  {
    title: "Comprendre et améliorer son score TERAS",
    desc: "Les critères clés et les actions pour atteindre 80+.",
    steps: ["Compléter le profil légal (RCCM, NIF, secteur…)", "Maintenir un score TERAS > 70 pour éviter les alertes", "Soumettre vos déclarations fiscales dans Déclarations", "Activer les modules manquants dans Tableau de bord"],
    tag: "Conformité",
    icon: "🛡️",
  },
];

const STATUS_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  open: "blue",
  in_progress: "amber",
  resolved: "green",
  closed: "red",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  closed: "Fermé",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Faible", medium: "Moyen", high: "Élevé", critical: "Critique",
};

/* ────────────────────────────────────────────────────────── sub-components */
function FaqItem({ q, a, tag }: { q: string; a: string; tag: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition ${open ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5" : "border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
      >
        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {tag}
        </span>
        <p className="flex-1 font-semibold text-[#17211f] dark:text-white">{q}</p>
        {open ? <ChevronDown size={18} className="shrink-0 text-emerald-600" /> : <ChevronRight size={18} className="shrink-0 text-[#717182]" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-sm leading-6 text-[#717182]">{a}</p>
        </div>
      )}
    </div>
  );
}

function GuideCard({ guide }: { guide: typeof GUIDES[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#1e2229]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-4 p-5 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-2xl dark:bg-emerald-500/10">
          {guide.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[#17211f] dark:text-white">{guide.title}</p>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#717182] dark:bg-white/10 dark:text-white/50">
              {guide.tag}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#717182]">{guide.desc}</p>
        </div>
        {open ? <ChevronDown size={18} className="mt-1 shrink-0 text-emerald-600" /> : <ChevronRight size={18} className="mt-1 shrink-0 text-[#717182]" />}
      </button>
      {open && (
        <div className="border-t border-black/[0.06] px-5 pb-5 pt-4 dark:border-white/[0.06]">
          <ol className="space-y-2">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-black text-white">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm text-[#17211f] dark:text-white">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── main page */
export function HelpCenterPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("faq");
  const [faqSearch, setFaqSearch] = useState("");
  const [newTicket, setNewTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");

  /* queries */
  const tickets = useQuery({ queryKey: ["myTickets"], queryFn: api.myTickets });
  const createTicket = useMutation({
    mutationFn: api.createTicket,
    onSuccess: () => {
      setNewTicket(false);
      setSubject("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["myTickets"] });
    },
  });

  /* FAQ filter */
  const filteredFaq = useMemo(() => {
    const q = faqSearch.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) =>
      `${item.q} ${item.a} ${item.tag}`.toLowerCase().includes(q)
    );
  }, [faqSearch]);

  function submitTicket(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    createTicket.mutate({ subject, body, category, priority });
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "faq", label: "FAQ", icon: BookOpen },
    { key: "guides", label: "Guides", icon: ChevronRight },
    { key: "tickets", label: `Tickets${tickets.data?.length ? ` (${tickets.data.length})` : ""}`, icon: MessageSquare },
    { key: "contact", label: "Contacter le support", icon: LifeBuoy },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-emerald-600">Aide et support</p>
        <h1 className="text-3xl font-black text-ink dark:text-white">Centre d'aide KOMPTA</h1>
        <p className="mt-1 text-sm text-[#717182]">FAQ, guides pas-à-pas et tickets de support connectés à notre équipe.</p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-black/[0.06] bg-white text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* FAQ tab */}
      {tab === "faq" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <Search size={17} className="text-[#717182]" />
            <input
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Rechercher dans la FAQ…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#17211f] outline-none placeholder:text-[#717182] dark:text-white"
            />
            {faqSearch && (
              <button onClick={() => setFaqSearch("")}>
                <X size={16} className="text-[#717182]" />
              </button>
            )}
          </div>
          {filteredFaq.length === 0 && (
            <p className="py-8 text-center text-sm text-[#717182]">
              Aucun résultat pour « {faqSearch} ». Essayez un autre mot-clé ou ouvrez un ticket.
            </p>
          )}
          <div className="space-y-2">
            {filteredFaq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} tag={item.tag} />
            ))}
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Vous ne trouvez pas votre réponse ?{" "}
              <button onClick={() => setTab("contact")} className="underline underline-offset-2">
                Ouvrez un ticket de support →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Guides tab */}
      {tab === "guides" && (
        <div className="space-y-3">
          {GUIDES.map((guide, i) => (
            <GuideCard key={i} guide={guide} />
          ))}
          <div className="rounded-xl border border-sky-100 bg-sky-50 px-5 py-4 dark:border-sky-500/20 dark:bg-sky-500/5">
            <p className="font-semibold text-sky-800 dark:text-sky-200">📖 Documentation complète</p>
            <p className="mt-1 text-sm text-sky-700 dark:text-sky-300/80">
              Retrouvez tous les guides détaillés, la référence API et les notes de version dans la documentation officielle.
            </p>
            <a
              href="https://docs.kompta.app"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700"
            >
              <ExternalLink size={14} />
              docs.kompta.app
            </a>
          </div>
        </div>
      )}

      {/* Tickets tab */}
      {tab === "tickets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#717182]">
              {tickets.data?.length ? `${tickets.data.length} ticket${tickets.data.length > 1 ? "s" : ""}` : "Aucun ticket ouvert"}
            </p>
            <button
              onClick={() => { setNewTicket(true); setTab("contact"); }}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Plus size={15} /> Nouveau ticket
            </button>
          </div>

          {!tickets.data?.length && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/[0.1] py-14 text-center dark:border-white/[0.1]">
              <LifeBuoy size={36} className="text-emerald-200" />
              <p className="font-semibold text-[#17211f] dark:text-white">Aucun ticket pour le moment</p>
              <p className="text-sm text-[#717182]">Besoin d'aide ? Ouvrez un ticket et notre équipe vous répondra.</p>
            </div>
          )}

          <div className="space-y-2">
            {tickets.data?.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.06] dark:bg-[#1e2229]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={STATUS_LABEL[ticket.status] ?? ticket.status}
                        tone={STATUS_TONE[ticket.status] ?? "blue"}
                      />
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#717182] dark:bg-white/10 dark:text-white/50">
                        {ticket.category}
                      </span>
                    </div>
                    <p className="mt-2 font-bold text-[#17211f] dark:text-white">{ticket.subject}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[#717182]">{ticket.body}</p>
                  </div>
                  <div className="text-right text-xs text-[#717182]">
                    <p className="font-semibold">{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</p>
                    <p className="mt-1">{shortDate(ticket.created_at)}</p>
                  </div>
                </div>

                {ticket.messages && ticket.messages.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-black/[0.04] pt-3 dark:border-white/[0.04]">
                    {ticket.messages.slice(-2).map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          msg.is_staff
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                            : "bg-stone-50 text-[#717182] dark:bg-white/[0.04] dark:text-white/60"
                        }`}
                      >
                        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {msg.is_staff ? "Support KOMPTA" : "Vous"} · {shortDate(msg.created_at)}
                        </p>
                        <p className="whitespace-pre-wrap leading-5">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact / New ticket tab */}
      {tab === "contact" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <Panel title="Ouvrir un ticket de support">
            <form onSubmit={submitTicket} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                  Sujet *
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Décrivez brièvement votre problème"
                  required
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                    Catégorie
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                  >
                    <option value="general">Général</option>
                    <option value="technical">Technique</option>
                    <option value="billing">Facturation</option>
                    <option value="feature">Demande fonctionnalité</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                    Priorité
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                  >
                    <option value="low">Faible</option>
                    <option value="medium">Moyen</option>
                    <option value="high">Élevé</option>
                    <option value="critical">Critique</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#717182]">
                  Description *
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Décrivez le problème en détail : étapes pour reproduire, message d'erreur, ce que vous attendiez vs ce qui s'est passé…"
                  required
                  rows={6}
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#17211f] outline-none focus:border-emerald-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={createTicket.isPending || !subject.trim() || !body.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-stone-300 dark:disabled:bg-white/10"
              >
                <Send size={16} />
                {createTicket.isPending ? "Envoi en cours…" : "Envoyer le ticket"}
              </button>

              {createTicket.isSuccess && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    ✓ Ticket envoyé avec succès !
                  </p>
                  <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                    Notre équipe vous répondra dans les plus brefs délais.{" "}
                    <button onClick={() => setTab("tickets")} className="underline underline-offset-2">
                      Voir mes tickets →
                    </button>
                  </p>
                </div>
              )}

              {createTicket.error && (
                <p className="text-sm text-red-600">{createTicket.error.message}</p>
              )}
            </form>
          </Panel>

          {/* Sidebar info */}
          <div className="space-y-4">
            <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
              <div className="flex items-center gap-2">
                <LifeBuoy size={20} className="text-emerald-600" />
                <h3 className="font-bold text-[#17211f] dark:text-white">Support KOMPTA</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#717182]">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">Temps de réponse :</span> moins de 24h en semaine</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">Priorité critique :</span> réponse en moins de 4h</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <p><span className="font-semibold text-[#17211f] dark:text-white">Email :</span> support@kompta.app</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-amber-600 dark:text-amber-400" />
                <h3 className="font-bold text-amber-800 dark:text-amber-200">Conseils pour un bon ticket</h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-300/80">
                <li>• Décrivez exactement les étapes pour reproduire</li>
                <li>• Mentionnez le module concerné (POS, Paie, etc.)</li>
                <li>• Copiez le message d'erreur si applicable</li>
                <li>• Indiquez la criticité réelle pour prioriser</li>
              </ul>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.06] dark:bg-[#1e2229]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">Accès rapide</p>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => setTab("faq")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <BookOpen size={15} className="text-emerald-600" /> FAQ
                </button>
                <button
                  onClick={() => setTab("guides")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <BookOpen size={15} className="text-sky-600" /> Guides pas-à-pas
                </button>
                <button
                  onClick={() => setTab("tickets")}
                  className="flex w-full items-center gap-2 rounded-lg border border-black/[0.06] px-3 py-2.5 text-sm font-medium text-[#17211f] hover:bg-stone-50 dark:border-white/[0.06] dark:text-white dark:hover:bg-white/[0.04]"
                >
                  <MessageSquare size={15} className="text-violet-600" /> Mes tickets
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
