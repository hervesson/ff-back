require('dotenv').config()
const express = require('express')
const multer = require('multer')
const fs = require('fs')
const pdfParse = require('pdf-parse')
const OpenAI = require('openai')

const router = express.Router()
const upload = multer({ dest: 'uploads/' })
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/* ===== util ===== */
function safeParseJSON(raw) {
  try {
    if (!raw) return []
    return JSON.parse(
      raw
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim()
    )
  } catch {
    return []
  }
}

/* ===== Prompt (CONDOMOB - APARTAMENTOS) ===== */
function buildPromptCondomobAps(texto) {
  return `
Analise o texto abaixo (extraído de um PDF do sistema CONDOMOB) e extraia APENAS os dados dos PROPRIETÁRIOS.

Objetivo:
Para cada unidade, retornar:
- unidade (ex: B01AP101)
- nome do proprietário
- telefones (array)
- emails (array)

REGRAS OBRIGATÓRIAS:
- Considere SOMENTE contatos marcados como "Proprietário:".
- Ignore completamente "Inquilino", "Pagador", "Síndico", "Administradora" e qualquer outro tipo.
- A unidade aparece em códigos como: B01AP101, B02AP307, etc. Retorne exatamente como estiver no texto.
- Telefones: normalize mantendo apenas números (DDD incluso quando existir). NÃO trate CPF/CNPJ como telefone.
- Remova duplicados de telefones e e-mails dentro do mesmo contato.
- Se não houver telefone ou e-mail, retorne [] no campo correspondente.
- Retorne APENAS JSON válido (sem texto extra, sem markdown).

Formato de saída obrigatório:

[
  {
    "unidade": "B01AP101",
    "nome": "NOME DO PROPRIETÁRIO",
    "telefones": ["98999999999"],
    "emails": ["email@exemplo.com"]
  }
]

Texto:
${texto}
`
}

/* ========================== ROTA (APs - CONDOMOB) ========================== */
router.post(
  '/analisar-aps',
  upload.fields([{ name: 'contatos', maxCount: 1 }]),
  async (req, res) => {
    if (!req.files?.contatos?.[0]) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' })
    }

    const contatosPath = req.files.contatos[0].path

    try {
      const texto = (await pdfParse(fs.readFileSync(contatosPath))).text || ''

      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 8000,
        messages: [{ role: 'user', content: buildPromptCondomobAps(texto) }],
      })

      const raw = resp.choices?.[0]?.message?.content || ''
      const parsed = safeParseJSON(raw)

      // normaliza para array
      const contatosList = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
          ? parsed.data
          : []

      // Agrupa por unidade (garante 1 por unidade e merge de contatos)
      const unidadesMap = new Map()

      for (const item of contatosList) {
        const unidade = String(item?.unidade || '').trim().toUpperCase()
        if (!unidade) continue

        const prev = unidadesMap.get(unidade) || {
          unidade,
          Nome: '',
          Telefone: [],
          Email: [],
        }

        const nome = String(item?.nome || '').trim()
        const telefones = Array.isArray(item?.telefones)
          ? item.telefones.map(String).map((t) => t.replace(/\D/g, '')).filter(Boolean)
          : []
        const emails = Array.isArray(item?.emails)
          ? item.emails.map(String).map((e) => e.trim()).filter(Boolean)
          : []

        unidadesMap.set(unidade, {
          unidade,
          Nome: prev.Nome || nome,
          Telefone: Array.from(new Set([...(prev.Telefone || []), ...telefones])),
          Email: Array.from(new Set([...(prev.Email || []), ...emails])),
        })
      }

      return res.json(Array.from(unidadesMap.values()))
    } catch (err) {
      console.error('Erro na rota /analisar-aps:', err)
      return res.status(500).json({
        erro: 'Falha ao processar PDF ou chamar a OpenAI',
        detalhes: err.message,
      })
    } finally {
      try {
        fs.unlinkSync(contatosPath)
      } catch {}
    }
  }
)

module.exports = router
