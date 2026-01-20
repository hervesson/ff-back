# =========================
# STAGE 1: Build (Node deps)
# =========================
FROM node:20-bookworm AS builder

WORKDIR /app

# Node deps
COPY package*.json ./
RUN npm install

# App code
COPY . .

# =========================
# STAGE 2: Produção (Node + Python)
# =========================
FROM node:20-bookworm

WORKDIR /app

# Instala Python + venv + pip (persistente na imagem)
RUN apt-get update && apt-get install -y \
    python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Copia app + node_modules do builder
COPY --from=builder /app /app

# Cria venv e instala libs Python
RUN python3 -m venv /app/.venv \
 && /app/.venv/bin/pip install --upgrade pip \
 && /app/.venv/bin/pip install -r /app/requirements.txt

# Pasta de uploads (se usar Multer em uploads/)
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.js"]
