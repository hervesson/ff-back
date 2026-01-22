const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

function runPython(contatosPath, debitosPath) {
  return new Promise((resolve, reject) => {
    const pyBin =
      process.env.PYTHON_BIN || path.resolve(process.cwd(), ".venv", "bin", "python");

    const py = spawn(
      pyBin,
      ["scripts/brcondominios_extract.py", contatosPath, debitosPath],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let out = "";
    let err = "";

    py.stdout.on("data", (d) => (out += d.toString("utf-8")));
    py.stderr.on("data", (d) => (err += d.toString("utf-8")));

    py.on("error", (e) => reject(e));

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
    { name: "debitos", maxCount: 1 },
  ]),
  async (req, res) => {
    const contatosFile = req.files?.contatos?.[0];
    const debitosFile = req.files?.debitos?.[0];

    if (!contatosFile || !debitosFile) {
      return res.status(400).json({
        erro: 'Envie 2 PDFs via multipart: campos "contatos" e "debitos".',
      });
    }

    try {
      const result = await runPython(contatosFile.path, debitosFile.path);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ erro: "Falha ao extrair", detalhes: e.message });
    } finally {
      try { fs.unlinkSync(contatosFile.path); } catch {}
      try { fs.unlinkSync(debitosFile.path); } catch {}
    }
  }
);

module.exports = router;
