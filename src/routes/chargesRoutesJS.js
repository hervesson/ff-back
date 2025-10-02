require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { PDFExtract } = require('pdf.js-extract');
const validator = require('validator');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

/* ============ Utils ============ */
function normWs(s) {
  return s
    .replace(/\u00A0/g, ' ')     // NBSP
    .replace(/\u200B/g, '')      // zero-width
    .replace(/\p{Cf}/gu, '')     // format/invisible
    .replace(/[ \t]{2,}/g, ' ')  // espaços repetidos
    .trim();
}

// Junta letras separadas: "C A S A" -> "CASA", "0 0 1" -> "001"
function unchunkCASA(s) {
  return s
    // cola sequências tipo "C A S A" ou "0 0 1"
    .replace(/\b(?:C\s*A\s*S\s*A)\b/ig, 'CASA')
    .replace(/\b(\d)\s+(\d)(?:\s+(\d))?\b/g, (_, a, b, c) => (a+(b||'')+(c||'')));
}

function hasCasa(line) {
  return /\bCASA\b/i.test(line);
}
function casaNumber(line) {
  const m = line.match(/\bCASA\s*0*(\d{1,4})\b/i);
  return m ? m[1].padStart(3, '0') : null;
}

function extractEmails(text) {
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const found = text.match(regex) || [];
  const cleaned = found.map(e => e.trim().toLowerCase()).filter(e => validator.isEmail(e));
  return Array.from(new Set(cleaned));
}

function extractPhonesRaw(text) {
  // Mantém o formato como no PDF (parênteses, espaços, hífens)
  const regex = /(?:\+\d{1,3}\s*)?(?:\(?\d{2}\)?\s*)?\d[\d\s().-]{7,}\d/g;
  const found = text.match(regex) || [];
  // tira pontuações sobrando nas pontas e espaços extras
  const cleaned = found.map(t => normWs(t.replace(/^[^\d+(]+|[^\d)]+$/g, '')));
  return Array.from(new Set(cleaned));
}

/* ===== Blocos por CASA e recorte do Proprietário =====
   Regras:
   - 'bloco' = da linha com "CASA NNN" até antes da próxima "CASA".
   - Nome = texto do cabeçalho da CASA depois de "CASA NNN" até o fim da linha OU até "Proprietário" se vier na mesma linha.
   - Emails/Telefones = coletar do(s) trecho(s) do bloco **associados ao Proprietário**:
       * Da linha que contém "Proprietário" inclusive até antes de um novo papel (Residente|Dependente|Esposa|Esposo|Filho|Filha etc.) ou até o fim do bloco.
   - Ignora linhas com outros papéis.
*/
const ROLE_OWNER = /Propriet[áa]rio/i;
const ROLE_OTHERS = /\b(Residente|Dependente|Esposa|Esposo|Filho|Filha|Conjug[eê]|Cônjuge)\b/i;

function splitBlocksByCasa(lines) {
  const blocks = [];
  let current = null;

  for (const raw of lines) {
    let line = normWs(unchunkCASA(raw));
    if (!line) continue;

    if (hasCasa(line)) {
      // inicia novo bloco
      if (current) blocks.push(current);
      current = { header: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function extractOwnerFromBlock(block) {
  // id da casa
  const unidade = casaNumber(block.header);
  if (!unidade) return null;

  // Nome: do header, tirando o prefixo "CASA NNN" e eventual palavra "Proprietário ..." que às vezes vem colada
  let headerAfterCasa = block.header.replace(/.*?\bCASA\s*\d+\b/i, '').trim();
  headerAfterCasa = headerAfterCasa.replace(ROLE_OWNER, '').trim();
  // Remove e-mails/telefones que por acaso estejam no header para o nome ficar limpo
  headerAfterCasa = headerAfterCasa
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/(?:\+\d{1,3}\s*)?(?:\(?\d{2}\)?\s*)?\d[\d\s().-]{7,}\d/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const nome = headerAfterCasa || null;

  // Junta linhas do bloco que pertencem ao Proprietário
  // Estratégia:
  //   - encontre a primeira posição onde aparece "Proprietário"
  //   - a partir dali, consome linhas até bater em um papel diferente (ROLE_OTHERS) ou fim do bloco
  let ownerSegments = [];
  let ownerMode = false;

  const searchLines = [block.header, ...block.lines]; // inclui header, pois às vezes tem "Proprietário" nele
  for (const line of searchLines) {
    if (!ownerMode) {
      if (ROLE_OWNER.test(line)) {
        ownerMode = true;
        ownerSegments.push(line);
      }
    } else {
      if (ROLE_OTHERS.test(line) || hasCasa(line)) {
        // acabou a área do proprietário
        break;
      }
      ownerSegments.push(line);
    }
  }

  // Se não achou 'Proprietário', ainda assim tente e-mails/telefones do header (alguns casos trazem tudo no header)
  let ownerText = ownerSegments.join(' \n ');
  if (!ownerText && block.header) ownerText = block.header;

  const emails = extractEmails(ownerText);
  const telefones = extractPhonesRaw(ownerText);

  // Se não tem Proprietário explícito mas tem nome+email/telefone no header, ainda retornamos (pois o cabeçalho costuma ser do titular)
  if (emails.length === 0 && telefones.length === 0 && !ROLE_OWNER.test(block.header)) {
    // nada útil para o proprietário -> descarta
    return { unidade, nome: nome || null, emails: [], telefones: [] };
  }

  return { unidade, nome: nome || null, emails, telefones };
}

/* ============ Extratores ============ */
async function extractWithPdfParse(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parsed = await pdfParse(buffer);
  const rawLines = (parsed.text || '').split(/\r?\n/).map(normWs).filter(Boolean);
  return rawLines;
}

async function extractWithPdfJsExtract(filePath) {
  const pdfExtract = new PDFExtract();
  const data = await new Promise((resolve, reject) => {
    pdfExtract.extract(filePath, {}, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // agrega por Y (+ tolerância) e recompõe linhas
  const lines = [];
  for (const page of data.pages) {
    const rows = [];
    for (const it of page.content) {
      if (!it.str || typeof it.y !== 'number') continue;
      const y = it.y, x = it.x;
      let row = rows.find(r => Math.abs(r.y - y) <= 2.5);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, str: it.str });
    }
    rows.sort((a, b) => a.y - b.y);
    for (const r of rows) {
      const line = r.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(' ');
      lines.push(normWs(line));
    }
  }
  return lines.filter(Boolean);
}

/* =================== Rota =================== */
router.post('/analisar', upload.single('contatos'), async (req, res) => {
  const debug = String(req.query.debug || '') === '1';

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // 1) Tenta com pdf-parse
    let lines = await extractWithPdfParse(req.file.path);

    // Se nada parece conter "CASA", tenta fallback com pdf.js-extract
    if (!lines.some(l => /CASA/i.test(unchunkCASA(l)))) {
      const fallback = await extractWithPdfJsExtract(req.file.path);
      // escolhe o conjunto que mais possui cabeçalhos CASA
      const count1 = lines.filter(l => /CASA/i.test(unchunkCASA(l))).length;
      const count2 = fallback.filter(l => /CASA/i.test(unchunkCASA(l))).length;
      if (count2 > count1) lines = fallback;
    }

    // Normaliza possíveis quebras “C A S A”
    lines = lines.map(l => normWs(unchunkCASA(l)));

    if (debug) {
      fs.unlink(req.file.path, () => {});
      return res.json({ preview: lines.slice(0, 200) });
    }

    const blocks = splitBlocksByCasa(lines);
    const resultados = [];
    for (const b of blocks) {
      const owner = extractOwnerFromBlock(b);
      if (!owner) continue;
      // Converte ao formato pedido
      resultados.push({
        Nome: owner.nome || '',
        Email: owner.emails,
        Telefone: owner.telefones
      });
    }

    fs.unlink(req.file.path, () => {});
    return res.json(resultados);

  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Erro ao processar PDF' });
  }
});

module.exports = router;
