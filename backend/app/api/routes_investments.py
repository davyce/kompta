"""
routes_investments.py — Module de suivi des investissements boursiers.

Endpoints:
  GET    /investments                  — liste du portefeuille
  POST   /investments                  — créer un investissement
  PUT    /investments/{id}             — modifier
  DELETE /investments/{id}             — supprimer

  GET    /investments/search?q=…       — recherche de ticker (proxy Yahoo Finance)
  GET    /investments/quote/{ticker}   — cours + métriques clés
  GET    /investments/history/{ticker}?period=1y  — historique OHLCV
  GET    /investments/news/{ticker}    — articles de presse récents

  POST   /investments/analyze/{ticker} — analyse Limule + persistance
  GET    /investments/{id}/analysis/pdf — télécharger le PDF de la dernière analyse
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Investment
from app.models.domain import UserPreference
from app.schemas.domain import InvestmentCreate, InvestmentRead, InvestmentUpdate


def _get_company_currency(db: Session, user) -> str:
    """Retourne la devise préférée de l'utilisateur/compagnie depuis user_preferences."""
    try:
        pref = db.scalar(
            select(UserPreference).where(UserPreference.user_id == user.id)
        )
        if pref and pref.currency:
            return pref.currency
        # Fallback : première préférence de la compagnie
        pref = db.scalar(
            select(UserPreference).where(UserPreference.company_id == user.company_id)
        )
        if pref and pref.currency:
            return pref.currency
    except Exception:
        pass
    return "XAF"

router = APIRouter(tags=["investments"])


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def _safe(info: dict, *keys: str, default: Any = None) -> Any:
    for k in keys:
        v = info.get(k)
        if v not in (None, "N/A", "", "None", "Infinity"):
            return v
    return default


def _fmt_large(val: float | None) -> str:
    if val is None:
        return "—"
    if val >= 1_000_000_000_000:
        return f"{val / 1_000_000_000_000:.2f}T"
    if val >= 1_000_000_000:
        return f"{val / 1_000_000_000:.2f}B"
    if val >= 1_000_000:
        return f"{val / 1_000_000:.2f}M"
    return f"{val:,.0f}"


# ═══════════════════════════════════════════════════════════════════
# CRUD
# ═══════════════════════════════════════════════════════════════════

@router.get("/investments", response_model=list[InvestmentRead])
def list_investments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Investment]:
    return db.scalars(
        select(Investment).where(Investment.company_id == current_user.company_id)
    ).all()


@router.post("/investments", response_model=InvestmentRead, status_code=201)
def create_investment(
    payload: InvestmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Investment:
    inv = Investment(
        **payload.model_dump(),
        company_id=current_user.company_id,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.put("/investments/{inv_id}", response_model=InvestmentRead)
def update_investment(
    inv_id: int,
    payload: InvestmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Investment:
    inv = db.get(Investment, inv_id)
    if not inv or inv.company_id != current_user.company_id:
        raise HTTPException(404, "Investissement introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return inv


@router.delete("/investments/{inv_id}", status_code=204)
def delete_investment(
    inv_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    inv = db.get(Investment, inv_id)
    if not inv or inv.company_id != current_user.company_id:
        raise HTTPException(404, "Investissement introuvable")
    db.delete(inv)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
# MARKET DATA
# ═══════════════════════════════════════════════════════════════════

# ── Exchange code → display name mapping ────────────────────────────
EXCHANGE_LABELS: dict[str, str] = {
    # Americas
    "NYQ": "NYSE",          "NMS": "NASDAQ",        "NGM": "NASDAQ",
    "PCX": "NYSE Arca",     "BTS": "BATS",          "ASE": "AMEX",
    "TSX": "Toronto (TSX)", "TOR": "Toronto (TSX)", "NEO": "NEO Canada",
    "SAO": "B3 Brésil",     "BUE": "Buenos Aires",  "SGO": "Santiago",
    "MEX": "Mexico BMV",    "LIM": "Lima",
    # Europe
    "PAR": "Euronext Paris",   "AMS": "Euronext Amsterdam",
    "BRU": "Euronext Bruxelles", "LIS": "Euronext Lisbonne",
    "LSE": "London (LSE)",     "LON": "London (LSE)",
    "FRA": "Frankfurt XETRA",  "GER": "Frankfurt XETRA",
    "XETRA": "Frankfurt XETRA",
    "SWX": "SIX Zurich",       "VTX": "SIX Zurich",    "EBS": "SIX Zurich",
    "MCE": "Madrid (BME)",     "MIL": "Borsa Italiana",
    "OSL": "Oslo Bors",        "STO": "Stockholm",
    "HEL": "Helsinki",         "CPH": "Copenhague",
    "ATH": "Athènes",          "IST": "Istanbul (BIST)",
    "WSE": "Varsovie (GPW)",   "PRA": "Prague",
    "BUD": "Budapest",         "VIE": "Vienne",
    "MSE": "Moscou (MOEX)",
    # Middle East / Africa
    "TLV": "Tel Aviv (TASE)",  "DFM": "Dubaï (DFM)",
    "ADX": "Abu Dhabi (ADX)",  "TADAWUL": "Riyad (Tadawul)",
    "KUW": "Koweït",           "CAI": "Le Caire (EGX)",
    "JNB": "Johannesburg (JSE)", "NBO": "Nairobi (NSE)",
    "LOS": "Lagos (NGX)",       "DAK": "Dakar (BRVM)",
    "BRVM": "BRVM (Afrique Ouest)",
    "DSX": "Douala (DSX)",      "ACC": "Accra (GSE)",
    # Asia-Pacific
    "JPX": "Tokyo (TSE)",       "TYO": "Tokyo (TSE)",
    "HKG": "Hong Kong (HKEX)", "SHE": "Shenzhen",
    "SHH": "Shanghai",          "TAI": "Taïwan (TWSE)",
    "KSC": "Seoul (KRX)",       "BSE": "Bombay (BSE)",
    "NSI": "Bombay (NSE)",      "NSE": "Nairobi / National (NSE)",
    "SGX": "Singapore (SGX)",   "ASX": "Australie (ASX)",
    "NZE": "Nouvelle-Zélande",  "BKK": "Bangkok (SET)",
    "KLS": "Kuala Lumpur (Bursa)", "JKT": "Jakarta (IDX)",
    "MNL": "Manille (PSE)",
    # ETF / generic
    "CXE": "Chi-X Europe",     "TLO": "Turquoise",
    "DXE": "DARKEX",           "XC":  "Chi-X",
}


def _exchange_label(code: str, full_name: str | None = None) -> str:
    """Return human-readable exchange name; fall back to full_name or code."""
    return EXCHANGE_LABELS.get(code, full_name or code or "")


@router.get("/investments/search")
async def search_tickers(q: str, current_user=Depends(get_current_user)):
    """Recherche d'entreprises cotées via l'API Yahoo Finance — toutes bourses mondiales."""
    if not q or len(q.strip()) < 1:
        return []
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={
                    "q": q,
                    "newsCount": "0",
                    "listsCount": "0",
                    "quotesCount": "15",   # more results → better global coverage
                    "enableNavLinks": "false",
                    "enableEnhancedTrivialQuery": "true",
                },
                headers={"User-Agent": "Mozilla/5.0 (compatible; KOMPTA/1.0)"},
            )
        data = resp.json()
        results = []
        seen: set[str] = set()
        for r in data.get("quotes", []):
            if r.get("quoteType") not in ("EQUITY", "ETF", "MUTUALFUND"):
                continue
            symbol = r.get("symbol", "")
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            exch_code = r.get("exchange", "")
            exch_full = r.get("fullExchangeName", "")
            results.append({
                "ticker":   symbol,
                "name":     r.get("shortname") or r.get("longname") or symbol,
                "exchange": _exchange_label(exch_code, exch_full),
                "exchange_code": exch_code,
                "type":     r.get("quoteType", "EQUITY"),
                "currency": r.get("currency", ""),
            })
        return results[:10]
    except Exception:
        return []


@router.get("/investments/quote/{ticker}")
async def get_quote(ticker: str, current_user=Depends(get_current_user)):
    """Cours en temps réel + métriques financières clés."""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper())
        info = t.info or {}
        hist = t.history(period="2d", interval="1d")

        # Prix courant (plusieurs sources possibles selon le marché)
        price = _safe(info, "currentPrice", "regularMarketPrice", "previousClose")
        prev  = _safe(info, "previousClose", "regularMarketPreviousClose")

        if price is None and not hist.empty:
            price = float(hist["Close"].iloc[-1])
        if prev is None and len(hist) >= 2:
            prev = float(hist["Close"].iloc[-2])

        change     = round(price - prev, 4) if price and prev else 0
        change_pct = round(change / prev * 100, 2) if prev else 0

        return {
            "ticker": ticker.upper(),
            "name": _safe(info, "longName", "shortName") or ticker.upper(),
            "exchange": _safe(info, "exchange", "fullExchangeName") or "",
            "currency": _safe(info, "currency") or "USD",
            "price": price,
            "prev_close": prev,
            "change": change,
            "change_pct": change_pct,
            # Métriques clés
            "market_cap": _safe(info, "marketCap"),
            "market_cap_fmt": _fmt_large(_safe(info, "marketCap")),
            "pe_ratio": _safe(info, "trailingPE", "forwardPE"),
            "eps": _safe(info, "trailingEps"),
            "dividend_yield": round(_safe(info, "dividendYield", default=0) * 100, 2) if _safe(info, "dividendYield") else None,
            "week52_high": _safe(info, "fiftyTwoWeekHigh"),
            "week52_low": _safe(info, "fiftyTwoWeekLow"),
            "volume": _safe(info, "volume", "regularMarketVolume"),
            "avg_volume": _safe(info, "averageVolume"),
            "open": _safe(info, "open", "regularMarketOpen"),
            "day_high": _safe(info, "dayHigh", "regularMarketDayHigh"),
            "day_low": _safe(info, "dayLow", "regularMarketDayLow"),
            "beta": _safe(info, "beta"),
            "sector": _safe(info, "sector") or "",
            "industry": _safe(info, "industry") or "",
            "country": _safe(info, "country") or "",
            "website": _safe(info, "website") or "",
            "description": _safe(info, "longBusinessSummary") or "",
        }
    except Exception as e:
        raise HTTPException(502, f"Données boursières indisponibles : {e}")


@router.get("/investments/history/{ticker}")
async def get_history(
    ticker: str,
    period: str = "1y",
    current_user=Depends(get_current_user),
):
    """Historique OHLCV pour le graphique de cours."""
    PERIOD_MAP = {
        "1d":  ("1d",  "5m"),
        "5d":  ("5d",  "1h"),
        "1mo": ("1mo", "1d"),
        "3mo": ("3mo", "1d"),
        "6mo": ("6mo", "1wk"),
        "1y":  ("1y",  "1wk"),
        "5y":  ("5y",  "1mo"),
        "max": ("max", "1mo"),
    }
    yf_period, yf_interval = PERIOD_MAP.get(period, ("1y", "1wk"))
    try:
        import yfinance as yf
        hist = yf.Ticker(ticker.upper()).history(period=yf_period, interval=yf_interval)
        if hist.empty:
            return []
        hist.index = hist.index.tz_localize(None) if hist.index.tzinfo else hist.index
        rows = []
        for ts, row in hist.iterrows():
            rows.append({
                "t": ts.strftime("%Y-%m-%dT%H:%M:%S"),
                "o": round(float(row["Open"]),  4),
                "h": round(float(row["High"]),  4),
                "l": round(float(row["Low"]),   4),
                "c": round(float(row["Close"]), 4),
                "v": int(row["Volume"]),
            })
        return rows
    except Exception as e:
        raise HTTPException(502, f"Historique indisponible : {e}")


@router.get("/investments/news/{ticker}")
async def get_news(ticker: str, current_user=Depends(get_current_user)):
    """Articles de presse récents liés à l'action."""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper())
        raw_news = t.news or []
        articles = []
        for n in raw_news[:12]:
            content = n.get("content", {})
            # Handle both old and new yfinance news format
            title = content.get("title") or n.get("title", "")
            summary = content.get("summary") or n.get("summary", "")
            provider = ""
            pub_date = ""
            url = ""

            if content:
                prov = content.get("provider", {})
                provider = prov.get("displayName", "") if isinstance(prov, dict) else str(prov)
                pub_date = content.get("pubDate") or content.get("displayTime", "")
                cf = content.get("canonicalUrl", {})
                url = cf.get("url", "") if isinstance(cf, dict) else str(cf)
            else:
                provider = n.get("publisher", "")
                pub_date = str(n.get("providerPublishTime", ""))
                url = n.get("link", "")

            if title:
                articles.append({
                    "title": title,
                    "summary": summary[:300] if summary else "",
                    "provider": provider,
                    "published": pub_date,
                    "url": url,
                })
        return articles
    except Exception:
        return []


@router.get("/investments/news-fr/{ticker}")
async def get_news_fr(ticker: str, current_user=Depends(get_current_user)):
    """Actualités françaises liées à l'action (Google News RSS)."""
    import xml.etree.ElementTree as ET

    # Résoudre un nom d'entreprise lisible pour la recherche (ex: TTE.PA → TotalEnergies)
    company_name = ticker.split(".")[0]  # fallback: utiliser le symbole brut
    try:
        import yfinance as yf
        info = yf.Ticker(ticker.upper()).info
        long_name = info.get("longName") or info.get("shortName") or ""
        if long_name:
            company_name = long_name
    except Exception:
        pass

    articles: list[dict] = []

    # Sources RSS francophones à interroger
    rss_feeds: list[tuple[str, str]] = [
        # Google News France (résultats en français en priorité)
        (
            f"https://news.google.com/rss/search?q={company_name}&hl=fr&gl=FR&ceid=FR:fr",
            "Google News FR",
        ),
        # Boursorama — si le ticker est parisien (.PA) ou équivalent
        (
            f"https://www.boursorama.com/rss/bourse/",
            "Boursorama",
        ),
    ]

    async with httpx.AsyncClient(timeout=8) as client:
        for feed_url, feed_name in rss_feeds:
            try:
                resp = await client.get(
                    feed_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; KOMPTA/1.0)"},
                    follow_redirects=True,
                )
                if resp.status_code != 200:
                    continue
                root = ET.fromstring(resp.text)
                ns = {"media": "http://search.yahoo.com/mrss/"}
                channel = root.find("channel")
                if channel is None:
                    continue
                items = channel.findall("item")[:8]
                for item in items:
                    title   = (item.findtext("title") or "").strip()
                    link    = (item.findtext("link") or "").strip()
                    summary = (item.findtext("description") or "").strip()
                    pub_date = (item.findtext("pubDate") or "").strip()
                    source_el = item.find("source")
                    source = source_el.text if source_el is not None else feed_name

                    # Nettoyage HTML basique dans le summary
                    import re as _re
                    summary = _re.sub(r"<[^>]+>", "", summary)[:300]

                    if title:
                        articles.append({
                            "title":     title,
                            "summary":   summary,
                            "provider":  source or feed_name,
                            "published": pub_date[:10] if len(pub_date) >= 10 else pub_date,
                            "url":       link,
                            "lang":      "fr",
                        })
                if len(articles) >= 10:
                    break
            except Exception:
                continue

    # Dédupliquer par titre
    seen_titles: set[str] = set()
    unique: list[dict] = []
    for a in articles:
        key = a["title"][:60].lower()
        if key not in seen_titles:
            seen_titles.add(key)
            unique.append(a)

    return unique[:10]


# ═══════════════════════════════════════════════════════════════════
# LIMULE ANALYSIS
# ═══════════════════════════════════════════════════════════════════

@router.post("/investments/analyze/portfolio")
async def analyze_portfolio(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Évalue l'intégralité du portefeuille avec Limule."""
    from app.services.limule import limule_generate

    # Récupérer la devise de l'utilisateur/compagnie
    company_currency = _get_company_currency(db, current_user)

    investments_list = db.scalars(
        select(Investment).where(Investment.company_id == current_user.company_id)
    ).all()

    if not investments_list:
        raise HTTPException(400, "Aucun investissement dans le portefeuille.")

    total_invested = 0.0
    total_current  = 0.0
    positions_data = []

    for inv in investments_list:
        total_invested += inv.invested_amount
        current_price  = None
        perf_1y_val    = None

        try:
            import yfinance as yf
            t = yf.Ticker(inv.ticker.upper())
            info = t.info or {}
            hist_1y = t.history(period="1y", interval="1wk")

            current_price = _safe(info, "currentPrice", "regularMarketPrice")
            if current_price is None and not hist_1y.empty:
                current_price = float(hist_1y["Close"].iloc[-1])

            if not hist_1y.empty and len(hist_1y) >= 2:
                first_c = float(hist_1y["Close"].iloc[0])
                last_c  = float(hist_1y["Close"].iloc[-1])
                perf_1y_val = round((last_c - first_c) / first_c * 100, 1) if first_c else 0
        except Exception:
            pass

        current_value = round(inv.shares * (current_price or 0), 2)
        gain          = round(current_value - inv.invested_amount, 2)
        gain_pct      = round(gain / inv.invested_amount * 100, 1) if inv.invested_amount else 0

        total_current += current_value
        positions_data.append({
            "ticker":        inv.ticker,
            "name":          inv.display_name,
            "shares":        inv.shares,
            "invested":      inv.invested_amount,
            "current_value": current_value,
            "gain":          gain,
            "gain_pct":      gain_pct,
            "weight":        0.0,
            "perf_1y":       perf_1y_val,
            "purchase_date": inv.purchase_date,
        })

    # Weights
    for p in positions_data:
        p["weight"] = round(p["current_value"] / total_current * 100, 1) if total_current else 0

    total_gain     = total_current - total_invested
    total_gain_pct = round(total_gain / total_invested * 100, 1) if total_invested else 0

    # Build context string
    lines = []
    for p in positions_data:
        perf_str = f", perf 1an: {p['perf_1y']:+.1f}%" if p["perf_1y"] is not None else ""
        lines.append(
            f"  • {p['name']} ({p['ticker']}): {p['shares']} actions, "
            f"investi {p['invested']:,.0f} {company_currency}, valeur {p['current_value']:,.0f} {company_currency} "
            f"({p['gain']:+,.0f} {company_currency} / {p['gain_pct']:+.1f}%), poids {p['weight']}%{perf_str}"
        )
    positions_str = "\n".join(lines)

    context = (
        f"ÉVALUATION PORTEFEUILLE BOURSIER\n"
        f"Date : {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}\n"
        f"Devise de référence de l'entreprise : {company_currency}\n\n"
        f"== Résumé ==\n"
        f"Positions : {len(positions_data)}\n"
        f"Montant total investi : {total_invested:,.0f} {company_currency}\n"
        f"Valeur actuelle : {total_current:,.0f} {company_currency}\n"
        f"P&L global : {total_gain:+,.0f} {company_currency} ({total_gain_pct:+.1f}%)\n\n"
        f"== Détail des positions ==\n"
        f"{positions_str}"
    )

    prompt = (
        f"Effectue une évaluation stratégique du portefeuille boursier "
        f"({len(positions_data)} position(s), valeur totale {total_current:,.0f} {company_currency}, "
        f"P&L {total_gain_pct:+.1f}%). "
        f"La devise de l'entreprise est {company_currency} — utilise UNIQUEMENT cette devise dans tes réponses. "
        f"Fournis : (1) Performance globale, (2) Diversification et exposition sectorielle, "
        f"(3) Points forts et faiblesses, (4) Recommandations de rééquilibrage, "
        f"(5) Stratégie adaptée à un investisseur PME. "
        f"Sois précis et actionnable."
    )

    analysis, _ = await limule_generate(
        kind="portfolio_analysis",
        prompt=prompt,
        context=context,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=2500,
        temperature=0.3,
    )

    # Persister dans AIGeneration pour que le chat Limule puisse y accéder en contexte
    try:
        from app.models.domain import AIGeneration as AIGen
        db.add(AIGen(
            kind="portfolio_analysis",
            title=f"Portefeuille — {len(positions_data)} positions",
            prompt=prompt,
            content=analysis,
            model="limule",
            teras_used=False,
            user_id=current_user.id,
            company_id=current_user.company_id,
        ))
        db.commit()
    except Exception:
        pass

    return {
        "analysis":      analysis,
        "generated_at":  datetime.now(timezone.utc).isoformat(),
        "portfolio_snapshot": {
            "positions":      len(positions_data),
            "total_invested": total_invested,
            "total_current":  total_current,
            "total_gain":     total_gain,
            "total_gain_pct": total_gain_pct,
        },
    }


@router.post("/investments/analyze/{ticker}")
async def analyze_investment(
    ticker: str,
    inv_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Génère une analyse Limule de l'action, croise avec le portefeuille si inv_id fourni."""
    from app.services.limule import limule_generate

    # ── 0. Devise de l'entreprise ────────────────────────────────
    company_currency = _get_company_currency(db, current_user)

    # ── 1. Récupérer les données marché ──────────────────────────
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.upper())
        info = t.info or {}
        hist_1y = t.history(period="1y", interval="1wk")
        news = (t.news or [])[:6]
    except Exception as e:
        raise HTTPException(502, f"Données boursières indisponibles : {e}")

    price     = _safe(info, "currentPrice", "regularMarketPrice")
    prev      = _safe(info, "previousClose")
    change_pct = round((price - prev) / prev * 100, 2) if price and prev else 0
    name      = _safe(info, "longName", "shortName") or ticker.upper()
    sector    = _safe(info, "sector") or "N/A"
    industry  = _safe(info, "industry") or "N/A"
    mktcap    = _fmt_large(_safe(info, "marketCap"))
    pe        = _safe(info, "trailingPE")
    eps       = _safe(info, "trailingEps")
    high52    = _safe(info, "fiftyTwoWeekHigh")
    low52     = _safe(info, "fiftyTwoWeekLow")
    beta      = _safe(info, "beta")
    desc      = (_safe(info, "longBusinessSummary") or "")[:600]

    # Résumé des headlines
    headlines = ""
    for n in news:
        content = n.get("content", {})
        title = content.get("title") or n.get("title", "")
        if title:
            headlines += f"• {title}\n"

    # Performance historique simplified
    perf_str = ""
    if not hist_1y.empty:
        first_c = float(hist_1y["Close"].iloc[0])
        last_c  = float(hist_1y["Close"].iloc[-1])
        perf_1y = round((last_c - first_c) / first_c * 100, 1) if first_c else 0
        perf_str = f"Performance 1 an : {perf_1y:+.1f}%"

    # ── 2. Position portefeuille ──────────────────────────────────
    stock_currency = _safe(info, "currency") or "USD"
    portfolio_str = ""
    if inv_id:
        inv = db.get(Investment, inv_id)
        if inv and inv.company_id == current_user.company_id:
            current_val = round(inv.shares * (price or 0), 2) if price else 0
            gain        = round(current_val - inv.invested_amount, 2)
            gain_pct    = round(gain / inv.invested_amount * 100, 1) if inv.invested_amount else 0
            portfolio_str = (
                f"\n\n== Position de l'entreprise ==\n"
                f"Nombre d'actions : {inv.shares}\n"
                f"Montant investi : {inv.invested_amount:,.2f} {company_currency}\n"
                f"Valeur actuelle estimée : {current_val:,.2f} {stock_currency} "
                f"(converti : {current_val:,.2f} {stock_currency})\n"
                f"Plus/moins-value : {gain:+,.2f} {stock_currency} ({gain_pct:+.1f}%)\n"
                f"Date d'achat : {inv.purchase_date or 'non précisée'}\n"
                f"Prix d'achat moyen : {inv.purchase_price_ref or '?'} {stock_currency}"
            )

    # ── 3. Prompt Limule ─────────────────────────────────────────
    context = f"""
ANALYSE BOURSIÈRE — {name} ({ticker.upper()})
Date : {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}
Devise de l'entreprise : {company_currency}
Devise de la bourse : {stock_currency}

== Données marché ==
Cours actuel : {price} {stock_currency} ({change_pct:+.2f}% vs clôture précédente)
Capitalisation : {mktcap}
Secteur : {sector} / {industry}
P/E : {pe or 'N/A'} | BPA : {eps or 'N/A'} {stock_currency} | Bêta : {beta or 'N/A'}
Plus haut 52 sem : {high52} {stock_currency} | Plus bas 52 sem : {low52} {stock_currency}
{perf_str}

== Description ==
{desc}

== Actualités récentes ==
{headlines or 'Aucune actualité disponible.'}
{portfolio_str}
"""

    portfolio_clause = (
        "Évalue également la position de portefeuille de l'entreprise et son exposition au risque. "
        if portfolio_str else ""
    )
    prompt = (
        f"Effectue une analyse approfondie de l'action {name} ({ticker.upper()}) "
        f"en croisant les données de marché, les métriques fondamentales et les dernières actualités. "
        f"{portfolio_clause}"
        f"Fournis : (1) Synthèse de la situation actuelle, (2) Analyse fondamentale, "
        f"(3) Facteurs de risque et opportunités, (4) Perspectives à court et moyen terme, "
        f"(5) Recommandation stratégique pour un investisseur PME. "
        f"IMPORTANT : La devise locale de l'entreprise est {company_currency}. "
        f"Les montants boursiers sont en {stock_currency}. "
        f"Utilise les bonnes devises dans ton analyse — ne suppose pas que c'est du FCFA ou CFA si ce n'est pas {company_currency}."
    )

    analysis, _ = await limule_generate(
        kind="investment_analysis",
        prompt=prompt,
        context=context,
        db=db,
        company_id=current_user.company_id,
        user=current_user,
        max_tokens=2000,
        temperature=0.3,
    )

    # ── 4. Persister l'analyse ────────────────────────────────────
    try:
        from app.models.domain import AIGeneration as AIGen
        db.add(AIGen(
            kind="investment_analysis",
            title=f"Analyse {name} ({ticker.upper()})",
            prompt=prompt,
            content=analysis,
            model="limule",
            teras_used=False,
            user_id=current_user.id,
            company_id=current_user.company_id,
        ))
        if inv_id:
            inv = db.get(Investment, inv_id)
            if inv and inv.company_id == current_user.company_id:
                inv.last_analysis = analysis
                inv.last_analysis_at = datetime.now(timezone.utc).isoformat()
        db.commit()
    except Exception:
        pass

    return {
        "ticker": ticker.upper(),
        "name": name,
        "analysis": analysis,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "context_snapshot": {
            "price": price,
            "change_pct": change_pct,
            "market_cap": mktcap,
            "pe": pe,
            "sector": sector,
            "perf_1y": perf_str,
        },
    }


@router.get("/investments/{inv_id}/analysis/pdf")
def download_analysis_pdf(
    inv_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Génère et télécharge le PDF de la dernière analyse Limule pour cet investissement."""
    from app.services.pdf_export import build_limule_pdf
    from app.models.domain import Company

    inv = db.get(Investment, inv_id)
    if not inv or inv.company_id != current_user.company_id:
        raise HTTPException(404, "Investissement introuvable")
    if not inv.last_analysis:
        raise HTTPException(400, "Aucune analyse disponible — générez-en une d'abord.")

    company = db.get(Company, current_user.company_id)
    company_name = company.name if company else "KOMPTA"
    generated_at = (inv.last_analysis_at or datetime.now(timezone.utc).isoformat())[:16]

    pdf_bytes = build_limule_pdf(
        title=f"Analyse Limule — {inv.display_name} ({inv.ticker})",
        content=inv.last_analysis,
        subtitle=f"{inv.shares} actions · Investi : {inv.invested_amount:,.2f} {inv.currency_stock}",
        generated_at=generated_at,
        company_name=company_name,
        kind="investment_analysis",
    )

    filename = f"limule-analyse-{inv.ticker}-{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
