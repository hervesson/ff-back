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
const chargesRoutesDirectSuperlogica = require('./routes/chargesRoutesDirectSuperlogica');
const chargesRoutesDirectCondomob = require('./routes/chargesRoutesDirectCondomob');
const chargesRoutesDirectBRCondominios = require('./routes/chargesRoutesDirectBRCondominios');
const chargesRoutesPySuperlogica = require('./routes/chargesRoutesPySuperlogica');
const chargesRoutesPyCondomob = require('./routes/chargesRoutesPyCondomob');


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
app.use('/cobrancas/superlogica', chargesRoutesSupelogica);
app.use('/cobrancas/condomob', chargesRoutesCondomob);
app.use('/cobrancas/direct/superlogica', chargesRoutesDirectSuperlogica);
app.use('/cobrancas/direct/condomob', chargesRoutesDirectCondomob);
app.use('/cobrancas/direct/brcondominios', chargesRoutesDirectBRCondominios);
app.use('/cobrancas/pyton/superlogica', chargesRoutesPySuperlogica);
app.use('/cobrancas/pyton/condomob', chargesRoutesPyCondomob);

// Porta dinâmica do EasyPanel/Heroku
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
