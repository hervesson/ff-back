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
 * Normalização focada no padrão do BRCondomínio:
 * - "BL I 01" e "BL I 1" => "BL I 1"
 * - remove pontuações e espaços extras
 */
function normalizeUnidade(u) {
  if (!u) return '';
  let s = String(u).toUpperCase().trim();

  s = s.replace(/[.,;:/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();

  // padroniza "BLOCO" -> "BL"
  s = s.replace(/\bBLOCO\b/g, 'BL');

  // "BL I 01" -> "BL I 1"
  s = s.replace(/\bBL\s*([A-ZIVX]+)\s*0*(\d+)\b/g, 'BL $1 $2');

  // limpa espaços
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

function buildPromptContatosBRCondominio() {
  return `
Extraia APENAS pessoas com "Tp.Pessoa: Proprietário" do PDF anexado (BRCondomínio - Lista de Unidades Expandidas).

IMPORTANTE:
- Pode haver MAIS DE UM Proprietário na MESMA unidade. Você deve retornar TODOS (não agrupe).
- Ignore Morador/Ocupante, Inquilino, Administrador e qualquer outro tipo que não seja Proprietário.
- Não invente dados e não omita proprietários.
- Não trate CPF/CNPJ como telefone.
- Telefone pode aparecer em "Telefone:", "Celular:" ou no campo "Contato:"; capture números que forem telefones.
- Remova duplicados APENAS dentro do mesmo registro (mesmo proprietário): telefones repetidos, e-mails repetidos.

Retorne APENAS JSON válido exatamente assim:

[
  {
    "unidade": "BL I 01",
    "Nome": "NOME COMPLETO",
    "Telefone": ["..."],
    "Email": ["..."]
  }
]
`;
}

function buildPromptDebitosBRCondominio() {
  return `
Você receberá um PDF do BRCondomínio "Lista de Débitos".

Extraia APENAS a lista de UNIDADES que aparecem como devedoras.
- A unidade aparece no começo da linha, ex.: "BL I 05", "BL I 106", etc.
- Ignore descrições, valores, datas, títulos, totais, etc.
- Remova duplicadas.

Retorne APENAS JSON válido:

[
  { "unidade": "BL I 05" },
  { "unidade": "BL I 106" }
]
`;
}

async function extractJSONFromPDF(filePath, prompt) {
  const stream = fs.createReadStream(filePath);

  const uploaded = await client.files.create({
    file: stream,
    purpose: 'assistants',
  });

  const response = await client.responses.create({
    model: 'gpt-4o', // ou 'gpt-4.1' se você tiver disponível
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
 * POST /analisar-pdf-brcondominio-inadimplentes
 * multipart/form-data:
 * - contatos: PDF "Lista de Unidades Expandidas"
 * - inadimplentes: PDF "Lista de Débitos"
 *
 * Retorno: APENAS array de contatos (cada proprietário vira um item; pode repetir unidade)
 */
router.post(
  '/analisar-pdf-brcondominio',
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
      // 1) extrai contatos (todos os proprietários, sem agrupar)
      const contatosR = await extractJSONFromPDF(
        contatosPath,
        buildPromptContatosBRCondominio()
      );
      if (!contatosR.data) {
        return res.status(422).json({
          erro: 'A IA não retornou JSON válido para CONTATOS.',
          raw_preview: (contatosR.raw || '').slice(0, 2000),
        });
      }

      // 2) extrai inadimplentes (apenas unidades)
      const inadR = await extractJSONFromPDF(inadPath, buildPromptDebitosBRCondominio());
      if (!inadR.data) {
        return res.status(422).json({
          erro: 'A IA não retornou JSON válido para INADIMPLENTES.',
          raw_preview: (inadR.raw || '').slice(0, 2000),
        });
      }

      const contatos = Array.isArray(contatosR.data) ? contatosR.data : [];
      const inad = Array.isArray(inadR.data) ? inadR.data : [];

      const inadSet = new Set(
        inad.map((x) => normalizeUnidade(x?.unidade)).filter(Boolean)
      );

      // 3) filtra mantendo TODOS os contatos (não deduplica unidade)
      const filtrados = contatos.filter((c) => {
        const key = normalizeUnidade(c?.unidade);
        return key && inadSet.has(key);
      });

      // 4) payload final: somente array, somente campos necessários
      const payload = filtrados.map((c) => ({
        unidade: c?.unidade,
        Nome: c?.Nome,
        Telefone: Array.isArray(c?.Telefone) ? c.Telefone : [],
        Email: Array.isArray(c?.Email) ? c.Email : [],
      }));

      return res.json(payload);
    } catch (err) {
      console.error('Erro /analisar-pdf-brcondominio-inadimplentes:', err);
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
