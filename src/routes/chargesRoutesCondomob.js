// routes/chargesRoutesCondomob.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===================== HELPERS ===================== */
function pad3(n) {
  const s = String(n || '').replace(/\D/g, '');
  return s ? s.padStart(3, '0') : '';
}

function pad2(n) {
  const s = String(n || '').replace(/\D/g, '');
  return s ? s.padStart(2, '0') : '';
}

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
 * ✅ Split robusto por unidade Condomob:
 * pega "4-406", "4 - 406", "4–406", etc.
 * NÃO depende de estar no fim da linha com lookahead.
 */
function splitByCondomobUnit(text) {
  const t = String(text || '').replace(/\r/g, '');

  // casa com: início ou quebra de linha + bloco + hífen/en-dash + apto(3 dig) + borda
  const re = /(?:^|\n)\s*(\d{1,3})\s*[-–]\s*(\d{3})\b/g;

  const hits = [];
  for (const m of t.matchAll(re)) {
    hits.push({ idx: m.index });
  }

  if (hits.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : t.length;
    chunks.push(t.slice(start, end));
  }

  return chunks;
}

function buildPromptCondomobChunk(chunkText) {
  return `
Você vai extrair APENAS o contato do tipo "Proprietário" de UMA unidade.

O chunk contém a unidade no formato "BLOCO-APTO" (ex.: "4-406" ou "4 - 406" ou "4–406").
- BLOCO = antes do hífen
- APTO = depois do hífen

REGRAS:
- Pegue NOME somente da linha que começa com "Proprietário:"
- Pegue telefones/e-mails somente das linhas ANTES de "Pagador:" (ignore tabela de cobrança)
- Ignore "Inquilino:" totalmente
- Remova duplicados
- Não considere CPF como telefone
- Retorne APENAS JSON válido (sem texto extra) no formato:

{
  "bloco": "04",
  "apto": "406",
  "nome": "NOME",
  "telefones": ["..."],
  "emails": ["..."]
}

Chunk:
${chunkText}
`;
}

/* ===================== ROTA ===================== */
/**
 * POST /cobrancas/condomob/ia-ap
 * form-data: contatos=<pdf>
 * query opcional: ?apto=406&bloco=04
 */
router.post('/condomob/ia-ap', upload.single('contatos'), async (req, res) => {
  const aptoQuery = req.query.apto ? pad3(req.query.apto) : null;
  const blocoQuery = req.query.bloco ? pad2(req.query.bloco) : null;

  if (!req.file) {
    return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
  }

  const filePath = req.file.path;

  try {
    const text = (await pdfParse(fs.readFileSync(filePath))).text || '';

    const chunks = splitByCondomobUnit(text);

    // ✅ debug (deixe ligado até validar)
    console.log('CHUNKS ENCONTRADOS:', chunks.length);

    if (!chunks.length) {
      return res.status(422).json({
        erro: 'Não consegui identificar unidades no padrão Condomob (BLOCO-APTO).',
      });
    }

    const unidadesMap = new Map();

    // ✅ processa unidade por unidade
    for (const chunk of chunks) {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 900, // 1 unidade por vez => pouca saída
        messages: [{ role: 'user', content: buildPromptCondomobChunk(chunk) }],
      });

      const raw = resp.choices?.[0]?.message?.content || '';
      const obj = safeParseJSON(raw);

      if (!obj) continue;

      const apto = pad3(obj?.apto);
      const bloco = pad2(obj?.bloco);

      if (!apto || !bloco) continue;

      // filtros opcionais
      if (aptoQuery && apto !== aptoQuery) continue;
      if (blocoQuery && bloco !== blocoQuery) continue;

      const key = `${apto}-BL-${bloco}`;

      const prev = unidadesMap.get(key) || {
        unidade: `${apto} BL ${bloco}`,
        Nome: '',
        Telefone: [],
        Email: [],
      };

      const nome = String(obj?.nome || '').trim();
      const telefones = Array.isArray(obj?.telefones) ? obj.telefones.filter(Boolean) : [];
      const emails = Array.isArray(obj?.emails) ? obj.emails.filter(Boolean) : [];

      unidadesMap.set(key, {
        unidade: prev.unidade,
        Nome: prev.Nome || nome,
        Telefone: Array.from(new Set([...(prev.Telefone || []), ...telefones])),
        Email: Array.from(new Set([...(prev.Email || []), ...emails])),
      });
    }

    return res.json(Array.from(unidadesMap.values()));
  } catch (err) {
    console.error('Erro na rota /condomob/ia-ap:', err);
    return res.status(500).json({
      erro: 'Falha ao processar PDF ou chamar a IA',
      detalhes: err.message,
    });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

module.exports = router;
