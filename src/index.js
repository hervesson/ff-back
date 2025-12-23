require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas principais
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const condominiumRoutes = require('./routes/condominiumRoutes');
const servicesRoutes = require('./routes/servicesRoutes');
const uploadRoutes = require('./routes/uploads');
const chargesRoutesSupelogica = require('./routes/chargesRoutesSuperlogica');
const chargesRoutesCondomob = require('./routes/chargesRoutesCondomob');
const chargesRoutesJS = require('./routes/chargesRoutesJS');
const chargesRoutesPdfDirectAI = require('./routes/chargesRoutesPdfDirectAI');


// Rota raiz para teste rápido
app.get("/", (req, res) => {
  res.send("API online 🚀");
});

// Endpoint de healthcheck para EasyPanel ou monitoramento
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Demais rotas
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/condominium', condominiumRoutes);
app.use('/service', servicesRoutes);
app.use('/files', uploadRoutes);
app.use('/cobrancas', chargesRoutesSupelogica);
app.use('/cobrancas', chargesRoutesCondomob);
app.use('/cobrancas', chargesRoutesPdfDirectAI);


// Porta dinâmica do EasyPanel/Heroku
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
