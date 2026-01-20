require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const router = express.Router();

/* -------------------- upload -------------------- */
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.pdf';
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      (file.originalname || '').toLowerCase().endsWith('.pdf');
    if (!ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    cb(null, true);
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

/* -------------------- helpers -------------------- */
async function pdfToText(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return String(data.text || '');
}

function normSpaces(s) {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function canonApBl(ap, bl) {
  const a = parseInt(ap, 10);
  const b = parseInt(bl, 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return `AP ${a} BL ${b}`;
}

/**
 * Injeta quebras antes de "001 01 ..." mesmo se o texto vier todo colado.
 * Garante que cada unidade comece em uma nova "linha".
 */
function forceLineBreaksForUnits(text) {
  let t = String(text || '');

  // formfeed -> newline
  t = t.replace(/\f/g, '\n');

  // normaliza espaços
  t = t.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ');

  // \n antes de: "<ap> <bl> <letra>"  (evita pegar datas/valores)
  t = t.replace(
    /(^|[^\d])0*(\d{1,5})\s+0*(\d{1,3})\s+([A-ZÀ-Ü])/g,
    (m, pfx, ap, bl, letter) => `${pfx}\n${ap} ${bl} ${letter}`
  );

  // também garante \n antes de: "<ap> <bl> -"
  t = t.replace(
    /(^|[^\d])0*(\d{1,5})\s+0*(\d{1,3})\s*-\s*/g,
    (m, pfx, ap, bl) => `${pfx}\n${ap} ${bl} - `
  );

  // limpa excessos
  t = t.replace(/\n{3,}/g, '\n\n');

  return t;
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function extractEmails(block) {
  const m = String(block || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return m ? m.map(x => x.trim()) : [];
}

function extractPhones(block) {
  const s = String(block || '');

  // quebra por separadores comuns do relatório: ";;", vírgula, barra, espaços grandes
  const parts = s.split(/;;|,|\||\s{2,}/g).map(x => x.trim()).filter(Boolean);

  const out = [];
  for (const p of parts) {
    const digits = p.replace(/\D/g, '');

    // descarta CNPJ (14 dígitos) e lixo curto
    if (digits.length === 14) continue;
    if (digits.length < 8) continue;

    out.push(p);
  }
  return out;
}

/* -------------------- parser CONTATOS TUPY -------------------- */
/**
 * Pega blocos do tipo:
 * 001 01 NOME...
 * ... (tel/email/qualquer coisa)
 * Proprietário
 * ... (às vezes mais lixo)
 * [próxima unidade]
 */
function parseContatosTupy(text) {
  const t = forceLineBreaksForUnits(text);

  // bloco = do começo de uma unidade até antes da próxima unidade
  // ^(\d+)\s+(\d+)\s+...  e vai até lookahead do próximo ^\d+\s+\d+\s+
  const reBlock = /^0*(\d{1,5})\s+0*(\d{1,3})\s+(.+?)(?=^\s*0*\d{1,5}\s+0*\d{1,3}\s+|\s*$)/gms;

  const out = [];
  let m;

  while ((m = reBlock.exec(t)) !== null) {
    const ap = m[1];
    const bl = m[2];
    const blockBody = m[3] || '';

    const unidade = canonApBl(ap, bl);
    if (!unidade) continue;

    // precisa ter “Proprietário” em algum lugar do bloco
    if (!/PROPRIET[ÁA]RIO/i.test(blockBody)) continue;

    // nome: primeira “linha” do bloco (até newline)
    const firstLine = normSpaces(blockBody.split('\n')[0] || '');
    if (!firstLine) continue;

    // remove títulos de coluna se colarem
    const nome = firstLine
      .replace(/^NOME\/TELEFONE\/CELULAR\s+TIPO\s*/i, '')
      .replace(/\bPROPRIET[ÁA]RIO\b/i, '')
      .trim();

    const emails = uniq(extractEmails(blockBody));
    const tels = uniq(extractPhones(blockBody));

    out.push({
      unidade,
      Nome: nome,
      Telefone: tels,
      Email: emails,
    });
  }

  return out;
}

/* -------------------- parser INADIMPLENTES TUPY -------------------- */
function parseInadimplentesTupy(text) {
  const t = forceLineBreaksForUnits(text);

  // linhas chave: "001 01 -"
  const re = /^0*(\d{1,5})\s+0*(\d{1,3})\s*-\s*/gm;

  const set = new Set();
  let m;
  while ((m = re.exec(t)) !== null) {
    const key = canonApBl(m[1], m[2]);
    if (key) set.add(key);
  }
  return set;
}

/* -------------------- rota exclusiva -------------------- */
router.post(
  '/analisar-tupy',
  upload.fields([
    { name: 'contatos', maxCount: 1 },
    { name: 'inadimplentes', maxCount: 1 },
  ]),
  async (req, res) => {
    const contatosFile = req.files?.contatos?.[0];
    const inadFile = req.files?.inadimplentes?.[0];

    if (!contatosFile || !inadFile) {
      return res.status(400).json({
        erro: 'Envie 2 PDFs via multipart/form-data: campos "contatos" e "inadimplentes".',
      });
    }

    const contatosPath = contatosFile.path;
    const inadPath = inadFile.path;

    try {
      const [contatosText, inadText] = await Promise.all([
        pdfToText(contatosPath),
        pdfToText(inadPath),
      ]);

      // DEBUG rápido (se vier 0 aqui, pdf-parse não leu texto)
      const dbg = {
        contatos_text_len: contatosText.length,
        inad_text_len: inadText.length,
        contatos_sample: contatosText.slice(0, 250),
        inad_sample: inadText.slice(0, 250),
      };

      const contatos = parseContatosTupy(contatosText);
      const inadSet = parseInadimplentesTupy(inadText);

      const data = contatos.filter(c => inadSet.has(c.unidade));

      return res.json({
        debug: dbg,
        contatos_total: contatos.length,
        inad_total: inadSet.size,
        resultado: data.length,
        data,
      });
    } catch (err) {
      console.error('Erro /analisar-tupy:', err);
      return res.status(500).json({
        erro: 'Falha ao processar PDFs',
        detalhes: err.message,
      });
    } finally {
      try { fs.unlinkSync(contatosPath); } catch {}
      try { fs.unlinkSync(inadPath); } catch {}
    }
  }
);

module.exports = router;
