
const condominiumModel = require('../models/condominiumModel')

const createCondominium = async (req, res) => {
  const { name, cnpj, sistemaDeGestao, tipoDeUnidade, trustee, phone } = req.body;

  await condominiumModel.createCondominium(name, cnpj, sistemaDeGestao, tipoDeUnidade, trustee, phone)

  res.status(201).json({ message: 'Usuário registrado com sucesso' });
};

const getAllCondominiuns = async (req, res) => {
  // pega o termo de busca da query string, se não vier nada assume string vazia
  const searchTerm = req.query.search || '';

  try {
    const condominiums = await condominiumModel.getAllCondominiuns(searchTerm);

    res.status(200).json({
      success: true,
      count: condominiums.length,
      data: condominiums,
    });
  } catch (error) {
    console.error('Erro ao buscar condomínios:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar condomínios'
    });
  }
};


const editCondominium = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, cnpj, sistemaDeGestao, tipoDeUnidade, trustee, phone } = req.body;

    let fieldsToUpdate = {};
    if (name) fieldsToUpdate.name = name;
    if (sistemaDeGestao) fieldsToUpdate.sistema_de_gestao = sistemaDeGestao;
    if (tipoDeUnidade) fieldsToUpdate.tipo_de_unidade = tipoDeUnidade;
    if (cnpj) fieldsToUpdate.cnpj = cnpj;
    if (trustee) fieldsToUpdate.trustee = trustee;
    if (phone) fieldsToUpdate.phone = phone;

    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({ message: 'Nenhum campo enviado para atualização' });
    }

    const updated = await condominiumModel.updateCondominium(id, fieldsToUpdate);

    if (!updated) {
      return res.status(404).json({ message: 'Condomínio não encontrado' });
    }

    res.status(200).json({ message: 'Condomínio atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao editar condomínio:', error);
    res.status(500).json({ message: 'Erro ao editar condomínio' });
  }
};



module.exports = { createCondominium, getAllCondominiuns, editCondominium };
