const express = require('express');
const router = express.Router();

const { readData } = require('../config/db');
const { SEARCH_REGISTRY, searchByEntity, suggestByEntity } = require('../services/searchService');

router.get('/api/search/entities', (req, res) => {
  res.json({
    success: true,
    data: Object.keys(SEARCH_REGISTRY)
  });
});

router.get('/api/search', async (req, res) => {
  try {
    const data = await readData();
    const entity = req.query.entity || 'products';
    const results = searchByEntity(data, entity, req.query);

    res.json({
      success: true,
      entity,
      total: results.length,
      data: results
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/api/search/:entity', async (req, res) => {
  try {
    const data = await readData();
    const results = searchByEntity(data, req.params.entity, req.query);

    res.json({
      success: true,
      entity: req.params.entity,
      total: results.length,
      data: results
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/api/search/:entity/suggest', async (req, res) => {
  try {
    const data = await readData();
    const results = suggestByEntity(data, req.params.entity, req.query);

    res.json({
      success: true,
      entity: req.params.entity,
      total: results.length,
      data: results
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
