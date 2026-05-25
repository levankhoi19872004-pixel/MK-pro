const userService = require('../services/userService');

exports.login = async (req, res) => {
  try{
    const result = await userService.login(req.body.username, req.body.password);
    res.json({ success: true, ...result });
  }catch(err){
    res.status(401).json({ success: false, error: err.message });
  }
};

exports.me = async (req, res) => res.json({ success: true, user: req.user });

exports.listUsers = async (req, res) => {
  const users = await userService.listUsers();
  res.json({ success: true, users });
};

exports.upsertUser = async (req, res) => {
  try{
    const user = await userService.upsertUser(req.body);
    res.json({ success: true, user });
  }catch(err){
    res.status(400).json({ success: false, error: err.message });
  }
};


exports.deleteUser = async (req, res) => {
  try{
    await userService.deleteUser(req.params.username);
    res.json({ success: true });
  }catch(err){
    res.status(400).json({ success: false, error: err.message });
  }
};
