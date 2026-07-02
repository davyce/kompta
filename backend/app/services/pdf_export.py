"""Native PDF generation using ReportLab — no system deps required."""
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Image,
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
        "logo": ParagraphStyle("logo", parent=base["Title"], fontSize=24, textColor=TEAL, spaceAfter=2, alignment=TA_LEFT),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontSize=18, textColor=INK, spaceAfter=4),
        "muted": ParagraphStyle("muted", parent=base["Normal"], fontSize=10, textColor=MUTED),
        "body": ParagraphStyle("body", parent=base["Normal"], fontSize=11, textColor=INK),
        "total": ParagraphStyle("total", parent=base["Heading1"], fontSize=15, alignment=2, textColor=TEAL),
        "footer": ParagraphStyle("footer", parent=base["Normal"], fontSize=9, textColor=MUTED, alignment=1),
        "badge": ParagraphStyle("badge", parent=base["Normal"], fontSize=10, textColor=TEAL, alignment=2),
    }


def _company_logo(company, width: float = 1.5 * cm, height: float = 1.5 * cm):
    """Return a ReportLab image when the tenant has uploaded a valid logo."""
    raw_path = getattr(company, "logo_path", "") if company else ""
    if not raw_path:
        return None
    path = Path(raw_path)
    if not path.is_file():
        # Production normally starts in backend/, while some test/build commands
        # start at the repository root.
        candidate = Path(__file__).resolve().parents[2] / raw_path
        path = candidate if candidate.is_file() else path
    if not path.is_file():
        return None
    try:
        image = Image(str(path), width=width, height=height)
        image.hAlign = "LEFT"
        return image
    except Exception:
        return None


_KOMPTA_LOGO_PATH = Path(__file__).resolve().parent.parent / "static" / "kompta-logo.png"


def _kompta_logo(width: float = 1.1 * cm, height: float = 1.1 * cm):
    """Logo KOMPTA (plateforme) — toujours présent sur les documents officiels,
    en plus du logo de l'entreprise émettrice si elle en a fourni un."""
    if not _KOMPTA_LOGO_PATH.is_file():
        return None
    try:
        image = Image(str(_KOMPTA_LOGO_PATH), width=width, height=height)
        image.hAlign = "LEFT"
        return image
    except Exception:
        return None


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

    # ── Logos : KOMPTA (plateforme, toujours présent) + entreprise émettrice
    # (si elle en a fourni un) côte à côte, comme sur un vrai document officiel.
    company_logo = _company_logo(company)
    kompta_logo = _kompta_logo()
    logo_cells: list = [c for c in (kompta_logo, company_logo) if c is not None]
    brand: list = []
    if logo_cells:
        logo_row = Table([logo_cells], colWidths=[1.6 * cm] * len(logo_cells))
        logo_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        brand.append(logo_row)
        brand.append(Spacer(1, 0.12 * cm))
    brand.append(Paragraph(escape(company_name), s["logo"]))

    header = Table(
        [[brand, Paragraph("FACTURE", s["badge"])],
         [Paragraph(f"{company_legal} · {company_country}", s["muted"]), ""]],
        colWidths=[12 * cm, 5 * cm],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(header)
    story.append(Spacer(1, 0.6 * cm))

    client_lines = f"Client : <b>{escape(invoice.customer_name)}</b>"
    if getattr(invoice, "customer_email", None):
        client_lines += f"<br/>Email : {escape(invoice.customer_email)}"

    meta = Table(
        [[
            Paragraph(f"<b>{invoice.number}</b><br/>"
                      f"{client_lines}<br/>"
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

    subtotal = getattr(invoice, "subtotal", None)
    tax_amount = getattr(invoice, "tax_amount", None)
    if subtotal is not None and tax_amount is not None and tax_amount > 0:
        totals = Table(
            [
                ["Sous-total (HT)", _money(subtotal)],
                ["TVA", _money(tax_amount)],
            ],
            colWidths=[13.5 * cm, 3.5 * cm],
        )
        totals.setStyle(TableStyle([
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TEXTCOLOR", (0, 0), (-1, -1), MUTED),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(totals)
        story.append(Spacer(1, 0.1 * cm))
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


def render_receipt_pdf(sale, company) -> bytes:
    """Build a printable 80 mm POS receipt with the company logo and line items."""
    item_count = max(len(getattr(sale, "items", []) or []), 1)
    page_height = max(14 * cm, (11.5 + item_count * 0.72) * cm)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=(8 * cm, page_height),
        rightMargin=0.45 * cm,
        leftMargin=0.45 * cm,
        topMargin=0.45 * cm,
        bottomMargin=0.45 * cm,
        title=f"Ticket {sale.receipt_number}",
    )
    base = getSampleStyleSheet()
    centered = ParagraphStyle(
        "receipt_center", parent=base["Normal"], alignment=TA_CENTER,
        fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK,
    )
    name_style = ParagraphStyle(
        "receipt_name", parent=centered, fontName="Helvetica-Bold",
        fontSize=12, leading=14, textColor=INK,
    )
    tiny = ParagraphStyle(
        "receipt_tiny", parent=centered, fontSize=7, leading=9, textColor=MUTED,
    )
    total_style = ParagraphStyle(
        "receipt_total", parent=base["Normal"], fontName="Helvetica-Bold",
        fontSize=11, leading=13, alignment=2, textColor=INK,
    )
    story = []

    logo = _company_logo(company, 1.25 * cm, 1.25 * cm)
    if logo:
        logo.hAlign = "CENTER"
        story.extend([logo, Spacer(1, 0.12 * cm)])
    company_name = escape(company.name if company else "KOMPTA")
    story.append(Paragraph(company_name, name_style))
    legal_bits = [
        getattr(company, "legal_name", ""),
        getattr(company, "address", ""),
        getattr(company, "city", ""),
        getattr(company, "phone", ""),
        f"NIU {company.niu}" if company and getattr(company, "niu", "") else "",
    ]
    legal_line = " · ".join(escape(str(value)) for value in legal_bits if value)
    if legal_line:
        story.append(Paragraph(legal_line, tiny))
    story.extend([
        Spacer(1, 0.2 * cm),
        HRFlowable(width="100%", thickness=0.7, color=MUTED, dash=[2, 2]),
        Spacer(1, 0.16 * cm),
        Paragraph(f"<b>TICKET DE CAISSE</b><br/>{escape(sale.receipt_number)}", centered),
        Paragraph(str(sale.created_at)[:16].replace("T", " "), tiny),
        Spacer(1, 0.18 * cm),
    ])
    if getattr(sale, "client_name", ""):
        story.extend([
            Paragraph(f"Client : <b>{escape(sale.client_name)}</b>", centered),
            Spacer(1, 0.12 * cm),
        ])

    rows = [["Article", "Qté", "Montant"]]
    for item in sale.items:
        rows.append([
            Paragraph(escape(item.product_name), ParagraphStyle("receipt_item", parent=tiny, alignment=TA_LEFT)),
            str(item.quantity),
            _money(item.line_total).replace(" XAF", " F"),
        ])
    table = Table(rows, colWidths=[4.0 * cm, 0.7 * cm, 2.35 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, MUTED),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([table, Spacer(1, 0.18 * cm)])

    payment = getattr(sale, "payment_account_label", "") or getattr(sale, "payment_method", "") or ""
    totals = Table(
        [
            [Paragraph("<b>TOTAL TTC</b>", centered), Paragraph(_money(sale.total_amount), total_style)],
            [Paragraph("Paiement", tiny), Paragraph(escape(str(payment)), tiny)],
        ],
        colWidths=[3.1 * cm, 3.95 * cm],
    )
    totals.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.extend([
        totals,
        Paragraph(
            f"+{int(getattr(sale, 'loyalty_points_earned', 0))} point(s) fidélité"
            if int(getattr(sale, "loyalty_points_earned", 0) or 0) > 0 else "",
            tiny,
        ),
        Spacer(1, 0.25 * cm),
        HRFlowable(width="100%", thickness=0.7, color=MUTED, dash=[2, 2]),
        Spacer(1, 0.2 * cm),
        Paragraph("Merci pour votre achat", centered),
        Paragraph("Ticket généré par KOMPTA", tiny),
    ])
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


def render_inventory_pdf(data: dict, company) -> bytes:
    """Rapport d'inventaire PDF : synthèse, produits (stock/valeur/entrées/sorties), mouvements."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=1.4 * cm, rightMargin=1.4 * cm,
                            topMargin=1.4 * cm, bottomMargin=1.4 * cm)
    base = getSampleStyleSheet()
    s_title = ParagraphStyle("invTitle", parent=base["Title"], fontSize=20, textColor=TEAL, spaceAfter=2)
    s_muted = ParagraphStyle("invMuted", parent=base["Normal"], fontSize=10, textColor=MUTED)
    s_h2 = ParagraphStyle("invH2", parent=base["Heading2"], fontSize=13, textColor=INK, spaceBefore=10, spaceAfter=6)
    s_cell = ParagraphStyle("invCell", parent=base["Normal"], fontSize=8, textColor=INK)

    def _money(v: float) -> str:
        return f"{v:,.0f}".replace(",", " ")

    cname = company.name if company else "KOMPTA"
    story = [
        Paragraph(cname, s_title),
        Paragraph("Rapport d'inventaire · généré le " + datetime.now().strftime("%d/%m/%Y %H:%M"), s_muted),
        Spacer(1, 0.4 * cm),
    ]

    # Synthèse
    synth = [
        ["Produits", "Valeur totale du stock", "Stock bas", "Total entrées", "Total sorties"],
        [str(data["product_count"]), _money(data["total_stock_value"]) + " XAF",
         str(data["low_stock_count"]), str(data["total_entries"]), str(data["total_exits"])],
    ]
    t = Table(synth, colWidths=[3 * cm, 5 * cm, 2.5 * cm, 3 * cm, 3 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [SOFT]), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    # Produits
    story.append(Paragraph("Produits", s_h2))
    head = ["Produit", "SKU", "Stock", "Seuil", "Prix U.", "Valeur", "Entrées", "Sorties", "Statut"]
    rows = [head] + [[
        Paragraph(r["name"], s_cell), r["sku"], str(r["stock"]), str(r["reorder_level"]),
        _money(r["unit_price"]), _money(r["stock_value"]), str(r["entries"]), str(r["exits"]),
        "Bas" if r["low"] else "OK",
    ] for r in data["products"]]
    pt = Table(rows, colWidths=[4.2 * cm, 2 * cm, 1.4 * cm, 1.4 * cm, 1.8 * cm, 2 * cm, 1.6 * cm, 1.6 * cm, 1.4 * cm], repeatRows=1)
    pt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (2, 1), (-1, -1), "CENTER"),
    ]))
    story.append(pt)

    # Mouvements
    if data["movements"]:
        story.append(Paragraph("Journal des mouvements (entrées / sorties)", s_h2))
        mhead = ["Date", "Produit", "Type", "Qté", "Motif", "Réf."]
        mrows = [mhead] + [[
            m["date"][:16].replace("T", " "), Paragraph(m["product"], s_cell), m["type"],
            str(m["quantity"]), Paragraph(m["reason"], s_cell), m["reference"],
        ] for m in data["movements"][:120]]
        mt = Table(mrows, colWidths=[3 * cm, 4 * cm, 1.8 * cm, 1.2 * cm, 4.5 * cm, 2.5 * cm], repeatRows=1)
        mt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, BORDER), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(mt)

    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph("KOMPTA · Document généré automatiquement", s_muted))
    doc.build(story)
    return buffer.getvalue()
