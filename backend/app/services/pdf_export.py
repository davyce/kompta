"""Native PDF generation using ReportLab — no system deps required."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
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
    return f"{amount:,.0f}".replace(",", " ") + " F CFA"


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

    story.append(Spacer(1, 1.5 * cm))
    story.append(Paragraph(
        "KOMPTA · Référentiel SYSCOHADA Révisé · Document généré automatiquement",
        s["footer"],
    ))

    doc.build(story)
    return buffer.getvalue()


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
            "KOMPTA · Référentiel SYSCOHADA · Bulletin certifié",
            s["footer"],
        ))

        if idx < len(run.payslips) - 1:
            story.append(PageBreak())

    doc.build(story)
    return buffer.getvalue()
