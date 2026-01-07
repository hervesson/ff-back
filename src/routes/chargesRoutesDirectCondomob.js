require('dotenv').config()
const express = require('express')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')

const router = express.Router()
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * ✅ diskStorage com extensão
 */
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.pdf'
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`)
  },
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      (file.originalname || '').toLowerCase().endsWith('.pdf')
    if (!ok) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname))
    cb(null, true)
  },
  limits: { fileSize: 25 * 1024 * 1024 },
})

function safeParseJSON(raw) {
  try {
    if (!raw) return null
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

/**
 * ✅ Prompt UNIVERSAL (CONDOMOB)
 * - Detecta automaticamente: APs (B01AP101), CASAS (CASA-02), LOTES (Q02-LT01)
 * - Retorna unidade normalizada:
 *   APs: "AP 101 BL 01"
 *   Casas: "CASA 02"
 *   Lotes: "QD 02 LT 01"
 */
function buildPromptCondomobUniversal() {
  return `Você está analisando um PDF do sistema CONDOMOB.

TAREFA:
Liste TODAS as unidades do documento que possuam um bloco de "Proprietário" e extraia:
- unidade
- nome do proprietário
- telefones
- e-mails

TIPOS DE UNIDADE (identificar automaticamente):
- Apartamento: B01AP101, B02AP307... -> normalize para "AP <APTO> BL <BLOCO>"
- Casa: CASA-02, CASA-8... -> normalize para "CASA <NUM>"
- Lote: Q02-LT01, Q3-LT7... -> normalize para "QD <QUADRA> LT <LOTE>"

REGRAS IMPORTANTES PARA NÃO OMITIR NINGUÉM:
1) NÃO omita registros. Percorra o documento inteiro.
2) Cada unidade encontrada deve gerar 1 objeto.
3) Se houver mais de um proprietário para a mesma unidade, mantenha o PRIMEIRO como "Nome" e continue coletando contatos do proprietário (telefones/emails).
4) Só use dados que estejam dentro do bloco do proprietário.
5) O bloco do proprietário pode estar escrito como:
   - "Proprietário:" OU
   - "Proprietario:" (sem acento) OU
   - "PROP:" OU
   - pode estar quebrado em linha (ex.: "Proprietá" + "rio:")
   Você deve reconhecer essas variações.
6) Ignore completamente Inquilino / Pagador / Residente / Dependente / Procurador etc.
7) Telefones: retorne somente dígitos; NÃO trate CPF/CNPJ como telefone.
8) Remova duplicados dentro do mesmo contato.

RETORNE APENAS JSON válido (sem texto extra):

[
  {
    "unidade": "...",
    "Nome": "...",
    "Telefone": ["..."],
    "Email": ["..."]
  }
]
`
}

router.post('/analisar-pdf-condomob', upload.any(), async (req, res) => {
  const file = req.files?.[0]

  if (!file) {
    return res.status(400).json({
      erro: 'Envie o PDF no multipart/form-data (qualquer nome de campo).',
    })
  }

  const filePath = file.path

  try {
    const stream = fs.createReadStream(filePath)

    // ✅ sobe o arquivo para o endpoint de files (pra usar input_file)
    const uploaded = await client.files.create({
      file: stream,
      purpose: 'assistants',
    })

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_output_tokens: 12000,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: buildPromptCondomobUniversal() },
            { type: 'input_file', file_id: uploaded.id },
          ],
        },
      ],
    })

    const raw = response.output_text || ''
    const data = safeParseJSON(raw)

    if (!data || !Array.isArray(data)) {
      return res.status(422).json({
        erro: 'A IA não retornou JSON válido.',
        raw_preview: raw.slice(0, 2000),
      })
    }

    return res.json(data)
  } catch (err) {
    console.error('Erro /analisar-pdf-condomob:', err)
    return res.status(500).json({
      erro: 'Falha ao enviar PDF para IA',
      detalhes: err.message,
    })
  } finally {
    try {
      fs.unlinkSync(filePath)
    } catch { }
  }
})

module.exports = router
