import secrets
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Company,
    CompanyDocument,
    Employee,
    EmployabilityCheck,
    Invoice,
    PayrollRun,
    Product,
    Task,
    TerasAlert,
    TerasAnalysisJob,
    TerasScoreSnapshot,
    TerasSyncEvent,
)
from app.services.documents import document_payload_for_employee, serialize_payload


def build_employability_payload(
    db: Session,
    *,
    company: Company,
    employee: Employee,
    include_documents: bool = True,
) -> dict:
    documents = document_payload_for_employee(db, employee) if include_documents else []
    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "legal_name": company.legal_name,
            "industry": company.industry,
            "country": company.country,
            "teras_score": company.teras_score,
        },
        "employee": {
            "id": employee.id,
            "name": f"{employee.first_name} {employee.last_name}",
            "job_title": employee.job_title,
            "employment_type": employee.employment_type,
            "department": employee.department,
            "branch": employee.branch,
            "account_status": employee.account_status,
            "phone_present": bool(employee.phone),
            "email_present": bool(employee.email),
            "salary_present": employee.salary > 0,
        },
        "documents": documents,
        "controls": {
            "has_contract": any(document["type"] == "contrat_travail" for document in documents),
            "has_contact": bool(employee.phone or employee.email),
            "has_active_access": employee.account_status in {"active", "pending_first_login"},
        },
    }


def submit_employability_to_teras(
    db: Session,
    *,
    company: Company,
    employee: Employee,
    include_documents: bool = True,
) -> EmployabilityCheck:
    payload = build_employability_payload(db, company=company, employee=employee, include_documents=include_documents)
    controls = payload["controls"]
    score = 45
    score += 20 if controls["has_contract"] else 0
    score += 15 if controls["has_contact"] else 0
    score += 15 if payload["employee"]["salary_present"] else 0
    score += 5 if controls["has_active_access"] else 0
    status = "confirmed" if score >= 75 else "needs_review"
    check = EmployabilityCheck(
        employee_id=employee.id,
        status=status,
        score=min(score, 100),
        teras_reference=f"TERAS-EMP-{secrets.token_hex(5).upper()}",
        payload_snapshot=serialize_payload(payload),
        result_summary=(
            "Employabilite confirmee par le connecteur TERAS local."
            if status == "confirmed"
            else "Dossier employabilite incomplet: contrat/contact/remuneration a verifier."
        ),
        submitted_at=datetime.utcnow(),
        confirmed_at=datetime.utcnow() if status == "confirmed" else None,
        company_id=company.id,
    )
    db.add(check)
    db.commit()
    db.refresh(check)
    return check


def _score_to_maturity(score: int) -> str:
    if score >= 85:
        return "well_structured"
    if score >= 65:
        return "partially_structured"
    if score >= 45:
        return "fragile"
    return "high_risk"


def build_company_analysis_payload(db: Session, company: Company, domain: str) -> dict:
    employees = db.scalars(select(Employee).where(Employee.company_id == company.id)).all()
    documents = db.scalars(select(CompanyDocument).where(CompanyDocument.company_id == company.id)).all()
    payroll_runs = db.scalars(select(PayrollRun).where(PayrollRun.company_id == company.id)).all()
    invoices_total = db.scalar(select(func.coalesce(func.sum(Invoice.total_amount), 0)).where(Invoice.company_id == company.id)) or 0
    products = db.scalars(select(Product).where(Product.company_id == company.id)).all()
    open_tasks = db.scalar(select(func.count()).select_from(Task).where(Task.company_id == company.id, Task.status != "done")) or 0
    return {
        "domain": domain,
        "company": {
            "id": company.id,
            "name": company.name,
            "legal_name": company.legal_name,
            "industry": company.industry,
            "country": company.country,
            "completion_score": company.completion_score,
        },
        "metrics": {
            "employees": len(employees),
            "employees_without_contract": sum(
                1 for employee in employees if not any(doc.employee_id == employee.id and doc.document_type == "contrat_travail" for doc in documents)
            ),
            "documents": len(documents),
            "low_confidence_documents": sum(1 for doc in documents if doc.confidence < 70),
            "payroll_runs": len(payroll_runs),
            "invoices_total": float(invoices_total),
            "products": len(products),
            "low_stock": sum(1 for product in products if product.stock_quantity <= product.reorder_level),
            "open_tasks": int(open_tasks),
        },
    }


def run_teras_analysis(
    db: Session,
    *,
    company: Company,
    domain: str,
    target_type: str = "company",
    target_id: int | None = None,
    requested_by_user_id: int | None = None,
) -> TerasAnalysisJob:
    payload = build_company_analysis_payload(db, company, domain)
    metrics = payload["metrics"]
    score = 90
    recommendations: list[str] = []

    if domain in {"company", "rh"} and metrics["employees_without_contract"]:
        score -= min(metrics["employees_without_contract"] * 8, 28)
        recommendations.append("Rattacher les contrats manquants aux dossiers employes.")
    if domain in {"company", "documents"} and metrics["low_confidence_documents"]:
        score -= min(metrics["low_confidence_documents"] * 6, 24)
        recommendations.append("Re-analyser ou remplacer les documents a faible confiance.")
    if domain in {"company", "inventory"} and metrics["low_stock"]:
        score -= min(metrics["low_stock"] * 4, 16)
        recommendations.append("Traiter les alertes de stock avant impact POS.")
    if domain in {"company", "declaration"} and metrics["documents"] < 3:
        score -= 12
        recommendations.append("Ajouter les justificatifs et pieces declaratives de la periode.")
    if domain in {"company", "payroll"} and metrics["payroll_runs"] == 0:
        score -= 10
        recommendations.append("Generer au moins un cycle de paie valide.")

    score = max(25, min(score, 100))
    confidence = max(55, min(92, score - 3 + min(metrics["documents"], 10)))
    summary = (
        f"TERAS a analyse le domaine {domain}. Score {score}/100, confiance {confidence}%. "
        f"{len(recommendations)} recommandation(s) prioritaire(s)."
    )
    result = {
        "domain": domain,
        "score": score,
        "confidence": confidence,
        "maturity_level": _score_to_maturity(score),
        "summary": summary,
        "recommendations": recommendations,
        "alerts": [],
    }

    job = TerasAnalysisJob(
        domain=domain,
        target_type=target_type,
        target_id=target_id,
        status="completed",
        requested_by_user_id=requested_by_user_id,
        payload_snapshot=serialize_payload(payload),
        result_snapshot=serialize_payload(result),
        teras_reference=f"TERAS-JOB-{secrets.token_hex(5).upper()}",
        company_id=company.id,
    )
    db.add(job)
    db.flush()

    snapshot = TerasScoreSnapshot(
        domain=domain,
        score=score,
        confidence=confidence,
        maturity_level=result["maturity_level"],
        summary=summary,
        recommendations=" | ".join(recommendations) if recommendations else "Aucune action critique immediate.",
        source_job_id=job.id,
        company_id=company.id,
    )
    db.add(snapshot)
    db.add(
        TerasSyncEvent(
            event_type=f"analysis_{domain}",
            status="success",
            details=f"Analyse TERAS terminee: {job.teras_reference}",
            company_id=company.id,
        )
    )

    if recommendations:
        db.add(
            TerasAlert(
                title=f"TERAS {domain}: actions recommandees",
                severity="high" if score < 55 else "medium",
                module=domain,
                status="open",
                confidence=confidence,
                recommendation="; ".join(recommendations),
                company_id=company.id,
            )
        )

    db.commit()
    db.refresh(job)
    return job


def latest_score_snapshots(db: Session, company_id: int) -> list[TerasScoreSnapshot]:
    snapshots = db.scalars(
        select(TerasScoreSnapshot).where(TerasScoreSnapshot.company_id == company_id).order_by(TerasScoreSnapshot.created_at.desc())
    ).all()
    seen: set[str] = set()
    latest: list[TerasScoreSnapshot] = []
    for snapshot in snapshots:
        if snapshot.domain not in seen:
            seen.add(snapshot.domain)
            latest.append(snapshot)
    return latest


def route_ai_request(prompt: str, context_domain: str = "general") -> dict:
    lowered = f"{context_domain} {prompt}".lower()
    teras_keywords = [
        "conform",
        "score",
        "risque",
        "anomal",
        "controle",
        "déclaration",
        "declaration",
        "document manquant",
        "paie",
        "audit",
        "coherence",
    ]
    if any(keyword in lowered for keyword in teras_keywords):
        return {
            "route": "limule_with_teras_context",
            "deepseek_role": "explique, reformule et guide l'utilisateur (Limule)",
            "teras_role": "verifie, score, detecte les anomalies et fournit les recommandations analytiques",
            "reason": "La demande touche a la conformite, au risque, aux documents ou au scoring.",
            "suggested_endpoint": "/api/teras/analyze/company",
        }
    return {
        "route": "limule_only",
        "deepseek_role": "repond, guide, redige ou organise le travail (Limule)",
        "teras_role": "non sollicite",
        "reason": "La demande est conversationnelle ou operationnelle sans controle analytique.",
        "suggested_endpoint": None,
    }
