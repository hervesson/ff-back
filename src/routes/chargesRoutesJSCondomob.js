const express = require("express");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * REGEX / HELPERS
 */

// emails
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// unidades tipo "Q02-LT08", "Q15-LT38" (Condomínio de lotes)
const UNIT_LOTE_RE = /\b(Q\d{2}-LT\d{1,4})\b/g;
// unidades
const UNIT_AP_RE = /\b(B\d{2}AP\d{3})\b/gi;     // Condomob apartamentos
const UNIT_CASA_RE = /\b(CASA-\d{1,5})\b/gi;    // Condomob casas
// unidades tipo "1-102", "2-301" (Veredas)
const UNIT_VEREDAS_RE = /\b(\d{1,2}-\d{2,4})\b/g;


// Telefones: capturamos formas comuns + "só dígitos" 10/11.
// A validação forte fica no normalizePhone (pra não pegar "Doc/Número" da tabela).
const PHONE_CANDIDATE_RE =
  /(?:\(\d{2}\)\s*)?\d{4,5}[-\s]?\d{4}|\b\d{10,11}\b|\b\d{8,9}\b/g;

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function normalizePhone(raw) {
  const rawStr = String(raw || "").trim();
  const digits = rawStr.replace(/\D+/g, "");
  if (!digits) return null;

  // com DDD (aceita mesmo sem máscara)
  if (digits.length === 11) return `+55${digits}`; // DD + 9xxxx xxxx
  if (digits.length === 10) return `+55${digits}`; // DD + xxxx xxxx

  // sem DDD: só aceitaria se tivesse máscara, mas como o regex não pega mais 8/9 “solto”,
  // isso aqui fica só como proteção extra
  const hasMask = /[()\-\s]/.test(rawStr);
  if (!hasMask) return null;

  if (digits.length === 9 && digits.startsWith("9")) return digits;
  if (digits.length === 8 && ["2", "3", "4", "5"].includes(digits[0])) return digits;

  return null;
}


function cleanOwnerNameFromProprietarioBlock(blockText) {
  // blockText é o trecho logo após "Proprietário:"
  let s = String(blockText || "");

  // corta Inquilino se vier colado (não é o foco aqui)
  s = s.split(/Inquilino:/i)[0];

  // pega nome antes do CPF/CNPJ
  const m = s.match(/^(.*?)\s*\(\s*[\d./-]+\s*\)/);
  if (m) return m[1].replace(/\s{2,}/g, " ").trim();

  // fallback: antes de ; e remove contatos colados
  s = s.split(";")[0];
  s = s.replace(PHONE_CANDIDATE_RE, "").replace(EMAIL_RE, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * DETECTOR
 */
function detectCondomobLayout(text) {
  const t = String(text || "");

  // 1) LOTES primeiro (evita "CASA 11" do endereço)
  if (/\bQ\d{2}-LT\d{1,4}\b/i.test(t)) return "LOTE";

  // 2) Apartamento BxxAPxxx
  if (/\bB\d{2}AP\d{3}\b/i.test(t)) return "APARTAMENTO";

  // 3) Veredas / bloco-ap: "1-102", "2-301" etc
  if (/\b\d{1,2}-\d{2,4}\b/.test(t)) return "BLOCO_AP";

  // 4) CASA por âncora (início de linha / quebra de linha)
  //    evita pegar "CASA 11" dentro do endereço
  if (/(?:^|\n)\s*CASA[\s-]?\d{1,5}\b/i.test(t)) return "CASA";

  return "DESCONHECIDO";
}


/**
 * PARSER: APARTAMENTOS (o que ficou “lindo” pra você)
 * Estratégia: ordem relativa unidade[i] -> proprietário[i]
 */
function parseCondomobApartamentos(text) {
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  // Unidades na ordem
  const unidades = [...t.matchAll(/\b(B\d{2}AP\d{3})\b/g)].map(m => m[1].toUpperCase());

  // Blocos de proprietário na ordem (do "Proprietário:" até o próximo "Proprietário:" ou fim)
  const proprietarios = [...t.matchAll(/Propriet[aá]rio:\s*([\s\S]*?)(?=Propriet[aá]rio:|$)/gi)]
    .map(m => m[1]);

  const len = Math.min(unidades.length, proprietarios.length);
  const results = [];

  for (let i = 0; i < len; i++) {
    const unidade = unidades[i];
    const block = proprietarios[i];

    const nome = cleanOwnerNameFromProprietarioBlock(block);

    const emails = uniq((block.match(EMAIL_RE) || []).map(e => e.trim().toLowerCase()));

    const phones = uniq(
      (block.match(PHONE_CANDIDATE_RE) || [])
        .map(normalizePhone)
        .filter(Boolean)
    );

    results.push({
      unidade,
      Nome: nome,
      Telefone: phones,
      Email: emails,
    });
  }

  return results;
}

function parseCondomobLotes(text) {
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  // unidades na ordem
  const unidades = [...t.matchAll(UNIT_LOTE_RE)].map(m => m[1].toUpperCase());

  // pega SOMENTE o trecho do proprietário, parando antes da parte financeira
  // (Pagador / Tipo / Ordinária / Acordo / Inadimplência / Razao / página)
  const ownerChunks = [...t.matchAll(
    /Propriet[aá]rio:\s*([\s\S]*?)(?=\bPagador\b|\bTipo\b|\bOrdin[aá]ria\b|\bAcordo\b|\bInadimpl[eê]ncia\b|\bRazao\b|Inadimpl[eê]ncia\sP[aá]g\.|<PARSED TEXT FOR PAGE|$)/gi
  )].map(m => m[1]);

  const len = Math.min(unidades.length, ownerChunks.length);
  const results = [];

  for (let i = 0; i < len; i++) {
    const unidade = unidades[i];
    const ownerPart = ownerChunks[i];

    const nome = cleanOwnerNameFromProprietarioBlock(ownerPart);

    const emails = uniq((ownerPart.match(EMAIL_RE) || []).map(e => e.trim().toLowerCase()));

    const phones = uniq(
      (ownerPart.match(PHONE_CANDIDATE_RE) || [])
        .map(normalizePhone)
        .filter(Boolean)
    );

    results.push({
      unidade,
      Nome: nome,
      Telefone: phones,
      Email: emails,
    });
  }

  return results;
}

/**
 * PARSER: CASAS
 * No PDF de casas, o padrão também é "CASA-xx" seguido de "Proprietário:" :contentReference[oaicite:3]{index=3}
 * Aqui dá pra usar a MESMA estratégia de ordem relativa, só trocando os regex.
 */
function parseCondomobCasas(text) {
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  // Unidades na ordem: CASA-21 ou CASA 21 -> normaliza pra CASA-21
  const unidades = [...t.matchAll(/\b(CASA)[\s-]?(\d{1,5})\b/gi)]
    .map(m => `CASA-${m[2]}`);

  // Blocos de proprietário na ordem (igual apartamentos)
  const proprietarios = [...t.matchAll(/Propriet[aá]rio:\s*([\s\S]*?)(?=Propriet[aá]rio:|$)/gi)]
    .map(m => m[1]);

  const len = Math.min(unidades.length, proprietarios.length);
  const results = [];

  for (let i = 0; i < len; i++) {
    const unidade = unidades[i];
    const block = proprietarios[i];

    const nome = cleanOwnerNameFromProprietarioBlock(block);

    const emails = uniq((block.match(EMAIL_RE) || []).map(e => e.trim().toLowerCase()));

    const phones = uniq(
      (block.match(PHONE_CANDIDATE_RE) || [])
        .map(normalizePhone)
        .filter(Boolean)
    );

    results.push({
      unidade,
      Nome: nome,
      Telefone: phones,
      Email: emails,
    });
  }

  return results;
}

function parseCondomobBlocoAp(text) {
  const t = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  // unidades na ordem: 1-102, 3-401...
  const unidades = [...t.matchAll(/\b(\d{1,2}-\d{2,4})\b/g)].map(m => m[1]);

  // pega SOMENTE o trecho do proprietário, parando antes da parte financeira
  // (Pagador / Tipo / Ordinária / Acordo / Inadimplência / Razao Condominial / página)
  const ownerChunks = [...t.matchAll(
    /Propriet[aá]rio:\s*([\s\S]*?)(?=\bPagador\b|\bTipo\b|\bOrdin[aá]ria\b|\bAcordo\b|\bInadimpl[eê]ncia\b|\bRazao\b|Inadimpl[eê]ncia\sP[aá]g\.|<PARSED TEXT FOR PAGE|$)/gi
  )].map(m => m[1]);

  const len = Math.min(unidades.length, ownerChunks.length);
  const results = [];

  for (let i = 0; i < len; i++) {
    const unidade = unidades[i];
    const ownerPart = ownerChunks[i];

    // nome limpo
    const nome = cleanOwnerNameFromProprietarioBlock(ownerPart);

    // contatos SÓ do trecho do proprietário (não pega tabela!)
    const emails = uniq((ownerPart.match(EMAIL_RE) || []).map(e => e.trim().toLowerCase()));

    const phones = uniq(
      (ownerPart.match(PHONE_CANDIDATE_RE) || [])
        .map(normalizePhone)
        .filter(Boolean)
    );

    results.push({
      unidade,
      Nome: nome,
      Telefone: phones,
      Email: emails,
    });
  }

  return results;
}



/**
 * Wrapper no seu formato padrão
 */
function buildResponse(layout, data) {
  const out = {
    layouts: { contatos: layout, inadimplentes: layout },
    totais: {
      contatos_extraidos: data.length,
      inad_unicos: data.length,
      match: data.length,
    },
    data,
  };
  return out;
}

/**
 * ROTA ÚNICA: aceita qualquer PDF Condomob e escolhe o parser
 */
router.post("/analisar", upload.single("pdf"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      erro: 'Envie 1 PDF via multipart: campo "pdf".',
    });
  }

  try {
    const buffer = fs.readFileSync(file.path);
    const parsed = await pdfParse(buffer);

    const layout = detectCondomobLayout(parsed.text);

    let data = [];
    if (layout === "APARTAMENTO") data = parseCondomobApartamentos(parsed.text);
    else if (layout === "CASA") data = parseCondomobCasas(parsed.text);
    else if (layout === "BLOCO_AP") data = parseCondomobBlocoAp(parsed.text);
    else if (layout === "LOTE") data = parseCondomobLotes(parsed.text);
    else {
      return res.status(422).json({
        erro: "PDF Condomob não reconhecido ainda",
        detalhes: "Não encontrei padrões conhecidos.",
      });
    }


    return res.json(buildResponse(layout, data));

  } catch (e) {
    return res.status(500).json({
      erro: "Falha ao extrair",
      detalhes: e.message,
    });
  } finally {
    try { fs.unlinkSync(file.path); } catch { }
  }
});

module.exports = router;
