const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');

const {
  listProducts,
  getProductByCode,
  addProduct,
  updateProduct,
  deactivateProduct,
  suggestProducts
} = require('../services/productService');

router.get('/api/products', async (req, res) => {
  try {
    const data = await readData();
    const products = listProducts(data, req.query);

    res.json({
      success: true,
      total: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/api/products/suggest', async (req, res) => {
  try {
    const data = await readData();
    const products = suggestProducts(data, req.query.keyword || req.query.q || '', req.query);

    res.json({
      success: true,
      total: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/api/products/:code', async (req, res) => {
  try {
    const data = await readData();
    const product = getProductByCode(data, req.params.code);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sản phẩm'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/api/products', async (req, res) => {
  try {
    const data = await readData();
    const product = addProduct(data, req.body);

    await writeData(data);

    res.status(201).json({
      success: true,
      message: 'Đã thêm sản phẩm',
      data: product
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

router.put('/api/products/:code', async (req, res) => {
  try {
    const data = await readData();
    const product = updateProduct(data, req.params.code, req.body);

    await writeData(data);

    res.json({
      success: true,
      message: 'Đã cập nhật sản phẩm',
      data: product
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/api/products/:code', async (req, res) => {
  try {
    const data = await readData();
    const product = deactivateProduct(data, req.params.code);

    await writeData(data);

    res.json({
      success: true,
      message: 'Đã ngừng sử dụng sản phẩm',
      data: product
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
