import re
import json
import sys
import unicodedata
import pdfplumber

UNIT_RE = re.compile(r"\b(B\d{2}AP\d{3})\b", re.I)

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)

# Telefones mais "seguros":
# - (98) 98503-3520
# - 98 985033520
# - 98503-3520
# - 3503-3520
PHONE_SAFE_RE = re.compile(
    r"""
    (?:\(\d{2}\)\s*\d{4,5}[-\s]?\d{4})     # (98) 98503-3520
    |
    (?:\b\d{2}\s*\d{4,5}[-\s]?\d{4}\b)     # 98 98503-3520 ou 98985033520 (se tiver espaço/hífen)
    |
    (?:\b9\d{4}[-\s]?\d{4}\b)              # 98503-3520 (celular sem DDD)
    |
    (?:\b[2-5]\d{3}[-\s]?\d{4}\b)          # 3503-3520 (fixo sem DDD)
    """,
    re.VERBOSE
)

STOP_ANY_RE = re.compile(
    r"\b(PAGADOR|TIPO\sPAGADOR|TIPO\s|ORDINARIA|ORDINÁRIA|ACORDO|EXTRA|INADIMPL|DATA\sDE\sREFER|N\.\s*NÚMERO|VL\.ATUAL)\b",
    re.I
)

def fold(s: str) -> str:
    s = s or ""
    s = s.replace("\u00a0", " ")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s

def extract_full_text(pdf_path: str) -> str:
    chunks = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if not t.strip():
                words = page.extract_words() or []
                if words:
                    words.sort(key=lambda w: (round(w["top"], 1), w["x0"]))
                    t = " ".join(w["text"] for w in words)
            chunks.append(t)
    return "\n".join(chunks)

def normalize_phone(raw: str) -> str | None:
    s = re.sub(r"\D+", "", raw or "")
    if not s:
        return None

    # casos com DDD (10 ou 11)
    if len(s) == 10:
        return f"+55{s}"
    if len(s) == 11:
        return f"+55{s}"

    # sem DDD: 9 (cel) ou 8 (fixo)
    if len(s) == 9 and s.startswith("9"):
        return s
    if len(s) == 8 and s[0] in ("2", "3", "4", "5"):
        return s

    return None

def split_by_units(full_text: str):
    matches = list(UNIT_RE.finditer(full_text))
    if not matches:
        return []
    blocks = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        blocks.append((m.group(1).upper(), full_text[start:end]))
    return blocks

def cut_at_stop(text: str) -> str:
    m = STOP_ANY_RE.search(text)
    return text[:m.start()].strip() if m else text.strip()

def extract_owner_line(chunk: str) -> str | None:
    """
    Pega o trecho APÓS 'Proprietário:' e corta:
    - antes de Inquilino:
    - antes de Pagador/Tipo/Ordinária...
    """
    m = re.search(r"PROPRIET[ÁA]RIO:\s*([\s\S]*)", chunk, flags=re.I)
    if not m:
        return None
    s = m.group(1)
    s = re.split(r"\bINQUILINO:\b", s, flags=re.I)[0]
    s = cut_at_stop(s)
    return s.strip()

def extract_clean_name(owner_part: str) -> str:
    """
    Nome = texto antes do primeiro (CPF/CNPJ).
    Se não achar, pega até o primeiro ';' (antes dos contatos).
    """
    m = re.match(r"^(.*?)\s*\(\s*[\d./-]+\s*\)", owner_part)
    if m:
        return re.sub(r"\s{2,}", " ", m.group(1).strip())

    # fallback: corta no primeiro ';'
    name = owner_part.split(";", 1)[0].strip()
    # remove qualquer resto de telefone/email grudado
    name = re.split(r"\b\d{4,5}[-\s]?\d{4}\b", name, maxsplit=1)[0].strip()
    return re.sub(r"\s{2,}", " ", name)

def extract_contacts(owner_part: str):
    emails = sorted(set(EMAIL_RE.findall(owner_part or "")))

    phones = []
    for p in PHONE_SAFE_RE.findall(owner_part or ""):
        np = normalize_phone(p)
        if np:
            phones.append(np)

    return sorted(set(phones)), emails

def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/condomob_apartamentos_extract.py arquivo.pdf", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    text = fold(extract_full_text(pdf_path))

    results = []
    for unidade, chunk in split_by_units(text):
        owner_part = extract_owner_line(chunk)
        if not owner_part:
            continue

        nome = extract_clean_name(owner_part)
        phones, emails = extract_contacts(owner_part)

        results.append({
            "unidade": unidade,
            
            "Telefone": phones,
            "Email": emails,
        })

    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
