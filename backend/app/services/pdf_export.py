"""Native PDF generation using ReportLab — no system deps required."""
import re
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

TEAL = colors.HexColor("#0f766e")
INK = colors.HexColor("#17211f")
MUTED = colors.HexColor("#6b7280")
BORDER = colors.HexColor("#e5e7eb")
SOFT = colors.HexColor("#f0faf9")


def _money(amount: float) -> str:
    return f"{amount:,.0f}".replace(",", " ") + " XAF"


def _styles():
    base = getSampleStyleSheet()
    return {
        "logo": ParagraphStyle("logo", parent=base["Title"], fontSize=24, textColor=TEAL, spaceAfter=2),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontSize=18, textColor=INK, spaceAfter=4),
        "muted": ParagraphStyle("muted", parent=base["Normal"], fontSize=10, textColor=MUTED),
        "body": ParagraphStyle("body", parent=base["Normal"], fontSize=11, textColor=INK),
        "total": ParagraphStyle("total", parent=base["Heading1"], fontSize=15, alignment=2, textColor=TEAL),
        "footer": ParagraphStyle("footer", parent=base["Normal"], fontSize=9, textColor=MUTED, alignment=1),
        "badge": ParagraphStyle("badge", parent=base["Normal"], fontSize=10, textColor=TEAL, alignment=2),
    }


def render_invoice_pdf(invoice, company) -> bytes:
    """Build a clean A4 PDF for an invoice. Returns raw bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=f"Facture {invoice.number}",
    )
    s = _styles()
    story = []

    company_name = company.name if company else "KOMPTA"
    company_legal = company.legal_name if company and company.legal_name else ""
    company_country = company.country if company and company.country else ""

    header = Table(
        [[Paragraph(company_name, s["logo"]), Paragraph("FACTURE", s["badge"])],
         [Paragraph(f"{company_legal} · {company_country}", s["muted"]), ""]],
        colWidths=[12 * cm, 5 * cm],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(header)
    story.append(Spacer(1, 0.6 * cm))

    meta = Table(
        [[
            Paragraph(f"<b>{invoice.number}</b><br/>"
                      f"Client : <b>{invoice.customer_name}</b><br/>"
                      f"Statut : <b>{invoice.status.upper()}</b>", s["body"]),
            Paragraph(f"Créé le : {str(invoice.created_at)[:10]}<br/>"
                      f"{'Échéance : ' + str(invoice.due_date)[:10] if invoice.due_date else ''}",
                      s["muted"]),
        ]],
        colWidths=[10 * cm, 7 * cm],
    )
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(meta)
    story.append(Spacer(1, 0.6 * cm))

    rows = [["Description", "Qté", "Prix unit.", "Total"]]
    for line in invoice.lines:
        rows.append([
            line.description,
            str(line.quantity),
            _money(line.unit_price),
            _money(line.total),
        ])
    table = Table(rows, colWidths=[8.5 * cm, 1.5 * cm, 3.5 * cm, 3.5 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEAL),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(f"Total TTC : {_money(invoice.total_amount)}", s["total"]))

    if getattr(invoice, "status", "") == "paid":
        payment_label = getattr(invoice, "payment_account_label", "") or getattr(invoice, "payment_method", "") or "cash"
        paid_at = getattr(invoice, "paid_at", None)
        story.append(Spacer(1, 0.25 * cm))
        story.append(Paragraph(
            f"Paiement reçu : <b>{payment_label}</b>"
            + (f" · {str(paid_at)[:16]}" if paid_at else ""),
            s["badge"],
        ))

    # ── Mentions légales de l'entreprise (rend la facture officiellement valable) ──
    from app.services.legal import legal_mention_lines
    legal_lines = legal_mention_lines(company)
    story.append(Spacer(1, 1.2 * cm))
    if legal_lines:
        story.append(Paragraph("<br/>".join(legal_lines), s["footer"]))
        story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        "KOMPTA · Référentiel SYSCEMAC Révisé · Document généré automatiquement",
        s["footer"],
    ))

    doc.build(story)
    return buffer.getvalue()


def build_limule_pdf(
    title: str,
    content: str,
    subtitle: str = "",
    prompt: str = "",
    generated_at: str = "",
    company_name: str = "KOMPTA",
    kind: str = "",
) -> bytes:
    """
    Génère un PDF propre pour tout contenu Limule (chat, historique, assistants, analyses).
    Supporte le Markdown basique : ## titres, **bold**, * listes, tableaux |col|col|.
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2.2 * cm,
        leftMargin=2.5 * cm, rightMargin=2.5 * cm,
        title=title,
    )

    base = getSampleStyleSheet()
    brand = colors.HexColor("#059669")
    ink   = colors.HexColor("#17211f")
    muted = colors.HexColor("#6b7280")
    soft  = colors.HexColor("#f0fdf4")

    st_title = ParagraphStyle("LTitle", parent=base["Title"],
                               textColor=brand, fontSize=20, spaceAfter=4, leading=24)
    st_sub   = ParagraphStyle("LSub",   parent=base["Normal"],
                               textColor=muted, fontSize=9, spaceAfter=14)
    st_h2    = ParagraphStyle("LH2",    parent=base["Heading2"],
                               textColor=brand, fontSize=13, spaceBefore=12, spaceAfter=4)
    st_h3    = ParagraphStyle("LH3",    parent=base["Heading3"],
                               textColor=ink, fontSize=11, spaceBefore=8, spaceAfter=2)
    st_body  = ParagraphStyle("LBody",  parent=base["Normal"],
                               fontSize=10, leading=15, spaceAfter=5, textColor=ink)
    st_bold  = ParagraphStyle("LBold",  parent=base["Normal"],
                               fontSize=10, leading=15, spaceAfter=5, textColor=ink)
    st_bullet = ParagraphStyle("LBullet", parent=base["Normal"],
                                fontSize=10, leading=15, spaceAfter=3,
                                leftIndent=14, bulletIndent=4, textColor=ink)
    st_prompt = ParagraphStyle("LPrompt", parent=base["Normal"],
                                fontSize=9, leading=13, spaceAfter=14,
                                textColor=muted, leftIndent=12,
                                borderPadding=(6, 10, 6, 10),
                                backColor=colors.HexColor("#f9fafb"))
    st_footer = ParagraphStyle("LFooter", parent=base["Normal"],
                                fontSize=8, textColor=muted, alignment=TA_CENTER)

    # ── KIND label
    kind_labels = {
        "email": "Email professionnel",
        "note": "Note de service",
        "clause": "Clause contractuelle",
        "declaration": "Analyse déclarative",
        "meeting_summary": "Résumé de réunion",
        "compliance_check": "Vérification conformité",
        "communique": "Communiqué",
        "courrier": "Courrier officiel",
        "reponse_client": "Réponse client",
        "annonce_interne": "Annonce interne",
        "portfolio_analysis": "Analyse de portefeuille",
        "investment_analysis": "Analyse boursière",
        "question": "Réponse Limule",
        "text": "Document Limule",
    }
    kind_label = kind_labels.get(kind, "Document Limule")

    date_str = (generated_at or datetime.now().strftime("%d/%m/%Y %H:%M"))[:16]

    story: list = []

    # ── Header
    story.append(Paragraph(title, st_title))
    meta_parts = [f"<b>{kind_label}</b>", f"Généré le {date_str}"]
    if company_name and company_name != "KOMPTA":
        meta_parts.insert(0, company_name)
    if subtitle:
        meta_parts.append(subtitle)
    story.append(Paragraph(" · ".join(meta_parts), st_sub))
    story.append(HRFlowable(width="100%", thickness=1.5, color=brand, spaceAfter=14))

    # ── Demande originale (si fournie)
    if prompt and prompt.strip():
        clean_p = re.sub(r"<[^>]+>", "", prompt.strip())[:400]
        story.append(Paragraph(f"<b>Demande :</b> {clean_p}", st_prompt))

    # ── Corps — parser Markdown basique
    def _escape(text: str) -> str:
        """Échapper les caractères spéciaux ReportLab sauf balises <b><i>."""
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # Remettre les balises bold/italic déjà insérées
        text = text.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")
        text = text.replace("&lt;i&gt;", "<i>").replace("&lt;/i&gt;", "</i>")
        return text

    def _inline(text: str) -> str:
        """Convertir **bold**, *italic*, `code` en balises ReportLab."""
        text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
        text = re.sub(r"`(.+?)`", r"<i>\1</i>", text)
        return text

    lines = content.split("\n")
    in_table = False
    table_rows: list[list[str]] = []

    def _flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            in_table = False
            return
        col_count = max(len(r) for r in table_rows)
        col_w = (16 * cm) / col_count
        t = Table(table_rows, colWidths=[col_w] * col_count, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, 0),  soft),
            ("TEXTCOLOR",    (0, 0), (-1, 0),  brand),
            ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",     (0, 0), (-1, -1), 9),
            ("LINEBELOW",    (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
            ("TOPPADDING",   (0, 0), (-1, -1), 6),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(Spacer(1, 6))
        in_table = False
        table_rows = []

    for raw_line in lines:
        line = raw_line.strip()

        # Table Markdown |col|col|…
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            # Ignorer la ligne séparateur |---|---|
            if all(re.match(r"^[-:]+$", c) for c in cells if c):
                continue
            if not in_table:
                in_table = True
            table_rows.append(cells)
            continue
        else:
            if in_table:
                _flush_table()

        if not line:
            story.append(Spacer(1, 4))
            continue

        # #### H4+ → texte bold normal (sous-sections fines)
        if re.match(r"^#{4,}\s+", line):
            clean = _inline(_escape(re.sub(r"^#{4,}\s+", "", line)))
            story.append(Paragraph(f"<b>{clean}</b>", st_body))
        # ### H3 → traité comme texte bold souligné (pas de heading séparé)
        elif line.startswith("### "):
            clean = _inline(_escape(line[4:]))
            story.append(Paragraph(f"<b>{clean}</b>", st_bold))
        # ## H2
        elif re.match(r"^##\s+", line):
            clean = _inline(_escape(re.sub(r"^##\s+", "", line)))
            story.append(Paragraph(clean, st_h2))
        # # H1 (traité comme H2)
        elif re.match(r"^#\s+", line):
            clean = _inline(_escape(re.sub(r"^#\s+", "", line)))
            story.append(Paragraph(clean, st_h2))
        # Ligne entière **bold**
        elif re.match(r"^\*\*(.+)\*\*$", line):
            clean = _escape(re.sub(r"\*\*", "", line))
            story.append(Paragraph(f"<b>{clean}</b>", st_bold))
        # Puce * ou -
        elif re.match(r"^[*\-•]\s+", line):
            clean = _inline(_escape(re.sub(r"^[*\-•]\s+", "", line)))
            story.append(Paragraph(f"• {clean}", st_bullet))
        # Ligne numérotée 1. 2. …
        elif re.match(r"^\d+\.\s+", line):
            num, rest = line.split(". ", 1)
            clean = _inline(_escape(rest))
            story.append(Paragraph(f"<b>{num}.</b> {clean}", st_bullet))
        # Paragraphe normal
        else:
            clean = _inline(_escape(line))
            story.append(Paragraph(clean, st_body))

    if in_table:
        _flush_table()

    # ── Pied de page
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e5e7eb")))
    story.append(Paragraph(
        f"Généré par Limule AI · KOMPTA ERP · {date_str} · À titre informatif uniquement.",
        st_footer,
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()


def render_payroll_pdf(run, company) -> bytes:
    """Build A4 PDF for a payroll run with one bulletin per page."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=f"Bulletins {run.period}",
    )
    s = _styles()
    story = []

    company_name = company.name if company else "KOMPTA"

    for idx, slip in enumerate(run.payslips):
        story.append(Paragraph(company_name, s["logo"]))
        story.append(Paragraph(f"Bulletin de paie · {run.period}", s["muted"]))
        story.append(Spacer(1, 0.6 * cm))

        story.append(Paragraph(f"<b>{slip.employee_name}</b>", s["h2"]))
        story.append(Paragraph(f"Référence : {slip.reference}", s["muted"]))
        story.append(Spacer(1, 0.6 * cm))

        rows = [
            ["Salaire brut", _money(slip.gross_pay)],
            ["Cotisations & retenues", f"- {_money(slip.deductions)}"],
            ["Net à payer", _money(slip.net_pay)],
        ]
        table = Table(rows, colWidths=[10 * cm, 7 * cm])
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 2), (-1, 2), TEAL),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("LINEBELOW", (0, 0), (-1, -2), 0.5, BORDER),
            ("LINEABOVE", (0, 2), (-1, 2), 1.5, TEAL),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(table)
        story.append(Spacer(1, 1.0 * cm))
        story.append(Paragraph(
            "KOMPTA · Référentiel SYSCEMAC · Bulletin certifié",
            s["footer"],
        ))

        if idx < len(run.payslips) - 1:
            story.append(PageBreak())

    doc.build(story)
    return buffer.getvalue()
