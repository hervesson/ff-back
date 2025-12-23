require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * ✅ Melhor que dest: garante que o arquivo tenha extensão no disco.
 * Isso evita vários bugs de "file type none".
 */
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
    // opcional: restringir a PDF (se quiser)
    // se seu front mandar mimetype errado, comente esta validação
    const ok =
      file.mimetype === 'application/pdf' ||
      (file.originalname || '').toLowerCase().endsWith('.pdf');
    if (!ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    cb(null, true);
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB (ajuste se precisar)
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

function buildPromptUniversal() {
  return `
Extraia APENAS contatos do tipo "Proprietário" do PDF anexado.

O PDF pode estar em QUALQUER um destes formatos de unidade (você deve identificar automaticamente):

1) BLOCO + APARTAMENTO
   - Pode aparecer como "BLOCO 04 AP 102", "AP 102 BL 04" ou "4-102" (bloco antes do apto).
   - Saída em "unidade": "<APTO> BL <BLOCO>" (ex.: "102 BL 04")

2) CASA (sem quadra)
   - Pode aparecer como "CASA 10"
   - Saída em "unidade": "CASA <NUM>" (ex.: "CASA 10")

3) CASA + QUADRA
   - Pode aparecer como "CASA 10" e em seguida "QUADRA 2" (ou na mesma linha)
   - Saída em "unidade": "CASA <NUM> QD <QUADRA>" (ex.: "CASA 10 QD 2")

4) LOTE (sem quadra)
   - Pode aparecer como "LOTE 12" ou "LT 12"
   - Saída em "unidade": "LT <NUM>" (ex.: "LT 12")

5) LOTE + QUADRA
   - Pode aparecer como "LOTE 12" e "QUADRA A/2/10" etc.
   - Saída em "unidade": "QD <QUADRA> LT <NUM>" (ex.: "QD A LT 12" ou "QD 2 LT 12")

REGRAS:
- Considere SOMENTE registros cujo tipo seja "Proprietário"
- Ignore Residente, Dependente, Inquilino e Procurador
- Remova telefones duplicados e e-mails duplicados
- Não trate CPF/CNPJ como telefone
- Não invente dados e não omita registros

RETORNE APENAS JSON válido (sem texto extra), exatamente neste formato:

[
  {
    "unidade": "...",
    "Nome": "...",
    "Telefone": ["..."],
    "Email": ["..."]
  }
]
`;
}

/**
 * ✅ Aceita "arquivo" OU "contatos"
 * Se seu front enviar outro nome, troque para upload.any() (ver comentário abaixo).
 */
router.post('/analisar-pdf-direto', upload.any(), async (req, res) => {
  const file = req.files?.[0];

  if (!file) {
    return res.status(400).json({
      erro: 'Envie o PDF no campo "arquivo" ou "contatos" (multipart/form-data).',
    });
  }

  const filePath = file.path;

  try {
    // ✅ força filename .pdf no multipart pra OpenAI (mesmo se o path fosse sem ext)
    const stream = fs.createReadStream(filePath);
    //stream.path = 'documento.pdf';

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
            { type: 'input_text', text: buildPromptUniversal() },
            { type: 'input_file', file_id: uploaded.id },
          ],
        },
      ],
    });

    const raw = response.output_text || '';
    const data = safeParseJSON(raw);

    if (!data) {
      return res.status(422).json({
        erro: 'A IA não retornou JSON válido.',
        raw_preview: raw.slice(0, 2000),
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro /analisar-pdf-direto:', err);
    return res.status(500).json({
      erro: 'Falha ao enviar PDF para IA',
      detalhes: err.message,
    });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch { }
  }
}
);

/**
 * ✅ Se você quiser ZERO risco de "Unexpected field":
 * comente a rota acima e use esta (aceita qualquer nome de campo):
 *
 * router.post('/analisar-pdf-direto', upload.any(), async (req, res) => {
 *   const file = req.files?.[0];
 *   ...
 * });
 */

module.exports = router;
