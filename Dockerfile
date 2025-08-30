# =========================
# STAGE 1: Build
# =========================
FROM node:20 AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala todas as dependências (prod + dev)
RUN npm install

# Copia todo o código da aplicação
COPY . .

# =========================
# STAGE 2: Produção
# =========================
FROM node:20-slim

# Define o diretório de trabalho
WORKDIR /app

# Copia apenas as dependências de produção do stage anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Expõe a porta que a aplicação vai usar (process.env.PORT)
EXPOSE 3000

# Comando de start
CMD ["node", "src/index.js"]
