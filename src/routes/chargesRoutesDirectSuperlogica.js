require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function safeParseJSON(raw) {
  try {
    if (!raw) return null;
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Normaliza unidade para bater "CASA 003" com "CASA 3", etc.
 * E suporta seus formatos: apt/bloco, casa, casa+quadra, lote, lote+quadra.
 */
function normalizeUnidade(u) {
  if (!u) return '';
  let s = String(u).toUpperCase().trim();

  // limpa pontuação e espaços
  s = s.replace(/[.,;:/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();

  // ✅ NOVO: unidade só numérica (ex.: 0103, 0201, 1207)
  // Interpreta como apartamento sem bloco e remove zeros à esquerda.
  // 0103 => AP 103
  if (/^\d{1,6}$/.test(s)) {
    const n = String(parseInt(s, 10));
    return n && n !== 'NAN' ? `AP ${n}` : '';
  }

  // padroniza palavras
  s = s
    .replace(/\bAPARTAMENTO\b/g, 'AP')
    .replace(/\bAPTO\b/g, 'AP')
    .replace(/\bBLOCO\b/g, 'BL')
    .replace(/\bQUADRA\b/g, 'QD')
    .replace(/\bLOTE\b/g, 'LT');

  // separa "BL07" => "BL 7", "QD02" => "QD 2", "LT001" => "LT 1"
  s = s.replace(/\bBL\s*0*(\d+)\b/g, 'BL $1');
  s = s.replace(/\bBL0*(\d+)\b/g, 'BL $1');

  s = s.replace(/\bQD\s*0*([A-Z0-9]+)\b/g, 'QD $1');
  s = s.replace(/\bQD0*([A-Z0-9]+)\b/g, 'QD $1');

  s = s.replace(/\bLT\s*0*(\d+)\b/g, 'LT $1');
  s = s.replace(/\bLT0*(\d+)\b/g, 'LT $1');

  // CASA 003 => CASA 3
  s = s.replace(/\bCASA\s*0*(\d+)\b/g, 'CASA $1');

  // padrão "4-102" => "AP 102 BL 4"
  s = s.replace(/\b0*(\d+)\s*-\s*0*(\d+)\b/g, 'AP $2 BL $1');

  // se vier "102 BL 1" (sem AP), assume AP quando tem BL
  s = s.replace(/^\s*0*(\d+)\s+BL\s+0*(\d+)\b/, 'AP $1 BL $2');

  // reordena "BL 1 AP 102" => "AP 102 BL 1"
  s = s.replace(/\bBL\s+0*(\d+)\s+AP\s+0*(\d+)\b/g, 'AP $2 BL $1');

  // normaliza "AP 001" => "AP 1"
  s = s.replace(/\bAP\s*0*(\d+)\b/g, 'AP $1');

  // ✅ NOVO: "AP 0103" (ou "AP0103") => "AP 103"
  s = s.replace(/\bAP\s*0*(\d{1,6})\b/g, (m, d) => `AP ${parseInt(d, 10)}`);

  // remove espaços duplicados
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

function buildPromptContatos() {
  return `
Extraia APENAS contatos do tipo "Proprietário" do PDF anexado.

O PDF pode estar em QUALQUER um destes formatos de unidade (você deve identificar automaticamente):

1) BLOCO + APARTAMENTO
   - Pode aparecer como "BLOCO 04 AP 102", "AP 102 BL 04" ou "4-102".
   - Saída em "unidade": "AP <NUM> BL <BLOCO>" (ex.: "AP 102 BL 4")

✅ 1.1) APARTAMENTO (SEM BLOCO)
   - Pode aparecer como "AP 103", "103" ou só como "0103" (unidade numérica).
   - Saída em "unidade": "AP <NUM>" (ex.: "AP 103")  // remova zeros à esquerda

2) CASA (sem quadra)
   - Saída: "CASA <NUM>" (ex.: "CASA 10")

3) CASA + QUADRA
   - Saída: "CASA <NUM> QD <QUADRA>" (ex.: "CASA 10 QD 2")

4) LOTE (sem quadra)
   - Saída: "LT <NUM>" (ex.: "LT 12")

5) LOTE + QUADRA
   - Saída: "QD <QUADRA> LT <NUM>" (ex.: "QD A LT 12" ou "QD 2 LT 12")

REGRAS:
- Considere SOMENTE registros cujo tipo seja "Proprietário"
- Ignore Residente, Dependente, Inquilino e Procurador
- Remova telefones duplicados e e-mails duplicados
- Não trate CPF/CNPJ como telefone
- Não invente dados e não omita registros
- Se a unidade vier como "0103", converta para "AP 103"

RETORNE APENAS JSON válido, exatamente:

[
  { "unidade": "...", "Nome": "...", "Telefone": ["..."], "Email": ["..."] }
]
`;
}

function buildPromptInadimplentes() {
  return `
Você receberá um PDF de INADIMPLÊNCIA (cobranças).

Sua missão é extrair APENAS a lista de UNIDADES inadimplentes.
Ignore valores, parcelas, juros, multas, códigos, notificações.

A unidade pode aparecer como:
- "CASA 003 - Nome ..."
- "AP 102 BL 04 - Nome ..."
- "QD A LT 12 - Nome ..."
✅ - apenas numérica no início da linha: "0103 - Nome ..." (apartamento sem bloco)

RETORNE APENAS JSON válido neste formato:

[
  { "unidade": "..." }
]

REGRAS:
- Não invente unidades
- Remova duplicadas
- Não inclua nome, valores ou qualquer texto extra
- Se a unidade vier como "0103", converta para "AP 103" (remova zeros à esquerda)
`;
}


async function extractJSONFromPDF(filePath, prompt) {
  const stream = fs.createReadStream(filePath);

  const uploaded = await client.files.create({
    file: stream,
    purpose: 'assistants',
  });

  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_file', file_id: uploaded.id },
        ],
      },
    ],
  });

  const raw = response.output_text || '';
  const data = safeParseJSON(raw);
  return { data, raw };
}

// ✅ agora recebe 2 arquivos
router.post(
  '/analisar-pdf-superlogica',
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
      // 1) extrai contatos
      const contatosR = await extractJSONFromPDF(contatosPath, buildPromptContatos());
      if (!contatosR.data) {
        return res.status(422).json({
          erro: 'A IA não retornou JSON válido para CONTATOS.',
          raw_preview: (contatosR.raw || '').slice(0, 2000),
        });
      }

      // 2) extrai inadimplentes (só unidades)
      const inadR = await extractJSONFromPDF(inadPath, buildPromptInadimplentes());
      if (!inadR.data) {
        return res.status(422).json({
          erro: 'A IA não retornou JSON válido para INADIMPLENTES.',
          raw_preview: (inadR.raw || '').slice(0, 2000),
        });
      }

      const contatos = Array.isArray(contatosR.data) ? contatosR.data : [];
      const inad = Array.isArray(inadR.data) ? inadR.data : [];

      // 3) normaliza e cruza por unidade
      const inadSet = new Set(
        inad
          .map((x) => normalizeUnidade(x?.unidade))
          .filter(Boolean)
      );

      const result = contatos.filter((c) => {
        const key = normalizeUnidade(c?.unidade);
        return key && inadSet.has(key);
      });

      // (opcional) lista quem está inadimplente mas não achou contato
      const contatosSet = new Set(
        contatos.map((c) => normalizeUnidade(c?.unidade)).filter(Boolean)
      );

      const inadSemContato = [...inadSet].filter((u) => !contatosSet.has(u));

      const payload = result.map((c) => ({
        unidade: c.unidade,
        Nome: c.Nome,
        Telefone: Array.isArray(c.Telefone) ? c.Telefone : [],
        Email: Array.isArray(c.Email) ? c.Email : [],
      }));

      return res.json(payload);
    } catch (err) {
      console.error('Erro /analisar-pdf-superlogica-inadimplentes:', err);
      return res.status(500).json({
        erro: 'Falha ao processar PDFs',
        detalhes: err.message,
      });
    } finally {
      try { fs.unlinkSync(contatosPath); } catch { }
      try { fs.unlinkSync(inadPath); } catch { }
    }
  }
);

module.exports = router;
