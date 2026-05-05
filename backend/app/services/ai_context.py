"""
Contexte d'orchestration IA pour Limule.

Ce fichier ne collecte pas directement la donnée métier. Il transforme le
contexte déjà assemblé par limule_context.py en consignes stables pour le LLM :
persona, contrat de réponse, playbooks par module et synthèse exploitable.
"""

from __future__ import annotations

from typing import Any


LIMULE_CONTEXT_VERSION = "kompta-limule-context-v2.0"


ROLE_LABELS: dict[str, str] = {
    "super_admin": "super-admin KOMPTA",
    "admin_entreprise": "DG / administrateur entreprise",
    "manager_entreprise": "DG",
    "comptable": "comptable",
    "rh_entreprise": "responsable RH",
    "caissier_pos": "caissier POS",
    "employe": "employé",
}


MODULE_PLAYBOOKS: dict[str, dict[str, Any]] = {
    "global": {
        "mission": "donner une vue transverse de l'entreprise et prioriser les décisions",
        "signals": ["santé globale", "risques TERAS", "actions urgentes", "données manquantes"],
    },
    "dashboard": {
        "mission": "expliquer l'état temps réel et les écarts importants",
        "signals": ["trésorerie", "CA", "paie à venir", "score TERAS", "tâches urgentes"],
    },
    "rh": {
        "mission": "aider à gérer les dossiers employés et la conformité RH",
        "signals": ["contrats", "statuts", "salaires", "téléphone", "comptes employés"],
    },
    "payroll": {
        "mission": "sécuriser les cycles de paie, bulletins et versements",
        "signals": ["bulletins prêts", "destinations de paiement", "CNPS", "écarts paie"],
    },
    "accounting": {
        "mission": "aider à comprendre la comptabilité, les écritures et le SYSCEMAC",
        "signals": ["trésorerie", "créances", "dettes", "résultat", "rapprochement"],
    },
    "billing": {
        "mission": "suivre les factures, paiements et relances client",
        "signals": ["factures impayées", "statut payé", "méthode de paiement", "reçu"],
    },
    "pos": {
        "mission": "assister la caisse, les ventes et les encaissements rapides",
        "signals": ["panier", "QR produit", "stock", "paiement Zola/mobile money/carte/espèces"],
    },
    "inventory": {
        "mission": "optimiser le stock, les QR codes et les fiches produits",
        "signals": ["stock bas", "réassort", "SKU", "images produit", "scan QR"],
    },
    "documents": {
        "mission": "classer, analyser et relier les documents de l'entreprise",
        "signals": ["contrats", "pièces justificatives", "confiance IA", "documents manquants"],
    },
    "declarations": {
        "mission": "préparer les déclarations et limiter les risques fiscaux ou sociaux",
        "signals": ["période", "pièces manquantes", "checklist", "risque de dépôt"],
    },
    "chat": {
        "mission": "résumer les conversations et transformer les messages en actions",
        "signals": ["mentions", "urgence", "suggestions TERAS", "tâches liées"],
    },
    "calendar": {
        "mission": "préparer les réunions, échéances et notes journalières",
        "signals": ["réunions à venir", "agenda", "décisions", "suivi quotidien"],
    },
    "notes": {
        "mission": "synthétiser les journées et garder une mémoire d'entreprise exploitable",
        "signals": ["notes IA", "actions réalisées", "actions programmées", "risques ouverts"],
    },
    "reports": {
        "mission": "générer des analyses exploitables par la direction",
        "signals": ["finance", "RH", "projets", "conformité", "RSE"],
    },
    "teras": {
        "mission": "analyser la conformité, le scoring et les recommandations TERAS",
        "signals": ["score", "alertes", "recommandations", "impact en points"],
    },
    "work": {
        "mission": "organiser les tâches, projets et responsabilités",
        "signals": ["priorité", "échéance", "responsable", "source"],
    },
    "projects": {
        "mission": "suivre l'avancement, les budgets et les risques projet",
        "signals": ["jalons", "budget", "responsable", "risque"],
    },
    "settings": {
        "mission": "aider à configurer l'entreprise, les modules et les paiements",
        "signals": ["comptes de paiement", "préférences", "modules activés", "droits"],
    },
    "assistants": {
        "mission": "rédiger et structurer les documents professionnels",
        "signals": ["ton", "destinataire", "objectif", "brouillon", "validation humaine"],
    },
}


INTENT_PLAYBOOKS: dict[str, dict[str, str]] = {
    "risk_analysis": {
        "goal": "identifier les risques, leur gravité et l'action corrective prioritaire",
        "format": "Diagnostic rapide, risques classés (critique/moyen/faible), actions correctives, données à vérifier",
    },
    "summary": {
        "goal": "résumer la situation sans perdre les chiffres et décisions importantes",
        "format": "Synthèse courte, chiffres clés, points d'attention, prochaines actions",
    },
    "task_creation": {
        "goal": "transformer la demande en tâches assignables",
        "format": "Tâches proposées avec titre, priorité, responsable suggéré, échéance et source",
    },
    "drafting": {
        "goal": "rédiger un contenu professionnel directement utilisable",
        "format": "Objet ou titre, corps prêt à envoyer, points à personnaliser",
    },
    "payroll_support": {
        "goal": "sécuriser la paie et éviter les versements incomplets ou non conformes",
        "format": "État du cycle, anomalies, actions RH/finance, validations nécessaires",
    },
    "operations_support": {
        "goal": "aider les opérations caisse, stock et vente à agir rapidement",
        "format": "État opérationnel, blocages, action immédiate, contrôle après action",
    },
    "compliance_check": {
        "goal": "vérifier la conformité CEMACE/SYSCEMAC/CNPS avec prudence",
        "format": "Constats, risques, pièces nécessaires, validation humaine",
    },
    "meeting_summary": {
        "goal": "résumer une réunion et isoler les décisions",
        "format": "Contexte, décisions, actions, échéances, sujets ouverts",
    },
    "declaration": {
        "goal": "préparer une déclaration avec pièces, risques et checklist",
        "format": "Période, pièces disponibles, pièces manquantes, risques, checklist",
    },
    "prediction_economique": {
        "goal": (
            "produire une prévision économique chiffrée et argumentée à partir des données réelles de l'entreprise. "
            "Projeter les tendances de CA, trésorerie, masse salariale et marges sur 30/60/90 jours. "
            "Identifier les scénarios optimiste, central et pessimiste en les justifiant par les signaux présents."
        ),
        "format": (
            "1. Tendances observées (données chiffrées réelles)\n"
            "2. Projection sur horizon demandé (scénarios chiffrés)\n"
            "3. Facteurs de risque identifiés\n"
            "4. Recommandations stratégiques\n"
            "5. Indicateurs à surveiller dans KOMPTA"
        ),
    },
    "conseil_investissement": {
        "goal": (
            "donner un conseil d'investissement ou d'allocation de ressources basé sur la santé financière réelle "
            "de l'entreprise: liquidité disponible, marges, masse salariale, dettes courantes. "
            "Comparer les options possibles (embauche, stock, équipement, trésorerie, expansion) "
            "et recommander la meilleure allocation selon le profil de risque de la PME."
        ),
        "format": (
            "1. Situation financière synthétique (capacité d'investissement réelle)\n"
            "2. Options identifiées avec coût, bénéfice attendu et délai de retour\n"
            "3. Recommandation prioritaire avec justification chiffrée\n"
            "4. Conditions à remplir avant d'investir\n"
            "5. Risques à surveiller\n"
            "Note: conseil opérationnel — validation par un expert-comptable recommandée pour les décisions majeures"
        ),
    },
    "analyse_secteur": {
        "goal": (
            "analyser le positionnement de l'entreprise dans son secteur d'activité en zone CEMAC/Afrique centrale. "
            "Identifier les opportunités de marché, les risques sectoriels, les benchmarks pertinents. "
            "Croiser les données internes (CA, employés, conformité) avec le contexte économique du secteur."
        ),
        "format": (
            "1. Profil sectoriel de l'entreprise (secteur, taille, positionnement)\n"
            "2. Contexte économique du secteur en zone CEMAC\n"
            "3. Forces et faiblesses de l'entreprise vs le secteur\n"
            "4. Opportunités identifiées\n"
            "5. Risques sectoriels à anticiper\n"
            "6. Actions stratégiques recommandées"
        ),
    },
    "tresorerie": {
        "goal": (
            "analyser la trésorerie en temps réel, projeter les flux entrants/sortants, "
            "identifier les risques de rupture et recommander des actions pour optimiser la liquidité."
        ),
        "format": (
            "1. État de trésorerie actuel (solde, flux récents)\n"
            "2. Prévision des encaissements attendus (factures, ventes)\n"
            "3. Prévision des décaissements (paie, fournisseurs, charges)\n"
            "4. Solde prévisionnel et risques de tension\n"
            "5. Recommandations d'optimisation"
        ),
    },
    "question": {
        "goal": "répondre simplement et directement en s'appuyant sur les données disponibles",
        "format": "Réponse directe, justification par les données, prochaine étape actionnable",
    },
    "document_analysis": {
        "goal": (
            "analyser un document d'entreprise (facture, contrat, bulletin, bilan, relevé…) "
            "pour en extraire toutes les données structurées : montants, parties, dates, "
            "risques, actions requises, et impact sur la comptabilité ou la conformité KOMPTA."
        ),
        "format": (
            "1. Identification du document (type, période, parties)\n"
            "2. Données clés extraites (montants, références, dates importantes)\n"
            "3. Conformité et risques détectés\n"
            "4. Impact sur les modules KOMPTA (facturation, RH, trésorerie, déclarations)\n"
            "5. Actions recommandées et prochaines étapes"
        ),
    },
}


def _clip(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _money(value: Any) -> str:
    try:
        return f"{float(value or 0):,.0f} XAF".replace(",", " ")
    except Exception:
        return "0 XAF"


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _role_label(role: str | None) -> str:
    return ROLE_LABELS.get(role or "", (role or "utilisateur").replace("_", " "))


def infer_module_from_context(context: dict[str, Any] | None, fallback: str = "global") -> str:
    if not isinstance(context, dict):
        return fallback
    module_key = str(context.get("module") or fallback or "global")
    return module_key if module_key in MODULE_PLAYBOOKS else "global"


def _summarize_module(module_key: str, data: dict[str, Any]) -> list[str]:
    lines: list[str] = []

    if module_key == "rh":
        lines.append(f"Employés actifs: {data.get('active_count', 0)}")
        for employee in _as_list(data.get("recent_employees"))[:4]:
            lines.append(
                "- "
                f"{employee.get('name')} | {employee.get('job_title') or 'poste non renseigné'} | "
                f"{employee.get('department') or 'service non renseigné'} | "
                f"salaire {_money(employee.get('salary'))} | paiement {employee.get('payout_method') or 'non défini'}"
            )
    elif module_key == "payroll":
        lines.append(
            "Dernière paie: "
            f"{data.get('latest_period') or 'aucune'} | statut {data.get('latest_status') or 'n/a'} | "
            f"net {_money(data.get('net_total'))} | "
            f"versements prêts {data.get('payouts_ready', 0)}/{data.get('payslip_count', 0)} | "
            f"compte {data.get('payment_account') or 'non défini'}"
        )
    elif module_key in {"finance", "accounting", "billing"}:
        lines.append(
            f"Factures: total {_money(data.get('invoices_total'))}, "
            f"en attente {data.get('pending_invoices', 0)}"
        )
        lines.append(f"Ventes cumulées: {_money(data.get('sales_total'))}")
    elif module_key == "pos":
        sales = _as_list(data.get("recent_sales"))
        lines.append(f"Ventes récentes: {len(sales)}")
        for sale in sales[:4]:
            lines.append(
                "- "
                f"{sale.get('receipt')} | {_money(sale.get('amount'))} | "
                f"{sale.get('method') or 'méthode inconnue'} | {sale.get('status') or 'statut n/a'}"
            )
    elif module_key == "inventory":
        lines.append(f"Produits: {data.get('product_count', 0)}")
        low_stock = _as_list(data.get("low_stock"))
        if low_stock:
            lines.append("Stock bas:")
            for product in low_stock[:5]:
                lines.append(
                    "- "
                    f"{product.get('name')} | SKU {product.get('sku') or 'n/a'} | "
                    f"{product.get('stock', 0)}/{product.get('reorder_level', 0)}"
                )
    elif module_key == "documents":
        lines.append(f"Documents: {data.get('count', 0)}")
        for doc in _as_list(data.get("recent"))[:4]:
            lines.append(
                "- "
                f"{doc.get('title')} | {doc.get('type') or 'type n/a'} | "
                f"statut {doc.get('status') or 'n/a'} | confiance {doc.get('confidence', 0)}%"
            )
            if doc.get("summary"):
                lines.append(f"  résumé: {_clip(doc.get('summary'), 130)}")
    elif module_key == "teras":
        lines.append(f"Score TERAS entreprise: {data.get('company_score', 0)}/100")
        alerts = _as_list(data.get("alerts"))
        if alerts:
            lines.append("Alertes:")
            for alert in alerts[:5]:
                lines.append(
                    "- "
                    f"[{alert.get('severity')}] {alert.get('title')} | "
                    f"{_clip(alert.get('recommendation'), 140)}"
                )
    elif module_key in {"work", "projects"}:
        tasks = _as_list(data.get("open_tasks"))
        lines.append(f"Tâches ouvertes visibles: {len(tasks)}")
        for task in tasks[:5]:
            lines.append(
                "- "
                f"{task.get('title')} | {task.get('priority') or 'priorité n/a'} | "
                f"{task.get('status') or 'statut n/a'} | échéance {task.get('due_date') or 'non définie'}"
            )
    elif module_key == "chat":
        messages = _as_list(data.get("recent_messages"))
        lines.append(f"Messages récents: {len(messages)}")
        for message in messages[:5]:
            lines.append(
                "- "
                f"#{message.get('channel') or 'canal'} | {message.get('author') or 'auteur'}: "
                f"{_clip(message.get('body'), 140)}"
            )
            if message.get("ai_suggestion"):
                lines.append(f"  suggestion: {_clip(message.get('ai_suggestion'), 120)}")
    elif module_key == "calendar":
        meetings = _as_list(data.get("upcoming_meetings"))
        lines.append(f"Réunions à venir: {len(meetings)}")
        for meeting in meetings[:5]:
            lines.append(
                "- "
                f"{meeting.get('title')} | {meeting.get('start_at')} | "
                f"{meeting.get('tag') or 'sans tag'} | {meeting.get('status') or 'statut n/a'}"
            )
    elif module_key == "notes":
        notes = _as_list(data.get("recent"))
        lines.append(f"Notes récentes: {len(notes)}")
        for note in notes[:5]:
            origin = "IA" if note.get("ai_generated") else "manuel"
            lines.append(f"- {note.get('date')} | {note.get('title')} | {origin}: {_clip(note.get('summary'), 140)}")
    elif module_key == "declarations":
        declarations = _as_list(data.get("recent"))
        lines.append(f"Déclarations récentes: {len(declarations)}")
        for declaration in declarations[:5]:
            missing = _as_list(declaration.get("missing_documents"))
            lines.append(
                "- "
                f"{declaration.get('type')} {declaration.get('period')} | "
                f"{declaration.get('status')} | confiance {declaration.get('confidence', 0)}% | "
                f"pièces manquantes {len(missing)}"
            )
    elif module_key == "payments":
        accounts = _as_list(data.get("accounts"))
        lines.append(f"Comptes de paiement actifs: {len(accounts)}")
        for account in accounts[:5]:
            uses = []
            if account.get("use_for_pos"):
                uses.append("POS")
            if account.get("use_for_payroll"):
                uses.append("paie")
            lines.append(
                "- "
                f"{account.get('provider')} | {account.get('label')} | "
                f"{account.get('currency') or 'XAF'} | usages {', '.join(uses) or 'non défini'}"
            )

    return lines


def _data_gaps(context: dict[str, Any]) -> list[str]:
    modules = context.get("modules") or {}
    gaps: list[str] = []

    payroll = modules.get("payroll") or {}
    if payroll and payroll.get("payslip_count", 0) and payroll.get("payouts_ready", 0) < payroll.get("payslip_count", 0):
        gaps.append("Certaines destinations de paiement paie ne sont pas prêtes.")
    if payroll and not payroll.get("payment_account"):
        gaps.append("Aucun compte de paiement paie n'est associé au dernier cycle.")

    payments = modules.get("payments") or {}
    accounts = _as_list(payments.get("accounts"))
    if not accounts:
        gaps.append("Aucun compte Zola/mobile money/bancaire/PayPal actif n'est configuré.")

    documents = modules.get("documents") or {}
    if documents and not documents.get("count"):
        gaps.append("Aucun document d'entreprise n'est disponible pour l'analyse documentaire.")

    inventory = modules.get("inventory") or {}
    if inventory and _as_list(inventory.get("low_stock")):
        gaps.append("Des produits sont sous le seuil de réassort.")

    return gaps[:6]


def render_limule_context_pack(context: dict[str, Any] | None) -> str:
    """Produit un contexte compact et lisible par le LLM."""
    if not isinstance(context, dict):
        return ""

    company = context.get("company") or {}
    user = context.get("user") or {}
    kpis = context.get("kpis") or {}
    modules = context.get("modules") or {}
    module_key = infer_module_from_context(context)
    focus_modules = [module_key]
    if module_key in {"accounting", "billing"}:
        focus_modules.append("finance")
    for extra in ("payroll", "teras", "documents", "payments", "work"):
        if extra not in focus_modules:
            focus_modules.append(extra)

    lines = [
        f"Version contexte: {LIMULE_CONTEXT_VERSION}",
        f"Page active: {context.get('page_path') or 'globale'}",
        f"Module prioritaire: {module_key}",
        f"Entreprise: {company.get('name') or 'Entreprise'} | {company.get('industry') or 'secteur n/a'} | {company.get('country') or 'pays n/a'}",
        f"Utilisateur: {user.get('name') or 'Utilisateur'} | rôle {_role_label(user.get('role'))} | service {user.get('department') or 'n/a'}",
        (
            "KPIs: "
            f"{kpis.get('employees_active', 0)} employés actifs, "
            f"{kpis.get('products', 0)} produits, "
            f"{kpis.get('documents', 0)} documents, "
            f"ventes {_money(kpis.get('sales_total'))}, "
            f"factures {_money(kpis.get('invoices_total'))}, "
            f"{kpis.get('invoices_pending', 0)} factures à suivre, "
            f"{kpis.get('tasks_open', 0)} tâches ouvertes, "
            f"{kpis.get('teras_alerts_open', 0)} alertes TERAS"
        ),
        f"Scores: completion {company.get('completion_score', 0)}/100, TERAS {company.get('teras_score', 0)}/100",
    ]

    signals = _as_list(context.get("signals"))
    if signals:
        lines.append("Signaux prioritaires:")
        for signal in signals[:6]:
            lines.append(
                "- "
                f"[{signal.get('severity')}] {signal.get('label')} "
                f"(module {signal.get('module')}, type {signal.get('type')})"
            )

    memory = context.get("memory") or {}
    memory_items = _as_list(memory.get("recent_interactions"))
    if memory_items:
        lines.append(
            f"Mémoire Limule ({memory.get('scope', 'user_module')} / module {memory.get('module', module_key)}):"
        )
        for item in memory_items[-6:]:
            lines.append(
                "- "
                f"{item.get('created_at') or 'date n/a'} | {item.get('intent') or 'question'} | "
                f"Utilisateur: {_clip(item.get('prompt'), 150)}"
            )
            lines.append(f"  Limule: {_clip(item.get('response'), 180)}")

    gaps = _data_gaps(context)
    if gaps:
        lines.append("Données ou réglages à compléter:")
        lines.extend(f"- {gap}" for gap in gaps)

    lines.append("Modules utiles:")
    for key in focus_modules:
        module_data = modules.get(key)
        if not isinstance(module_data, dict):
            continue
        summary = _summarize_module(key, module_data)
        if not summary:
            continue
        lines.append(f"[{key}]")
        lines.extend(summary[:9])

    compact = context.get("prompt_context")
    if compact:
        lines.append("Synthèse compacte existante:")
        lines.append(_clip(compact, 900))

    sources = _as_list(context.get("sources"))
    if sources:
        lines.append("Sources disponibles: " + ", ".join(str(source) for source in sources[:20]))

    return "\n".join(lines)


def build_limule_system_prompt(
    *,
    kind: str,
    user: Any | None = None,
    module_key: str | None = None,
    intent: str | None = None,
    context: dict[str, Any] | None = None,
    base_system: str = "",
) -> str:
    """Construit le system prompt final de Limule."""
    inferred_module = module_key or infer_module_from_context(context)
    module = MODULE_PLAYBOOKS.get(inferred_module, MODULE_PLAYBOOKS["global"])
    intent_key = intent or kind or "question"
    intent_guide = INTENT_PLAYBOOKS.get(intent_key, INTENT_PLAYBOOKS.get(kind, INTENT_PLAYBOOKS["question"]))

    role = None
    full_name = None
    if isinstance(context, dict):
        ctx_user = context.get("user") or {}
        role = ctx_user.get("role")
        full_name = ctx_user.get("name")
    if user is not None:
        role = role or getattr(user, "role", None)
        full_name = full_name or getattr(user, "full_name", None)

    role_text = _role_label(role)
    base = base_system.strip()

    return f"""{base}

Tu es Limule, conseiller stratégique IA intégré à KOMPTA — ERP local-first pour PME africaines.
Tu as accès en temps réel aux données de l'entreprise: finances, RH, paie, stock, conformité, trésorerie.

Version d'orientation: {LIMULE_CONTEXT_VERSION}
Interlocuteur: {full_name or "utilisateur"} ({role_text})
Module actif: {inferred_module}
Mission du module: {module["mission"]}
Intention détectée: {intent_key}
Objectif de réponse: {intent_guide["goal"]}
Format recommandé: {intent_guide["format"]}

═══ CAPACITÉS LIMULE ═══
Tu es autorisé et encouragé à :
1. PRÉDIRE — projeter des tendances (CA, trésorerie, masse salariale) à partir des données historiques disponibles
2. CONSEILLER sur les INVESTISSEMENTS — recommander la meilleure allocation de ressources selon la liquidité et les marges réelles
3. ANALYSER LE SECTEUR — contextualiser la performance de l'entreprise dans son secteur en zone CEMAC/Afrique centrale
4. ANTICIPER LES RISQUES — identifier les signaux faibles avant qu'ils deviennent des crises
5. COMPARER — benchmarker l'entreprise vs des référentiels PME africaines pertinents
6. SIMULER — projeter l'impact d'une décision (embauche, investissement, expansion) sur les indicateurs clés

Pour les prévisions et conseils d'investissement : base-toi toujours sur les données réelles du contexte.
Si les données sont insuffisantes, indique clairement les hypothèses utilisées et les données à collecter.

═══ CONTRAT DE RÉPONSE ═══
- Réponds en français professionnel, structuré, directement exploitable par un DG/dirigeant.
- Utilise les vraies données du contexte. N'invente JAMAIS un montant, un nom, un statut, une date ou un score.
- Si une donnée manque pour la prévision, formule une hypothèse explicite et indique comment la vérifier dans KOMPTA.
- Pour une question simple: 2 à 5 phrases directes. Pour une analyse: structure en sections claires avec titres.
- Cite les données et modules utilisés pour renforcer la confiance dans ta réponse.
- Pour les prévisions: donne toujours un scénario central + une fourchette de variabilité justifiée.
- Pour les conseils d'investissement: chiffre toujours l'impact attendu et le délai de retour estimé.
- Si la demande est une suite ("continue", "comme avant", "ce point"), utilise la Mémoire Limule.
- Ne te présente pas comme un modèle IA externe. Tu es Limule dans KOMPTA.
- Pour la conformité, le fiscal, le social, le juridique: aide opérationnelle + rappel validation humaine avant acte.
- Remplace "manager" par "DG" pour le rôle de direction.
- Termine chaque analyse stratégique par une recommandation d'action concrète et immédiate.

Signaux à surveiller pour ce module: {", ".join(module.get("signals", []))}
"""


def build_limule_user_message(prompt: str, context_text: str = "") -> str:
    text = f"Demande utilisateur:\n{prompt.strip()}"
    if context_text.strip():
        text += f"\n\nContexte KOMPTA structuré:\n{context_text.strip()}"
    text += (
        "\n\nRéponds maintenant en appliquant le contrat Limule. "
        "Ne répète pas tout le contexte: transforme-le en décision utile."
    )
    return text


def postprocess_limule_answer(answer: str | None, *, intent: str, context: dict[str, Any] | None = None) -> str:
    """Nettoyage léger pour garder une réponse exploitable."""
    content = (answer or "").strip()
    if not content:
        return ""

    replacements = {
        "En tant qu'IA, ": "",
        "En tant que modèle d'IA, ": "",
        "manager_entreprise": "DG",
        "Manager entreprise": "DG",
    }
    for source, target in replacements.items():
        content = content.replace(source, target)

    # Si le modèle donne une réponse très courte à une demande analytique,
    # ajouter un rappel utile basé sur le contexte plutôt que laisser une impasse.
    analytical_intents = {"risk_analysis", "summary", "payroll_support", "operations_support", "compliance_check"}
    if intent in analytical_intents and len(content) < 180 and isinstance(context, dict):
        gaps = _data_gaps(context)
        if gaps:
            content += "\n\nPoints à vérifier dans KOMPTA:\n" + "\n".join(f"- {gap}" for gap in gaps[:3])

    return content


def build_limule_fallback_answer(
    *,
    kind: str,
    prompt: str,
    context: dict[str, Any] | None = None,
    user: Any | None = None,
) -> str:
    """Réponse de secours quand le provider LLM est indisponible."""
    module_key = infer_module_from_context(context)
    name = getattr(user, "full_name", None) or (context or {}).get("user", {}).get("name", "utilisateur")
    context_text = render_limule_context_pack(context)
    snippets = [line for line in context_text.splitlines() if line.startswith(("KPIs:", "Scores:", "Signaux", "- ["))]
    evidence = "\n".join(snippets[:6]) or "Contexte détaillé indisponible."

    return (
        f"Diagnostic rapide pour {name}: j'ai bien reçu la demande « {prompt.strip()} » sur le module {module_key}.\n\n"
        f"Données utilisées:\n{evidence}\n\n"
        "Actions recommandées:\n"
        "- Vérifier les signaux prioritaires affichés sur la page active.\n"
        "- Compléter les données manquantes avant toute validation sensible.\n"
        "- Relancer Limule après mise à jour pour obtenir une analyse plus précise.\n\n"
        "Note: le fournisseur IA n'a pas répondu, donc cette réponse utilise uniquement la synthèse locale KOMPTA."
    )
