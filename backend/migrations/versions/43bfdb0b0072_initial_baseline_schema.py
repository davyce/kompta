"""initial - baseline schema

Revision ID: 43bfdb0b0072
Revises:
Create Date: 2026-07-08 20:20:18.360414

Révision volontairement VIDE. L'autogénération initiale a détecté des
dizaines de divergences entre le schéma réel de prod (bâti au fil du temps
via ALTER TABLE dans init_db.py) et les modèles SQLAlchemy déclarés —
notamment un remplacement dangereux de l'index UNIQUE d'idempotence POS
(ux_sales_company_idempotency_key) par un index non-unique, et la
suppression de colonnes legacy encore présentes en base (ex.
bank_transactions.amount_cents, invoice_lines.payment_account_id,
pos_sessions.total_amount_cents). Exécuter ce diff tel quel casserait la
protection anti-double-vente et perdrait des colonnes.

Cette révision ne fait donc RIEN : elle marque juste le point à partir
duquel Alembic prend le relais. La base existante est "stampée" sur cette
révision (`alembic stamp head`) sans exécuter de SQL. Seules les futures
migrations, écrites et vérifiées une par une, feront de vrais changements
de schéma.

Le diff brut généré par autogenerate est conservé pour référence (colonnes
legacy à nettoyer un jour, volontairement) hors du dossier migrations/ :
scratchpad/alembic_autogenerate_diff_2026-07-08.txt
"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = '43bfdb0b0072'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op — voir docstring du module."""
    pass


def downgrade() -> None:
    """No-op — voir docstring du module."""
    pass
