const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'kho-data.json');

function createEmptyData() {
  return {
    products: [],
    customers: [],
    staff: [],
    warehouses: [],
    documents: [],
    postings: [],
    payments: [],
    meta: {
      version: 'V43',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    const emptyData = createEmptyData();
    await fs.writeFile(DATA_FILE, JSON.stringify(emptyData, null, 2), 'utf8');
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const data = raw ? JSON.parse(raw) : createEmptyData();

  if (!data.products) data.products = [];
  if (!data.customers) data.customers = [];
  if (!data.staff) data.staff = [];
  if (!data.warehouses) data.warehouses = [];
  if (!data.documents) data.documents = [];
  if (!data.postings) data.postings = [];
  if (!data.payments) data.payments = [];
  if (!data.meta) data.meta = {};

  return data;
}

async function writeData(data) {
  await ensureDataFile();

  const nextData = {
    ...data,
    meta: {
      ...(data.meta || {}),
      version: 'V43',
      updatedAt: new Date().toISOString()
    }
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(nextData, null, 2), 'utf8');
  return nextData;
}

module.exports = {
  readData,
  writeData,
  createEmptyData
};
