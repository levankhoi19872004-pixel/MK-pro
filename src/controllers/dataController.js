const dataService = require('../services/dataService');

exports.getData = async (req, res) => {
  const data = await dataService.getDb();
  res.json(data);
};

exports.saveData = async (req, res) => {
  const data = await dataService.saveDb(req.body);
  res.json({ success: true, storage: 'mongodb', data });
};

exports.health = async (req, res) => res.json({ success: true, status: 'ok', storage: 'mongodb' });
