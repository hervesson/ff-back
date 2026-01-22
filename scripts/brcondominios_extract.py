#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import json
import sys
import fitz  # PyMuPDF

# ------------------ leitura PDF ------------------
def pdf_text(path: str) -> str:
    doc = fitz.open(path)
    parts = []
    for p in doc:
        parts.append(p.get_text("text"))
    doc.close()
    t = "\n".join(parts)
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return t

# ------------------ helpers ------------------
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)

def uniq(xs):
    seen = set()
    out = []
    for x in xs or []:
        x = (x or "").strip()
        if not x or x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out

def normalize_unidade(u: str) -> str:
    s = (u or "").upper().strip()
    s = s.replace("\u00A0", " ")
    s = re.sub(r"[ \t]+", " ", s).strip()

    # padroniza: BL I 05 (zero opcional)
    # mantém 05 como 05 (pq no PDF aparece 05), mas se vier "5", vira "05"
    m = re.match(r"^(BL)\s+([A-ZIVX]+)\s+(\d{1,3})\b", s)
    if m:
        bl, bloco, num = m.group(1), m.group(2), m.group(3)
        if len(num) == 1:
            num = "0" + num
        return f"{bl} {bloco} {num}"

    return s

def normalize_phone(raw: str):
    raw_str = (raw or "").strip()
    digits = re.sub(r"\D+", "", raw_str)
    if not digits:
        return None

    # 55 + ddd + num
    if len(digits) in (12, 13) and digits.startswith("55"):
        rest = digits[2:]
        if len(rest) in (10, 11):
            return f"+{digits}"
        return None

    # BR com DDD
    if len(digits) == 11:
        return f"+55{digits}"
    if len(digits) == 10:
        return f"+55{digits}"

    # sem DDD (8/9)
    if len(digits) == 9 and digits.startswith("9"):
        return digits
    if len(digits) == 8 and digits[0] in "2345":
        return digits

    return None

# ------------------ PARSER: DÉBITOS ------------------
# No PDF de débitos as linhas começam com: "BL I 05 ..." / "BL I 106 ..."
DEBITO_UNIT_LINE_RE = re.compile(r"(?m)^\s*(BL)\s+([A-ZIVX]+)\s+(\d{1,3})\b")

def parse_inadimplentes_debitos(text: str):
    t = (text or "").replace("\f", "\n")
    s = set()
    for m in DEBITO_UNIT_LINE_RE.finditer(t.upper()):
        unidade = normalize_unidade(f"{m.group(1)} {m.group(2)} {m.group(3)}")
        s.add(unidade)
    return s

# ------------------ PARSER: CONTATOS (Unidades Expandidas) ------------------
UNIT_SPLIT_RE = re.compile(r"(?m)^\s*Unidade:\s*", re.I)

def extract_unit_name(unit_block: str) -> str:
    # primeira linha do bloco: "BL I 01 Local: ..."
    first = unit_block.splitlines()[0] if unit_block else ""
    m = re.search(r"^\s*(.*?)\s+\bLocal:\b", first, flags=re.I)
    base = (m.group(1) if m else first).strip()
    # pega só o que parece unidade "BL I 01"
    mm = re.search(r"\bBL\s+[A-ZIVX]+\s+\d{1,3}\b", base.upper())
    if mm:
        return normalize_unidade(mm.group(0))
    return normalize_unidade(base)

def split_people(unit_block: str):
    parts = re.split(r"(?im)^\s*Pessoa:\s*", unit_block)
    return ["Pessoa: " + p.strip() for p in parts[1:] if p.strip()]

TP_RE = re.compile(r"(?im)\bTp\.?\s*Pessoa:\s*([^\n\r]+)")
NAME_LINE_RE = re.compile(r"(?im)^\s*Pessoa:\s*(.+?)\s*$")

# Só captura telefones de campos específicos (evita RG, códigos etc.)
PHONE_FIELDS_RE = re.compile(r"(?im)^\s*(Telefone|Celular|Contato|Whats|Comercial)\s*:\s*(.*?)\s*$")
EMAIL_FIELD_RE  = re.compile(r"(?im)\bEmail\s*:\s*([^\s]+)")

def parse_person(pb: str):
    # nome
    nome = ""
    mname = NAME_LINE_RE.search(pb)
    if mname:
        nome = mname.group(1).strip()

    # tipo
    tipo = ""
    mt = TP_RE.search(pb)
    if mt:
        tipo = mt.group(1).strip()

    # emails (prioriza campo Email:)
    emails = []
    for em in EMAIL_FIELD_RE.findall(pb):
        emails.append(em.strip())
    if not emails:
        emails = EMAIL_RE.findall(pb)
    emails = uniq([e.lower() for e in emails])

    # phones apenas dos campos
    phones = []
    for _label, val in PHONE_FIELDS_RE.findall(pb):
        # pode vir: "(98)98839-0999", "98 99224 1322", "85991506179", "99104 - 2929"
        chunks = re.split(r"[;,/]| e |\s{2,}", val)
        for c in chunks:
            p = normalize_phone(c)
            if p:
                phones.append(p)
    phones = uniq(phones)

    return nome, tipo, phones, emails

def is_owner(tipo: str) -> bool:
    t = (tipo or "").upper()
    # aceita Proprietário e Proprietário/Ocupant
    return "PROPRIET" in t

def parse_contatos_unidades(text: str):
    t = (text or "").replace("\f", "\n")
    chunks = UNIT_SPLIT_RE.split(t)
    unit_blocks = [c.strip() for c in chunks[1:] if c.strip()]

    contatos = []
    for ub in unit_blocks:
        unidade = extract_unit_name(ub)
        for pb in split_people(ub):
            nome, tipo, phones, emails = parse_person(pb)

            # aqui: só Proprietário (igual tua regra padrão)
            if not is_owner(tipo):
                continue

            if not (nome or phones or emails):
                continue

            contatos.append({
                "unidade": unidade,
                "Nome": nome.title() if nome else "",
                "Telefone": phones,
                "Email": emails
            })

    return contatos

# ------------------ main ------------------
def main():
    if len(sys.argv) < 3:
        print(json.dumps({"erro": "Uso: python3 brcondominio_extract.py contatos.pdf debitos.pdf"}, ensure_ascii=False))
        sys.exit(2)

    contatos_path = sys.argv[1]
    debitos_path  = sys.argv[2]

    cont_text = pdf_text(contatos_path)
    deb_text  = pdf_text(debitos_path)

    if len(cont_text.strip()) < 50 or len(deb_text.strip()) < 50:
        print(json.dumps({
            "erro": "PDF parece ser imagem/scan (texto vazio). Precisa OCR/vision.",
            "debug": {"cont_text_len": len(cont_text), "deb_text_len": len(deb_text)}
        }, ensure_ascii=False))
        sys.exit(0)

    cont_layout = "BR_UNIDADES_EXPANDIDAS"
    inad_layout = "BR_LISTA_DEBITOS"

    contatos = parse_contatos_unidades(cont_text)
    inad_set = parse_inadimplentes_debitos(deb_text)

    # match por unidade
    data = [c for c in contatos if normalize_unidade(c.get("unidade")) in inad_set]

    out = {
        "layouts": {"contatos": cont_layout, "inadimplentes": inad_layout},
        "totais": {
            "contatos_extraidos": len(contatos),
            "inad_unicos": len(inad_set),
            "match": len(data)
        },
        "data": data
    }

    print(json.dumps(out, ensure_ascii=False))

if __name__ == "__main__":
    main()
