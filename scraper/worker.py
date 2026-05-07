#!/usr/bin/env python3
"""
Flori Prospector — Scraper Worker (sin API de IA, 100% gratis)
Busca empresas en DuckDuckGo y las puntúa con reglas.
"""

import os
import sys
import time
import json
import re
import logging
import requests
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

CRM_URL = os.getenv("CRM_URL", "http://localhost:3000")
CRM_SECRET = os.getenv("CRM_SECRET", "")
POLL_INTERVAL = 12

# ── CRM helpers ───────────────────────────────────────────────────────────────

def _crm_headers():
    return {"Authorization": f"Bearer {CRM_SECRET}", "Content-Type": "application/json"}


def get_pending_job() -> Optional[dict]:
    try:
        r = requests.get(f"{CRM_URL}/api/jobs/pending", timeout=8)
        return r.json() if r.status_code == 200 else None
    except Exception as e:
        log.debug(f"Poll error: {e}")
        return None


def send_partial_prospects(job_id: str, prospect_list: list):
    """Upsert prospects while the job is still running (for live UI updates)."""
    if not prospect_list:
        return
    try:
        r = requests.post(
            f"{CRM_URL}/api/jobs/{job_id}/prospects",
            json={"prospects": prospect_list},
            headers=_crm_headers(),
            timeout=30,
        )
        if r.ok:
            log.info(f"  Live: {r.json().get('upserted', 0)} prospectos en CRM")
        else:
            log.warning(f"  Live error: {r.status_code}")
    except Exception as e:
        log.warning(f"  Live send error: {e}")


def report_results(job_id: str, source_statuses: dict):
    """Mark job as done. Prospects are already saved incrementally."""
    try:
        r = requests.post(
            f"{CRM_URL}/api/jobs/{job_id}/done",
            json={"prospects": [], "source_statuses": source_statuses},
            headers=_crm_headers(),
            timeout=30,
        )
        if r.ok:
            log.info("  Job marcado como done")
        else:
            log.error(f"  Error: {r.status_code} {r.text[:200]}")
    except Exception as e:
        log.error(f"  Error marcando done: {e}")


def import_as_contacts_and_deals(prospects: list):
    """Create a contact + pipeline deal for each prospect."""
    if not prospects:
        return
    created = 0
    for p in prospects:
        notes_parts = [p.get("opportunitySignals") or "", p.get("fitBreakdown") or "", p.get("notes") or ""]
        notes = "\n".join(x for x in notes_parts if x).strip()
        try:
            # 1. Create contact
            cr = requests.post(
                f"{CRM_URL}/api/contacts",
                json={
                    "name": p["name"],
                    "email": p.get("email") or None,
                    "phone": p.get("phone") or None,
                    "source": "prospector",
                    "temperature": "cold",
                    "score": p.get("fitScore", 0),
                    "notes": notes[:800] if notes else None,
                },
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            if not cr.ok:
                continue
            contact_id = cr.json().get("id")
            if not contact_id:
                continue

            # 2. Create deal in pipeline (first stage)
            requests.post(
                f"{CRM_URL}/api/deals",
                json={
                    "title": p["name"],
                    "contactId": contact_id,
                    "probability": p.get("fitScore", 0),
                    "notes": notes[:500] if notes else None,
                },
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            created += 1
        except Exception as e:
            log.warning(f"  Error creando {p['name']}: {e}")

    log.info(f"  Creados en pipeline: {created} deals")


def report_failed(job_id: str):
    try:
        requests.post(
            f"{CRM_URL}/api/jobs/{job_id}/done",
            json={"status": "failed"},
            headers=_crm_headers(),
            timeout=10,
        )
    except Exception:
        pass


# ── Query generation (sin IA) ─────────────────────────────────────────────────

EXCLUDE_DOMAINS = {
    "workana", "freelancer", "fiverr", "upwork", "99designs", "behance.net/search",
    "linkedin.com/in", "linkedin.com/jobs", "instagram.com", "pinterest", "twitter",
    "facebook", "youtube", "wikipedia", "amazon", "mercadolibre",
    "jooble", "glassdoor", "indeed.com", "zonajobs", "computrabajo",
}

# Only used when searching companies — individual portfolio signals are excluded
INDIVIDUAL_SIGNALS = [
    "soy ilustradora", "soy ilustrador", "soy diseñadora", "soy diseñador",
    "mi portfolio", "my portfolio", "mi portafolio",
    "freelance illustrator", "ilustradora freelance", "diseñadora freelance",
    "portafolio personal", "hola soy", "about me", "sobre mí",
    "my work", "mis trabajos", "mi trabajo", "ver mi", "see my",
    "contratame", "hire me", "contact me for", "contactame para",
]

COMPANY_POSITIVE = [
    # Editorial / libros
    ("editorial", 25), ("publisher", 25), ("ediciones", 25), ("editora", 25),
    ("editorial infantil", 35), ("libros infantiles", 30), ("children book", 30),
    ("libro niños", 30), ("picture book", 25),
    # Agencias / estudios
    ("agencia", 15), ("agency", 15), ("estudio creativo", 15), ("design studio", 15),
    ("estudio de diseño", 15), ("estudio diseño", 15),
    # Packaging / producto
    ("packaging", 20), ("marca", 10), ("brand", 10), ("envase", 15),
    # Moda / textil / ropa
    ("moda", 20), ("fashion", 20), ("ropa", 20), ("indumentaria", 20),
    ("textil", 20), ("estampado", 20), ("tejido", 15), ("clothing", 20),
    ("coleccion", 15), ("colección", 15), ("diseño de ropa", 25),
    ("estampados", 20), ("tela", 10), ("remera", 15), ("camiseta", 15),
    # Señales de contratación
    ("ilustración", 10), ("illustration", 10),
    ("contratar", 15), ("hire", 15), ("we work with", 15), ("trabajamos con", 15),
    ("busca ilustrador", 20), ("necesitamos ilustrador", 20),
    # Cultural / otros
    ("cultura", 10), ("cultural", 10), ("museo", 10), ("ong", 10),
    ("merchandise", 10),
]

PEOPLE_POSITIVE = [
    ("portfolio", 25), ("portafolio", 25),
    ("ilustradora", 20), ("ilustrador", 20),
    ("ilustración", 10), ("illustration", 10),
    ("behance.net", 25), ("artista", 15), ("artist", 15),
    ("freelance", 15), ("commission", 20), ("encargo", 20),
    ("comisiones", 20), ("commissions open", 25), ("encargos abiertos", 25),
    ("acuarela", 15), ("watercolor", 15), ("botánico", 15), ("botanico", 15),
    ("whimsical", 15), ("hand-drawn", 15), ("digital art", 10),
    ("stationery", 10), ("pattern design", 20), ("surface design", 20),
    ("hire me", 20), ("contratame", 20), ("contactame", 15),
]

# Señales de empresa que restan puntos en modo personas
PEOPLE_NEGATIVE = [
    ("editorial", -15), ("agencia", -15), ("agency", -15),
    ("estudio de diseño", -15), ("empresa", -10), ("s.a.", -20), ("s.r.l.", -20),
    ("trabaja con ilustradores", -25), ("contratar ilustrador", -25),
    ("hire illustrator", -25), ("publishing house", -20),
    ("nuestros servicios", -15), ("nuestros clientes", -15),
]

PEOPLE_EXCLUDE_DOMAINS = {
    "workana", "freelancer", "fiverr", "upwork", "99designs",
    "linkedin.com/company", "linkedin.com/jobs",
    "pinterest", "twitter", "facebook", "youtube", "wikipedia",
    "amazon", "mercadolibre", "jooble", "glassdoor", "indeed.com",
    "zonajobs", "computrabajo",
}


def build_queries(criteria: str, mode: str = "companies", role: str = "ilustrador") -> list[str]:
    base = criteria.strip()
    if mode == "people":
        role_cfg = ROLE_SEARCH_TERMS.get(role, ROLE_SEARCH_TERMS["ilustrador"])
        role_en = role_cfg["en"]
        role_es = role_cfg["es"]
        return [
            f"{base} freelance portfolio",
            f"{base} freelance contacto",
            f"{base} behance portfolio",
            f"{base} {role_en} portfolio",
            f"{base} {role_es} freelance",
            f"{base} portfolio contacto",
        ]
    # companies mode
    return [
        f"{base} trabaja con ilustradores",
        f"{base} ilustración encargo",
        f"{base} contratar ilustrador freelance",
        f"{base} hire illustrator",
        f"{base} diseño ilustración contacto",
        f"{base} agencia estudio creativo",
        f"site:linkedin.com/company {base}",
        f"site:behance.net {base}",
    ]


# ── Role → Behance search terms ───────────────────────────────────────────────

ROLE_SEARCH_TERMS: dict[str, dict] = {
    "ilustrador": {
        "label": "ilustrador/a",
        "en": "illustrator",
        "es": "ilustrador",
        "portfolio_terms": [
            "illustration portfolio",
            "ilustrador portafolio",
            "freelance illustrator portfolio",
            "ilustradora portfolio",
        ],
    },
    "fotografo": {
        "label": "fotógrafo/a",
        "en": "photographer",
        "es": "fotógrafo",
        "portfolio_terms": [
            "photographer portfolio",
            "fotógrafo portafolio",
            "photography freelance",
            "fotografía portfolio",
        ],
    },
    "disenador_grafico": {
        "label": "diseñador/a gráfico/a",
        "en": "graphic designer",
        "es": "diseñador gráfico",
        "portfolio_terms": [
            "graphic designer portfolio",
            "diseñador gráfico portafolio",
            "graphic design freelance",
            "diseño gráfico portafolio",
        ],
    },
    "motion_designer": {
        "label": "motion designer",
        "en": "motion designer",
        "es": "motion designer",
        "portfolio_terms": [
            "motion designer portfolio",
            "motion design portfolio",
            "animation portfolio",
            "motion graphics freelance",
        ],
    },
    "artista_3d": {
        "label": "artista 3D",
        "en": "3D artist",
        "es": "artista 3D",
        "portfolio_terms": [
            "3D artist portfolio",
            "artista 3D portafolio",
            "3D design portfolio",
            "3D modeling freelance",
        ],
    },
    "muralista": {
        "label": "muralista",
        "en": "muralist",
        "es": "muralista",
        "portfolio_terms": [
            "muralist portfolio",
            "muralista portafolio",
            "mural art portfolio",
            "street art portfolio",
        ],
    },
    "retratista": {
        "label": "retratista",
        "en": "portrait artist",
        "es": "retratista",
        "portfolio_terms": [
            "portrait artist portfolio",
            "retratista portafolio",
            "portrait illustration portfolio",
            "portrait photography portfolio",
        ],
    },
}

SPECIALTY_SEARCH_TERMS: dict[str, list[str]] = {
    "moda":       ["fashion", "moda"],
    "editorial":  ["editorial", "book"],
    "infantil":   ["children", "kids", "infantil"],
    "packaging":  ["packaging", "product"],
    "publicidad": ["advertising", "branding"],
    "musica":     ["music", "album"],
    "naturaleza": ["botanical", "nature"],
}


# ── Behance filter → search term mapping ──────────────────────────────────────

INDUSTRY_BEHANCE = {
    "ropa_infantil": {
        "project_terms": [
            "children clothing illustration brand",
            "ropa infantil ilustración",
            "kids fashion illustration",
        ],
        "job_categories": ["illustrations", "childrens-illustration"],
    },
    "moda_adultos": {
        "project_terms": [
            "fashion illustration brand",
            "moda adultos ilustración",
            "clothing brand illustration",
        ],
        "job_categories": ["illustrations"],
    },
    "editorial_infantil": {
        "project_terms": [
            "children's book illustration",
            "picture book illustration",
            "libros infantiles ilustración",
        ],
        "job_categories": ["illustrations", "childrens-illustration"],
    },
    "editorial": {
        "project_terms": [
            "editorial illustration magazine",
            "book cover illustration publisher",
            "editorial ilustración revista",
        ],
        "job_categories": ["illustrations"],
    },
    "packaging": {
        "project_terms": [
            "packaging illustration brand",
            "product packaging illustration",
            "packaging ilustración marca",
        ],
        "job_categories": ["illustrations"],
    },
    "agencia": {
        "project_terms": [
            "creative agency illustration client",
            "design studio illustration",
            "agencia creativa ilustración",
        ],
        "job_categories": ["illustrations"],
    },
    "ong_cultura": {
        "project_terms": [
            "nonprofit illustration cultural",
            "museum illustration cultural project",
            "ong ilustración cultural",
        ],
        "job_categories": ["illustrations"],
    },
}

STYLE_BEHANCE = {
    "botanica": ["botanical illustration", "nature botanical illustration", "botanical watercolor"],
    "whimsical": ["whimsical illustration", "whimsical art magical", "whimsical character illustration"],
    "editorial": ["editorial illustration", "magazine editorial illustration", "press illustration"],
    "infantil": ["children illustration", "children's book illustration", "kids illustration"],
    "pattern": ["pattern design illustration", "surface pattern design", "surface design"],
    "acuarela": ["watercolor illustration", "acuarela ilustración", "handmade illustration watercolor"],
}

LOCATION_GEO = {
    "argentina": "Argentina",
    "buenos_aires": "Buenos Aires",
    "latam": "Latin America",
    "espana": "Spain",
    "global": "",
}

# All terms that count as a location match (broader than LOCATION_GEO for profile text)
LOCATION_MATCH: dict[str, list[str]] = {
    "argentina": ["argentina"],
    "buenos_aires": ["buenos aires", "argentina"],
    "latam": ["argentina", "brazil", "brasil", "méxico", "mexico", "colombia", "chile",
              "peru", "perú", "uruguay", "venezuela", "latam", "latin america", "latinoamérica"],
    "espana": ["spain", "españa", "madrid", "barcelona", "sevilla", "valencia", "bilbao"],
    "global": [],
}

# Keywords to post-filter Behance job board results by industry.
# The job board has no keyword search — we fetch all illustration jobs and filter here.
INDUSTRY_JOB_FILTER: dict[str, list[str]] = {
    "ropa_infantil":      ["children", "kids", "infantil", "baby", "niños", "ropa", "clothing", "kidswear"],
    "moda_adultos":       ["fashion", "moda", "clothing", "apparel", "textile", "wear", "garment", "style"],
    "editorial_infantil": ["children", "kids", "picture book", "infantil", "young adult", "board book", "cuento", "children's"],
    "editorial":          ["editorial", "book", "magazine", "publisher", "publishing", "revista", "libro", "media", "press", "print"],
    "packaging":          ["packaging", "product", "label", "consumer", "retail", "goods", "brand"],
    "agencia":            ["agency", "studio", "agencia", "estudio", "creative", "design", "advertising", "marketing"],
    "ong_cultura":        ["nonprofit", "cultural", "museum", "ngo", "ong", "foundation", "gallery", "education", "charity", "museum"],
}


def build_behance_project_terms(mode: str, industry: str, style: str, location: str, extra: str, role: str = "ilustrador", specialty: str = "") -> list[str]:
    geo = LOCATION_GEO.get(location, "")
    terms = []

    if mode == "people":
        role_cfg = ROLE_SEARCH_TERMS.get(role, ROLE_SEARCH_TERMS["ilustrador"])
        role_en = role_cfg["en"]
        base_terms = role_cfg["portfolio_terms"].copy()

        if specialty and specialty in SPECIALTY_SEARCH_TERMS:
            spec_kws = SPECIALTY_SEARCH_TERMS[specialty]
            terms = [f"{spec_kws[0]} {role_en} portfolio", f"{spec_kws[0]} {role_en} freelance"]
            if len(spec_kws) > 1:
                terms.append(f"{spec_kws[1]} {role_en} portfolio")
        else:
            terms = base_terms

        if extra:
            terms.insert(0, f"{extra} {role_en}")

        if geo:
            terms = [f"{t} {geo}".strip() for t in terms]
    else:
        cfg = INDUSTRY_BEHANCE.get(industry, {})
        base_terms = cfg.get("project_terms", [])
        if not base_terms and extra:
            base_terms = [f"{extra} illustration"]
        for t in base_terms:
            terms.append(f"{t} {geo}".strip() if geo else t)
        if extra and industry not in ("", "otro"):
            terms.append(f"{extra} illustration brand {geo}".strip())

    return terms[:4]  # máximo 4 búsquedas


def build_behance_job_categories(industry: str) -> list[str]:
    cfg = INDUSTRY_BEHANCE.get(industry, {})
    return cfg.get("job_categories", ["illustrations"])


# ── DuckDuckGo scraper ────────────────────────────────────────────────────────

DDG_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def search_ddg(query: str, fetcher) -> list[dict]:
    """Returns list of {title, url, snippet} from DuckDuckGo HTML."""
    url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}&kl=ar-es"
    try:
        page = fetcher.get(url, headers=DDG_HEADERS)
        results = []

        for result in page.css(".result") or []:
            title_el = result.css_first(".result__a") or result.css_first("a.result__a")
            snippet_el = result.css_first(".result__snippet")
            url_el = result.css_first(".result__url")

            title = title_el.text.strip() if title_el else ""
            snippet = snippet_el.text.strip() if snippet_el else ""
            result_url = url_el.text.strip() if url_el else ""

            if title and len(title) > 3:
                results.append({"title": title, "url": result_url, "snippet": snippet})

        log.info(f"  DDG '{query[:50]}': {len(results)} resultados")
        return results

    except Exception as e:
        log.warning(f"  DDG error: {e}")
        return []


# ── Scoring (sin IA) ──────────────────────────────────────────────────────────

def is_excluded(url: str, title: str, snippet: str, mode: str = "companies") -> bool:
    combined = (url + " " + title + " " + snippet).lower()
    domains = PEOPLE_EXCLUDE_DOMAINS if mode == "people" else EXCLUDE_DOMAINS
    for domain in domains:
        if domain in combined:
            return True
    if mode == "companies":
        for signal in INDIVIDUAL_SIGNALS:
            if signal in combined:
                return True
    return False


def score_result(title: str, snippet: str, url: str, mode: str = "companies") -> int:
    text = (title + " " + snippet + " " + url).lower()
    score = 0
    keywords = PEOPLE_POSITIVE if mode == "people" else COMPANY_POSITIVE
    for keyword, points in keywords:
        if keyword in text:
            score += points
    if mode == "people":
        for keyword, penalty in PEOPLE_NEGATIVE:
            if keyword in text:
                score += penalty  # penalty is already negative
    return max(0, min(score, 100))


def classify_type(title: str, snippet: str) -> str:
    text = (title + " " + snippet).lower()
    if any(w in text for w in ["editorial", "ediciones", "publisher", "libros"]):
        return "publisher"
    if any(w in text for w in ["agencia", "agency", "studio", "estudio"]):
        return "agency"
    if any(w in text for w in ["moda", "fashion", "ropa", "indumentaria", "textil", "clothing"]):
        return "brand"
    if any(w in text for w in ["marca", "brand", "packaging"]):
        return "brand"
    if any(w in text for w in ["cultura", "museo", "ong", "fundacion"]):
        return "ngo"
    return "other"


def extract_email(text: str) -> Optional[str]:
    m = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return m.group(0) if m else None


_EMAIL_JUNK = re.compile(
    r"(example|test|noreply|no-reply|wix|wordpress|sentry|schema|pixel|@[23]x\b)",
    re.I,
)

def extract_emails_from_html(html: str) -> list[str]:
    """Find emails in raw HTML: checks mailto: href attributes AND visible text."""
    found: set[str] = set()
    for m in re.finditer(
        r'mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})', html, re.I
    ):
        found.add(m.group(1).lower())
    text = re.sub(r"<[^>]+>", " ", html)
    for m in re.finditer(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text):
        found.add(m.group(0).lower())
    return [e for e in found if not _EMAIL_JUNK.search(e)]


def extract_tel_links(html: str) -> list[str]:
    """Extract phone numbers from tel: href attributes."""
    phones = []
    for m in re.finditer(r'href=["\']tel:([+\d\s\-\(\)\.]{6,25})["\']', html, re.I):
        p = m.group(1).strip()
        if len(re.sub(r"[\s\-\.\(\)]", "", p)) >= 7:
            phones.append(p)
    return list(dict.fromkeys(phones))[:3]


def extract_whatsapp(html: str) -> Optional[str]:
    """Extract WhatsApp number from wa.me or whatsapp.com links."""
    for pat in [
        r'wa\.me/(\+?[\d]{6,15})',
        r'whatsapp\.com/send\?phone=(\+?[\d]{6,15})',
        r'api\.whatsapp\.com/send[^"\']*phone=(\+?[\d]{6,15})',
    ]:
        m = re.search(pat, html, re.I)
        if m:
            return m.group(1)
    return None


def extract_industry(title: str, snippet: str) -> str:
    text = (title + " " + snippet).lower()
    if any(w in text for w in ["moda", "fashion", "ropa", "indumentaria", "clothing", "coleccion", "estampado", "textil"]):
        return "Moda / Textil"
    if any(w in text for w in ["infantil", "niños", "children", "cuento"]):
        return "Editorial Infantil"
    if any(w in text for w in ["editorial", "libro", "book", "publishing"]):
        return "Editorial"
    if any(w in text for w in ["packaging", "envase", "producto"]):
        return "Packaging"
    if any(w in text for w in ["cultural", "museo", "fundacion"]):
        return "Cultura"
    if any(w in text for w in ["agencia", "publicidad", "marketing"]):
        return "Agencia / Publicidad"
    return "Diseño / Creativo"


def fit_breakdown(score: int, title: str, snippet: str) -> str:
    text = (title + " " + snippet).lower()
    reasons = []
    if any(w in text for w in ["infantil", "children", "cuento"]):
        reasons.append("publica libros infantiles")
    if any(w in text for w in ["ilustraci", "illustration"]):
        reasons.append("trabaja con ilustración")
    if any(w in text for w in ["packaging"]):
        reasons.append("hace packaging ilustrado")
    if any(w in text for w in ["contratar", "hire", "busca"]):
        reasons.append("busca ilustradores activamente")
    if not reasons:
        reasons.append("empresa del sector creativo/editorial")
    return " · ".join(reasons)


def opportunity_signals(title: str, snippet: str) -> str:
    text = (title + " " + snippet).lower()
    signals = []
    if any(w in text for w in ["contratar", "hire", "busca ilustrador", "necesita"]):
        signals.append("Busca ilustradores activamente")
    if any(w in text for w in ["infantil", "niños"]):
        signals.append("Publica libros infantiles")
    if any(w in text for w in ["packaging"]):
        signals.append("Produce packaging ilustrado")
    if any(w in text for w in ["cultura", "museo"]):
        signals.append("Proyectos culturales")
    return " · ".join(signals) if signals else snippet[:120]


def full_url(partial_url: str) -> str:
    if not partial_url:
        return ""
    if partial_url.startswith("http"):
        return partial_url
    return "https://" + partial_url.lstrip("/")


def base_domain_url(raw_url: str) -> str:
    """Convert 'www.empresa.com/page/stuff' → 'https://www.empresa.com'"""
    url = full_url(raw_url)
    m = re.match(r"(https?://[^/]+)", url)
    return m.group(1) if m else url


# ── Website enrichment ────────────────────────────────────────────────────────

PHONE_RE = re.compile(
    r"(?:\+?(?:54|52|57|56|598|34)\s?)?"   # country code opcional
    r"(?:\(0?\d{2,4}\)\s?)?"               # área entre paréntesis
    r"\d{4}[\s\-]\d{4}"                    # XXXX-XXXX o XXXX XXXX
)

ROLE_KEYWORDS = [
    "director", "directora", "gerente", "ceo", "founder", "fundador", "fundadora",
    "presidente", "presidenta", "socio", "socia", "dueño", "dueña", "owner",
    "responsable", "coordinador", "coordinadora", "jefe", "jefa",
]

CONTACT_PAGES = ["", "/contacto", "/about", "/nosotros"]


def extract_phones(text: str) -> list[str]:
    raw = PHONE_RE.findall(text)
    phones = []
    for p in raw:
        clean = re.sub(r"[\s\-\.]", "", p.strip())
        if len(clean) >= 7:
            phones.append(p.strip())
    return list(dict.fromkeys(phones))[:3]  # deduplicate, max 3


def extract_social(text: str) -> dict:
    social = {}
    ig = re.search(r"instagram\.com/([a-zA-Z0-9._]{2,})", text)
    if ig and ig.group(1) not in ("p", "reel", "stories", "explore"):
        social["instagram"] = f"@{ig.group(1)}"
    li = re.search(r"linkedin\.com/(?:company|in)/([a-zA-Z0-9._\-]{2,})", text)
    if li:
        social["linkedin"] = f"linkedin.com/company/{li.group(1)}"
    bh = re.search(r"behance\.net/([a-zA-Z0-9._\-]{2,})", text)
    if bh:
        social["behance"] = f"behance.net/{bh.group(1)}"
    return social


def extract_key_people(text: str) -> list[str]:
    """Find 'Name - Role' or 'Role: Name' patterns near known role keywords."""
    people = []
    lines = text.split("\n")
    for i, line in enumerate(lines):
        line_lower = line.lower()
        for role in ROLE_KEYWORDS:
            if role in line_lower and len(line) < 120:
                # Clean and add line as-is (likely "Name – Director General")
                clean = line.strip(" •·|-–—")
                if clean and len(clean) > 4:
                    people.append(clean)
                break
    return list(dict.fromkeys(people))[:4]


def enrich_from_website(raw_url: str, fetcher) -> dict:
    """Visit company pages and extract contact details."""
    base = base_domain_url(raw_url)
    if not base or len(base) < 10:
        return {}

    all_html = ""
    visited = 0

    for suffix in CONTACT_PAGES:
        if visited >= 2:
            break
        page_url = base + suffix
        try:
            resp = requests.get(page_url, headers=DDG_HEADERS, timeout=6, allow_redirects=True)
            if resp.status_code != 200:
                continue
            raw = resp.text[:10000]
            if len(raw) < 80:
                continue
            all_html += raw
            visited += 1
        except Exception:
            continue

    if not all_html:
        return {}

    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", all_html)).strip()
    emails = extract_emails_from_html(all_html)[:3]
    phones = extract_tel_links(all_html) or extract_phones(plain)
    social = extract_social(all_html)
    people = extract_key_people(plain)

    return {
        "email": emails[0] if emails else None,
        "all_emails": emails,
        "phone": phones[0] if phones else None,
        "whatsapp": extract_whatsapp(all_html),
        "instagram": social.get("instagram"),
        "linkedin": social.get("linkedin"),
        "behance": social.get("behance"),
        "key_people": people,
        "pages_visited": visited,
    }


# ── Deep enrichment (manual trigger, more pages + better extraction) ──────────

DEEP_CONTACT_PAGES = [
    "", "/contacto", "/contactenos", "/contactanos", "/contact", "/contact-us",
    "/about", "/about-us", "/nosotros", "/quienes-somos", "/acerca-de", "/equipo", "/team",
]


def deep_enrich_website(raw_url: str) -> dict:
    """Thorough enrichment: visits more pages, larger HTML window, better extraction."""
    base = base_domain_url(raw_url)
    if not base or len(base) < 10:
        return {}

    all_html = ""
    visited = 0

    for suffix in DEEP_CONTACT_PAGES:
        if visited >= 5:
            break
        page_url = base + suffix
        try:
            resp = requests.get(page_url, headers=DDG_HEADERS, timeout=8, allow_redirects=True)
            if resp.status_code != 200:
                continue
            raw = resp.text[:20000]
            if len(raw) < 100:
                continue
            all_html += raw
            visited += 1
            time.sleep(0.5)
        except Exception:
            continue

    if not all_html:
        return {}

    plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", all_html)).strip()
    emails = extract_emails_from_html(all_html)[:5]
    phones = extract_tel_links(all_html) or extract_phones(plain)
    social = extract_social(all_html)
    people = extract_key_people(plain)

    return {
        "email": emails[0] if emails else None,
        "all_emails": emails,
        "phone": phones[0] if phones else None,
        "whatsapp": extract_whatsapp(all_html),
        "instagram": social.get("instagram"),
        "linkedin": social.get("linkedin"),
        "behance": social.get("behance"),
        "key_people": people,
        "pages_visited": visited,
    }


def _build_notes(url: str, data: dict) -> str:
    lines = [f"🌐 {url}"]
    if data.get("all_emails"):
        lines.append("📧 " + " | ".join(data["all_emails"]))
    if data.get("phone"):
        lines.append(f"📞 {data['phone']}")
    if data.get("whatsapp"):
        lines.append(f"WhatsApp: {data['whatsapp']}")
    if data.get("instagram"):
        lines.append(f"Instagram: {data['instagram']}")
    if data.get("linkedin"):
        lines.append(f"LinkedIn: {data['linkedin']}")
    if data.get("behance"):
        lines.append(f"Behance: {data['behance']}")
    if data.get("key_people"):
        lines.append("👤 " + " | ".join(data["key_people"]))
    return "\n".join(lines)


def process_enrich_job(enrich_job_id: str, source_job_id: str, prospects_data: list):
    """Deep-enrich specific prospects and update them in the source job."""
    log.info(f"  Enriquecimiento manual: {len(prospects_data)} prospectos")

    for p_info in prospects_data:
        name = p_info.get("name", "")
        url = p_info.get("url", "")
        if not name or not url:
            continue

        log.info(f"  Deep enrich: {name[:50]}")
        try:
            data = deep_enrich_website(url)
            updated = {
                "name": name,
                "email": data.get("email"),
                "notes": _build_notes(url, data),
            }
            send_partial_prospects(source_job_id, [updated])
            log.info(f"  ✓ {name[:30]}: email={data.get('email') or '—'}, "
                     f"wa={data.get('whatsapp') or '—'}, pages={data.get('pages_visited', 0)}")
        except Exception as e:
            log.warning(f"  Error {name}: {e}")

        time.sleep(1)

    report_results(
        enrich_job_id,
        {"google": "done", "apollo": "done", "instagram": "done", "behance": "done", "news": "done"},
    )
    log.info("  Enriquecimiento completado")


# ── Behance Playwright scraper ────────────────────────────────────────────────

PLAYWRIGHT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_EXTRACT_PROJECTS_JS = """
() => {
    const results = [];
    const rootCards = document.querySelectorAll('[class*="ProjectCover-root"]');
    const seen = new Set();
    rootCards.forEach((card) => {
        const innerCard = card.querySelector('[aria-label]');
        const title = innerCard ? innerCard.getAttribute('aria-label') : null;
        const links = Array.from(card.querySelectorAll('a[href]'));
        let projectUrl = null, ownerUrl = null, ownerName = null;
        links.forEach(link => {
            const href = link.href;
            if (href.includes('/gallery/')) {
                projectUrl = href.split('?')[0];
            } else if (href.includes('behance.net/') && !href.includes('/galleries/') && !href.includes('/search')) {
                const clean = href.split('?')[0];
                if (clean.match(/behance\\.net\\/[a-zA-Z0-9_-]+$/)) {
                    ownerUrl = clean;
                    ownerName = link.textContent.trim() || null;
                }
            }
        });
        if (projectUrl && !seen.has(projectUrl)) {
            seen.add(projectUrl);
            results.push({ title, projectUrl, ownerUrl, ownerName });
        }
    });
    return results;
}
"""

_EXTRACT_PROFILE_JS = """
() => {
    const data = {};
    data.name = document.querySelector('h1')?.textContent.trim() || null;
    const bodyText = document.body.innerText || '';
    // Location
    const locMatch = bodyText.match(/([A-Z][^\\n]{3,40}(?:Argentina|Brazil|Mexico|Colombia|Chile|Spain|UK|USA|France|Italy|Germany|Portugal|Australia|Uruguay|Peru|Bolivia)[^\\n]{0,30})/);
    data.location = locMatch ? locMatch[1].trim().substring(0, 80) : null;
    // Presentation / About — try CSS selectors first, fallback to text search
    const presSelectors = [
        '[class*="Presentation"]', '[class*="presentation"]',
        '[class*="AboutSection"]', '[class*="about-section"]',
        '[class*="UserInfo-bio"]', '[class*="profileBio"]',
        '[data-testid*="about"]', '[data-testid*="presentation"]'
    ];
    let bio = null;
    for (const sel of presSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 20) {
            bio = el.innerText.trim().substring(0, 800);
            break;
        }
    }
    if (!bio) {
        const aboutIdx = bodyText.indexOf('ABOUT');
        if (aboutIdx >= 0) bio = bodyText.substring(aboutIdx + 5, aboutIdx + 800).trim();
    }
    data.bio = bio || null;
    // Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}/g;
    const rawEmails = (document.documentElement.innerHTML.match(emailRegex) || []);
    data.emails = [...new Set(rawEmails)].filter(e =>
        !e.includes('behance') && !e.includes('adobe') && !e.includes('nr-data') &&
        !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('@2x') && !e.includes('@3x')
    );
    // External links
    const extLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter(a => a.href && !a.href.includes('behance.net') && !a.href.includes('adobe.com') && a.href.startsWith('http'))
        .map(a => ({ text: a.textContent.trim(), href: a.href }));
    const seen = new Set();
    data.externalLinks = extLinks.filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; }).slice(0, 8);
    return data;
}
"""

_EXTRACT_JOBS_JS = """
() => {
    const jobLinks = Array.from(document.querySelectorAll('a[href*="/joblist/"]'));
    const jobs = [];
    const seen = new Set();
    jobLinks.forEach(link => {
        const jobUrl = link.href.split('?')[0];
        if (seen.has(jobUrl)) return;
        seen.add(jobUrl);
        const container = link.closest('li') || link.parentElement;
        const text = container ? container.innerText.trim() : link.innerText.trim();
        if (text.length > 10) jobs.push({ jobUrl, text: text.substring(0, 400) });
    });
    return jobs.slice(0, 20);
}
"""


async def _async_scrape_behance_people(search_terms: list, location_filter: str, max_profiles: int = 15, strict_geo: bool = False, keywords: str = "", role: str = "ilustrador") -> list:
    """Scrape Behance project search → owner profiles → email/contacts. Returns prospect list."""
    import asyncio
    from playwright.async_api import async_playwright

    prospects = []
    seen_profiles: set = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=PLAYWRIGHT_UA)
        page = await ctx.new_page()

        for term in search_terms:
            if len(seen_profiles) >= max_profiles:
                break
            url = f"https://www.behance.net/search/projects?search={requests.utils.quote(term)}&sort=appreciations&time=month"
            log.info(f"  Behance search: {term[:60]}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                await asyncio.sleep(3)
                projects = await page.evaluate(_EXTRACT_PROJECTS_JS)
                log.info(f"    → {len(projects)} proyectos")
            except Exception as e:
                log.warning(f"  Behance search error: {e}")
                continue

            for proj in projects:
                owner_url = proj.get("ownerUrl")
                owner_name = proj.get("ownerName")
                if not owner_url or owner_url in seen_profiles:
                    continue
                if len(seen_profiles) >= max_profiles:
                    break
                seen_profiles.add(owner_url)

                # Visit owner profile
                try:
                    await page.goto(owner_url, wait_until="networkidle", timeout=30000)
                    await asyncio.sleep(2)
                    profile = await page.evaluate(_EXTRACT_PROFILE_JS)
                except Exception as e:
                    log.debug(f"  Profile error {owner_url}: {e}")
                    profile = {}

                name = profile.get("name") or owner_name or owner_url.split("/")[-1]
                location_raw = profile.get("location") or ""
                emails = profile.get("emails") or []
                bio = profile.get("bio") or ""
                ext_links = profile.get("externalLinks") or []

                # Build social links from externalLinks
                instagram = next((l["href"] for l in ext_links if "instagram.com" in l["href"]), None)
                if instagram:
                    ig_handle = re.search(r"instagram\.com/([a-zA-Z0-9._]{2,})", instagram)
                    instagram = f"@{ig_handle.group(1)}" if ig_handle else instagram

                linkedin = next((l["href"] for l in ext_links if "linkedin.com" in l["href"]), None)

                match_terms = LOCATION_MATCH.get(location_filter or "global", [])
                combined_text = (location_raw + " " + bio).lower()
                geo_match = not match_terms or any(t in combined_text for t in match_terms)

                if strict_geo and match_terms and location_raw and not geo_match:
                    log.debug(f"  Skip (geo mismatch strict): {name[:40]} — {location_raw}")
                    continue

                score = 40
                if emails:
                    score += 25
                if geo_match and match_terms:
                    score += 20
                elif not geo_match and match_terms:
                    score -= 10
                if instagram:
                    score += 10

                # Keyword scoring: check bio + project title for matches
                if keywords:
                    kw_list = [k.strip().lower() for k in keywords.replace(",", " ").split() if k.strip()]
                    kw_text = (bio + " " + (proj.get("title") or "")).lower()
                    matched_kw = sum(1 for k in kw_list if k in kw_text)
                    if matched_kw > 0:
                        score += min(matched_kw * 10, 20)  # +10 por keyword, máximo +20
                    else:
                        score -= 5  # suave penalidad si no menciona ninguna keyword

                score = min(max(score, 0), 95)

                notes_lines = [f"🌐 {owner_url}"]
                if location_raw:
                    notes_lines.append(f"📍 {location_raw}")
                if emails:
                    notes_lines.append("📧 " + " | ".join(emails[:2]))
                if instagram:
                    notes_lines.append(f"Instagram: {instagram}")
                if linkedin:
                    notes_lines.append(f"LinkedIn: {linkedin}")
                for l in ext_links[:3]:
                    href = l["href"]
                    if "instagram" not in href and "linkedin" not in href and "behance" not in href and "adobe" not in href:
                        notes_lines.append(f"🔗 {href[:80]}")
                if bio:
                    notes_lines.append(f"💬 {bio[:600]}")

                role_cfg = ROLE_SEARCH_TERMS.get(role, ROLE_SEARCH_TERMS["ilustrador"])
                role_label = role_cfg["label"]
                prospects.append({
                    "name": name,
                    "type": role,
                    "industry": role_label.capitalize(),
                    "region": location_raw or None,
                    "opportunitySignals": f"Behance · {proj.get('title', '')[:60]}",
                    "fitScore": score,
                    "fitBreakdown": bio[:400] if bio else f"{role_label} en Behance",
                    "email": emails[0] if emails else None,
                    "phone": None,
                    "instagram": instagram,
                    "linkedin": linkedin,
                    "key_people": [],
                    "_raw_url": owner_url,
                    "source": "behance",
                    "notes": "\n".join(notes_lines),
                })
                log.info(f"  ✓ {name[:40]} | email={'✓' if emails else '—'} | ig={'✓' if instagram else '—'} | score={score}")

        await browser.close()

    return prospects


async def _async_scrape_behance_jobs(categories: list, location_filter: str, industry: str = "", strict_geo: bool = False) -> list:
    """Scrape Behance job board for illustration jobs. Returns prospect list."""
    import asyncio
    from playwright.async_api import async_playwright

    prospects = []
    seen_urls: set = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=PLAYWRIGHT_UA)
        page = await ctx.new_page()

        for cat in categories:
            url = f"https://www.behance.net/joblist?category={cat}"
            log.info(f"  Behance jobs: {url}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                await asyncio.sleep(3)
                jobs = await page.evaluate(_EXTRACT_JOBS_JS)
                log.info(f"    → {len(jobs)} jobs")
            except Exception as e:
                log.warning(f"  Behance jobs error: {e}")
                continue

            for job in jobs:
                job_url = job.get("jobUrl", "")
                if not job_url or job_url in seen_urls:
                    continue
                seen_urls.add(job_url)

                text = job.get("text", "")
                lines = [l.strip() for l in text.split("\n") if l.strip()]

                # Industry filter: skip jobs that don't mention relevant keywords
                if industry and industry in INDUSTRY_JOB_FILTER:
                    kws = INDUSTRY_JOB_FILTER[industry]
                    if not any(k in text.lower() for k in kws):
                        log.debug(f"  Skip (industry mismatch): {lines[0][:40] if lines else '?'}")
                        continue

                # Parse: first meaningful line = company, second = location, rest = title/desc
                company = lines[0] if lines else "Empresa desconocida"
                location_raw = next((l for l in lines[1:3] if any(c.isupper() for c in l) and len(l) < 60), "")
                title = next((l for l in lines[2:5] if len(l) > 10 and l != location_raw), "")
                desc = " ".join(lines[4:8])

                match_terms = LOCATION_MATCH.get(location_filter or "global", [])
                anywhere = "anywhere" in text.lower() or "remote" in text.lower()
                text_lower = text.lower()
                geo_match = not match_terms or any(t in text_lower for t in match_terms)

                if strict_geo and not geo_match and not anywhere:
                    log.debug(f"  Skip (geo mismatch strict): {lines[0][:40] if lines else '?'}")
                    continue

                score = 55  # job postings are warm leads
                if geo_match and match_terms:
                    score += 15
                elif not geo_match and not anywhere and match_terms:
                    score -= 10

                notes_lines = [f"🌐 {job_url}"]
                if location_raw:
                    notes_lines.append(f"📍 {location_raw}")
                if title:
                    notes_lines.append(f"💼 {title[:100]}")
                if desc:
                    notes_lines.append(f"📝 {desc[:150]}")

                prospects.append({
                    "name": company,
                    "type": "client",
                    "industry": "Busca ilustrador (Behance Jobs)",
                    "region": location_raw or None,
                    "opportunitySignals": f"Job posting activo · {title[:60]}",
                    "fitScore": score,
                    "fitBreakdown": "empresa buscando ilustrador en Behance",
                    "email": None,
                    "phone": None,
                    "instagram": None,
                    "linkedin": None,
                    "key_people": [],
                    "_raw_url": job_url,
                    "source": "behance-jobs",
                    "notes": "\n".join(notes_lines),
                })
                log.info(f"  ✓ Job: {company[:40]} | {location_raw or 'Anywhere'} | score={score}")

        await browser.close()

    return prospects


async def _async_scrape_behance_projects_for_clients(search_terms: list, location_filter: str) -> list:
    """Scrape Behance projects, extract 'Client: X' mentions → company prospects."""
    import asyncio, re as _re
    from playwright.async_api import async_playwright

    prospects = []
    seen_companies: set = set()

    CLIENT_RE = _re.compile(
        r'(?:client|cliente|brand|marca|for)\s*[:\-–]\s*([A-Z][^\n\.\|]{2,60})',
        _re.IGNORECASE
    )
    DIRECTOR_RE = _re.compile(
        r'(?:creative\s+direction|art\s+direction|directed\s+by|direction\s+by)\s*[:\-–]\s*([A-Z][^\n\|]{3,60})',
        _re.IGNORECASE
    )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(user_agent=PLAYWRIGHT_UA)
        page = await ctx.new_page()

        for term in search_terms:
            url = f"https://www.behance.net/search/projects?search={requests.utils.quote(term)}&sort=appreciations&time=month"
            log.info(f"  Behance client search: {term[:60]}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
                await asyncio.sleep(3)
                projects = await page.evaluate(_EXTRACT_PROJECTS_JS)
            except Exception as e:
                log.warning(f"  Behance search error: {e}")
                continue

            for proj in projects[:12]:
                proj_url = proj.get("projectUrl")
                if not proj_url:
                    continue
                try:
                    await page.goto(proj_url, wait_until="networkidle", timeout=30000)
                    await asyncio.sleep(2)
                    body_text = await page.evaluate("() => document.body.innerText")
                except Exception:
                    continue

                client_matches = CLIENT_RE.findall(body_text)
                director_matches = DIRECTOR_RE.findall(body_text)

                for client_name in client_matches:
                    client_name = client_name.strip().rstrip(".,;)")
                    if len(client_name) < 3 or client_name.lower() in seen_companies:
                        continue
                    seen_companies.add(client_name.lower())

                    # Geo filter
                    if location_filter and location_filter.lower() not in ("global", ""):
                        geo_kw = LOCATION_GEO.get(location_filter, "").lower()
                        if geo_kw and geo_kw not in body_text.lower() and geo_kw not in client_name.lower():
                            continue

                    director = director_matches[0].strip() if director_matches else None
                    score = 60  # company that already commissions illustration
                    notes_lines = [f"🌐 {proj_url}"]
                    notes_lines.append(f"💼 Cliente encontrado en proyecto Behance: {proj.get('title', '')[:80]}")
                    if director:
                        notes_lines.append(f"👤 Dirección creativa: {director[:80]}")

                    prospects.append({
                        "name": client_name,
                        "type": "client",
                        "industry": "Comisionó ilustración (Behance)",
                        "region": None,
                        "opportunitySignals": f"Ya contrató ilustración · Behance: {proj.get('title', '')[:50]}",
                        "fitScore": score,
                        "fitBreakdown": "empresa que comisionó trabajo de ilustración",
                        "email": None,
                        "phone": None,
                        "instagram": None,
                        "linkedin": None,
                        "key_people": [director] if director else [],
                        "_raw_url": proj_url,
                        "source": "behance-projects",
                        "notes": "\n".join(notes_lines),
                    })
                    log.info(f"  ✓ Client: {client_name[:40]} | dir={director or '—'}")

        await browser.close()

    return prospects


def scrape_behance_people(search_terms: list, location_filter: str, strict_geo: bool = False, keywords: str = "", role: str = "ilustrador") -> list:
    import asyncio
    try:
        return asyncio.run(_async_scrape_behance_people(search_terms, location_filter, strict_geo=strict_geo, keywords=keywords, role=role))
    except Exception as e:
        log.error(f"Behance people scraper error: {e}")
        return []


def scrape_behance_jobs(categories: list, location_filter: str, industry: str = "", strict_geo: bool = False) -> list:
    import asyncio
    try:
        return asyncio.run(_async_scrape_behance_jobs(categories, location_filter, industry, strict_geo))
    except Exception as e:
        log.error(f"Behance jobs scraper error: {e}")
        return []


def scrape_behance_clients(search_terms: list, location_filter: str) -> list:
    import asyncio
    try:
        return asyncio.run(_async_scrape_behance_projects_for_clients(search_terms, location_filter))
    except Exception as e:
        log.error(f"Behance clients scraper error: {e}")
        return []


# ── Main search flow ──────────────────────────────────────────────────────────

def find_prospects(criteria: str, job_id: str = None, mode: str = "companies",
                   industry: str = "", style: str = "", location: str = "argentina",
                   strict_geo: bool = False, role: str = "ilustrador", specialty: str = "") -> list:

    # ── People mode: Behance primary ─────────────────────────────────────────
    if mode == "people":
        search_terms = build_behance_project_terms("people", industry, style, location, criteria, role=role, specialty=specialty)
        log.info(f"  Behance people terms: {search_terms}")
        behance_prospects = scrape_behance_people(search_terms, location, strict_geo=strict_geo, keywords=criteria, role=role)
        if job_id and behance_prospects:
            send_partial_prospects(job_id, [{k: v for k, v in p.items() if k != "_raw_url"}
                                            for p in behance_prospects])

        prospects = sorted(behance_prospects, key=lambda x: x["fitScore"], reverse=True)
        log.info(f"  Prospectos people: {len(prospects)}")

        # Send final enriched list (already enriched during profile visit)
        for p in prospects:
            p.pop("_raw_url", None)

        if job_id:
            send_partial_prospects(job_id, prospects)

        return prospects[:30]

    # ── Companies mode: Behance jobs + client extraction + DDG fallback ───────
    from scrapling.fetchers import Fetcher
    fetcher = Fetcher()
    search_terms = build_behance_project_terms("companies", industry, style, location, criteria)
    job_categories = build_behance_job_categories(industry)
    log.info(f"  Behance company terms: {search_terms}")
    log.info(f"  Behance job categories: {job_categories}")

    all_prospects: list = []

    # Track 1: Behance job board (warm leads — companies actively posting)
    job_prospects = scrape_behance_jobs(job_categories, location, industry=industry, strict_geo=strict_geo)
    all_prospects.extend(job_prospects)
    if job_id and job_prospects:
        send_partial_prospects(job_id, [{k: v for k, v in p.items() if k != "_raw_url"} for p in job_prospects])

    # Track 2: Behance project client extraction ("Client: X" pattern)
    client_prospects = scrape_behance_clients(search_terms, location)
    seen_names = {p["name"].lower() for p in all_prospects}
    for p in client_prospects:
        if p["name"].lower() not in seen_names:
            seen_names.add(p["name"].lower())
            all_prospects.append(p)
    if job_id and client_prospects:
        send_partial_prospects(job_id, [{k: v for k, v in p.items() if k != "_raw_url"} for p in client_prospects])

    # Track 3: DDG fallback for extra coverage
    queries = build_queries(criteria or (INDUSTRY_BEHANCE.get(industry, {}).get("project_terms", [""])[0]), mode, role=role)
    log.info(f"  Queries: {len(queries)} (modo: {mode})")

    seen_urls: set = set()
    seen_names: set = set()
    raw_results: list = []

    for q in queries:
        results = search_ddg(q, fetcher)
        for r in results:
            url_key = r["url"].lower().split("?")[0]
            if url_key and url_key in seen_urls:
                continue
            if url_key:
                seen_urls.add(url_key)
            raw_results.append(r)
        time.sleep(2)

    log.info(f"  Total resultados únicos: {len(raw_results)}")

    prospects = []
    for r in raw_results:
        title = r["title"]
        snippet = r["snippet"]
        url = r["url"]

        if is_excluded(url, title, snippet, mode):
            continue

        score = score_result(title, snippet, url, mode)
        min_score = 1 if mode == "people" else 10
        if score < min_score:
            continue

        name_key = title.lower().strip()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)

        prospects.append({
            "name": title,
            "type": classify_type(title, snippet),
            "industry": extract_industry(title, snippet),
            "region": None,
            "opportunitySignals": opportunity_signals(title, snippet),
            "fitScore": score,
            "fitBreakdown": fit_breakdown(score, title, snippet),
            "email": extract_email(snippet),
            "phone": None,
            "instagram": None,
            "linkedin": None,
            "key_people": [],
            "_raw_url": full_url(url),
            "source": "web-search",
            "notes": f"🌐 {full_url(url)}\n{snippet[:250]}",
        })

    prospects.sort(key=lambda x: x["fitScore"], reverse=True)
    log.info(f"  Prospectos calificados: {len(prospects)}")

    # ── Phase 1: Send scored (unenriched) prospects immediately ──────────────
    if job_id and prospects:
        initial = [{k: v for k, v in p.items() if k != "_raw_url"} for p in prospects[:30]]
        send_partial_prospects(job_id, initial)

    # ── Phase 2: Enrich top 10, send each update live ─────────────────────────
    enriched_count = 0
    for p in prospects[:10]:
        raw_url = p.pop("_raw_url", "")
        if not raw_url:
            continue
        try:
            log.info(f"  Enriqueciendo: {p['name'][:40]}")
            data = enrich_from_website(raw_url, fetcher)
            if data:
                if data.get("email") and not p.get("email"):
                    p["email"] = data["email"]
                if data.get("phone"):
                    p["phone"] = data["phone"]
                if data.get("instagram"):
                    p["instagram"] = data["instagram"]
                if data.get("linkedin"):
                    p["linkedin"] = data["linkedin"]
                notes = _build_notes(raw_url, data)
                if notes != f"🌐 {raw_url}":
                    p["notes"] = notes
                    enriched_count += 1
        except Exception as e:
            log.debug(f"  Enrich error {p['name']}: {e}")
        finally:
            p.pop("_raw_url", None)
            if job_id:
                send_partial_prospects(job_id, [p])

    for p in prospects[10:]:
        p.pop("_raw_url", None)

    log.info(f"  Enriquecidos con datos de sitio web: {enriched_count}")
    return prospects[:30]


# ── Job processor ─────────────────────────────────────────────────────────────

def process_job(job: dict):
    job_id = job["id"]
    criteria = job["criteria"]
    log.info(f"Job {job_id[:8]}… | {criteria[:70]}")

    # Detect special job types encoded as JSON in criteria
    search_query = criteria
    search_mode = "companies"
    search_industry = ""
    search_style = ""
    search_location = "argentina"
    search_strict_geo = False
    search_role = "ilustrador"
    search_specialty = ""
    try:
        parsed = json.loads(criteria)
        if isinstance(parsed, dict):
            if parsed.get("__type") == "enrich":
                return process_enrich_job(
                    job_id,
                    parsed["source_job_id"],
                    parsed.get("prospects", []),
                )
            search_query = parsed.get("query", criteria)
            search_mode = parsed.get("mode", "companies")
            search_industry = parsed.get("industry", "")
            search_style = parsed.get("style", "")
            search_location = parsed.get("location", "argentina")
            search_strict_geo = bool(parsed.get("strict_geo", False))
            search_role = parsed.get("role", "ilustrador")
            search_specialty = parsed.get("specialty", "")
    except (json.JSONDecodeError, TypeError, KeyError):
        pass

    source_statuses = {
        "apollo": "done", "instagram": "done",
        "behance": "done", "google": "done", "news": "done",
    }

    try:
        prospects = find_prospects(
            search_query, job_id=job_id, mode=search_mode,
            industry=search_industry, style=search_style, location=search_location,
            strict_geo=search_strict_geo, role=search_role, specialty=search_specialty,
        )
    except Exception as e:
        log.error(f"Error en búsqueda: {e}")
        prospects = []
        source_statuses["google"] = "failed"

    # Prospects already saved incrementally — just mark job done
    report_results(job_id, source_statuses)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if not CRM_SECRET:
        log.error("CRM_SECRET no configurado en scraper/.env")
        sys.exit(1)

    log.info(f"Flori Prospector Worker — polling {CRM_URL} cada {POLL_INTERVAL}s")
    while True:
        job = get_pending_job()
        if job:
            try:
                process_job(job)
            except Exception as e:
                log.error(f"Error: {e}")
                if job.get("id"):
                    report_failed(job["id"])
        else:
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
