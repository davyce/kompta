"""Test : mentions légales (RCCM/NIU/capital) dans factures et contrats générés."""
from types import SimpleNamespace

from app.services.legal import legal_mention_lines, legal_mention_text


def _company():
    return SimpleNamespace(
        name="ADANSONIA", legal_name="ADANSONIA SARL", legal_form="SARL",
        share_capital="1 000 000 XAF", address="12 av. Paix", city="Brazzaville", country="Congo",
        rccm="CG-BZV-01-2024-B12-00123", niu="M2024CG12345", cnss_number="CNSS-99",
        patente_number="PAT-55", phone="+242060000000", email="contact@adansonia.cg", website="",
    )


def test_legal_lines_include_official_identifiers():
    txt = legal_mention_text(_company())
    assert "RCCM : CG-BZV-01-2024-B12-00123" in txt
    assert "NIU : M2024CG12345" in txt
    assert "CNSS : CNSS-99" in txt
    assert "au capital de 1 000 000 XAF" in txt
    assert "SARL" in txt


def test_legal_lines_omit_empty_fields():
    c = SimpleNamespace(name="Mini", legal_name="", legal_form="", share_capital="",
                        address="", city="", country="", rccm="", niu="", cnss_number="",
                        patente_number="", phone="", email="", website="")
    lines = legal_mention_lines(c)
    # Seule la dénomination est présente, aucun identifiant vide n'apparaît
    assert all("RCCM" not in l and "NIU" not in l for l in lines)


def test_contract_html_embeds_legal_footer():
    from app.services.access import render_contract_html
    employee = SimpleNamespace(
        first_name="Jean", last_name="Dupont", job_title="Comptable", branch="Siege",
        department="Finance", employment_type="CDI", salary=300000.0, phone="0600",
        email="jean@x.cg", account_status="active",
    )
    html_out = render_contract_html(_company(), employee, ai_clauses=["Clause test"], provider="local_template")
    assert "RCCM : CG-BZV-01-2024-B12-00123" in html_out
    assert "NIU : M2024CG12345" in html_out
    assert "legal-footer" in html_out
