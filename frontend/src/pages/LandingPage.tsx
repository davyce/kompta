import {
  ArrowRight, Award, BarChart3, Building2, CheckCircle2, Gift, Globe2, Lock, Receipt,
  ShieldCheck, Smartphone, Sparkles, Truck, Users2, Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { LimuleIcon } from "../components/LimuleAvatar";

const FEATURES = [
  {
    icon: BarChart3, title: "Comptabilité SYSCOHADA partie double",
    desc: "Journal, grand livre, balance, exercices — écritures équilibrées garanties, conformes CEMAC/OHADA.",
  },
  {
    icon: Receipt, title: "Facturation & TVA",
    desc: "Factures HT/TVA/TTC, avoirs, numérotation infalsifiable, export PDF professionnel.",
  },
  {
    icon: Wallet, title: "Caisse & Inventaire",
    desc: "POS temps réel, stock au coût moyen pondéré, alertes seuil bas, mouvements tracés.",
  },
  {
    icon: Truck, title: "Achats & Fournisseurs",
    desc: "Bons de commande, réseau fournisseurs inter-entreprises : connectez vos partenaires KOMPTA directement.",
  },
  {
    icon: Users2, title: "RH, Paie & Groupes",
    desc: "Bulletins CNSS + IRPP, congés, et un module dédié tontines / ONG / mutuelles avec caisse et votes.",
  },
  {
    icon: Building2, title: "Portail client gratuit",
    desc: "Vos clients consultent leurs factures, suivent leurs points de fidélité et leurs réductions depuis un espace 100% gratuit.",
  },
];

const TRUST = [
  { icon: Lock, label: "Données chiffrées" },
  { icon: ShieldCheck, label: "Multi-entreprises, cloisonné" },
  { icon: Globe2, label: "Hébergé en Afrique & Europe" },
];

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/branding/logo-512.png" alt="KOMPTA" className="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-emerald-600/20" />
            <span className="text-lg font-black">KOMPTA</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/login")}
              className="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 hover:bg-stone-50"
            >
              Se connecter
            </button>
            <button
              onClick={() => navigate("/login?mode=register")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
            >
              Créer mon entreprise
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20 text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
          <LimuleIcon size={13} /> Propulsé par Limule, l'IA intégrée à KOMPTA
        </div>
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
          L'ERP tout-en-un pour les PME, ONG et collectifs de la zone CEMAC
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-stone-600 sm:text-lg">
          Comptabilité partie double, facturation, caisse, paie, achats et gestion de groupes
          (tontines, mutuelles) — dans un seul espace, avec un conseiller IA qui comprend vos
          chiffres. Gratuit pour démarrer.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => navigate("/login?mode=register")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98] sm:w-auto"
          >
            Créer mon entreprise gratuitement <ArrowRight size={18} />
          </button>
          <button
            onClick={() => navigate("/login")}
            className="w-full rounded-xl border border-stone-200 px-6 py-3.5 text-base font-bold text-stone-700 transition hover:bg-stone-50 sm:w-auto"
          >
            J'ai déjà un compte
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-stone-500">
          {TRUST.map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon size={13} className="text-emerald-600" /> {label}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-black/[0.06] bg-stone-50/60 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Tout ce qu'il faut</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Un cockpit unique pour piloter l'activité</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Limule spotlight */}
      <section className="border-t border-black/[0.06] py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <Sparkles size={13} /> Assistant IA intégré
            </div>
            <h2 className="text-2xl font-black sm:text-3xl">Limule lit vos chiffres, pas seulement vos écrans</h2>
            <p className="mt-4 text-sm text-stone-600 sm:text-base">
              Limule analyse en direct votre trésorerie, vos factures, votre masse salariale et vos
              indicateurs de conformité pour vous donner des réponses concrètes — jamais de données
              inventées : quand une information manque, Limule le dit clairement plutôt que de deviner.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-stone-700">
              {[
                "Prévisions de trésorerie à partir de votre historique réel",
                "Rédaction assistée de déclarations, contrats et courriers",
                "Alertes de conformité TERAS et recommandations priorisées",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-stone-50 p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-stone-500">
              <LimuleIcon size={16} /> Limule · Assistant KOMPTA
            </div>
            <div className="mt-4 space-y-3">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2.5 text-sm text-white">
                Quelle est ma trésorerie prévisionnelle pour le mois prochain ?
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm text-stone-700 shadow-sm">
                D'après vos 3 derniers mois, votre encaissement moyen est de 1,2M FCFA et vos charges
                récurrentes de 850K FCFA. À rythme constant, votre trésorerie de fin de mois
                prochain serait d'environ...
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portail client */}
      <section className="border-t border-black/[0.06] bg-stone-50/60 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2">
          <div>
            <div className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <Gift size={13} /> 100% gratuit pour vos clients
            </div>
            <h2 className="text-2xl font-black sm:text-3xl">Un espace client que vos clients vont adorer</h2>
            <p className="mt-4 text-sm text-stone-600 sm:text-base">
              Chaque client d'une entreprise KOMPTA a son propre espace, gratuit et sécurisé — accessible
              par email ou numéro de téléphone. Il y consulte ses factures, suit ses points de fidélité
              en temps réel et voit ses réductions, dans tous les commerces KOMPTA qu'il fréquente.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-stone-700">
              {[
                "Connexion simple par email ou téléphone, aucune carte bancaire",
                "Points de fidélité et paliers (Standard, Argent, Or, VIP) suivis en direct",
                "Réductions et factures visibles pour chaque commerce, au même endroit",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/portal/login")}
              className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-600 px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
            >
              Accéder à mon espace client <ArrowRight size={16} />
            </button>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-stone-500">Boutique Ngoma</p>
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                <Award size={12} /> Or
              </span>
            </div>
            <p className="mt-3 text-3xl font-black text-ink">1 240 <span className="text-sm font-semibold text-stone-500">points</span></p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div className="h-full w-[62%] rounded-full bg-emerald-500" />
            </div>
            <p className="mt-1.5 text-xs text-stone-500">Encore 760 points pour le palier VIP</p>
            <p className="mt-3 inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              -10% sur vos achats
            </p>
          </div>
        </div>
      </section>

      {/* Mobile */}
      <section className="border-t border-black/[0.06] py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Smartphone size={26} />
          </div>
          <h2 className="max-w-lg text-2xl font-black sm:text-3xl">Aussi disponible en app native iOS et macOS</h2>
          <p className="max-w-xl text-sm text-stone-600 sm:text-base">
            Les mêmes données, en temps réel, sur votre iPhone, iPad ou Mac — encaissez en Tap to Pay
            depuis votre téléphone, consultez vos rapports où que vous soyez.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-black/[0.06] py-16">
        <div className="mx-auto max-w-2xl px-5 text-center">
          <h2 className="text-2xl font-black sm:text-3xl">Prêt à structurer votre gestion ?</h2>
          <p className="mt-3 text-sm text-stone-600 sm:text-base">
            Créez votre espace en quelques minutes. Aucune carte bancaire requise pour démarrer.
          </p>
          <button
            onClick={() => navigate("/login?mode=register")}
            className="mx-auto mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            Créer mon entreprise gratuitement <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs text-stone-500 sm:flex-row">
          <span>© {new Date().getFullYear()} KOMPTA · v2.0</span>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="hover:underline">Confidentialité</a>
            <a href="/terms" className="hover:underline">Conditions</a>
            <a href="/portal/login" className="hover:underline">Espace client</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
