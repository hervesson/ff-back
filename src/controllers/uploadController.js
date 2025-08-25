const bucket = require('../lib/firebaseAdmin');
const path = require('path');
const fs = require('fs');

/**
 * Recebe um array de arquivos (do multer) e retorna array de URLs públicas
 * files = [{ path: 'caminho temporário', originalname: 'nome.ext' }, ...]
 */
async function uploadFiles(files) {
  const urls = [];

  for (const file of files) {
    const destination = `uploads/${Date.now()}-${file.originalname}`;

    const [uploadedFile] = await bucket.upload(file.path, {
      destination,
      resumable: false,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: Date.now().toString(),
        },
      },
    });

    // Apaga arquivo temporário
    fs.unlinkSync(file.path);

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${uploadedFile.metadata.metadata.firebaseStorageDownloadTokens}`;
    urls.push({name: file.originalname, url: url});
  }

  return urls;
}

module.exports = uploadFiles;
