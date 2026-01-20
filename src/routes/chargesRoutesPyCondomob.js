const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");

const router = express.Router();const upload = multer({ dest: "uploads/" });


const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UNIT_RE = /\b(B\d{2}AP\d{3})\b/g; // apartamentos desse PDF
const PHONE_RE = /(?:\(\d{2}\)\s*)?\d{4,5}[-\s]?\d{4}|\b\d{10,13}\b/g;

function normalizePhone(raw) {
  const s = String(raw || "").replace(/\D+/g, "");
  if (!s) return null;

  if ((s.length === 12 || s.length === 13) && s.startsWith("55")) return `+${s}`;
  if (s.length === 11) return `+55${s}`;
  if (s.length === 10) return `+55${s}`;
  if (s.length === 8 || s.length === 9) return s;

  return null;
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function parseCondomobApartamentos(text) {
  // “achatando” espaços ajuda demais no Condomob
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00a0/g, " ");

  // quebra por unidades: pega a posição de cada ocorrência e corta em blocos
  const matches = [...t.matchAll(UNIT_RE)];
  if (!matches.length) return [];

  const blocks = matches.map((m, idx) => {
    const start = m.index;
    const end = idx < matches.length - 1 ? matches[idx + 1].index : t.length;
    return { unidade: m[1], chunk: t.slice(start, end) };
  });

  const results = [];

  for (const b of blocks) {
    // pega trecho do proprietário até “Pagador:” (ou até “Tipo” se não tiver)
    const ownerMatch = b.chunk.match(/Propriet[aá]rio:\s*([\s\S]*?)(?=\bPagador:\b|\bTipo\b)/i);
    if (!ownerMatch) continue;

    // corta antes de “Inquilino:” se existir
    let ownerPart = ownerMatch[1];
    ownerPart = ownerPart.split(/Inquilino:/i)[0].trim();

    // remove (CPF/CNPJ) no fim
    const nome = ownerPart.replace(/\(\s*[\d./-]+\s*\)\s*$/g, "").trim();

    // contatos: pega do bloco inteiro (porque às vezes o e-mail tá na linha de cima)
    const emails = uniq(b.chunk.match(EMAIL_RE) || []);

    const phonesRaw = b.chunk.match(PHONE_RE) || [];
    const phones = uniq(phonesRaw.map(normalizePhone));

    results.push({
      unidade: b.unidade,
      Nome: nome,
      Telefone: phones,
      Email: emails,
    });
  }

  return results;
}

router.post("/analisar", upload.single("pdf"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      erro: 'Envie 1 PDF via multipart: campo "pdf".',
    });
  }

  try {
    const buf = fs.readFileSync(file.path);
    const parsed = await pdfParse(buf);

    const data = parseCondomobApartamentos(parsed.text);

    return res.json(data); // retorna só o array, igual você curte
  } catch (e) {
    return res.status(500).json({ erro: "Falha ao extrair", detalhes: e.message });
  } finally {
    try { fs.unlinkSync(file.path); } catch {}
  }
});

module.exports = router;
