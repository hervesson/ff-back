require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===== util ===== */
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
    if (!raw) return [];
    return JSON.parse(
      raw
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim()
    );
  } catch {
    return [];
  }
}


/* ===== Prompt (SOMENTE APARTAMENTO/BLOCO) ===== */
function buildPromptContatos(contatosText) {
  return `
Extraia APENAS contatos do tipo **Proprietário** do texto abaixo.

O texto vem de um PDF de condomínio com a seguinte estrutura:
- Unidade no formato: "NNN BL BB"
  - NNN = apartamento (3 dígitos)
  - BB = bloco (2 dígitos)
- Após a unidade vêm:
  - Nome do morador (pode quebrar linha)
  - Telefones (podem estar em várias linhas, com ou sem DDI)
  - Tipo (Proprietário / Residente / Dependente / Procurador)
  - E-mails (0 ou mais, separados por ; ou em linhas diferentes)

REGRAS OBRIGATÓRIAS:
- Considere SOMENTE linhas cujo tipo seja "Proprietário"
- Ignore Residente, Dependente e Procurador
- Agrupe os dados por (apartamento + bloco)
- Remova telefones duplicados
- Remova e-mails duplicados
- Não trate números de CPF/CNPJ como telefone

Formato de saída (JSON PURO, sem texto extra):

[
  {
    "apto": "101",
    "bloco": "04",
    "nome": "NOME DO PROPRIETÁRIO",
    "telefones": ["..."],
    "emails": ["..."]
  }
]

Texto:
${contatosText}
`;
}

/* ========================== ROTA ========================== */
router.post(
  '/analisar-APs',
  upload.fields([{ name: 'contatos', maxCount: 1 }]),
  async (req, res) => {
    // filtro opcional por query
    const aptoQuery = req.query.apto ? pad3(req.query.apto) : null;
    const blocoQuery = req.query.bloco ? pad2(req.query.bloco) : null;

    if (!req.files || !req.files.contatos) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
    }

    const contatosPath = req.files.contatos[0].path;

    try {
      const contatosText =
        (await pdfParse(fs.readFileSync(contatosPath))).text || '';

      const respContatos = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 8000, // ✅ troca aqui
        messages: [{ role: "user", content: buildPromptContatos(contatosText) }],
      });

      const raw = respContatos.choices?.[0]?.message?.content || '';
      const contatosArr = safeParseJSON(raw) || [];

      // normaliza pra array
      const contatosList = Array.isArray(contatosArr)
        ? contatosArr
        : Array.isArray(contatosArr?.data)
          ? contatosArr.data
          : [];

      const unidadesMap = new Map();

      for (const item of contatosList) {
        const apto = pad3(item?.apto);
        const bloco = pad2(item?.bloco);

        if (!apto || !bloco) continue;

        // ✅ aplicar filtros opcionais
        if (aptoQuery && apto !== aptoQuery) continue;
        if (blocoQuery && bloco !== blocoQuery) continue;

        const key = `${apto}-BL-${bloco}`;

        const prev = unidadesMap.get(key) || {
          unidade: `${apto} BL ${bloco}`, // ou `${APT_PREFIX} ${apto} ${BLOCO_PREFIX} ${bloco}`
          Nome: '',
          Telefone: [],
          Email: [],
        };

        const telefones = Array.isArray(item?.telefones) ? item.telefones.filter(Boolean) : [];
        const emails = Array.isArray(item?.emails) ? item.emails.filter(Boolean) : [];
        const nome = String(item?.nome || '').trim();

        unidadesMap.set(key, {
          unidade: prev.unidade,
          Nome: prev.Nome || nome,
          Telefone: Array.from(new Set([...(prev.Telefone || []), ...telefones])),
          Email: Array.from(new Set([...(prev.Email || []), ...emails])),
        });
      }

      const resultadoFinal = Array.from(unidadesMap.values());
      return res.json(resultadoFinal);
    } catch (err) {
      console.error('Erro na rota /analisar:', err);
      return res.status(500).json({
        erro: 'Falha ao processar PDF ou chamar a OpenAI',
        detalhes: err.message,
      });
    } finally {
      try {
        if (req.files?.contatos) fs.unlinkSync(req.files.contatos[0].path);
      } catch { }
    }
  }
);

/* ===== Prompt ===== */
function buildPromptCasasUniversal(texto) {
  return `
Extraia contatos do tipo **Proprietário** do texto abaixo (PDF de condomínio).

O PDF contém unidades do tipo **CASA**. Em alguns PDFs existe também **QUADRA** (opcional).
Exemplos de padrões reais:
- "CASA 003" (sem quadra)
- "CASA 01" seguido de "QUADRA 01" em outra linha (com quadra)

TAREFA:
Retorne uma lista com UM objeto por unidade (casa), agrupando dados do Proprietário.

REGRAS OBRIGATÓRIAS:
- Considere SOMENTE registros cujo tipo seja "Proprietário"
- Ignore qualquer outro tipo (Residente, Dependente, Procurador, Inquilino etc.)
- Extraia e normalize:
  - casa: número da casa como string, com 1 ou mais dígitos (ex.: "3", "003", "120")
  - quadra: se existir (pode ser número com 1+ dígitos ou letra como "A"), senão "" (string vazia)
  - nome: nome completo do proprietário (pode estar quebrado em mais de uma linha)
  - telefones: array com todos os telefones/celulares do proprietário
  - emails: array com todos os e-mails do proprietário
- Remova telefones duplicados e e-mails duplicados
- Não trate CPF/CNPJ como telefone
- Não invente dados e não omita registros
- A unidade deve ser considerada pela combinação:
  - se quadra existir: (quadra + casa)
  - se quadra não existir: (casa)

FORMATO DE SAÍDA:
Retorne APENAS JSON válido (sem texto extra), exatamente assim:

[
  {
    "casa": "003",
    "quadra": "",
    "nome": "NOME DO PROPRIETÁRIO",
    "telefones": ["..."],
    "emails": ["..."]
  }
]

Texto:
${texto}
`;
}


/* ========================== ROTA ========================== */
router.post(
  '/analisar-casas',
  upload.fields([{ name: 'contatos', maxCount: 1 }]),
  async (req, res) => {
    if (!req.files?.contatos) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
    }

    const path = req.files.contatos[0].path;

    try {
      const text = (await pdfParse(fs.readFileSync(path))).text || '';

      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 4000,
        messages: [{ role: 'user', content: buildPromptCasasUniversal(text) }],
      });



      const raw = resp.choices?.[0]?.message?.content || '';
      const arr = safeParseJSON(raw);

      const map = new Map();

      for (const item of arr) {
        const casa = pad3(item?.casa);
        if (!casa) continue;

        const prev = map.get(casa) || {
          casa,
          Nome: '',
          Telefone: [],
          Email: [],
        };

        map.set(casa, {
          casa,
          Nome: prev.Nome || String(item?.nome || '').trim(),
          Telefone: Array.from(
            new Set([...(prev.Telefone || []), ...(item?.telefones || [])])
          ),
          Email: Array.from(
            new Set([...(prev.Email || []), ...(item?.emails || [])])
          ),
        });
      }

      return res.json(Array.from(map.values()));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Falha ao processar PDF' });
    } finally {
      try {
        fs.unlinkSync(path);
      } catch { }
    }
  }
);

function buildPromptLotes(lotesText) {
  return `
Você vai extrair APENAS os dados do contato do tipo "Proprietário" referentes a UMA unidade (uma casa) do texto abaixo.

O texto (chunk) sempre contém:
- "CASA <número>" (número pode ter 1 ou mais dígitos)
- Opcionalmente "QUADRA <valor>" (pode ser número com 1+ dígitos ou letra como "A")
- Nome do proprietário (pode estar quebrado em mais de uma linha)
- Telefones/celulares (podem estar em várias linhas, com parênteses, hífens, +55, e separados por ; )
- E-mails (podem estar em 1 ou mais linhas, separados por ; )

REGRAS:
- Se houver tipos (Residente/Dependente/Inquilino/Procurador), ignore tudo que NÃO for "Proprietário".
- Se o relatório já indicar "Tipo do contato: Proprietário", então todo contato no chunk é proprietário.
- Não trate CPF/CNPJ como telefone.
- Remova telefones duplicados.
- Remova e-mails duplicados.
- Não invente dados.
- Se não existir quadra no chunk, retorne quadra = "".

Retorne APENAS JSON válido, sem texto extra, exatamente neste formato:

{
  "casa": "<string numérica>",
  "quadra": "<string ou vazio>",
  "nome": "<string>",
  "telefones": ["..."],
  "emails": ["..."]
}

Texto:
${lotesText}
`;
}

/* ========================== ROTA ========================== */
router.post(
  '/analisar-lotes',
  upload.fields([{ name: 'contatos', maxCount: 1 }]),
  async (req, res) => {
    if (!req.files?.contatos) {
      return res.status(400).json({ erro: 'Arquivo "contatos" é obrigatório.' });
    }

    const path = req.files.contatos[0].path;

    try {
      const text = (await pdfParse(fs.readFileSync(path))).text || '';

      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPromptLotes(text) }],
      });

      const raw = resp.choices?.[0]?.message?.content || '';
      const parsed = safeParseJSON(raw);

      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];

      const map = new Map();

      for (const item of arr) {
        const lote = String(item?.lote || '').trim().toUpperCase();
        const quadra = String(item?.quadra || '').trim().toUpperCase();

        if (!lote) continue;

        const key = quadra
          ? `QD-${quadra}-LT-${lote}`
          : `LT-${lote}`;

        const prev = map.get(key) || {
          lote,
          quadra,
          Nome: '',
          Telefone: [],
          Email: [],
        };

        const telefones = Array.isArray(item?.telefones)
          ? item.telefones.filter(Boolean)
          : [];

        const emails = Array.isArray(item?.emails)
          ? item.emails.filter(Boolean)
          : [];

        const nome = String(item?.nome || '').trim();

        map.set(key, {
          lote,
          quadra,
          Nome: prev.Nome || nome,
          Telefone: Array.from(new Set([...(prev.Telefone || []), ...telefones])),
          Email: Array.from(new Set([...(prev.Email || []), ...emails])),
        });
      }

      return res.json(Array.from(map.values()));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Falha ao processar PDF de lotes' });
    } finally {
      try {
        fs.unlinkSync(path);
      } catch { }
    }
  }
);


module.exports = router;
