require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { PDFDocument } = require('pdf-lib');

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
 * Normaliza textos já "rotulados" (AP/BL/CASA/LT/QD etc.)
 * Retorna UMA forma canônica (quando possível).
 */
function normalizeUnidade(u) {
  if (!u) return '';
  let s = String(u).toUpperCase().trim();

  // limpa pontuação e espaços
  s = s.replace(/[.,;:/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();

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

  // remove espaços duplicados
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * ✅ Gera várias chaves possíveis (aliases) para UMA unidade,
 * pra aguentar variações da IA e formatos diferentes.
 *
 * - Serro Mirador: "001 01" => AP 1 BL 1
 * - Maritimus (SEM BLOCO): "0103" => AP 103 (apenas número do apt com zero à esquerda)
 */
function unidadeKeys(u) {
  if (!u) return [];
  let s = String(u).toUpperCase().trim();
  s = s.replace(/[.,;:/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();

  const keys = new Set();

  // 1) sempre tenta normalização "rotulada"
  const norm = normalizeUnidade(s);
  if (norm) keys.add(norm);

  // 2) SERRO MIRADOR / TUPY: "001 01" => AP 1 BL 1 (também cobre "001 01 - NOME...")
  {
    const m = s.match(/^\s*0*(\d{1,5})\s+0*(\d{1,3})(?:\b|[^0-9].*)$/);
    if (m) {
      const ap = parseInt(m[1], 10);
      const bl = parseInt(m[2], 10);
      if (!Number.isNaN(ap) && !Number.isNaN(bl)) {
        keys.add(`AP ${ap} BL ${bl}`);
      }
    }
  }

  // 3) MARITIMUS (PRÉDIO SEM BLOCO): "0103" é o AP (com zero à esquerda)
  // "0103" => AP 103
  // Também adiciona "0103" e "103" como fallback.
  {
    const rawDigits = s.replace(/\D/g, '');
    if (rawDigits.length === 4) {
      const ap = parseInt(rawDigits, 10); // remove zeros à esquerda
      if (!Number.isNaN(ap)) {
        keys.add(`AP ${ap}`);                 // canônico
        keys.add(rawDigits);                  // "0103"
        keys.add(String(ap));                 // "103"
      }
    }
  }

  // 4) Se vier só "103" (3 dígitos) ou "03" (2 dígitos) ou "3" (1 dígito): assume AP <n>
  {
    const only = s.replace(/\D/g, '');
    if (only.length >= 1 && only.length <= 3) {
      const n = parseInt(only, 10);
      if (!Number.isNaN(n)) {
        keys.add(`AP ${n}`);
        keys.add(String(n));
      }
    }
  }

  return [...keys].filter(Boolean);
}

function buildPromptContatos() {
  return `
Extraia APENAS contatos do tipo "Proprietário" do PDF anexado.

O PDF pode estar em QUALQUER um destes formatos de unidade (você deve identificar automaticamente):

1) BLOCO + APARTAMENTO
   - Pode aparecer como "BLOCO 04 AP 102", "AP 102 BL 04" ou "4-102".
   - Saída: "AP <NUM> BL <BLOCO>" (ex.: "AP 102 BL 4")

✅ 1.1) BLOCO + APARTAMENTO (SEM RÓTULOS) (Serro Mirador)
   - Pode aparecer como "001 01", "101 03" (dois números separados por espaço).
   - Interprete como "AP <primeiro> BL <segundo>"
   - Saída: "AP <NUM> BL <BLOCO>" (ex.: "AP 1 BL 1", "AP 101 BL 3")

✅ 1.2) APARTAMENTO SEM BLOCO (Maritimus)
   - Pode aparecer como "0103", "0201", "1207" (quatro dígitos com zeros à esquerda) ou "103".
   - Interprete como APENAS o número do apartamento.
   - Saída: "AP <NUM>" (ex.: "AP 103", "AP 201", "AP 1207") removendo zeros à esquerda.

2) CASA (sem quadra)
   - Saída: "CASA <NUM>"

3) CASA + QUADRA
   - Saída: "CASA <NUM> QD <QUADRA>"

4) LOTE (sem quadra)
   - Saída: "LT <NUM>"

5) LOTE + QUADRA
   - Saída: "QD <QUADRA> LT <NUM>"

REGRAS:
- Considere SOMENTE registros cujo tipo seja "Proprietário"
- Ignore Residente, Dependente, Inquilino e Procurador
- Remova telefones duplicados e e-mails duplicados
- Não trate CPF/CNPJ como telefone
- Não invente dados e não omita registros

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
✅ Serro Mirador: "001 01 - Nome ..." (AP + BL sem rótulos)
✅ Maritimus: "0103 - Nome ..." (apenas AP com zeros à esquerda; sem bloco)

RETORNE APENAS JSON válido neste formato:

[
  { "unidade": "..." }
]

REGRAS:
- Não invente unidades
- Remova duplicadas
- Não inclua nome, valores ou qualquer texto extra
- Se vier "001 01", converta para "AP 1 BL 1"
- Se vier "0103", converta para "AP 103"
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

/**
 * Split PDF em chunks de N páginas e salva em arquivos temporários.
 * Retorna array de caminhos.
 */
async function splitPdfIntoChunks(inputPath, pagesPerChunk = 1) {
  const bytes = fs.readFileSync(inputPath);
  const pdf = await PDFDocument.load(bytes);

  const totalPages = pdf.getPageCount();
  const chunkPaths = [];

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);

    const outPdf = await PDFDocument.create();
    const pageIndexes = Array.from({ length: end - start }, (_, i) => start + i);

    const copiedPages = await outPdf.copyPages(pdf, pageIndexes);
    copiedPages.forEach((p) => outPdf.addPage(p));

    const outBytes = await outPdf.save();

    const chunkPath = path.join(
      'uploads',
      `${Date.now()}-${Math.random().toString(16).slice(2)}-chunk-${start + 1}-${end}.pdf`
    );

    fs.writeFileSync(chunkPath, outBytes);
    chunkPaths.push(chunkPath);
  }

  return chunkPaths;
}

/**
 * Junta arrays de { unidade: "..." } e remove duplicadas (pela unidade normalizada).
 * Usa normalizeUnidade para padronizar antes de deduplicar.
 */
function mergeAndDedupeUnidades(list) {
  const map = new Map(); // key(normalizada) -> {unidade: original}
  for (const item of list) {
    const u = item?.unidade;
    if (!u) continue;

    const key = normalizeUnidade(u);
    if (!key) continue;

    if (!map.has(key)) map.set(key, { unidade: key }); // já salva normalizado
  }
  return [...map.values()];
}

/**
 * Extrai inadimplentes usando split por páginas (evita truncar).
 * - chama IA pra cada chunk
 * - junta
 * - deduplica
 */
async function extractInadimplentesWithSplit(inadPdfPath, pagesPerChunk = 1) {
  const chunkPaths = await splitPdfIntoChunks(inadPdfPath, pagesPerChunk);

  const all = [];
  const errors = [];

  try {
    for (let i = 0; i < chunkPaths.length; i++) {
      const p = chunkPaths[i];

      const r = await extractJSONFromPDF(p, buildPromptInadimplentes());
      if (Array.isArray(r.data)) {
        all.push(...r.data);
      } else {
        errors.push({
          chunk: path.basename(p),
          raw_preview: (r.raw || '').slice(0, 500),
        });
      }
    }

    // dedupe final
    const merged = mergeAndDedupeUnidades(all);
    return { data: merged, errors };
  } finally {
    // limpa chunks
    for (const p of chunkPaths) {
      try { fs.unlinkSync(p); } catch { }
    }
  }
}

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
      // 2) extrai inadimplentes (split pra não truncar)
      const inadR = await extractInadimplentesWithSplit(inadPath, 2); // 2 páginas por chunk
      if (!inadR.data) {
        return res.status(422).json({
          erro: 'Não consegui extrair INADIMPLENTES (split).',
          detalhes: inadR.errors?.slice(0, 5) || [],
        });
      }

      const contatos = Array.isArray(contatosR.data) ? contatosR.data : [];
      const inad = Array.isArray(inadR.data) ? inadR.data : [];

      // 3) monta Set de inadimplentes com TODOS os aliases
      const inadSet = new Set();
      for (const x of inad) {
        for (const k of unidadeKeys(x?.unidade)) inadSet.add(k);
      }

      // 4) filtra contatos: se QUALQUER alias do contato bater no Set
      const result = contatos.filter((c) => {
        const keys = unidadeKeys(c?.unidade);
        return keys.some((k) => inadSet.has(k));
      });

      const payload = result.map((c) => ({
        unidade: c.unidade,
        Nome: c.Nome,
        Telefone: Array.isArray(c.Telefone) ? c.Telefone : [],
        Email: Array.isArray(c.Email) ? c.Email : [],
      }));

      return res.json(payload);
    } catch (err) {
      console.error('Erro /analisar-pdf-superlogica:', err);
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
