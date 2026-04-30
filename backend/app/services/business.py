from datetime import datetime

from app.models import Employee, Product


def product_qr_payload(company_id: int, product: Product) -> str:
    return f"KOMPTA:{company_id}:{product.sku}:{product.id}"


def label_preview(product: Product) -> dict[str, str | float]:
    return {
        "title": product.name[:32],
        "sku": product.sku,
        "variant": product.variant,
        "price": product.price,
        "qr": product.qr_code,
        "print_formats": "A4, thermique 58mm, thermique 80mm",
    }


def payslip_reference(period: str, employee: Employee, index: int) -> str:
    compact_period = "".join(ch for ch in period.upper() if ch.isalnum())[:10]
    suffix = datetime.utcnow().strftime("%H%M%S%f")
    return f"PAY-{compact_period}-{employee.id:04d}-{index:03d}-{suffix}"


def extract_mentions(body: str) -> str:
    mentions = []
    for part in body.split():
        if part.startswith("@") and len(part) > 1:
            mentions.append(part[1:].strip(".,;:!?"))
    return ",".join(dict.fromkeys(mentions))


def chat_ai_suggestion(body: str) -> str:
    lower = body.lower()
    if "urgent" in lower or "avant" in lower or "bloqu" in lower:
        return "Action detectee: creer une tache prioritaire avec echeance."
    if "reunion" in lower:
        return "Coordination detectee: proposer une reunion et preparer un ordre du jour."
    if "document" in lower or "justificatif" in lower:
        return "Document detecte: demander une piece jointe et suivre la conformite TERAS."
    return "Aucune action critique detectee, message archive dans le contexte entreprise."


def compliance_snapshot() -> dict:
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "checks": [
            {"label": "Identite entreprise", "status": "ok"},
            {"label": "Dossiers RH", "status": "warning"},
            {"label": "Pieces justificatives", "status": "warning"},
            {"label": "Paie", "status": "ok"},
            {"label": "Facturation", "status": "ok"},
        ],
    }
