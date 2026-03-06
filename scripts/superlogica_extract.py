import re
import json
import sys
from typing import List, Dict, Set
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


# ------------------ normalização unidade ------------------
def norm_space(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("\u00A0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def normalize_unidade(u: str) -> str:
    s = norm_space(u).upper()
    s = re.sub(r"[.,;:/\\|]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    s = (
        s.replace("APARTAMENTO", "AP")
         .replace("APTO", "AP")
         .replace("BLOCO", "BL")
         .replace("QUADRA", "QD")
         .replace("LOTE", "LT")
    )

    s = re.sub(r"\bBL\s*0*(\d+)\b", r"BL \1", s)
    s = re.sub(r"\bQD\s*0*([A-Z0-9]+)\b", r"QD \1", s)
    s = re.sub(r"\bLT\s*0*([0-9]+[A-Z]?)\b", r"LT \1", s)
    s = re.sub(r"\bCASA\s*0*(\d+)\b", r"CASA \1", s)

    # 4-102 -> AP 102 BL 4
    s = re.sub(r"\b0*(\d+)\s*-\s*0*(\d+)\b", r"AP \2 BL \1", s)

    # BL 1 AP 102 -> AP 102 BL 1
    s = re.sub(r"\bBL\s+0*(\d+)\s+AP\s+0*(\d+)\b", r"AP \2 BL \1", s)

    # AP 001 -> AP 1
    s = re.sub(r"\bAP\s*0*(\d+)\b", r"AP \1", s)

    # 104BL01 ou 104 BL01 -> AP 104 BL 1
    s = re.sub(r"^\s*0*(\d{1,5})\s*BL\s*0*(\d{1,3})\b", r"AP \1 BL \2", s)

    # LT 5 QUADRA A -> QD A LT 5
    s = re.sub(r"\bLT\s*0*([0-9]+[A-Z]?)\s+(?:QUADRA|QD)\s*([A-Z0-9]+)\b", r"QD \2 LT \1", s)

    s = re.sub(r"\s+", " ", s).strip()
    return s


# ------------------ detecção de layout ------------------
def detect_layout(text: str) -> str:
    t = (text or "").upper()

    c_apbl_nrot_dash = len(re.findall(r"(?m)^\s*0*(\d{1,5})\s+0*(\d{1,3})\s*-\s*[A-ZÀ-Ü]", t))
    c_apbl_nrot = len(re.findall(r"(?m)^\s*0*(\d{1,5})\s+0*(\d{1,3})\s+[A-ZÀ-Ü]", t))
    c_apbl_num_bl = len(re.findall(r"(?m)^\s*0*(\d{1,5})\s+BL\s*0*(\d{1,3})\b", t))
    c_apbl_rot_strict = len(re.findall(r"\bAP\s*0*\d+\s+BL\s*0*\d+\b", t))

    c_ap_sem_bl_dash = len(re.findall(r"(?m)^\s*0*(\d{4})\s*-\s*[A-ZÀ-Ü]", t))
    c_ap_sem_bl_line = len(re.findall(r"(?m)^\s*0*(\d{4})\s*(?=(?:-|[A-ZÀ-Ü]))", t))

    c_casa_any = len(re.findall(r"\bCASA\s*0*\d+\b", t))
    c_lote = len(re.findall(r"\b(LT|LOTE)\s+\d+\b", t))

    if c_casa_any >= 3:
        if "QUADRA" in t or re.search(r"\bQD\s+[A-Z0-9]+\b", t):
            return "CASA_QD"
        return "CASA"

    if c_ap_sem_bl_dash >= 5:
        return "AP_SEM_BLOCO"

    if (c_apbl_nrot_dash + c_apbl_nrot) >= 5:
        return "APBL_NAO_ROTULADO"

    if c_apbl_num_bl >= 5:
        return "APBL_NUM_BL"

    if re.search(r"(?m)^\s*LOTE\b", t):
        if "QUADRA" in t or re.search(r"\bQD\s*[A-Z0-9]+\b", t):
            return "QD_LT"
        return "LT"

    if c_ap_sem_bl_line >= 8:
        return "AP_SEM_BLOCO"

    c_ap_bloco_palavra = len(re.findall(r"(?m)^\s*0*\d{1,5}\s+BLOCO\s*0*\d{1,3}\b", t))
    if c_ap_bloco_palavra >= 5:
        return "AP_BLOCO_PALAVRA"

    if c_apbl_rot_strict >= 3 or ("BLOCO" in t and "AP" in t):
        return "APBL_ROTULADO"

    if c_lote >= 3:
        if "QUADRA" in t or re.search(r"\bQD\s+[A-Z0-9]+\b", t):
            return "QD_LT"
        return "LT"

    return "DESCONHECIDO"


# ------------------ utilitários de contato ------------------
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)


def extract_emails(s: str) -> List[str]:
    return EMAIL_RE.findall(s or "")


PHONE_RE = re.compile(
    r"""
    (?<!\d)
    (?:\+?55\s*)?
    (?:\(?\d{2}\)?\s*)?
    (?:9\s*)?\d{4}[-\s]?\d{4}
    (?!\d)
    """,
    re.VERBOSE
)


def clean_phone(p: str) -> str:
    p = (p or "").upper()
    p = p.replace("PROPRIETARIO", "").replace("PROPRIETÁRIO", "")
    p = re.sub(r"[^0-9()+\- ]+", " ", p)
    p = re.sub(r"\s+", " ", p).strip()
    return p


def extract_phones(s: str) -> List[str]:
    s = (s or "").replace("\n", " ")
    matches = PHONE_RE.findall(s)
    cleaned = [clean_phone(m) for m in matches]

    out = []
    seen = set()
    for p in cleaned:
        digits = re.sub(r"\D", "", p)
        if len(digits) == 14:
            continue
        if len(digits) < 8:
            continue
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def dedupe_list(xs: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in xs:
        x = (x or "").strip()
        if not x:
            continue
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


# ------------------ força quebras (pra PDF colado) ------------------
def force_breaks_apbl_sem_rotulo(text: str) -> str:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    t = re.sub(
        r"(^|[^\d])0*(\d{1,5})\s+0*(\d{1,3})\s+([A-ZÀ-Ü])",
        lambda m: f"{m.group(1)}\n{m.group(2)} {m.group(3)} {m.group(4)}",
        t,
        flags=re.I
    )
    t = re.sub(
        r"(^|[^\d])0*(\d{1,5})\s+0*(\d{1,3})\s*-\s*",
        lambda m: f"{m.group(1)}\n{m.group(2)} {m.group(3)} - ",
        t,
        flags=re.I
    )
    return t


# ------------------ parsers ------------------
def parse_contatos_apbl_sem_rotulo(text: str) -> List[Dict]:
    t = force_breaks_apbl_sem_rotulo(text).upper()
    block_re = re.compile(
        r"^0*(\d{1,5})\s+0*(\d{1,3})\s+(.+?)(?=^\s*0*\d{1,5}\s+0*\d{1,3}\s+|\Z)",
        re.M | re.S
    )

    out = []
    for ap, bl, body in block_re.findall(t):
        unidade = f"AP {int(ap)} BL {int(bl)}"
        first_line = (body.split("\n")[0] or "").strip()
        nome = re.sub(r"\bPROPRIET[ÁA]RIO\b", "", first_line, flags=re.I).strip()

        out.append({
            "unidade": normalize_unidade(unidade),
            "Nome": nome.title(),
            "Telefone": dedupe_list(extract_phones(body)),
            "Email": dedupe_list(extract_emails(body)),
        })
    return out


def parse_contatos_ap_bloco_palavra(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    out = []
    re_unit = re.compile(r"^\s*0*(\d{1,5})\s+BLOCO\s*0*(\d{1,3})\s*$", re.I)
    cur = None

    def flush():
        nonlocal cur
        if not cur:
            return
        cur["Telefone"] = dedupe_list(cur["Telefone"])
        cur["Email"] = dedupe_list(cur["Email"])
        out.append(cur)
        cur = None

    for line in lines:
        up = line.upper().strip()

        if "CONTATOS DAS UNIDADES" in up or "TIPO DO CONTATO" in up:
            continue
        if up.startswith("UNIDADE") or "NOME/TELEFONE" in up:
            continue
        if up.startswith("W0") and "CONDOMINIO" in up:
            continue
        if up.startswith("TOTAL DE CONTATOS"):
            break

        m = re_unit.match(line)
        if m:
            flush()
            ap = int(m.group(1))
            bl = int(m.group(2))
            cur = {
                "unidade": normalize_unidade(f"AP {ap} BL {bl}"),
                "Nome": "",
                "Telefone": [],
                "Email": [],
            }
            continue

        if not cur:
            continue

        if up in ("PROPRIETÁRIO", "PROPRIETARIO"):
            flush()
            continue

        if not cur["Nome"]:
            cur["Nome"] = line.title().strip()
            continue

        cur["Email"].extend(extract_emails(line))
        cur["Telefone"].extend(extract_phones(line))

        for d in re.findall(r"\b\d{8,9}\b", line):
            if len(d) == 9 and d.startswith("9"):
                cur["Telefone"].append(d)
            elif len(d) == 8 and d[0] in "2345":
                cur["Telefone"].append(d)

    flush()
    return out


def parse_contatos_casa_lines(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    out = []
    cur = None
    re_start = re.compile(r"^\s*CASA\s*0*(\d+)\b\s*(.*)$", re.I)

    def is_probably_name(s: str) -> bool:
        up = (s or "").upper().strip()
        if not up:
            return False
        if up in ("PROPRIETÁRIO", "PROPRIETARIO", "INQUILINO", "SÍNDICO", "SINDICO"):
            return False
        if "CONTATOS DAS UNIDADES" in up or "NOME/TELEFONE" in up or up.startswith("UNIDADE"):
            return False
        if up.startswith("STATUS DA UNIDADE"):
            return False
        if up.startswith("TOTAL DE CONTATOS"):
            return False
        if re.fullmatch(r"\d{8,14}", re.sub(r"\D", "", s or "")):
            return False
        if extract_phones(s) or extract_emails(s):
            return False
        return bool(re.search(r"[A-ZÀ-Ü]", up))

    def flush():
        nonlocal cur
        if not cur:
            return
        cur["Telefone"] = dedupe_list(cur["Telefone"])
        cur["Email"] = dedupe_list(cur["Email"])
        out.append(cur)
        cur = None

    for line in lines:
        up = line.upper().strip()

        if up.startswith("TOTAL DE CONTATOS"):
            break
        if "MOURA CONDOM" in up or "ATENDIMENTO@" in up:
            continue

        m = re_start.match(line)
        if m:
            flush()
            casa_n = int(m.group(1))
            rest = (m.group(2) or "").strip()
            rest = rest.lstrip("-–— ").strip()
            rest = re.sub(r"\bPROPRIET[ÁA]RIO\b", "", rest, flags=re.I).strip()

            cur = {
                "unidade": normalize_unidade(f"CASA {casa_n}"),
                "Nome": (rest.title() if rest else ""),
                "Telefone": [],
                "Email": [],
            }

            cur["Telefone"].extend(extract_phones(line))
            cur["Email"].extend(extract_emails(line))
            continue

        if not cur:
            continue

        if not cur["Nome"] and is_probably_name(line):
            cur["Nome"] = line.title().strip()
            continue

        if up in ("PROPRIETÁRIO", "PROPRIETARIO", "INQUILINO", "SÍNDICO", "SINDICO"):
            continue

        cur["Telefone"].extend(extract_phones(line))
        cur["Email"].extend(extract_emails(line))

        for d in re.findall(r"\b\d{8,9}\b", line):
            if len(d) == 9 and d.startswith("9"):
                cur["Telefone"].append(d)
            elif len(d) == 8 and d[0] in "2345":
                cur["Telefone"].append(d)

    flush()
    return out


def parse_contatos_casa_qd_lines(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    out = []
    cur = None

    re_casa = re.compile(r"^\s*CASA\s*0*(\d+)\s*$", re.I)
    re_qd = re.compile(r"^\s*(?:QUADRA|QD)\s*0*([A-Z0-9]+)\s*$", re.I)

    def is_probably_name(s: str) -> bool:
        up = (s or "").upper().strip()
        if not up:
            return False
        if up in ("PROPRIETÁRIO", "PROPRIETARIO", "INQUILINO", "SÍNDICO", "SINDICO"):
            return False
        if "CONTATOS DAS UNIDADES" in up or "NOME/TELEFONE" in up or up.startswith("UNIDADE"):
            return False
        if up.startswith("STATUS DA UNIDADE"):
            return False
        if up.startswith("TOTAL DE CONTATOS"):
            return False
        if re.fullmatch(r"\d{8,14}", re.sub(r"\D", "", s or "")):
            return False
        if extract_phones(s) or extract_emails(s):
            return False
        return bool(re.search(r"[A-ZÀ-Ü]", up))

    def flush():
        nonlocal cur
        if not cur:
            return
        cur["Telefone"] = dedupe_list(cur["Telefone"])
        cur["Email"] = dedupe_list(cur["Email"])
        out.append(cur)
        cur = None

    for line in lines:
        up = line.upper().strip()

        if up.startswith("TOTAL DE CONTATOS"):
            break
        if "CONTATOS DAS UNIDADES" in up or "TIPO DO CONTATO" in up:
            continue
        if up.startswith("UNIDADE") or "NOME/TELEFONE" in up:
            continue
        if "MOURA CONDOM" in up or "ATENDIMENTO@" in up:
            continue
        if "UTTIL ADMINISTRAÇÃO" in up:
            continue

        m_casa = re_casa.match(line)
        if m_casa:
            flush()
            casa_n = int(m_casa.group(1))
            cur = {
                "unidade": normalize_unidade(f"CASA {casa_n}"),
                "Nome": "",
                "Telefone": [],
                "Email": [],
            }
            continue

        if not cur:
            continue

        m_qd = re_qd.match(line)
        if m_qd:
            qd = m_qd.group(1)
            cur["unidade"] = normalize_unidade(f'{cur["unidade"]} QD {qd}')
            continue

        if up in ("PROPRIETÁRIO", "PROPRIETARIO", "INQUILINO", "SÍNDICO", "SINDICO"):
            continue

        if not cur["Nome"] and is_probably_name(line):
            cur["Nome"] = line.title().strip()
            continue

        cur["Telefone"].extend(extract_phones(line))
        cur["Email"].extend(extract_emails(line))

        for d in re.findall(r"\b\d{8,9}\b", line):
            if len(d) == 9 and d.startswith("9"):
                cur["Telefone"].append(d)
            elif len(d) == 8 and d[0] in "2345":
                cur["Telefone"].append(d)

    flush()
    return out


def parse_contatos_rotulado(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = re.sub(r"[ \t]+", " ", t)
    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    out = []
    cur = None

    unit_re = re.compile(r"\b(AP\s*\d+)\s+(BL\s*\d+)\b", re.I)

    def flush():
        nonlocal cur
        if not cur:
            return
        cur["Telefone"] = dedupe_list(cur["Telefone"])
        cur["Email"] = dedupe_list(cur["Email"])
        out.append(cur)
        cur = None

    for line in lines:
        m = unit_re.search(line)
        if m:
            flush()
            unidade = normalize_unidade(f"{m.group(1)} {m.group(2)}")
            nome = unit_re.sub("", line).strip(" -–—:").strip()
            cur = {"unidade": unidade, "Nome": nome, "Telefone": [], "Email": []}
            continue

        if not cur:
            continue

        cur["Email"].extend(extract_emails(line))
        cur["Telefone"].extend(extract_phones(line))

    flush()
    return out


def parse_contatos_ap_sem_bloco(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    t = re.sub(r"(?m)^\s*(0*\d{4})\b", r"\n\1", t)
    t = re.sub(r"\n{2,}", "\n", t).strip()

    block_re = re.compile(
        r"(?m)^\s*(0*\d{4})\s*(.*?)(?=^\s*0*\d{4}\b|\Z)",
        re.S
    )

    out = []
    for raw_ap, body in block_re.findall(t):
        ap = int(raw_ap)
        unidade = normalize_unidade(f"AP {ap}")

        body_clean = (body or "").strip()
        lines = [norm_space(x) for x in body_clean.splitlines() if norm_space(x)]
        nome = ""
        if lines:
            nome = re.sub(r"\bPROPRIET[ÁA]RIO\b", "", lines[0], flags=re.I).strip()

        out.append({
            "unidade": unidade,
            "Nome": nome.title(),
            "Telefone": dedupe_list(extract_phones(body_clean)),
            "Email": dedupe_list(extract_emails(body_clean)),
        })

    return out


def parse_contatos_unit_in_line(text: str, unit_regex: re.Pattern, unit_builder) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = re.sub(r"[ \t]+", " ", t)
    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    out = []

    for line in lines:
        m = unit_regex.search(line)
        if not m:
            continue

        unidade = normalize_unidade(unit_builder(m))
        nome = unit_regex.sub("", line).strip(" -–—:").strip()

        out.append({
            "unidade": unidade,
            "Nome": nome,
            "Telefone": dedupe_list(extract_phones(line)),
            "Email": dedupe_list(extract_emails(line)),
        })

    return out


def parse_contatos_apbl_num_bl(text: str) -> List[Dict]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t)

    block_re = re.compile(
        r"(?m)^\s*0*(\d{1,5})\s+BL\s*0*(\d{1,3})\b\s*(.*?)(?=^\s*0*\d{1,5}\s+BL\s*0*\d{1,3}\b|\Z)",
        re.S
    )

    out = []
    for ap, bl, body in block_re.findall(t):
        unidade = normalize_unidade(f"AP {int(ap)} BL {int(bl)}")
        body_clean = (body or "").strip()
        lines = [norm_space(x) for x in body_clean.splitlines() if norm_space(x)]

        nome = ""
        for ln in lines:
            up = ln.upper()
            if "PROPRIET" in up:
                continue
            if extract_phones(ln) or extract_emails(ln):
                continue
            nome = ln
            break

        out.append({
            "unidade": unidade,
            "Nome": (nome or "").title(),
            "Telefone": dedupe_list(extract_phones(body_clean)),
            "Email": dedupe_list(extract_emails(body_clean)),
        })

    return out


# ------------------ inadimplência ------------------
def parse_inad_apbl_sem_rotulo(text: str) -> Set[str]:
    t = force_breaks_apbl_sem_rotulo(text).upper()
    re_line = re.compile(r"^0*(\d{1,5})\s+0*(\d{1,3})\s*-\s*", re.M)

    s = set()
    for ap, bl in re_line.findall(t):
        s.add(normalize_unidade(f"AP {int(ap)} BL {int(bl)}"))
    return s


def parse_inad_ap_bloco_palavra(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t).upper()

    s = set()
    for ap, bl in re.findall(r"(?m)^\s*0*(\d{1,5})\s+BLOCO\s*0*(\d{1,3})\s*-\s*", t):
        s.add(normalize_unidade(f"AP {int(ap)} BL {int(bl)}"))
    return s


def parse_inad_rotulado(text: str) -> Set[str]:
    t = (text or "").upper()
    s = set()

    for ap, bl in re.findall(r"(?:^|\n)\s*0*(\d{1,5})\s+BL\s*0*(\d{1,3})\s*-\s*", t):
        s.add(normalize_unidade(f"AP {int(ap)} BL {int(bl)}"))

    for bl, ap in re.findall(r"\b0*(\d+)\s*-\s*0*(\d+)\b", t):
        s.add(normalize_unidade(f"AP {int(ap)} BL {int(bl)}"))

    return s


def parse_inad_ap_sem_bloco(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n").upper()
    s = set()

    for ap in re.findall(r"(?m)^\s*0*(\d{4})\s*-\s*[A-ZÀ-Ü]", t):
        s.add(normalize_unidade(f"AP {int(ap)}"))

    if not s:
        for ap in re.findall(r"(?m)^\s*0*(\d{4})\s*(?=(?:-|[A-ZÀ-Ü]))", t):
            s.add(normalize_unidade(f"AP {int(ap)}"))

    return s


def parse_inad_lotes(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t).upper()

    s = set()

    for lt in re.findall(r"(?m)^\s*LOTE\s+0*([0-9]+[A-Z]?)\s*-\s*", t):
        s.add(normalize_unidade(f"LT {lt}"))

    for lt, qd in re.findall(r"(?m)^\s*LOTE\s+0*([0-9]+[A-Z]?)\s+(?:QUADRA|QD)\s*([A-Z0-9]+)\s*-\s*", t):
        s.add(normalize_unidade(f"LT {lt} QD {qd}"))

    return s


def parse_inad_casa(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n").upper()
    s = set()

    for n in re.findall(r"(?m)\bCASA\s*0*(\d+)\b", t):
        s.add(normalize_unidade(f"CASA {int(n)}"))

    return s


def parse_inad_casa_qd(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n")
    t = t.replace("\u00A0", " ")
    t = re.sub(r"[ \t]+", " ", t).upper()

    lines = [norm_space(x) for x in t.splitlines() if norm_space(x)]
    s = set()

    # 1) Caso venha tudo na mesma linha:
    # CASA 09 QUADRA 01 - FULANO
    for casa, qd in re.findall(
        r"\bCASA\s*0*(\d+)\s+(?:QUADRA|QD)\s*0*([A-Z0-9]+)\b",
        t,
        flags=re.I
    ):
        s.add(normalize_unidade(f"CASA {int(casa)} QD {qd}"))

    if s:
        return s

    # 2) Caso venha quebrado em linhas:
    # CASA 09
    # QUADRA 01
    casa_atual = None
    re_casa = re.compile(r"^\s*CASA\s*0*(\d+)\b", re.I)
    re_qd = re.compile(r"^\s*(?:QUADRA|QD)\s*0*([A-Z0-9]+)\b", re.I)

    for line in lines:
        m_casa = re_casa.match(line)
        if m_casa:
            casa_atual = int(m_casa.group(1))
            continue

        m_qd = re_qd.match(line)
        if m_qd and casa_atual is not None:
            qd = m_qd.group(1)
            s.add(normalize_unidade(f"CASA {casa_atual} QD {qd}"))
            casa_atual = None

    return s


def parse_inad_apbl_num_bl(text: str) -> Set[str]:
    t = (text or "").replace("\f", "\n").upper()
    s = set()

    for ap, bl in re.findall(r"(?:^|\n)\s*0*(\d{1,5})\s+BL\s*0*(\d{1,3})\s*-\s*", t):
        s.add(normalize_unidade(f"AP {int(ap)} BL {int(bl)}"))

    return s


# ------------------ router ------------------
def parse_contatos(layout: str, text: str) -> List[Dict]:
    if layout == "AP_BLOCO_PALAVRA":
        return parse_contatos_ap_bloco_palavra(text)
    if layout == "APBL_NAO_ROTULADO":
        return parse_contatos_apbl_sem_rotulo(text)
    if layout == "APBL_ROTULADO":
        return parse_contatos_rotulado(text)
    if layout == "AP_SEM_BLOCO":
        return parse_contatos_ap_sem_bloco(text)
    if layout == "APBL_NUM_BL":
        return parse_contatos_apbl_num_bl(text)
    if layout == "CASA":
        return parse_contatos_casa_lines(text)
    if layout == "CASA_QD":
        return parse_contatos_casa_qd_lines(text)
    if layout == "LT":
        return parse_contatos_unit_in_line(
            text,
            re.compile(r"\b(LT|LOTE)\s*0*\d+\b", re.I),
            lambda m: m.group(0).replace("LOTE", "LT")
        )
    if layout == "QD_LT":
        return parse_contatos_unit_in_line(
            text,
            re.compile(r"\bQD\s*[A-Z0-9]+\b.*?\b(LT|LOTE)\s*0*\d+\b", re.I),
            lambda m: m.group(0).replace("LOTE", "LT")
        )
    return []


def parse_inad(layout: str, text: str) -> Set[str]:
    if layout == "AP_BLOCO_PALAVRA":
        return parse_inad_ap_bloco_palavra(text)
    if layout == "APBL_NAO_ROTULADO":
        return parse_inad_apbl_sem_rotulo(text)
    if layout == "APBL_ROTULADO":
        return parse_inad_rotulado(text)
    if layout == "AP_SEM_BLOCO":
        return parse_inad_ap_sem_bloco(text)
    if layout == "APBL_NUM_BL":
        return parse_inad_apbl_num_bl(text)
    if layout == "CASA":
        return parse_inad_casa(text)
    if layout == "CASA_QD":
        return parse_inad_casa_qd(text)
    if layout in ("LT", "QD_LT"):
        return parse_inad_lotes(text)
    return set()


# ------------------ main ------------------
def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "erro": "Uso: python3 superlogica_extract.py contatos.pdf inadimplentes.pdf"
        }, ensure_ascii=False))
        sys.exit(2)

    contatos_path = sys.argv[1]
    inad_path = sys.argv[2]

    cont_text = pdf_text(contatos_path)
    inad_text = pdf_text(inad_path)

    if len(cont_text.strip()) < 50 or len(inad_text.strip()) < 50:
        print(json.dumps({
            "erro": "PDF parece ser imagem/scan (texto vazio). Precisa OCR/vision.",
            "debug": {
                "cont_text_len": len(cont_text),
                "inad_text_len": len(inad_text),
            }
        }, ensure_ascii=False))
        sys.exit(0)

    cont_layout = detect_layout(cont_text)
    inad_layout = detect_layout(inad_text)

    contatos = parse_contatos(cont_layout, cont_text)
    inad_set = parse_inad(inad_layout, inad_text)

    for c in contatos:
        c["unidade"] = normalize_unidade(c.get("unidade", ""))
        c["Telefone"] = dedupe_list(c.get("Telefone", []))
        c["Email"] = dedupe_list(c.get("Email", []))

    data = [c for c in contatos if c.get("unidade") in inad_set]

    out = {
        "layouts": {
            "contatos": cont_layout,
            "inadimplentes": inad_layout,
        },
        "totais": {
            "contatos_extraidos": len(contatos),
            "inad_unicos": len(inad_set),
            "match": len(data),
        },
        "data": data,
    }

    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()