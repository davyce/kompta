import { useState } from "react";
import {
  ArrowRight, Award, BarChart3, CheckCircle2, ChevronDown, Coins, Database,
  FileBarChart, Gift, Globe2, HeartHandshake, KanbanSquare, Lock, Receipt, RefreshCw,
  ShieldCheck, Smartphone, Sparkles, Truck, UsersRound, Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { LimuleIcon } from "../components/LimuleAvatar";

const STEPS = [
  {
    n: "1", title: "Créez votre entreprise",
    desc: "Deux minutes, aucune carte bancaire. Vous démarrez sur le plan Standard, gratuit, avec un essai Mokonzi (accès complet) offert pendant 3 mois.",
  },
  {
    n: "2", title: "Configurez vos modules",
    desc: "Activez caisse, facturation, paie, achats, comptabilité ou groupes selon vos besoins — invitez votre équipe avec des rôles et permissions précis.",
  },
  {
    n: "3", title: "Pilotez avec Limule",
    desc: "Suivez trésorerie, ventes et conformité en temps réel, sur web, iPhone ou Mac, avec un assistant IA qui connaît vos vrais chiffres.",
  },
];

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
    icon: RefreshCw, title: "Réconciliation bancaire",
    desc: "Rapprochez vos relevés bancaires avec vos écritures en quelques clics, détection automatique des écarts.",
  },
  {
    icon: Coins, title: "Multi-devises",
    desc: "Facturez et encaissez dans plusieurs devises, sans conversion forcée — chaque montant reste fidèle à son origine.",
  },
  {
    icon: Truck, title: "Achats & Fournisseurs",
    desc: "Bons de commande, réseau fournisseurs inter-entreprises : connectez vos partenaires KOMPTA directement.",
  },
  {
    icon: UsersRound, title: "RH & Paie",
    desc: "Bulletins CNSS + IRPP, contrats, congés, fiches employé complètes, calculs conformes à la législation locale.",
  },
  {
    icon: HeartHandshake, title: "Groupes : tontines, mutuelles, ONG",
    desc: "Un module dédié aux collectifs — cotisations, caisse commune, votes et suivi des membres, en toute transparence.",
  },
  {
    icon: FileBarChart, title: "CRM, rapports & TERAS Connect",
    desc: "Pipeline commercial léger, tableaux de bord, et un score de conformité TERAS pour objectiver la santé de votre structure.",
  },
];

const EXTRA_MODULES = [
  "Projets & Kanban", "Réunions & agenda partagé", "Notes d'équipe", "Chat interne",
  "Documents centralisés", "Rôles & permissions avancés", "Journal d'audit unifié",
];

const TRUST = [
  {
    icon: Lock, title: "Chiffrement de bout en bout",
    desc: "Vos données sensibles (mots de passe, secrets de paiement) sont chiffrées au repos et en transit.",
  },
  {
    icon: ShieldCheck, title: "Cloisonnement strict multi-entreprises",
    desc: "Chaque entreprise n'accède qu'à ses propres données — aucune fuite possible entre organisations, même sur un compte commun.",
  },
  {
    icon: Globe2, title: "Hébergement Afrique & Europe",
    desc: "Infrastructure cloud répartie, pensée pour la latence et la conformité de la zone CEMAC.",
  },
  {
    icon: Database, title: "Sauvegardes régulières",
    desc: "Vos écritures comptables et vos données métier sont sauvegardées automatiquement, sans action de votre part.",
  },
];

const PLANS = [
  {
    code: "starter", name: "Standard", price: "Gratuit", period: "",
    desc: "Pour démarrer sans risque.",
    features: ["POS / Caisse", "Facturation TVA", "2 utilisateurs", "Support communautaire"],
    highlight: false,
  },
  {
    code: "pro", name: "Musala", price: "5 000", period: "FCFA / mois",
    desc: "Pour les PME en croissance.",
    features: ["Tout Standard", "Paie CNSS/IRPP", "Comptabilité SYSCOHADA", "IA Limule", "Groupes & Organisations", "10 utilisateurs"],
    highlight: false,
  },
  {
    code: "business", name: "Mokonzi", price: "10 000", period: "FCFA / mois",
    desc: "Pour les structures établies — 3 mois offerts à l'inscription.",
    features: ["Tout Musala", "TERAS Connect", "Utilisateurs illimités", "Support prioritaire"],
    highlight: true,
  },
];

const FAQ = [
  {
    q: "Est-ce vraiment gratuit pour démarrer ?",
    a: "Oui. Le plan Standard (POS, facturation, 2 utilisateurs) est gratuit indéfiniment. En plus, chaque nouvelle entreprise profite automatiquement d'un essai Mokonzi (accès complet) de 3 mois, sans carte bancaire. À la fin de l'essai, vous repassez automatiquement sur Standard si vous ne choisissez pas un plan payant — aucune surprise sur votre facture.",
  },
  {
    q: "Où mes données sont-elles hébergées ?",
    a: "Sur une infrastructure cloud répartie entre l'Afrique et l'Europe, chiffrée et cloisonnée par entreprise : personne d'autre que vous n'accède à vos écritures, factures ou fiches employé.",
  },
  {
    q: "KOMPTA est-il conforme aux normes locales ?",
    a: "La comptabilité suit le référentiel SYSCOHADA en partie double, la paie applique les cotisations CNSS et l'IRPP, et le module TERAS Connect vous donne un score de conformité objectif sur votre structure.",
  },
  {
    q: "Puis-je utiliser KOMPTA sur mobile et Mac ?",
    a: "Oui — en plus du web, des applications natives iOS et macOS partagent les mêmes données en temps réel, avec encaissement Tap to Pay directement depuis votre iPhone.",
  },
  {
    q: "Comment mes clients accèdent-ils à leur espace fidélité ?",
    a: "Via le portail client, gratuit et 100% séparé : connexion par email ou numéro de téléphone, sans carte bancaire, pour consulter factures, points de fidélité et réductions.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui, depuis les Paramètres de votre compte, sans engagement de durée — vous passez d'un plan à l'autre quand vos besoins évoluent.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-dvh bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/branding/logo-512.png" alt="KOMPTA" className="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-emerald-600/20" />
            <span className="text-lg font-black">KOMPTA</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-stone-600 md:flex">
            <a href="#fonctionnalites" className="hover:text-ink">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-ink">Tarifs</a>
            <a href="#securite" className="hover:text-ink">Sécurité</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
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
          De la caisse à la paie, en passant par la comptabilité SYSCOHADA, la réconciliation
          bancaire et la conformité TERAS — un seul système connecté, disponible sur web, iPhone
          et Mac, avec un conseiller IA qui comprend vos vrais chiffres. Gratuit pour démarrer,
          3 mois d'accès complet offerts à l'inscription.
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
          {[
            { icon: Lock, label: "Données chiffrées" },
            { icon: ShieldCheck, label: "Multi-entreprises, cloisonné" },
            { icon: Globe2, label: "Hébergé en Afrique & Europe" },
            { icon: CheckCircle2, label: "Conforme SYSCOHADA / CNSS / IRPP" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <Icon size={13} className="text-emerald-600" /> {label}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-black/[0.06] py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">En 3 étapes</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">De la création à la première écriture, sans friction</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fonctionnalites" className="scroll-mt-20 border-t border-black/[0.06] bg-stone-50/60 py-16">
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-500">
              <KanbanSquare size={15} className="text-emerald-600" /> Et aussi :
            </span>
            {EXTRA_MODULES.map((m) => (
              <span key={m} className="rounded-full border border-black/[0.06] bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                {m}
              </span>
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
                "Disponible sur web, iPhone et Mac, avec le même niveau de détail",
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
                "Fidélité multi-entreprises : un seul compte pour tous les commerces KOMPTA",
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

      {/* Sécurité & conformité */}
      <section id="securite" className="scroll-mt-20 border-t border-black/[0.06] py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Sécurité & conformité</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Vos données, protégées comme dans une banque</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Icon size={20} />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1.5 text-xs text-stone-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" className="scroll-mt-20 border-t border-black/[0.06] bg-stone-50/60 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Tarifs</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Un plan gratuit pour toujours, des plans qui grandissent avec vous</h2>
            <p className="mt-3 text-sm text-stone-600">
              Chaque nouvelle entreprise démarre avec 3 mois d'accès complet Mokonzi offerts, sans carte bancaire.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.code}
                className={`relative rounded-2xl border p-6 shadow-sm ${
                  p.highlight ? "border-emerald-600 bg-white ring-2 ring-emerald-600/20" : "border-black/[0.06] bg-white"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                    Recommandé
                  </span>
                )}
                <h3 className="text-base font-black">{p.name}</h3>
                <p className="mt-1 text-xs text-stone-500">{p.desc}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-ink">{p.price}</span>
                  {p.period && <span className="text-xs font-semibold text-stone-500">{p.period}</span>}
                </p>
                <ul className="mt-5 space-y-2 text-sm text-stone-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate("/login?mode=register")}
                  className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    p.highlight
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  Commencer
                </button>
              </div>
            ))}
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
            depuis votre téléphone, consultez vos rapports où que vous soyez. Une version desktop
            complète l'offre pour piloter votre gestion depuis votre poste de travail.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-black/[0.06] bg-stone-50/60 py-16">
        <div className="mx-auto max-w-3xl px-5">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Questions fréquentes</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Tout ce que vous vous demandez avant de démarrer</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQ.map((item, i) => (
              <div key={item.q} className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-ink"
                >
                  {item.q}
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-stone-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  />
                </button>
                {openFaq === i && (
                  <p className="px-5 pb-4 text-sm text-stone-600">{item.a}</p>
                )}
              </div>
            ))}
          </div>
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
            <a href="#fonctionnalites" className="hover:underline">Fonctionnalités</a>
            <a href="#tarifs" className="hover:underline">Tarifs</a>
            <a href="/privacy" className="hover:underline">Confidentialité</a>
            <a href="/terms" className="hover:underline">Conditions</a>
            <a href="/portal/login" className="hover:underline">Espace client</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
