'use strict';

const { canonicalizeOperationalStaff } = require('../../../utils/canonicalStaffWrite.util');
const dateUtil = require('../../../utils/date.util');
const ImportOrder = require('../../../models/ImportOrder');
const SalesOrder = require('../../../models/SalesOrder');
const StockTransaction = require('../../../models/StockTransaction');
const inventoryStockService = require('../../inventoryStock.service');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const { applyOrderSourceFields, ORDER_SOURCE } = require('../../../utils/orderSource.util');
const { DIRECT_PRICE } = require('../../../constants/pricingModes');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../../../constants/business.constants');
const importSessionService = require('../../importSessionService');
const { runAtomicChunks } = require('../importTransaction.service');
const InventoryPostingService = require('../../../domain/posting/InventoryPostingService');
const { normalizePickingZone, pickingZoneFrom, legacyPrintGroupCode, pickingZoneLabel, PICKING_ZONES } = require('../../../utils/pickingZone.util');
const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);
const { addImportLog } = require('../core/importLogging.util');
const AUTO_CREATED_CUSTOMER_ADDRESS = 'NEW';

const values = require('../core/importValue.util');
const persistence = require('../core/importPersistence.util');
const rows = require('../core/importRow.util');
const {
  makeReturnDraftItemFromImportItem,
  buildReturnDraftFromImportedOrder,
  allocateStockForSaleAndPromo,
  cleanText,
  dateOnly,
  getCartonsFromRow,
  getCustomerCodeFromRow,
  getCustomerNameFromRow,
  getDateFromRow,
  getDmsAmountFromRow,
  getDmsCatalogPriceAfterVatFromRow,
  getDmsPriceFromRow,
  getDmsPromoQuantityFromRow,
  getDmsQuantityFromRow,
  getDmsVatAmountForLine,
  getGsvAmountFromRow,
  getNivAmountFromRow,
  getPackingFromRow,
  getProductCodeFromRow,
  getPromoCartons2FromRow,
  getPromoCartonsFromRow,
  getPromoUnits2FromRow,
  getPromoUnitsFromRow,
  getQtyFromRow,
  getRouteCodeFromRow,
  getUnitsFromRow
} = values;
const {
  buildImportedCustomerPlaceholder,
  buildRunningCodes,
  collectImportedCustomerCandidates,
  ensureImportedCustomersForOrderChunk,
  groupRows,
  importedCustomerCandidateError,
  insertManyInBatches,
  preloadCustomersByCode,
  preloadProductsByCode,
  setOpeningStockInventoriesBulk
} = persistence;
const {
  getOrderDocumentCode,
  makeSalesOrderGroupKey,
  preloadSalesStaffUsersByCode,
  resolveSalesStaffForImportRow
} = rows;

async function importOpeningStock(rows = []) {
  const shortageReport = [];
  let imported = 0;
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const codeList = await buildRunningCodes(StockTransaction, 'TD', rows.length);
  let codeIndex = 0;
  const movements = [];
  const snapshotRows = [];

  for (const row of rows) {
    const productCode = getProductCodeFromRow(row);
    const product = productMap.get(cleanText(productCode)) || null;
    const quantity = getQtyFromRow(row, product);
    if (!productCode || quantity < 0) {
      skipped += 1;
      errors.push({ productCode, message: !productCode ? 'Thiếu mã sản phẩm' : 'Tồn đầu không được âm' });
      continue;
    }
    if (!product) {
      skipped += 1;
      errors.push({ productCode, message: 'Không tìm thấy sản phẩm trong danh mục. Tồn kho ban đầu chỉ nhận mã sản phẩm đã có.' });
      continue;
    }
    const date = dateOnly(row.date || row.documentDate || row['Ngày'] || row['Ngay'] || dateUtil.todayVN());
    const docCode = cleanText(row.documentCode || row.code || row['Mã phiếu'] || row['Ma phieu']) || codeList[codeIndex++] || makeId('TD');
    // Tồn kho chỉ có 1 kho chính. HC/PC chỉ là nhóm in/gộp đơn, không ghi vào lịch sử tồn đầu.
    const warehouseCode = STOCK_WAREHOUSE_CODE || 'MAIN';
    const warehouseName = STOCK_WAREHOUSE_NAME || 'Kho chính';
    const productId = String(product.id || product._id || productCode);
    const productName = product.name || productCode;
    const note = cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import tồn đầu Excel';

    movements.push({
      id: makeId('ST'),
      date,
      productId,
      productCode: product?.code || productCode,
      productName,
      warehouseId: warehouseCode,
      warehouseCode,
      warehouseName,
      type: 'OPENING',
      direction: 'IN',
      quantity,
      qty: quantity,
      inQty: quantity,
      outQty: 0,
      balanceQty: quantity,
      refType: 'OPENING_STOCK_IMPORT',
      refId: makeId('OS'),
      refCode: docCode,
      note,
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    });
    snapshotRows.push({
      productId,
      productCode: product?.code || productCode,
      productName,
      warehouseId: warehouseCode,
      warehouseCode,
      warehouseName,
      quantity
    });
    imported += 1;
  }

  if (movements.length) await insertManyInBatches(StockTransaction, movements);
  const inventoryResult = await setOpeningStockInventoriesBulk(snapshotRows);
  await addImportLog('openingStock', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'setOpeningStockSnapshots',
    batchSize: IMPORT_BATCH_SIZE,
    stockTransactions: movements.length,
    inventoryRows: inventoryResult.inventoryRows,
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return { imported, skipped, errors, shortageReport };
}

async function importImportOrders(rows = []) {
  let skipped = 0;
  const errors = [];
  const productMap = await preloadProductsByCode(rows);
  const importDocumentCodes = Array.from(new Set(rows.map(r => cleanText(r.documentCode || r.code || r['Số hóa đơn'] || r['So hoa don'] || r['Mã đơn'] || r['Ma don'])).filter(Boolean)));
  const existingOrders = await SalesOrder.find({ documentCode: { $in: importDocumentCodes } }).select('documentCode').lean().catch(() => []);
  const existingDocumentSet = new Set(existingOrders.map(o => cleanText(o.documentCode)));
const groups = groupRows(rows, (r) => `${cleanText(r.documentCode || r.code || r['Mã phiếu'] || r['Ma phieu']) || 'AUTO'}|${dateOnly(r.date || r['Ngày'] || r['Ngay'] || dateUtil.todayVN())}|${cleanText(r.supplier || r.supplierName || r['Nhà cung cấp'] || r['Nha cung cap']) || 'Import Excel'}`);
  const autoCodes = await buildRunningCodes(ImportOrder, 'PN', groups.length);
  let autoIdx = 0;
  const docs = [];
  const movements = [];
  const inventoryDeltas = new Map();
  const shortageReport = [];

  for (const group of groups) {
    const first = group[0] || {};
    const items = [];
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row, product);
      const costPrice = toNumber(product?.costPrice || 0);

      // Phiếu nhập kho: dòng SL = 0 nghĩa là không nhập sản phẩm này.
      // Bỏ qua an toàn, không ghi lỗi.
      if (quantity === 0) {
        skipped += 1;
        continue;
      }

      if (!product || quantity < 0) {
        skipped += 1;
        errors.push({ productCode, message: !product ? 'Không tìm thấy sản phẩm' : 'Số lượng nhập không được âm' });
        continue;
      }
      const pickingZone = normalizePickingZone(
        pickingZoneFrom(
          row.pickingZone || row['Khu bốc hàng'] || row['Khu boc hang'],
          product,
          row.warehouseCode || row.warehouse || row['Kho']
        ),
        PICKING_ZONES.HC
      );
      items.push({
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        quantity,
        costPrice,
        amount: quantity * costPrice,
        pickingZone,
        // Alias in phiếu nhập cũ; InventoryPostingService vẫn luôn ghi MAIN.
        warehouseCode: legacyPrintGroupCode(pickingZone),
        warehouseName: pickingZoneLabel(pickingZone)
      });
    }
    if (!items.length) continue;
    const now = dateUtil.nowIso();
    const importDate = dateOnly(first.date || first.documentDate || first.importDate || first['Ngày'] || first['Ngay'] || dateUtil.todayVN());
    const doc = {
      id: makeId('IM'),
      code: cleanText(first.documentCode || first.code || first['Mã phiếu'] || first['Ma phieu']) || autoCodes[autoIdx++] || makeId('PN'),
      date: importDate,
      documentDate: importDate,
      importDate,
      supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      supplierName: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
      // Kho vật lý của chứng từ luôn là MAIN. HC/PC chỉ nằm ở pickingZone của từng dòng để phục vụ in/bốc hàng.
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel Mongo-native bulk',
      status: 'draft',
      items,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
      totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0),
      createdAt: now,
      updatedAt: now
    };
    docs.push(doc);
    // Phiếu nhập import Excel chỉ tạo bản nháp; chưa ghi tồn kho.
  }

  const orderResult = await insertManyInBatches(ImportOrder, docs);
  const inventoryResult = { transactionCount: 0, inventoryRows: 0 };
  skipped += orderResult.errors.length;
  errors.push(...orderResult.errors.map((error) => ({ productCode: '', message: error.message })));
  const imported = Math.max(0, docs.length - orderResult.errors.length);
  await addImportLog('importOrders', {
    imported,
    skipped,
    errors: errors.slice(0, 30),
    mode: 'bulkImportOrders',
    batchSize: IMPORT_BATCH_SIZE,
    stockTransactions: inventoryResult.transactionCount,
    inventoryRows: inventoryResult.inventoryRows,
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return { imported, skipped, errors, shortageReport };
}

async function importSalesOrders(rows = [], options = {}) {
  const startedAtMs = Date.now();
  const autoCutStock = Boolean(options.autoCutStock);
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const importedCustomerCandidates = collectImportedCustomerCandidates(rows, customerMap);
  const productMap = await preloadProductsByCode(rows);
  const salesStaffUserMap = await preloadSalesStaffUsersByCode(rows);
  const productCodes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  const importDocumentCodes = Array.from(new Set(rows.map(getOrderDocumentCode).map(cleanText).filter((code) => code && code !== 'AUTO')));
  const existingSalesOrders = importDocumentCodes.length
    ? await SalesOrder.find({
        $or: [
          { documentCode: { $in: importDocumentCodes } },
          { code: { $in: importDocumentCodes } }
        ]
      }).select('documentCode code').lean().catch(() => [])
    : [];
  const existingDocumentSet = new Set(
    existingSalesOrders
      .flatMap((order) => [order.documentCode, order.code])
      .map(cleanText)
      .filter(Boolean)
  );
  const importedDocumentSet = new Set();
  // Lấy tồn kho theo mã sản phẩm. Không khóa cứng warehouseCode ở bước import DMS,
  // vì tồn đầu/import cũ có thể lưu warehouseCode rỗng hoặc thiếu warehouseCode.
  // Nếu chỉ query MAIN thì màn Tồn kho thấy còn hàng nhưng import lại báo còn 0.
  const stockByCode = await inventoryStockService.getAvailableStocks(productCodes);
  const productStockMap = new Map();
  for (const code of productCodes) {
    const normalizedCode = inventoryStockService.normalizeProductCode(code);
    productStockMap.set(cleanText(code), toNumber(stockByCode[normalizedCode]));
  }
  const groups = groupRows(rows, makeSalesOrderGroupKey);
  const autoOrderCodes = await buildRunningCodes(SalesOrder, 'BH', groups.length);
  let autoOrderIdx = 0;
  const orderDocs = [];
  // ERP/DMS chuẩn: import Excel DMS chỉ tạo đơn con chờ gộp/giao.
  // Không tạo Payment/Cashbook/AR ngay tại bước import, vì công nợ chỉ phát sinh khi giao hàng thành công.
  const shortageReport = [];

  for (const group of groups) {
    const first = group[0] || {};
    const resolvedSalesStaff = resolveSalesStaffForImportRow(first, salesStaffUserMap);
    const docCodeCheck = getOrderDocumentCode(first);
    if (docCodeCheck && docCodeCheck !== 'AUTO' && existingDocumentSet.has(docCodeCheck)) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Đơn đã tồn tại - bỏ qua import' });
      continue;
    }
    if (docCodeCheck && docCodeCheck !== 'AUTO' && importedDocumentSet.has(docCodeCheck)) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Đơn trùng trong cùng file - bỏ qua import' });
      continue;
    }

    const customerCode = getCustomerCodeFromRow(first);
    const customerCandidate = importedCustomerCandidates.get(cleanText(customerCode));
    const customer = customerMap.get(cleanText(customerCode)) || buildImportedCustomerPlaceholder(customerCandidate);
    if (!customer) {
      skipped += group.length;
      errors.push({
        customerCode,
        message: customerCode
          ? importedCustomerCandidateError(customerCandidate, customerCode)
          : 'Thiếu mã khách hàng / mã cửa hàng'
      });
      continue;
    }
    if (!resolvedSalesStaff.staffCode) {
      skipped += group.length;
      errors.push({ documentCode: docCodeCheck, message: 'Thiếu mã NVBH trong file Excel import' });
      continue;
    }
    if (!resolvedSalesStaff.found) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Mã NVBH ${resolvedSalesStaff.staffCode} không tồn tại trong users`
      });
      continue;
    }

    if (!resolvedSalesStaff.validRole) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Mã ${resolvedSalesStaff.staffCode} không phải nhân viên bán hàng`
      });
      continue;
    }

    if (!resolvedSalesStaff.hasUserStaffCode) {
      skipped += group.length;
      errors.push({
        documentCode: docCodeCheck,
        staffCode: resolvedSalesStaff.staffCode,
        message: `Tài khoản NVBH ${resolvedSalesStaff.staffCode} thiếu mã nhân viên trong users`
      });
      continue;
    }

    const items = [];
    let groupInvalid = false;
    for (const row of group) {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      let rawSaleQuantity = Object.prototype.hasOwnProperty.call(row, '__allowedSaleQuantity')
        ? toNumber(row.__allowedSaleQuantity)
        : getDmsQuantityFromRow(row, product);
      let rawPromoQuantity = Object.prototype.hasOwnProperty.call(row, '__allowedPromoQuantity')
        ? toNumber(row.__allowedPromoQuantity)
        : getDmsPromoQuantityFromRow(row, product);
      let deliveredQuantity = rawSaleQuantity + rawPromoQuantity;
      const originalSaleQuantity = rawSaleQuantity;
      const originalPromoQuantity = rawPromoQuantity;
      const salePrice = getDmsPriceFromRow(row, rawSaleQuantity);
      let lineAmount = getDmsAmountFromRow(row, rawSaleQuantity, salePrice);

      // Cột 4 của mẫu đơn con là giá bán chuẩn trong danh mục sản phẩm,
      // không phải giá thực tế lấy từ file DMS. Đóng băng giá này ngay lúc import
      // để việc in lại đơn cũ không thay đổi khi danh mục sản phẩm đổi giá.
      const productCatalogSalePrice = toNumber(
        product?.salePrice ?? product?.giaBan ?? product?.price ?? 0
      );
      let catalogPriceAfterVat = productCatalogSalePrice > 0
        ? productCatalogSalePrice
        : getDmsCatalogPriceAfterVatFromRow(row, rawSaleQuantity, salePrice);
      let preTaxPriceAtOrder = catalogPriceAfterVat > 0
        ? Math.round(catalogPriceAfterVat / 1.08)
        : 0;
      let vatAmountAtOrder = getDmsVatAmountForLine(row, rawSaleQuantity, salePrice, lineAmount);
      const pickingZoneAtOrder = normalizePickingZone(
        pickingZoneFrom(
          row.pickingZone || row['Khu bốc hàng'] || row['Khu boc hang'],
          first.pickingZone || first['Khu bốc hàng'] || first['Khu boc hang'],
          product,
          row.warehouseCode || row.warehouse || row['Mã Kho'] || row['Ma Kho'] || row['Kho']
        ),
        PICKING_ZONES.HC
      );
      const warehouseCode = legacyPrintGroupCode(pickingZoneAtOrder);
      const normalizedProductCode = cleanText(product?.code || productCode);
      // warehouseCode của dòng DMS chỉ là nhóm in/gộp đơn; tồn kho kiểm tra theo productCode chung.
      let availableQty = toNumber(productStockMap.get(normalizedProductCode));
      const isCutByStockRow = Boolean(
        row.__autoCutByStock ||
        Object.prototype.hasOwnProperty.call(row, '__allowedSaleQuantity') ||
        Object.prototype.hasOwnProperty.call(row, '__allowedPromoQuantity')
      );

      if (product && autoCutStock && !isCutByStockRow && deliveredQuantity > availableQty) {
        const allocation = allocateStockForSaleAndPromo(rawSaleQuantity, rawPromoQuantity, availableQty);
        rawSaleQuantity = allocation.allowedSaleQuantity;
        rawPromoQuantity = allocation.allowedPromoQuantity;
        deliveredQuantity = allocation.allowedDeliveredQuantity;
        lineAmount = rawSaleQuantity * salePrice;
        // Không thay đổi giá danh mục khi cắt số lượng theo tồn kho.
        // Cột 4 vẫn là product.salePrice đã chốt ở thời điểm import.
        catalogPriceAfterVat = productCatalogSalePrice > 0
          ? productCatalogSalePrice
          : getDmsCatalogPriceAfterVatFromRow(row, rawSaleQuantity, salePrice);
        preTaxPriceAtOrder = catalogPriceAfterVat > 0
          ? Math.round(catalogPriceAfterVat / 1.08)
          : 0;
        vatAmountAtOrder = getDmsVatAmountForLine(row, rawSaleQuantity, salePrice, lineAmount);
        shortageReport.push({
          documentCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
          customerCode,
          customerName: getCustomerNameFromRow(first) || customer?.name || '',
          productCode: normalizedProductCode,
          productName: product.name,
          unit: product.unit || product.baseUnit || '',
          conversionRate: getPackingFromRow(row, product),
          sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
          requestedQuantity: originalSaleQuantity + originalPromoQuantity,
          importedQuantity: deliveredQuantity,
          missingQuantity: allocation.missingQuantity,
          missingSaleQuantity: allocation.missingSaleQuantity,
          missingPromoQuantity: allocation.missingPromoQuantity,
          cutAmount: allocation.missingSaleQuantity * salePrice,
          availableQuantity: availableQty
        });
      }

      // Dòng không có số lượng bán và không có số lượng khuyến mại thì bỏ qua,
      // không làm hỏng cả đơn DMS.
      if (product && deliveredQuantity <= 0 && (originalSaleQuantity + originalPromoQuantity) <= 0) {
        skipped += 1;
        continue;
      }

      if (!product || deliveredQuantity <= 0 || salePrice < 0 || (!autoCutStock && !isCutByStockRow && availableQty < deliveredQuantity)) {
        skipped += 1;
        groupInvalid = true;
        errors.push({
          productCode,
          message: !product
            ? 'Không tìm thấy sản phẩm'
            : (!autoCutStock && !isCutByStockRow && availableQty < deliveredQuantity)
              ? `Không đủ tồn kho: còn ${availableQty}`
              : 'Dòng bán hàng/khuyến mại không hợp lệ'
        });
        continue;
      }

      productStockMap.set(normalizedProductCode, Math.max(0, toNumber(productStockMap.get(normalizedProductCode)) - deliveredQuantity));
      const conversionRateAtOrder = getPackingFromRow(row, product);
      const catalogSalePriceAtOrder = productCatalogSalePrice > 0
        ? productCatalogSalePrice
        : (catalogPriceAfterVat || salePrice);
      const catalogSalePriceSource = productCatalogSalePrice > 0
        ? 'product.salePrice'
        : 'dms_legacy_fallback';
      // Cột 3 luôn bằng cột 4 / 1.08 theo mẫu đơn con đã chốt.
      const listPriceBeforeVat = catalogSalePriceAtOrder > 0
        ? Math.round(catalogSalePriceAtOrder / 1.08)
        : 0;
      const baseItem = {
        productId: String(product.id || product._id || product.code),
        productCode: product.code,
        productName: product.name,
        unit: product.unit,
        packingQty: conversionRateAtOrder,
        conversionRate: conversionRateAtOrder,
        conversionRateAtOrder,
        catalogSalePriceAtOrder,
        catalogSalePriceSource,
        priceAfterTaxBeforePromotionSource: catalogSalePriceSource,
        pickingZoneAtOrder,
        warehouseCodeAtOrder: warehouseCode,
        appliedPromotionRows: [],
        promotionRows: [],
        appliedPromotions: [],
        promotions: [],
        promotionCode: '',
        promotionDescription: '',
        discountPercent: 0,
        productSnapshot: {
          code: product.code,
          productCode: product.code,
          name: product.name,
          productName: product.name,
          unit: product.unit || product.baseUnit || '',
          salePrice: catalogSalePriceAtOrder,
          conversionRate: conversionRateAtOrder,
          pickingZone: pickingZoneAtOrder,
          warehouseCode,
          defaultWarehouse: warehouseCode
        },
        listPriceBeforeVat,
        preTaxPriceAtOrder: listPriceBeforeVat,
        listPriceAfterVat: catalogSalePriceAtOrder,
        priceAfterTaxBeforePromotionAtOrder: catalogSalePriceAtOrder,
        priceAfterTaxBeforePromotion: catalogSalePriceAtOrder,
        gsvAmount: getGsvAmountFromRow(row),
        nivAmount: getNivAmountFromRow(row),
        vatAmount: vatAmountAtOrder,
        vatAmountAtOrder,
        warehouseCode,
        warehouseName: cleanText(product.warehouseName || (warehouseCode === 'KHO_PC' ? 'KHO PC' : warehouseCode === 'KHO_HC' ? 'KHO HC' : 'Kho chính'))
      };

      if (rawSaleQuantity > 0) {
        items.push({
          ...baseItem,
          lineType: 'SALE',
          isPromo: false,
          lineTypeName: 'Hàng bán',
          cartons: getCartonsFromRow(row),
          units: getUnitsFromRow(row),
          quantity: rawSaleQuantity,
          deliveredQuantity: rawSaleQuantity,
          stockQuantity: rawSaleQuantity,
          soldQuantity: rawSaleQuantity,
          promoQuantity: 0,
          salePrice,
          price: salePrice,
          finalPrice: salePrice,
          finalPriceAtOrder: salePrice,
          priceAfterTaxAfterPromotion: salePrice,
          priceAfterPromotion: salePrice,
          lineAmountAtOrder: lineAmount,
          lineAmount,
          amount: lineAmount
        });
      }

      if (rawPromoQuantity > 0) {
        items.push({
          ...baseItem,
          lineType: 'PROMO',
          isPromo: true,
          lineTypeName: 'Xuất khuyến mại',
          cartons: 0,
          units: rawPromoQuantity,
          quantity: rawPromoQuantity,
          deliveredQuantity: rawPromoQuantity,
          stockQuantity: rawPromoQuantity,
          soldQuantity: 0,
          promoCartons: getPromoCartonsFromRow(row) + getPromoCartons2FromRow(row),
          promoUnits: getPromoUnitsFromRow(row) + getPromoUnits2FromRow(row),
          promoQuantity: rawPromoQuantity,
          salePrice: 0,
          referenceSalePrice: salePrice,
          finalPrice: 0,
          finalPriceAtOrder: 0,
          priceAfterTaxAfterPromotion: 0,
          price: 0,
          lineAmountAtOrder: 0,
          lineAmount: 0,
          amount: 0
        });
      }
    }
    // Không bỏ cả hóa đơn chỉ vì 1 dòng lỗi.
    // Với đơn DMS dài, một dòng thiếu mã/thiếu tồn không được làm mất toàn bộ đơn của khách.
    if (!items.length) continue;

    const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
    const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const paidAmount = Math.min(toNumber(first.paidAmount ?? first['Đã thu'] ?? first['Da thu']), totalAmount);
    const now = dateUtil.nowIso();
    const doc = {
      id: makeId('SO'),
      code: docCodeCheck === 'AUTO' ? (autoOrderCodes[autoOrderIdx++] || makeId('BH')) : docCodeCheck,
      documentCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
      invoiceCode: docCodeCheck === 'AUTO' ? '' : docCodeCheck,
      date: getDateFromRow(first),
      orderDate: getDateFromRow(first),
      deliveryDate: getDateFromRow(first),
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: getCustomerNameFromRow(first) || customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      __autoCreateCustomer: customer.__autoCreateCustomer
        ? {
            code: customer.code,
            name: customer.name,
            address: AUTO_CREATED_CUSTOMER_ADDRESS
          }
        : null,
      // Mã NVBH lấy nguyên từ Excel; tên NVBH lấy từ users Mongo theo mã NVBH.
      staffCode: resolvedSalesStaff.staffCode,
      salesStaffCode: resolvedSalesStaff.salesStaffCode,
      staffName: resolvedSalesStaff.staffName,
      salesStaffName: resolvedSalesStaff.salesStaffName,
      routeCode: getRouteCodeFromRow(first),
      note: cleanText(first.note || first['Ghi chú'] || first['Ghi chu']) || 'Import Excel DMS bulk',
      source: 'DMS',
      sourceType: 'dms_import',
      orderSource: 'DMS',
      orderSourceName: 'Từ DMS',
      vatInvoiceRequired: true,
      vatInvoiceDecisionSource: 'default',
      vatInvoiceNote: '',
      vatInvoiceUpdatedAt: '',
      vatInvoiceUpdatedBy: '',
      // DMS_DIRECT_PRICE_LOCK_START
      saleMethod: DIRECT_PRICE,
      saleMode: DIRECT_PRICE,
      pricingMode: DIRECT_PRICE,
      orderPricingMode: DIRECT_PRICE,
      priceLocked: true,
      lockedPrice: true,
      lockedPromotion: false,
      isPromotionSale: false,
      promotionCalculated: false,
      promotionMode: 'none',
      promotions: [],
      promotionRows: [],
      totalPromotionAmount: 0,
      promotionAmount: 0,
      promotionValue: 0,
      isPromotionSale: false,
      grossAmount: totalAmount,
      totalGrossAmount: totalAmount,
      grossAmountBeforePromotion: totalAmount,
      discountAmount: 0,
      totalDiscountAmount: 0,
      promotionAmount: 0,
      totalPromotionAmount: 0,
      netAmount: totalAmount,
      goodsAmountAfterPromotion: totalAmount,
      // DMS_DIRECT_PRICE_LOCK_END
      importSource: 'excel_dms',
      isImported: true,
      isChildOrder: true,
      masterOrderId: '',
      masterOrderCode: '',
      mergeStatus: 'unmerged',
      deliveryStatus: 'pending',
      items,
      totalQuantity,
      totalAmount,
      grandTotal: totalAmount,
      paidAmount: 0,
      cashCollected: 0,
      bankCollected: 0,
      paymentAmount: 0,
      debtAmount: totalAmount,
      debt: totalAmount,
      arBalance: totalAmount,
      arStatus: 'pending',
      lifecycleStatus: 'pending',
      status: 'pending',
      stockPosted: false,
      stockPostedAt: '',
      stockPostedBy: '',
      // Kho vật lý của chứng từ luôn là MAIN. HC/PC chỉ nằm ở pickingZone của từng dòng để phục vụ in/bốc hàng.
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      createdAt: now,
      updatedAt: now
    };
    Object.assign(doc, applyOrderSourceFields(doc, ORDER_SOURCE.DMS));
    orderDocs.push(doc);
    if (doc.documentCode) importedDocumentSet.add(cleanText(doc.documentCode));
  }

  const postedBy = options.userName || options.username || options.createdBy || 'excel_import';
  const chunkSize = Number(process.env.SALES_IMPORT_TX_CHUNK_SIZE || 25);
  const importSessionId = cleanText(options.importSessionId || options.sessionId);
  const totalChunks = Math.max(1, Math.ceil(orderDocs.length / Math.max(1, chunkSize)));
  const atomicResults = await runAtomicChunks(
    orderDocs,
    async (chunk, { session }) => {
      const customerResult = await ensureImportedCustomersForOrderChunk(chunk, {
        session,
        createdBy: postedBy,
        importSessionId
      });
      const insertedOrders = await SalesOrder.insertMany(
        chunk.map((row) => canonicalizeOperationalStaff(row)),
        {
          session,
          ordered: true
        }
      );

      const transactions = await InventoryPostingService.postSalesOrdersBulkOut(
        insertedOrders,
        { session }
      );
      const stockTransactions = Array.isArray(transactions)
        ? transactions.filter((row) => !row?.skipped).length
        : 0;

      const postedAt = dateUtil.nowIso();
      await SalesOrder.updateMany(
        { _id: { $in: insertedOrders.map((order) => order._id) } },
        {
          $set: {
            stockPosted: true,
            stockPostedAt: postedAt,
            stockPostedBy: postedBy,
            updatedAt: postedAt
          }
        },
        { session }
      );

      return {
        imported: insertedOrders.length,
        stockTransactions,
        createdCustomers: Number(customerResult.createdCustomers || 0)
      };
    },
    {
      chunkSize,
      onChunkComplete: importSessionId
        ? async ({ completedChunks, completedRows, totalRows }) => {
            const ratio = totalRows > 0 ? completedRows / totalRows : completedChunks / totalChunks;
            await importSessionService.updateProgress(importSessionId, {
              percent: 20 + Math.round(Math.min(1, ratio) * 70),
              step: `committing:${completedChunks}/${totalChunks}`
            });
          }
        : null
    }
  );

  let imported = 0;
  let stockTransactions = 0;
  let createdCustomers = 0;
  for (const result of atomicResults) {
    if (result.ok) {
      imported += Number(result.value?.imported || 0);
      stockTransactions += Number(result.value?.stockTransactions || 0);
      createdCustomers += Number(result.value?.createdCustomers || 0);
      continue;
    }
    skipped += result.count;
    const failedChunk = orderDocs.slice(result.chunkIndex * chunkSize, result.chunkIndex * chunkSize + result.count);
    for (const order of failedChunk) {
      errors.push({
        documentCode: order.documentCode || order.code || '',
        customerCode: order.customerCode || '',
        code: result.code,
        message: result.error
      });
    }
  }

  const durationMs = Date.now() - startedAtMs;
  await addImportLog('salesOrders', {
    imported,
    skipped,
    failed: orderDocs.length - imported,
    errors: errors.slice(0, 100),
    mode: 'atomicBulkSalesOrderChunks',
    batchSize: chunkSize,
    durationMs,
    ordersPerSecond: durationMs > 0 ? Number((imported * 1000 / durationMs).toFixed(2)) : imported,
    stockTransactionsPerSecond: durationMs > 0 ? Number((stockTransactions * 1000 / durationMs).toFixed(2)) : stockTransactions,
    uniqueProducts: productCodes.length,
    createdCustomers,
    payments: 0,
    cashbook: 0,
    returnDrafts: 0,
    stockTransactions,
    inventoryRows: stockTransactions,
    chunks: atomicResults.map((result) => ({
      chunkIndex: result.chunkIndex,
      ok: result.ok,
      count: result.count,
      imported: Number(result.value?.imported || 0),
      createdCustomers: Number(result.value?.createdCustomers || 0),
      code: result.code || '',
      error: result.error || ''
    })),
    shortageCount: shortageReport.length,
    shortageReport: shortageReport.slice(0, 100)
  });
  return {
    imported,
    failed: orderDocs.length - imported,
    skipped,
    errors,
    createdCustomers,
    shortageReport,
    chunks: atomicResults,
    performance: {
      mode: 'atomicBulkSalesOrderChunks',
      durationMs,
      batchSize: chunkSize,
      uniqueProducts: productCodes.length,
      ordersPerSecond: durationMs > 0 ? Number((imported * 1000 / durationMs).toFixed(2)) : imported,
      stockTransactionsPerSecond: durationMs > 0 ? Number((stockTransactions * 1000 / durationMs).toFixed(2)) : stockTransactions
    }
  };
}

module.exports = {
  importOpeningStock,
  importImportOrders,
  importSalesOrders
};