import re
import json
import sys
import unicodedata
import pdfplumber

UNIT_RE = re.compile(r"\b(B\d{2}AP\d{3})\b", re.I)

# pega o "bloco" do proprietário: Proprietário: ... (até antes de Pagador:)
BLOCK_RE = re.compile(
    r"(B\d{2}AP\d{3}).*?PROPRIET[ÁA]RIO:\s*(.*?)\s*(?=PAGADOR:)",
    re.I | re.S
)

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\(\d{2}\)\s*)?\d{4,5}[-\s]?\d{4}|\b\d{10,13}\b")

def fold(s: str) -> str:
    # remove acentos e normaliza espaços pra regex ficar estável
    s = s or ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return s

def normalize_phone(raw: str) -> str | None:
    s = re.sub(r"\D+", "", raw or "")
    if not s:
        return None

    if len(s) in (12, 13) and s.startswith("55"):
        return f"+{s}"
    if len(s) == 11:
        return f"+55{s}"
    if len(s) == 10:
        return f"+55{s}"
    if len(s) in (8, 9):
        return s
    return None

def extract_full_text(pdf_path: str) -> str:
    chunks = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if not t.strip():
                # fallback: concatena words se extract_text vier vazio
                words = page.extract_words() or []
                if words:
                    words.sort(key=lambda w: (round(w["top"], 1), w["x0"]))
                    t = " ".join(w["text"] for w in words)
            chunks.append(t)
    return "\n".join(chunks)

def clean_owner_name(owner_and_more: str) -> str:
    # corta "Inquilino:" se vier junto
    owner = re.split(r"\bINQUILINO:\b", owner_and_more, flags=re.I)[0].strip()
    # remove (cpf/cnpj) no fim
    owner = re.sub(r"\(\s*[\d./-]+\s*\)", "", owner).strip()
    owner = re.sub(r"\s{2,}", " ", owner).strip()
    return owner

def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/condomob_apartamentos_extract.py arquivo.pdf", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    text = extract_full_text(pdf_path)
    text = fold(text)  # normaliza acentos/espaços, mas mantém estrutura geral

    results = []
    for m in BLOCK_RE.finditer(text):
        unidade = m.group(1).upper()
        bloco = m.group(2)  # trecho do proprietário até antes de pagador (já normalizado)

        # reconstruímos um “mini-texto” só do trecho do proprietário
        # pra puxar nome e contatos
        # Nome vem logo após "PROPRIETARIO:"
        # Como o regex já começou após "PROPRIETARIO:", o bloco começa com "NOME (CPF) ..."
        nome = clean_owner_name(bloco)

        emails = sorted(set(EMAIL_RE.findall(bloco)))

        phones = []
        for p in PHONE_RE.findall(bloco):
            np = normalize_phone(p)
            if np:
                phones.append(np)
        phones = sorted(set(phones))

        results.append({
            "unidade": unidade,
            "Nome": nome,
            "Telefone": phones,
            "Email": emails,
        })

    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
