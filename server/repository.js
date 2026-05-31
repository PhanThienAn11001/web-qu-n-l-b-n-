import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { seedData } from './seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '../data/inventory.json');
const sheetNames = ['Products', 'Shops', 'Distributions', 'Users', 'ActivityLogs'];

export function createRepository() {
  if (hasGoogleSheetsConfig()) {
    console.log('USING GOOGLE SHEETS');
    return new GoogleSheetsRepository();
  }

  console.log('USING LOCAL JSON FILE');

  return new FileRepository(dataPath);
}

class FileRepository {
  constructor(filePath) {
    this.filePath = filePath;
  }

 async read() {
  console.log('READING GOOGLE SHEETS');

  await this.ensureInitialized();
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(raw);
  }
  async write(data) {
  console.log('WRITING GOOGLE SHEETS');

  await this.ensureInitialized();
  
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  async ensureFile() {
    try {
      await fs.access(this.filePath);
    } catch {
      await this.write(seedData);
    }
  }
}

class GoogleSheetsRepository {
  constructor() {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.initialized = false;
  }

  async read() {
  await this.ensureInitialized();
  const [products, shops, distributions, users, activityLogs] = await Promise.all(
    sheetNames.map((name) => this.readSheet(name)),
  );

  return {
    products: products.map(parseProduct),
    shops,
    distributions: distributions.map(parseDistribution),
    users,
    activityLogs: activityLogs.map(parseActivityLog),
  };
}

  async write(data) {
    await this.ensureInitialized();
    await Promise.all(sheetNames.map((name) => this.writeSheet(name, data[nameToKey(name)])));
  }

  async ensureInitialized() {
    if (this.initialized) return;

    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const existingNames = new Set(response.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean));
    const missingNames = sheetNames.filter((name) => !existingNames.has(name));

    if (missingNames.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: missingNames.map((title) => ({
            addSheet: {
              properties: { title },
            },
          })),
        },
      });
    }

    this.initialized = true;
  }

  async readSheet(name) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${name}!A:Z`,
    });

    const [headers = [], ...rows] = response.data.values || [];
    return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])));
  }

  async writeSheet(name, rows) {
    const seedRow = seedData[nameToKey(name)]?.[0] || {};
    const headers = [...Object.keys(seedRow)];
    for (const row of rows) {
      for (const key of Object.keys(row || {})) {
        if (!headers.includes(key)) headers.push(key);
      }
    }
    const values = [headers, ...rows.map((row) => headers.map((header) => serializeCell(row[header])) )];

    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${name}!A:Z`,
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function hasGoogleSheetsConfig() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function parseProduct(product) {
  return {
    ...product,
    totalImported: Number(product.totalImported || 0),
    totalExported: Number(product.totalExported || 0),
    factoryReturnDefects: Number(product.factoryReturnDefects || 0),
    unfixableDefects: Number(product.unfixableDefects || 0),
    fixableDefects: Number(product.fixableDefects || 0),
    lowStockThreshold: Number(product.lowStockThreshold || 0),
  };
}

function parseDistribution(distribution) {
  return {
    ...distribution,
    quantity: Number(distribution.quantity || 0),
  };
}

function parseActivityLog(log) {
  return {
    ...log,
    metadata: parseJsonField(log.metadata, {}),
  };
}

function parseJsonField(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeCell(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function nameToKey(name) {
  return {
    Products: 'products',
    Shops: 'shops',
    Distributions: 'distributions',
    Users: 'users',
    ActivityLogs: 'activityLogs',
  }[name];
}
