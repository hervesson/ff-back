require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const condominiumRoutes = require('./routes/condominiumRoutes')
const servicesRoutes = require('./routes/servicesRoutes')
const uploadRoutes = require('./routes/uploads')

app.use(express.json());
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/condominium', condominiumRoutes);
app.use('/service', servicesRoutes);
app.use('/files', uploadRoutes);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
