


const Analyze = async (req, res) => {
  try {
   

    res.status(200).json({ message: 'Chegando com sucesso' });
  } catch (error) {
    console.error('Erro ao editar senha:', error);
    res.status(500).json({ message: 'Erro ao editar senha' });
  }
};

module.exports = { Analyze};