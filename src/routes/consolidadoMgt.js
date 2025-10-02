require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Prefixo para exibir no campo "unidade" da resposta (CASA, UNIDADE, APT, etc.)
const UNIDADE_PREFIX = process.env.UNIDADE_PREFIX || 'CASA';

/* ===== util ===== */
function padCasa(n) {
  const s = String(n || '').replace(/\D/g, '');
  return s ? s.padStart(3, '0') : '';
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

/* ========================== ROTA ========================== */
router.post(
  '/analisar',
  upload.fields([
    { name: 'contatos', maxCount: 1 },       // obrigatório
    { name: 'inadimplencia', maxCount: 1 },  // opcional (se quiser filtrar)
  ]),
  async (req, res) => {
    const casaQuery = req.query.casa ? padCasa(req.query.casa) : null;

    if (!req.files || !req.files.contatos) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
    }

    const contatosPath = req.files.contatos[0].path;
    const inadimplenciaPath = req.files?.inadimplencia?.[0]?.path;

    try {
      // Lê PDFs
      const contatosText = (await pdfParse(fs.readFileSync(contatosPath))).text || '';
      const inadimplenciaText = inadimplenciaPath
        ? (await pdfParse(fs.readFileSync(inadimplenciaPath))).text || ''
        : '';

      // ===== Prompt CONTATOS (somente PROPRIETÁRIO) =====
      const promptContatos = `Você é um extrator de contatos.
A partir do texto abaixo, gere um JSON agregando por unidade **somente para pessoas cujo tipo seja "Proprietário"**.

Regras:
- Campo "unidade": capture apenas os números e padronize com 3 dígitos (ex.: 1 -> "001").
- Campo "nome": nome do Proprietário da unidade (string).
- Campo "emails": array de e-mails válidos do Proprietário (0..n).
- Campo "telefones": array com todos os telefones do Proprietário (0..n), **preservando exatamente o formato como aparece no texto** (parênteses, espaços, hífens, DDI/DDD).
- Ignore telefones/e-mails de Residente/Dependente/etc.
- Saída **somente JSON válido**, no formato:
[
  {"unidade":"001","nome":"Fulano de Tal","emails":["fulano@x.com"],"telefones":["(98) 9 9999-9999"]}
]

Texto:
${contatosText}`;

      // ===== Prompt INADIMPLÊNCIA (opcional) =====
      const promptInad = inadimplenciaText
        ? `Você é um extrator de inadimplentes.
Do texto abaixo, gere JSON com as unidades inadimplentes (se houver).

Regras:
- Campo "unidade": apenas os números, 3 dígitos.
- Campo "nome": nome do titular/proprietário, se houver; senão null.
- Saída **somente JSON válido** no formato:
[{"unidade":"001","nome":"Fulano"}]

Texto:
${inadimplenciaText}`
        : null;

      // ==== OpenAI ====
      const tasks = [
        client.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 1,
          messages: [{ role: 'user', content: promptContatos }],
        })
      ];
      if (promptInad) {
        tasks.push(
          client.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 1,
            messages: [{ role: 'user', content: promptInad }],
          })
        );
      }

      const responses = await Promise.all(tasks);
      const respContatos = responses[0];
      const respInad = responses[1];

      const contatosArr = safeParseJSON(respContatos.choices?.[0]?.message?.content || '') || [];
      let inadSet = null;
      if (respInad) {
        const inadArr = safeParseJSON(respInad.choices?.[0]?.message?.content || '') || [];
        inadSet = new Set(inadArr.map(it => padCasa(it?.unidade)));
      }

      // Monta registros normalizados
      let registros = contatosArr.map(it => ({
        unidadeNum: padCasa(it?.unidade), // sempre numérico com 3 dígitos
        Nome: String(it?.nome || '').trim(),
        Email: Array.isArray(it?.emails) ? it.emails.filter(Boolean) : [],
        Telefone: Array.isArray(it?.telefones) ? it.telefones.filter(Boolean) : [],
      })).filter(r => r.unidadeNum);

      // Filtragens opcionais
      if (inadSet && inadSet.size > 0) {
        registros = registros.filter(r => inadSet.has(r.unidadeNum));
      }
      if (casaQuery) {
        registros = registros.filter(r => r.unidadeNum === casaQuery);
      }

      // Saída final com o prefixo (ex.: "CASA 005")
      const saida = registros.map(({ unidadeNum, Nome, Email, Telefone }) => ({
        unidade: `${UNIDADE_PREFIX} ${unidadeNum}`,
        Nome,
        Email,
        Telefone
      }));

      return res.json(saida);
    } catch (err) {
      console.error('Erro na rota /analisar:', err);
      return res.status(500).json({ erro: 'Falha ao processar PDFs ou chamar a OpenAI', detalhes: err.message });
    } finally {
      try { if (req.files?.contatos) fs.unlinkSync(req.files.contatos[0].path); } catch {}
      try { if (req.files?.inadimplencia) fs.unlinkSync(req.files.inadimplencia[0].path); } catch {}
    }
  }
);

module.exports = router;
