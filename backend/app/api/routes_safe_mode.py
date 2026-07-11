"""
Safe Mode — KOMPTA Backup & Restore
GET  /safe-mode/export    → PDF pack complet + analyse Limule
POST /safe-mode/analyze   → Analyse un PDF uploadé, retourne preview JSON
POST /safe-mode/restore   → Restaure les données depuis un payload JSON parsé
"""
from __future__ import annotations

import asyncio
import base64, io, json, re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes import _require_company_owner
from app.db.session import get_db
from app.models import (
    Company, DeclarationRecord, Employee, Invoice, InvoiceLine,
    PayrollRun, Payslip, Product, Task, TerasAlert, TerasScoreSnapshot, User,
)

router = APIRouter()
SAFE_MODE_VERSION = "1.0"
JSON_MARKER_START = "%%KOMPTA_SAFE%%"
JSON_MARKER_END = "%%/KOMPTA_SAFE%%"


# ─── Data collection ──────────────────────────────────────────────────────────

def _collect_snapshot(db: Session, company_id: int) -> dict[str, Any]:
    company = db.get(Company, company_id)
    company_dict: dict[str, Any] = {}
    if company:
        company_dict = {
            "id": company.id,
            "name": company.name,
            "legal_name": company.legal_name,
            "industry": company.industry,
            "organization_type": company.organization_type,
            "country": company.country,
            "primary_color": company.primary_color,
            "accent_color": company.accent_color,
            "completion_score": company.completion_score,
            "teras_score": company.teras_score,
        }

    employees = db.scalars(
        select(Employee).where(Employee.company_id == company_id)
    ).all()
    employees_list = [
        {
            "id": e.id,
            "first_name": e.first_name,
            "last_name": e.last_name,
            "job_title": e.job_title,
            "department": e.department,
            "branch": e.branch,
            "salary": e.salary,
            "employment_type": e.employment_type,
            "status": e.status,
            "email": e.email,
            "phone": e.phone,
        }
        for e in employees
    ]

    products = db.scalars(
        select(Product).where(Product.company_id == company_id)
    ).all()
    products_list = [
        {
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "category": p.category,
            "price": p.price,
            "stock_quantity": p.stock_quantity,
            "reorder_level": p.reorder_level,
        }
        for p in products
    ]

    invoices = db.scalars(
        select(Invoice).where(Invoice.company_id == company_id)
    ).all()
    invoices_list = [
        {
            "id": i.id,
            "number": i.number,
            "customer_name": i.customer_name,
            "status": i.status,
            "total_amount": i.total_amount,
            "due_date": str(i.due_date) if i.due_date else None,
            "created_at": str(i.created_at) if i.created_at else None,
        }
        for i in invoices
    ]

    payroll_runs = db.scalars(
        select(PayrollRun).where(PayrollRun.company_id == company_id)
    ).all()
    payroll_list = [
        {
            "id": pr.id,
            "period": pr.period,
            "status": pr.status,
            "gross_total": pr.gross_total,
            "net_total": pr.net_total,
            "created_at": str(pr.created_at) if pr.created_at else None,
        }
        for pr in payroll_runs
    ]

    tasks = db.scalars(
        select(Task).where(Task.company_id == company_id)
    ).all()
    tasks_list = [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "assignee_name": t.assignee_name,
            "due_date": str(t.due_date) if t.due_date else None,
            "created_at": str(t.created_at) if t.created_at else None,
        }
        for t in tasks
    ]

    teras_score_row = db.scalars(
        select(TerasScoreSnapshot)
        .where(TerasScoreSnapshot.company_id == company_id)
        .order_by(TerasScoreSnapshot.created_at.desc())
    ).first()
    teras_score = None
    if teras_score_row:
        teras_score = {
            "domain": teras_score_row.domain,
            "score": teras_score_row.score,
            "maturity_level": teras_score_row.maturity_level,
            "confidence": teras_score_row.confidence,
            "summary": teras_score_row.summary,
        }

    teras_alerts = db.scalars(
        select(TerasAlert).where(TerasAlert.company_id == company_id)
    ).all()
    alerts_list = [
        {
            "title": a.title,
            "severity": a.severity,
            "module": a.module,
            "status": a.status,
        }
        for a in teras_alerts
    ]

    return {
        "version": SAFE_MODE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "company": company_dict,
        "employees": employees_list,
        "products": products_list,
        "invoices": invoices_list,
        "payroll_runs": payroll_list,
        "tasks": tasks_list,
        "teras_score": teras_score,
        "teras_alerts": alerts_list,
    }


# ─── Limule AI summary ────────────────────────────────────────────────────────

async def _generate_limule_summary(
    snapshot: dict, db: Session, company_id: int, current_user: User
) -> str:
    try:
        from app.services.limule import limule_generate
        from app.services.limule_context import build_limule_context

        context = build_limule_context(
            db=db, company_id=company_id, user=current_user, page_path="/safe-mode"
        )

        n_emp = len(snapshot.get("employees", []))
        n_prod = len(snapshot.get("products", []))
        n_inv = len(snapshot.get("invoices", []))
        teras = snapshot.get("teras_score") or {}
        company_name = (snapshot.get("company") or {}).get("name", "")

        prompt = f"""En tant que conseiller stratégique de {company_name}, génère un rapport d'appréciation complet pour le pack Safe Mode.

Données disponibles :
- {n_emp} employé(s) actif(s)
- {n_prod} produit(s) en inventaire
- {n_inv} facture(s) enregistrée(s)
- Score TERAS : {teras.get('score', 'N/D')} ({teras.get('maturity_level', 'N/D')})

Génère :
1. Un résumé exécutif de l'état de l'entreprise
2. Points forts identifiés
3. Points d'attention et risques potentiels
4. Recommandations prioritaires pour les 30 prochains jours
5. Note de conformité et sécurité

Ton : professionnel, précis, actionnable. Format structuré avec titres."""

        content, _ = await limule_generate(
            kind="summary",
            prompt=prompt,
            context=context["prompt_context"],
            structured_context=context,
            db=db,
            company_id=company_id,
            user=current_user,
            max_tokens=2000,
            temperature=0.3,
        )
        return content
    except Exception as e:
        return (
            f"Analyse IA non disponible lors de l'export ({e}). "
            "Consultez Limule depuis le tableau de bord pour une analyse personnalisée."
        )


# ─── PDF builder ──────────────────────────────────────────────────────────────

def _build_pdf(snapshot: dict, limule_summary: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, HRFlowable,
    )
    from reportlab.lib.enums import TA_CENTER

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=2.5 * cm, bottomMargin=2 * cm,
    )

    ss = getSampleStyleSheet()

    # Custom styles
    cover_title = ParagraphStyle(
        "CoverTitle", parent=ss["Title"], fontSize=28,
        textColor=colors.HexColor("#17211f"), spaceAfter=8,
        alignment=TA_CENTER, fontName="Helvetica-Bold",
    )
    cover_sub = ParagraphStyle(
        "CoverSub", parent=ss["Normal"], fontSize=14,
        textColor=colors.HexColor("#6b7280"), alignment=TA_CENTER, spaceAfter=4,
    )
    section_head = ParagraphStyle(
        "SectionHead", parent=ss["Heading1"], fontSize=14,
        textColor=colors.HexColor("#17211f"), spaceBefore=12, spaceAfter=6,
        fontName="Helvetica-Bold", borderPad=4,
    )
    body = ParagraphStyle(
        "Body", parent=ss["Normal"], fontSize=9, leading=14,
        textColor=colors.HexColor("#374151"),
    )

    company = snapshot.get("company") or {}
    company_name = company.get("name") or "—"
    exported_at = snapshot.get("exported_at", "")[:16].replace("T", " ")

    story: list[Any] = []

    # ── Cover page ────────────────────────────────────────────────────────
    story += [
        Spacer(1, 3 * cm),
        Paragraph("KOMPTA", cover_title),
        Paragraph("Safe Mode — Pack de sauvegarde sécurisé", cover_sub),
        Spacer(1, 1 * cm),
        HRFlowable(width="80%", thickness=2, color=colors.HexColor("#059669"), hAlign="CENTER"),
        Spacer(1, 1 * cm),
        Paragraph(company_name, ParagraphStyle("Co", parent=cover_title, fontSize=22)),
        Spacer(1, 0.5 * cm),
        Paragraph(f"Exporté le {exported_at} UTC", cover_sub),
        Paragraph(
            f"Version Safe Mode {snapshot.get('version', '1.0')} · Généré par KOMPTA",
            ParagraphStyle("Footer", parent=cover_sub, fontSize=10),
        ),
        Spacer(1, 2 * cm),
        Paragraph(
            "Ce document contient l'intégralité des données de votre espace KOMPTA ainsi qu'une "
            "analyse stratégique générée par Limule. En cas de perte d'accès, il permet la restauration "
            "automatique ou assistée de toutes vos données.",
            ParagraphStyle(
                "Notice", parent=body, fontSize=10, alignment=TA_CENTER,
                textColor=colors.HexColor("#6b7280"),
            ),
        ),
        PageBreak(),
    ]

    # ── Company section ───────────────────────────────────────────────────
    story += [
        Paragraph("1. Profil Entreprise", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
    ]
    co_data = [
        ["Raison sociale", company.get("name") or "—", "Nom légal", company.get("legal_name") or "—"],
        ["Secteur", company.get("industry") or "—", "Type", company.get("organization_type") or "—"],
        ["Pays", company.get("country") or "—", "Score TERAS", str(company.get("teras_score", "N/D"))],
        ["Score complétion", f"{company.get('completion_score', 0)}%", "Couleur principale", company.get("primary_color") or "—"],
    ]
    t = Table(co_data, colWidths=[3.5 * cm, 6 * cm, 3.5 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f9fafb")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f9fafb")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7280")),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#6b7280")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [t, Spacer(1, 0.5 * cm)]

    # ── Employees section ─────────────────────────────────────────────────
    employees = snapshot.get("employees") or []
    story += [
        Paragraph(f"2. Personnel ({len(employees)} employé(s))", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
    ]
    if employees:
        emp_headers = ["Nom", "Poste", "Département", "Type", "Statut", "Salaire"]
        emp_rows = [emp_headers] + [
            [
                f"{e.get('first_name', '')} {e.get('last_name', '')}".strip() or "—",
                (e.get("job_title") or "—")[:28],
                (e.get("department") or "—")[:20],
                e.get("employment_type") or "—",
                e.get("status") or "—",
                f"{e.get('salary', 0):,.0f} XAF".replace(",", " "),
            ]
            for e in employees[:50]
        ]
        et = Table(emp_rows, colWidths=[4 * cm, 4.5 * cm, 3 * cm, 2.5 * cm, 2 * cm, 3.5 * cm])
        et.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0fdf4")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#059669")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [et]
        if len(employees) > 50:
            story += [
                Paragraph(
                    f"… et {len(employees) - 50} employé(s) supplémentaires (inclus dans la sauvegarde JSON)",
                    body,
                )
            ]
    else:
        story += [Paragraph("Aucun employé enregistré.", body)]
    story += [Spacer(1, 0.5 * cm), PageBreak()]

    # ── Finance section ───────────────────────────────────────────────────
    invoices = snapshot.get("invoices") or []
    payroll_runs = snapshot.get("payroll_runs") or []
    story += [
        Paragraph("3. Finance & Facturation", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
    ]

    story += [Paragraph("Factures", ParagraphStyle("SubHead", parent=section_head, fontSize=11, spaceBefore=6))]
    if invoices:
        inv_headers = ["N° Facture", "Client", "Statut", "Montant", "Échéance"]
        inv_rows = [inv_headers] + [
            [
                i.get("number") or "—",
                (i.get("customer_name") or "—")[:30],
                i.get("status") or "—",
                f"{i.get('total_amount', 0):,.0f} XAF".replace(",", " "),
                (i.get("due_date") or "—")[:10],
            ]
            for i in invoices[:30]
        ]
        it = Table(inv_rows, colWidths=[3.5 * cm, 6 * cm, 2.5 * cm, 4 * cm, 3 * cm])
        it.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [it, Spacer(1, 0.4 * cm)]
    else:
        story += [Paragraph("Aucune facture.", body)]

    story += [Paragraph("Cycles de paie", ParagraphStyle("SubHead2", parent=section_head, fontSize=11, spaceBefore=6))]
    if payroll_runs:
        pr_headers = ["Période", "Statut", "Brut total", "Net total"]
        pr_rows = [pr_headers] + [
            [
                p.get("period") or "—",
                p.get("status") or "—",
                f"{p.get('gross_total', 0):,.0f} XAF".replace(",", " "),
                f"{p.get('net_total', 0):,.0f} XAF".replace(",", " "),
            ]
            for p in payroll_runs
        ]
        prt = Table(pr_rows, colWidths=[4 * cm, 3 * cm, 5.5 * cm, 5.5 * cm])
        prt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fff7ed")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#ea580c")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [prt]
    else:
        story += [Paragraph("Aucun cycle de paie.", body)]
    story += [Spacer(1, 0.5 * cm), PageBreak()]

    # ── Products & Tasks section ──────────────────────────────────────────
    products = snapshot.get("products") or []
    tasks = snapshot.get("tasks") or []
    story += [
        Paragraph("4. Inventaire & Opérations", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
    ]

    story += [Paragraph(f"Produits ({len(products)})", ParagraphStyle("SubHead3", parent=section_head, fontSize=11, spaceBefore=4))]
    if products:
        prod_headers = ["Produit", "SKU", "Catégorie", "Prix", "Stock", "Seuil"]
        prod_rows = [prod_headers] + [
            [
                (p.get("name") or "—")[:30],
                p.get("sku") or "—",
                (p.get("category") or "—")[:20],
                f"{p.get('price', 0):,.0f} XAF".replace(",", " "),
                str(p.get("stock_quantity", 0)),
                str(p.get("reorder_level", 0)),
            ]
            for p in products[:40]
        ]
        prodt = Table(prod_rows, colWidths=[5 * cm, 2.5 * cm, 3.5 * cm, 3.5 * cm, 2 * cm, 2 * cm])
        prodt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f3ff")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [prodt, Spacer(1, 0.4 * cm)]
    else:
        story += [Paragraph("Aucun produit.", body)]

    story += [Paragraph(f"Tâches opérationnelles ({len(tasks)})", ParagraphStyle("SubHead4", parent=section_head, fontSize=11, spaceBefore=6))]
    if tasks:
        task_headers = ["Titre", "Statut", "Priorité", "Responsable", "Échéance"]
        task_rows = [task_headers] + [
            [
                (tk.get("title") or "—")[:35],
                tk.get("status") or "—",
                tk.get("priority") or "—",
                (tk.get("assignee_name") or "—")[:20],
                (tk.get("due_date") or "—")[:10],
            ]
            for tk in tasks[:30]
        ]
        tt = Table(task_rows, colWidths=[6 * cm, 2.5 * cm, 2.5 * cm, 4 * cm, 3 * cm])
        tt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ecfdf5")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#059669")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [tt]
    else:
        story += [Paragraph("Aucune tâche.", body)]
    story += [Spacer(1, 0.5 * cm), PageBreak()]

    # ── TERAS section ─────────────────────────────────────────────────────
    teras_score = snapshot.get("teras_score") or {}
    teras_alerts = snapshot.get("teras_alerts") or []
    story += [
        Paragraph("5. TERAS & Conformité", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
    ]
    if teras_score:
        ts_data = [
            ["Score global", str(teras_score.get("score", "N/D")), "Niveau", teras_score.get("maturity_level", "N/D")],
            ["Domaine", teras_score.get("domain", "N/D"), "Confiance", f"{teras_score.get('confidence', 0)}%"],
        ]
        tst = Table(ts_data, colWidths=[3.5 * cm, 5 * cm, 3.5 * cm, 6.5 * cm])
        tst.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f9fafb")),
            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f9fafb")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story += [tst, Spacer(1, 0.3 * cm)]
        if teras_score.get("summary"):
            story += [Paragraph(teras_score["summary"][:500], body)]

    if teras_alerts:
        story += [Paragraph("Alertes TERAS actives", ParagraphStyle("SubHead5", parent=section_head, fontSize=11, spaceBefore=8))]
        al_rows: list[list[str]] = [["Titre", "Sévérité", "Module", "Statut"]] + [
            [
                (a.get("title") or "—")[:40],
                a.get("severity") or "—",
                a.get("module") or "—",
                a.get("status") or "—",
            ]
            for a in teras_alerts[:20]
        ]
        alt = Table(al_rows, colWidths=[7 * cm, 3 * cm, 3 * cm, 5 * cm])
        alt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fff1f2")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#e11d48")),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story += [alt]
    story += [Spacer(1, 0.5 * cm), PageBreak()]

    # ── Limule AI Analysis ────────────────────────────────────────────────
    story += [
        Paragraph("6. Analyse & Appréciation Limule", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
        Paragraph(
            "Ce rapport a été généré automatiquement par Limule, votre conseiller stratégique IA intégré à KOMPTA.",
            ParagraphStyle("Notice2", parent=body, textColor=colors.HexColor("#6b7280"), spaceAfter=10),
        ),
    ]

    for line in limule_summary.split("\n"):
        stripped = line.strip()
        if not stripped:
            story += [Spacer(1, 0.2 * cm)]
            continue
        clean = re.sub(r"\*\*(.*?)\*\*", r"\1", stripped)
        clean = re.sub(r"#+\s*", "", clean)
        clean = re.sub(r"[*_`]", "", clean)
        if stripped.startswith("#") or stripped.startswith("**"):
            story += [
                Paragraph(
                    clean,
                    ParagraphStyle("AIHead", parent=section_head, fontSize=11, spaceBefore=8, spaceAfter=4),
                )
            ]
        elif stripped.startswith("-") or stripped.startswith("•") or re.match(r"^\d+\.", stripped):
            item_text = re.sub(r"^[-•\d\.]+\s*", "", clean)
            story += [
                Paragraph(
                    f"- {item_text}",
                    ParagraphStyle("Bullet", parent=body, leftIndent=14, spaceAfter=3),
                )
            ]
        else:
            story += [Paragraph(clean, body)]

    story += [Spacer(1, 0.5 * cm), PageBreak()]

    # ── Machine Data Page ─────────────────────────────────────────────────
    json_bytes = json.dumps(snapshot, ensure_ascii=False, default=str).encode("utf-8")
    b64 = base64.b64encode(json_bytes).decode("ascii")

    story += [
        Paragraph("7. Données Machine — Restauration Automatique", section_head),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")),
        Spacer(1, 0.3 * cm),
        Paragraph(
            "Cette section contient le snapshot JSON complet de vos données, encodé en Base64. "
            "Il est utilisé par KOMPTA Safe Mode pour une restauration automatique et fiable. "
            "Ne pas modifier ni supprimer cette section.",
            ParagraphStyle(
                "Warning", parent=body, textColor=colors.HexColor("#b45309"),
                backgroundColor=colors.HexColor("#fffbeb"), borderPad=6,
            ),
        ),
        Spacer(1, 0.4 * cm),
        Paragraph(
            JSON_MARKER_START,
            ParagraphStyle(
                "Marker", parent=body, fontSize=7, fontName="Courier",
                textColor=colors.HexColor("#9ca3af"),
            ),
        ),
    ]

    chunk_size = 80
    for i in range(0, len(b64), chunk_size):
        chunk = b64[i: i + chunk_size]
        story += [
            Paragraph(
                chunk,
                ParagraphStyle(
                    "B64", parent=body, fontSize=6, fontName="Courier",
                    leading=8, textColor=colors.HexColor("#d1d5db"),
                ),
            )
        ]

    story += [
        Paragraph(
            JSON_MARKER_END,
            ParagraphStyle(
                "MarkerEnd", parent=body, fontSize=7, fontName="Courier",
                textColor=colors.HexColor("#9ca3af"),
            ),
        )
    ]

    doc.build(story)
    return buf.getvalue()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/safe-mode/export")
async def safe_mode_export(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Génère et retourne le PDF pack Safe Mode complet."""
    _require_company_owner(current_user)
    snapshot = _collect_snapshot(db, current_user.company_id)
    try:
        limule_summary = await asyncio.wait_for(
            _generate_limule_summary(snapshot, db, current_user.company_id, current_user),
            timeout=6,
        )
    except Exception:
        limule_summary = (
            "Analyse Limule indisponible dans le délai de génération du pack Safe Mode.\n\n"
            "Le snapshot de restauration reste complet. Relancez une analyse depuis Limule "
            "pour obtenir des recommandations détaillées."
        )
    pdf_bytes = _build_pdf(snapshot, limule_summary)
    company_name = (snapshot.get("company") or {}).get("name") or "kompta"
    safe_name = re.sub(r"[^\w\-]", "_", company_name.lower())
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"kompta_safe_mode_{safe_name}_{date_str}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/safe-mode/analyze")
async def safe_mode_analyze(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Analyse un PDF Safe Mode uploadé et retourne un aperçu des données."""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés")

    raw = await file.read()
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50 Mo)")

    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le PDF : {e}")

    start_idx = text.find(JSON_MARKER_START)
    end_idx = text.find(JSON_MARKER_END)

    if start_idx == -1 or end_idx == -1:
        return {
            "status": "no_snapshot",
            "message": (
                "Aucun snapshot machine trouvé dans ce PDF. Il ne s'agit peut-être pas "
                "d'un pack Safe Mode KOMPTA, ou les données sont corrompues."
            ),
            "data": None,
        }

    b64_raw = text[start_idx + len(JSON_MARKER_START): end_idx]
    b64_clean = re.sub(r"\s+", "", b64_raw)

    try:
        json_bytes = base64.b64decode(b64_clean)
        snapshot = json.loads(json_bytes.decode("utf-8"))
    except Exception as e:
        return {"status": "corrupt", "message": f"Snapshot trouvé mais corrompu : {e}", "data": None}

    company = snapshot.get("company") or {}
    preview = {
        "company_name": company.get("name") or "—",
        "exported_at": snapshot.get("exported_at") or "—",
        "version": snapshot.get("version") or "—",
        "counts": {
            "employees": len(snapshot.get("employees") or []),
            "products": len(snapshot.get("products") or []),
            "invoices": len(snapshot.get("invoices") or []),
            "payroll_runs": len(snapshot.get("payroll_runs") or []),
            "tasks": len(snapshot.get("tasks") or []),
            "teras_alerts": len(snapshot.get("teras_alerts") or []),
        },
    }
    return {"status": "ok", "preview": preview, "snapshot": snapshot}


@router.post("/safe-mode/restore")
async def safe_mode_restore(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Restaure les données depuis un snapshot Safe Mode.
    Le payload doit contenir { "snapshot": {...}, "sections": ["employees", "products", ...] }
    """
    _require_company_owner(current_user)
    snapshot = payload.get("snapshot")
    sections: list[str] = payload.get("sections") or []

    if not snapshot:
        raise HTTPException(status_code=400, detail="Snapshot manquant")

    restored: dict[str, int] = {}
    company_id = current_user.company_id

    if "employees" in sections:
        count = 0
        for e in snapshot.get("employees") or []:
            existing = db.scalars(
                select(Employee)
                .where(Employee.email == e.get("email"))
                .where(Employee.company_id == company_id)
            ).first()
            if not existing and e.get("first_name"):
                emp = Employee(
                    first_name=e.get("first_name") or "",
                    last_name=e.get("last_name") or "",
                    email=e.get("email") or "",
                    phone=e.get("phone") or "",
                    job_title=e.get("job_title") or "",
                    employment_type=e.get("employment_type") or "full_time",
                    department=e.get("department") or "",
                    branch=e.get("branch") or "",
                    salary=float(e.get("salary") or 0),
                    status=e.get("status") or "active",
                    company_id=company_id,
                )
                db.add(emp)
                count += 1
        restored["employees"] = count

    if "products" in sections:
        count = 0
        for p in snapshot.get("products") or []:
            existing = db.scalars(
                select(Product)
                .where(Product.sku == p.get("sku"))
                .where(Product.company_id == company_id)
            ).first()
            if not existing and p.get("name"):
                prod = Product(
                    name=p.get("name") or "",
                    sku=p.get("sku") or "",
                    category=p.get("category") or "",
                    brand="",
                    price=float(p.get("price") or 0),
                    stock_quantity=int(p.get("stock_quantity") or 0),
                    reorder_level=int(p.get("reorder_level") or 0),
                    company_id=company_id,
                )
                db.add(prod)
                count += 1
        restored["products"] = count

    if "tasks" in sections:
        count = 0
        for tk in snapshot.get("tasks") or []:
            if tk.get("title"):
                task = Task(
                    title=tk.get("title") or "",
                    description=tk.get("description") or "",
                    status=tk.get("status") or "todo",
                    priority=tk.get("priority") or "normal",
                    assignee_name=tk.get("assignee_name") or "",
                    due_date=tk.get("due_date"),
                    source="safe_mode_restore",
                    company_id=company_id,
                )
                db.add(task)
                count += 1
        restored["tasks"] = count

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur lors de la restauration : {e}")

    return {"status": "restored", "restored": restored}
