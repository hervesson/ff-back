const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { spawn } = require("child_process");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

function runPython(contatosPath, inadPath) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", ["scripts/superlogica_extract.py", contatosPath, inadPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    py.stdout.on("data", (d) => (out += d.toString("utf-8")));
    py.stderr.on("data", (d) => (err += d.toString("utf-8")));

    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || `Python exit ${code}`));
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        reject(new Error("Python não retornou JSON válido (stdout)."));
      }
    });
  });
}

router.post(
  "/analisar",
  upload.fields([
    { name: "contatos", maxCount: 1 },
    { name: "inadimplentes", maxCount: 1 },
  ]),
  async (req, res) => {
    const contatosFile = req.files?.contatos?.[0];
    const inadFile = req.files?.inadimplentes?.[0];

    if (!contatosFile || !inadFile) {
      return res.status(400).json({
        erro: 'Envie 2 PDFs via multipart: campos "contatos" e "inadimplentes".',
      });
    }

    try {
      const result = await runPython(contatosFile.path, inadFile.path);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao extrair", detalhes: e.message });
    } finally {
      try { fs.unlinkSync(contatosFile.path); } catch { }
      try { fs.unlinkSync(inadFile.path); } catch { }
    }
  }
);

module.exports = router;
