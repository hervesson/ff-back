require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Prefixos configuráveis
const UNIDADE_PREFIX = process.env.UNIDADE_PREFIX || 'CASA';   // para "casa"
const APT_PREFIX = process.env.APT_PREFIX || 'AP';             // para "ap_bloco"
const BLOCO_PREFIX = process.env.BLOCO_PREFIX || 'BLOCO';

/* ===== util ===== */
function pad3(n) {
  const s = String(n || '').replace(/\D/g, '');
  return s ? s.padStart(3, '0') : '';
}
function pad2(n) {
  const s = String(n || '').replace(/\D/g, '');
  return s ? s.padStart(2, '0') : '';
}
function padCasa(n) { return pad3(n); }

function safeParseJSON(raw) {
  try {
    if (!raw) return null;
    const cleaned = raw.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/* ===== Prompts ===== */
function buildPromptContatos(contatosText) {
  // Este prompt lida com os dois jeitos:
  // - “CASA 001 … Proprietário …”
  // - Tabela “Unidade Nome/Telefone…”, onde Unidade traz “APTO BLOCO” (ex. “101 03”)
  return `Você é um extrator de contatos. A partir do texto fornecido, detecte o formato e extraia SOMENTE dados do tipo/qualificação **"Proprietário"** agregando por unidade.

Existem dois formatos possíveis no texto:
1) **CASA**: aparece a palavra "CASA" seguida do número (ex.: "CASA 001"). Para este caso:
   - Saída (por item): {"tipo":"casa","unidade":"NNN","nome":"...","emails":[...],"telefones":[...]}
   - "unidade" deve ser apenas o número em 3 dígitos, ex.: "001".

2) **APARTAMENTO/BLOCO** (planilha com cabeçalho “Unidade Nome/Telefone/Celular Tipo E-mail”):
   - A coluna "Unidade" traz **duas colunas numéricas**: primeiro o **apartamento** (3 dígitos, ex. 101), depois o **bloco** (2 dígitos, ex. 03).
   - Exemplo de linha: "101 03 Fulano ...  Proprietário ...".
   - Saída (por item): {"tipo":"ap_bloco","apto":"NNN","bloco":"BB","nome":"...","emails":[...],"telefones":[...]}
   - "apto" deve ter 3 dígitos, "bloco" 2 dígitos.

Regras gerais:
- "nome": string do Proprietário.
- "emails": array de e-mails válidos do Proprietário (0..n).
- "telefones": array com telefones do Proprietário (0..n), **preservando exatamente o formato do texto** (parênteses, traços, espaços).
- Ignore telefones/e-mails de Residente/Dependente/Visitante etc.
- Não inclua CPFs/CNPJs/RGs como telefone.
- Responda **apenas um JSON válido** (array de objetos) sem comentários.

Texto:
${contatosText}`;
}

/* ========================== ROTA ========================== */
router.post(
  '/analisar',
  upload.fields([
    { name: 'contatos', maxCount: 1 },       // obrigatório
  ]),
  async (req, res) => {
    const casaQuery = req.query.casa ? padCasa(req.query.casa) : null; // segue funcionando p/ CASA

    if (!req.files || !req.files.contatos) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
    }

    const contatosPath = req.files.contatos[0].path;

    try {
      // Lê PDFs
      const contatosText = (await pdfParse(fs.readFileSync(contatosPath))).text || '';

      // ===== OpenAI =====
      const tasks = [
        client.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 1,
          messages: [{ role: 'user', content: buildPromptContatos(contatosText) }],
        })
      ];

      const responses = await Promise.all(tasks);
      const respContatos = responses[0];
      const respInad = responses[1];

      const contatosArr = safeParseJSON(respContatos.choices?.[0]?.message?.content || '') || [];
      let inadList = null;
      if (respInad) {
        inadList = safeParseJSON(respInad.choices?.[0]?.message?.content || '') || [];
      }

      // Normaliza para um índice interno por "chave de unidade"
      // chave para casa: C-<NNN>
      // chave para ap/bloco: A-<NNN>-<BB>
      const keyCasa = (n) => `C-${pad3(n)}`;
      const keyApBloco = (a, b) => `A-${pad3(a)}-${pad2(b)}`;

      const contatosMap = new Map();
      for (const it of contatosArr) {
        let key = null, displayUnidade = null;

        if (String(it?.tipo).toLowerCase() === 'ap_bloco') {
          const apto = pad3(it?.apto);
          const bloco = pad2(it?.bloco);
          if (!apto || !bloco) continue;
          key = keyApBloco(apto, bloco);
          displayUnidade = `${APT_PREFIX} ${apto} ${BLOCO_PREFIX} ${bloco}`;
        } else {
          // default/casa
          const unidadeNum = pad3(it?.unidade);
          if (!unidadeNum) continue;
          key = keyCasa(unidadeNum);
          displayUnidade = `${UNIDADE_PREFIX} ${unidadeNum}`;
        }

        const nome = String(it?.nome || '').trim();
        const emails = Array.isArray(it?.emails) ? it.emails.filter(Boolean) : [];
        const telefones = Array.isArray(it?.telefones) ? it.telefones.filter(Boolean) : [];

        const prev = contatosMap.get(key) || { unidadeLabel: displayUnidade, Nome: '', Email: [], Telefone: [] };
        contatosMap.set(key, {
          unidadeLabel: displayUnidade,
          Nome: prev.Nome || nome, // mantém o primeiro nome válido
          Email: Array.from(new Set([...(prev.Email || []), ...emails])),
          Telefone: Array.from(new Set([...(prev.Telefone || []), ...telefones])),
        });
      }

      // Se tiver lista de inadimplentes, filtramos
      let keysToReturn = null;
      if (inadList && inadList.length) {
        keysToReturn = new Set(
          inadList.map(n => {
            if (String(n?.tipo).toLowerCase() === 'ap_bloco') {
              const apto = pad3(n?.apto);
              const bloco = pad2(n?.bloco);
              return apto && bloco ? keyApBloco(apto, bloco) : null;
            }
            const u = pad3(n?.unidade);
            return u ? keyCasa(u) : null;
          }).filter(Boolean)
        );
      }

      // Filtro opcional por ?casa=NNN (mantido para retrocompat.)
      // Observação: esse filtro só faz sentido para “casa”.
      if (casaQuery) {
        const onlyKey = keyCasa(casaQuery);
        keysToReturn = new Set([onlyKey]);
      }

      // Monta saída final
      const out = [];
      for (const [key, val] of contatosMap.entries()) {
        if (keysToReturn && !keysToReturn.has(key)) continue;
        out.push({
          unidade: val.unidadeLabel,
          Nome: val.Nome,
          Email: val.Email,
          Telefone: val.Telefone
        });
      }

      return res.json(out);
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
