'use strict';

const Product = require('../../../models/Product');
const Customer = require('../../../models/Customer');
const User = require('../../../models/User');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const { DIRECT_PRICE } = require('../../../constants/pricingModes');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../../../constants/business.constants');
const importRules = require('../../../rules/importRules');
const importSessionService = require('../../importSessionService');
const auditService = require('../../auditService');
const JobSubmissionService = require('../../background-jobs/JobSubmissionService');
const { runImportPreviewPipeline } = require('../../../jobs/importPreviewRunner');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('../selectiveUpdate.util');

const values = require('../core/importValue.util');
const persistence = require('../core/importPersistence.util');
const rows = require('../core/importRow.util');
const {
  allocateStockForSaleAndPromo,
  buildCustomerSelectiveUpdate,
  buildProductSelectiveUpdate,
  cleanText,
  getCustomerCodeFromRow,
  getCustomerNameFromRow,
  getDateFromRow,
  getDmsAmountFromRow,
  getDmsPriceFromRow,
  getDmsPromoQuantityFromRow,
  getDmsQuantityFromRow,
  getPackingFromRow,
  getProductCodeFromRow,
  getQtyFromRow,
  pickCustomerPayload,
  pickProductPayload
} = values;
const {
  buildImportedCustomerPlaceholder,
  collectImportedCustomerCandidates,
  groupRows,
  importedCustomerCandidateError,
  preloadCustomersByCode,
  preloadProductsByCode
} = persistence;
const {
  applyAdjustedQuantityToRow,
  buildUserSelectiveUpdate,
  getOrderDocumentCode,
  getStockMapByProductCode,
  makeImportOrderGroupKey,
  makeSalesOrderGroupKey,
  getUserUpdateInput,
  normalizeImportRole,
  pickPromotionProductRulePayload,
  pickPromotionGroupItemPayload,
  pickPromotionGroupRulePayload,
  pickPromotionQuantityGroupDiscountPayload,
  pickPromotionCustomerOrderValueDiscountPayload,
  pickUserImportPayload,
  preloadPromotionProductsByCode,
  preloadPromotionCustomersByCode,
  preloadSalesStaffUsersByCode,
  resolveSalesStaffForImportRow,
  rowBase,
  summarizeOrderShortages
} = rows;

const PROMOTION_MISSING_PRODUCT_ERROR = 'Mã sản phẩm chưa có trong danh mục';
const { buildPromotionProductRuleGroups, applyPromotionProductRuleDuplicatePolicy } = require('../promotionProductRuleGrouping');

function normalizeUploadedFileName(value) {
  const text = cleanText(value);
  if (!text) return text;
  if (!/[ÃÂÄ]/.test(text)) return text;
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (decoded && decoded !== text && !decoded.includes('�')) return decoded;
  } catch (_) {
    // Giữ nguyên tên file nếu không phải mojibake latin1->utf8.
  }
  return text;
}

function addUniqueError(item, message) {
  if (!item || !message) return;
  if (!Array.isArray(item.errors)) item.errors = [];
  if (!item.errors.includes(message)) item.errors.push(message);
}

function removeWarning(item, message) {
  if (!item || !Array.isArray(item.warnings)) return;
  item.warnings = item.warnings.filter((warning) => cleanText(warning) !== message);
}

function finalizePromotionGroupItemPreview(item) {
  if (!item) return item;
  item.errors = Array.isArray(item.errors) ? item.errors.filter(Boolean) : [];
  item.warnings = Array.isArray(item.warnings) ? item.warnings.filter(Boolean) : [];

  if (item.productCode && (item.missingProduct === true || item.productMatched === false)) {
    addUniqueError(item, PROMOTION_MISSING_PRODUCT_ERROR);
    removeWarning(item, PROMOTION_MISSING_PRODUCT_ERROR);
  }

  const valid = item.errors.length === 0 && item.missingProduct !== true && item.productMatched !== false;
  item.valid = valid;
  item.canImport = valid;
  item.status = valid ? 'valid' : 'invalid';
  item.statusText = valid ? 'Hợp lệ' : 'Lỗi';
  return item;
}


function aggregateMissingPromotionProducts(rows = []) {
  const grouped = new Map();
  for (const row of rows || []) {
    if (!row || row.missingProduct !== true) continue;
    const productCode = cleanText(row.productCode);
    if (!productCode) continue;
    if (!grouped.has(productCode)) {
      grouped.set(productCode, {
        productCode,
        productName: cleanText(row.productName),
        rowNos: [],
        programCodes: []
      });
    }
    const item = grouped.get(productCode);
    const rowNo = Number(row.sourceRowNo || row.rowNo || 0);
    if (rowNo && !item.rowNos.includes(rowNo)) item.rowNos.push(rowNo);
    const programCode = cleanText(row.programCode || row.groupCode);
    if (programCode && !item.programCodes.includes(programCode)) item.programCodes.push(programCode);
    if (!item.productName && row.productName) item.productName = cleanText(row.productName);
  }
  return Array.from(grouped.values())
    .sort((a, b) => a.productCode.localeCompare(b.productCode))
    .slice(0, 500);
}

function buildPreviewSummary(type, result = []) {
  const safe = Array.isArray(result) ? result : [];
  const validRows = safe.filter((row) => row && row.valid).length;
  const invalidRows = safe.length - validRows;
  const missingProductCount = safe.filter((row) => row && row.missingProduct === true).length;
  const missingProducts = aggregateMissingPromotionProducts(safe);
  const groupedPreview = type === 'promotionProductRules'
    ? buildPromotionProductRuleGroups(safe)
    : { groups: [], groupSummary: {} };
  return {
    type,
    rows: safe,
    groups: groupedPreview.groups,
    total: safe.length,
    totalRows: safe.length,
    valid: validRows,
    validRows,
    invalid: invalidRows,
    invalidRows,
    errorRows: invalidRows,
    summary: {
      totalRows: safe.length,
      validRows,
      invalidRows,
      errorRows: invalidRows,
      missingProductCount,
      missingProducts,
      skippedCount: invalidRows,
      ...groupedPreview.groupSummary
    }
  };
}

async function previewMongoNative(type, rows = [], options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let result = [];

  if (type === 'products') {
    const importMode = normalizeImportMode(options.importMode, type);
    const payloads = safeRows.map((row) => ({ ...rowBase(row), ...pickProductPayload(row), errors: [], warnings: [], importMode }));
    const codes = Array.from(new Set(payloads.map((p) => cleanText(p.code)).filter(Boolean)));
    const existingRows = codes.length ? await Product.find({ code: { $in: codes } }).lean() : [];
    const existing = new Map(existingRows.map((p) => [normalizeText(p.code), p]));
    const seen = new Set();
    result = payloads.map((item) => {
      const codeKey = normalizeText(item.code);
      const current = existing.get(codeKey) || null;
      if (!item.code) item.errors.push('Thiếu mã sản phẩm');
      if (item.code && seen.has(codeKey)) item.errors.push('Mã sản phẩm bị trùng trong file');
      if (item.code) seen.add(codeKey);

      if (importMode === IMPORT_MODE_UPDATE) {
        if (item.code && !current) item.errors.push('Không tìm thấy sản phẩm để cập nhật');
        const conversion = getProvidedField(item.raw, ['conversionRate', 'Quy đổi', 'Quy doi', 'Tỷ lệ', 'Ty le']);
        const costPrice = getProvidedField(item.raw, ['costPrice', 'importPrice', 'Giá nhập', 'Gia nhap']);
        const salePrice = getProvidedField(item.raw, ['salePrice', 'price', 'Giá bán', 'Gia ban']);
        if (conversion.hasValue && toNumber(conversion.value) < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
        if ((costPrice.hasValue && toNumber(costPrice.value) < 0) || (salePrice.hasValue && toNumber(salePrice.value) < 0)) item.errors.push('Giá không được âm');
        const updateInfo = current ? buildProductSelectiveUpdate(item.raw, current) : { patch: {}, changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
      } else {
        if (!item.name) item.errors.push('Thiếu tên sản phẩm');
        if (item.code && current) item.errors.push('Mã sản phẩm đã tồn tại');
        if (toNumber(item.conversionRate) < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
        if (toNumber(item.costPrice) < 0 || toNumber(item.salePrice) < 0) item.errors.push('Giá không được âm');
        item.action = item.errors.length ? 'error' : 'create';
        item.statusText = item.errors.length ? 'Có lỗi' : 'Thêm mới';
      }
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'customers') {
    const importMode = normalizeImportMode(options.importMode, type);
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(safeRows);
    const payloads = safeRows.map((row) => {
      const payload = { ...rowBase(row), ...pickCustomerPayload(row), errors: [], warnings: [], importMode };
      const staffField = getProvidedField(row, ['legacyStaffCode', 'staffCode', 'Mã NVBH', 'Ma NVBH', 'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên']);
      if (staffField.hasValue) {
        const resolvedStaff = resolveSalesStaffForImportRow(row, salesStaffUserMap);
        payload.resolvedStaff = resolvedStaff;
        if (!resolvedStaff.found) payload.errors.push(`Không tìm thấy mã NVBH ${cleanText(staffField.value)} trong tài khoản hệ thống`);
        else if (!resolvedStaff.validRole) payload.errors.push(`Mã ${cleanText(staffField.value)} không phải nhân viên bán hàng`);
        else {
          payload.staffCode = resolvedStaff.staffCode;
          payload.staffName = resolvedStaff.staffName;
        }
      }
      return payload;
    });
    const codes = Array.from(new Set(payloads.map((c) => cleanText(c.code)).filter(Boolean)));
    const existingRows = codes.length ? await Customer.find({ code: { $in: codes } }).lean() : [];
    const existing = new Map(existingRows.map((c) => [normalizeText(c.code), c]));
    const seen = new Set();
    result = payloads.map((item) => {
      const codeKey = normalizeText(item.code);
      const current = existing.get(codeKey) || null;
      if (!item.code) item.errors.push('Thiếu mã khách hàng');
      if (item.code && seen.has(codeKey)) item.errors.push('Mã khách hàng bị trùng trong file');
      if (item.code) seen.add(codeKey);

      if (importMode === IMPORT_MODE_UPDATE) {
        if (item.code && !current) item.errors.push('Không tìm thấy khách hàng để cập nhật');
        const updateInfo = current ? buildCustomerSelectiveUpdate(item.raw, current, item.resolvedStaff || null) : { patch: {}, changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
      } else {
        if (!item.name) item.errors.push('Thiếu tên khách hàng');
        if (item.code && current) item.errors.push('Mã khách hàng đã tồn tại');
        item.action = item.errors.length ? 'error' : 'create';
        item.statusText = item.errors.length ? 'Có lỗi' : 'Thêm mới';
      }
      delete item.resolvedStaff;
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'openingStock') {
    const productMap = await preloadProductsByCode(safeRows);
    result = safeRows.map((row) => {
      const productCode = getProductCodeFromRow(row);
      const product = productMap.get(cleanText(productCode));
      const quantity = getQtyFromRow(row, product);
      const warehouseCode = product ? (STOCK_WAREHOUSE_CODE || 'MAIN') : '';
      const item = {
        ...rowBase(row),
        documentCode: 'AUTO',
        date: getDateFromRow(row),
        productCode,
        productName: product?.name || '',
        warehouseCode,
        warehouseName: product ? (STOCK_WAREHOUSE_NAME || 'Kho chính') : '',
        quantity,
        errors: []
      };
      if (!productCode) item.errors.push('Thiếu mã sản phẩm');
      if (!product) item.errors.push('Không tìm thấy sản phẩm trong danh mục');
      if (quantity < 0) item.errors.push('Tồn đầu không được âm');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'importOrders') {
    const productMap = await preloadProductsByCode(safeRows);
    const groups = groupRows(safeRows, makeImportOrderGroupKey);
    result = groups.map((group) => {
      const first = group[0] || {};
      const documentCode = getOrderDocumentCode(first);
      const errors = [];
      const detailErrors = [];
      const lineDetails = [];
      const importRows = [];
      let skippedZeroQuantity = 0;
      let totalQuantity = 0;
      let totalAmount = 0;

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getQtyFromRow(row, product);

        // Phiếu nhập kho: dòng SL = 0 nghĩa là không nhập sản phẩm này.
        // Bỏ qua, không coi là lỗi.
        if (quantity === 0) {
          skippedZeroQuantity += 1;
          continue;
        }

        const costPrice = toNumber(product?.costPrice || 0);
        const amount = quantity * costPrice;
        const lineErrors = [];
        if (!productCode) lineErrors.push('Thiếu mã sản phẩm');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        if (quantity < 0) lineErrors.push('Số lượng nhập không được âm');
        if (lineErrors.length) detailErrors.push({ rowNo: row.__rowNo || row.rowNo || '', productCode, productName: product?.name || '', errors: lineErrors });

        totalQuantity += Math.max(0, quantity);
        totalAmount += Math.max(0, amount);
        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          quantity,
          price: costPrice,
          amount,
          errors: lineErrors
        });
        importRows.push(row);
      }

      if (!importRows.length) errors.push('Phiếu nhập không có dòng sản phẩm nào có số lượng lớn hơn 0');
      if (detailErrors.length) errors.push(`${detailErrors.length} dòng hàng lỗi`);
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        supplier: cleanText(first.supplier || first.supplierName || first['Nhà cung cấp'] || first['Nha cung cap']) || 'Import Excel',
        customerCode: '',
        customerName: '',
        lineCount: lineDetails.length,
        sourceLineCount: group.length,
        skippedZeroQuantity,
        totalQuantity,
        totalAmount,
        amount: totalAmount,
        statusText: errors.length ? 'Có lỗi' : 'Hợp lệ',
        hasShortage: false,
        shortageCount: 0,
        shortageReport: [],
        lineDetails,
        detailErrors,
        __importRows: importRows,
        errors,
        valid: errors.length === 0
      };
    });
  } else if (type === 'salesOrders') {
    const productMap = await preloadProductsByCode(safeRows);
    const customerMap = await preloadCustomersByCode(safeRows);
    const importedCustomerCandidates = collectImportedCustomerCandidates(safeRows, customerMap);
    const salesStaffUserMap = await preloadSalesStaffUsersByCode(safeRows);
    const stockMap = await getStockMapByProductCode(safeRows);
    const runningStockMap = new Map(stockMap);
    const groups = groupRows(safeRows, makeSalesOrderGroupKey);

    result = groups.map((group) => {
      const first = group[0] || {};
      const resolvedSalesStaff = resolveSalesStaffForImportRow(first, salesStaffUserMap);
      const documentCode = getOrderDocumentCode(first);
      const customerCode = getCustomerCodeFromRow(first);
      const customerCandidate = importedCustomerCandidates.get(cleanText(customerCode));
      const customer = customerMap.get(cleanText(customerCode)) || buildImportedCustomerPlaceholder(customerCandidate);
      const customerAutoCreate = Boolean(customer?.__autoCreateCustomer);
      const errors = [];
      const warnings = [];
      const detailErrors = [];
      const shortageReport = [];
      const lineDetails = [];
      const adjustedRows = [];
      let totalQuantity = 0;
      let totalAmount = 0;
      let adjustedQuantity = 0;
      let adjustedAmount = 0;

      if (!customerCode) errors.push('Thiếu mã khách hàng / mã cửa hàng');
      if (customerCode && !customer) errors.push(importedCustomerCandidateError(customerCandidate, customerCode));
      if (customerAutoCreate) {
        warnings.push(`Khách hàng mới ${customer.code} - ${customer.name} sẽ được tự tạo với địa chỉ NEW`);
      }
      if (!resolvedSalesStaff.staffCode) errors.push('Thiếu mã NVBH trong file Excel import');
      else if (!resolvedSalesStaff.found) errors.push(`Mã NVBH ${resolvedSalesStaff.staffCode} không tồn tại trong users`);
      else if (!resolvedSalesStaff.validRole) errors.push(`Mã ${resolvedSalesStaff.staffCode} không phải nhân viên bán hàng`);
      else if (!resolvedSalesStaff.hasUserStaffCode) errors.push(`Tài khoản NVBH ${resolvedSalesStaff.staffCode} thiếu mã nhân viên trong users`);

      for (const row of group) {
        const productCode = getProductCodeFromRow(row);
        const product = productMap.get(cleanText(productCode));
        const quantity = getDmsQuantityFromRow(row, product);
        const promoQuantity = getDmsPromoQuantityFromRow(row, product);
        const deliveredQuantity = quantity + promoQuantity;
        const salePrice = getDmsPriceFromRow(row, quantity);
        const amount = getDmsAmountFromRow(row, quantity, salePrice);
        const normalizedProductCode = cleanText(product?.code || productCode);
        const rowProductCode = cleanText(productCode);
        const stockLookupCode = runningStockMap.has(normalizedProductCode)
          ? normalizedProductCode
          : rowProductCode;
        const initialAvailableQuantity = toNumber(stockMap.get(stockLookupCode));
        const availableBefore = toNumber(runningStockMap.get(stockLookupCode));
        const allocatedBeforeQuantity = Math.max(0, initialAvailableQuantity - availableBefore);
        const allocation = allocateStockForSaleAndPromo(quantity, promoQuantity, availableBefore);
        const allowedQuantity = allocation.allowedDeliveredQuantity;
        const missingQuantity = allocation.missingQuantity;
        const lineErrors = [];

        if (!productCode) lineErrors.push('Thiếu mã sản phẩm / mã hàng hóa');
        if (!product) lineErrors.push('Không tìm thấy sản phẩm');
        // Hàng khuyến mại hợp lệ dù số lượng bán = 0. Chỉ bỏ qua/báo lỗi khi cả hàng bán và 4 cột KM đều bằng 0.
        if (deliveredQuantity <= 0) lineErrors.push('Số lượng bán hoặc khuyến mại phải lớn hơn 0');
        if (salePrice < 0) lineErrors.push('Giá bán không được âm');

        totalQuantity += Math.max(0, deliveredQuantity);
        totalAmount += Math.max(0, amount);

        if (product && missingQuantity > 0) {
          shortageReport.push({
            documentCode,
            customerCode,
            customerName: getCustomerNameFromRow(first) || customer?.name || '',
            rowNo: row.__rowNo || row.rowNo || '',
            productCode: product.code,
            productName: product.name,
            unit: product.unit || product.baseUnit || '',
            conversionRate: getPackingFromRow(row, product),
            sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
            requestedQuantity: deliveredQuantity,
            saleQuantity: quantity,
            promoQuantity,
            initialAvailableQuantity,
            allocatedBeforeQuantity,
            availableQuantity: availableBefore,
            importQuantity: allowedQuantity,
            allowedSaleQuantity: allocation.allowedSaleQuantity,
            allowedPromoQuantity: allocation.allowedPromoQuantity,
            missingQuantity,
            missingSaleQuantity: allocation.missingSaleQuantity,
            missingPromoQuantity: allocation.missingPromoQuantity,
            salePrice,
            // Ưu tiên cắt KM trước nên chỉ tính giảm giá trị khi bị cắt cả hàng bán.
            cutAmount: allocation.missingSaleQuantity * salePrice
          });
        }

        if (lineErrors.length) {
          detailErrors.push({ rowNo: row.__rowNo || row.rowNo || '', productCode, productName: product?.name || '', errors: lineErrors });
        }

        const adjustedRow = applyAdjustedQuantityToRow(row, allocation.allowedSaleQuantity, allocation.allowedPromoQuantity, salePrice);
        adjustedRows.push(adjustedRow);
        adjustedQuantity += allowedQuantity;
        adjustedAmount += allocation.allowedSaleQuantity * salePrice;
        if (product) runningStockMap.set(stockLookupCode, Math.max(0, availableBefore - deliveredQuantity));

        lineDetails.push({
          rowNo: row.__rowNo || row.rowNo || '',
          productCode,
          productName: product?.name || cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
          unit: product?.unit || product?.baseUnit || '',
          conversionRate: getPackingFromRow(row, product),
          sourcePackingRate: toNumber(row['Qc'] ?? row['QC'] ?? row.packingQty ?? row.conversionRate),
          saleQuantity: quantity,
          promoQuantity,
          requestedQuantity: deliveredQuantity,
          initialAvailableQuantity,
          allocatedBeforeQuantity,
          availableQuantity: availableBefore,
          importQuantity: allowedQuantity,
          allowedSaleQuantity: allocation.allowedSaleQuantity,
          allowedPromoQuantity: allocation.allowedPromoQuantity,
          missingQuantity,
          missingSaleQuantity: allocation.missingSaleQuantity,
          missingPromoQuantity: allocation.missingPromoQuantity,
          salePrice,
          amount,
          adjustedAmount: allocation.allowedSaleQuantity * salePrice,
          lineType: promoQuantity > 0 && quantity <= 0 ? 'PROMO' : 'SALE',
          errors: lineErrors
        });
      }

      const importableAdjustedRows = adjustedRows.filter((r) => !r.__skipImportLine);
      const blockingErrors = [...errors];
      // Lỗi chi tiết từng dòng chỉ để cảnh báo/cắt dòng đó, không khóa cả hóa đơn
      // nếu hóa đơn vẫn còn dòng hợp lệ để import.
      if (detailErrors.length && !importableAdjustedRows.length) {
        blockingErrors.push(`${detailErrors.length} dòng hàng lỗi`);
      }
      const shortageSummary = summarizeOrderShortages(shortageReport);
      const normalStatusText = customerAutoCreate ? 'Hợp lệ - tạo KH mới' : 'Hợp lệ';
      const shortageStatusText = customerAutoCreate ? 'Vượt tồn - tạo KH mới' : 'Vượt tồn';
      return {
        ...rowBase(first),
        previewMode: 'order',
        documentCode,
        date: getDateFromRow(first),
        customerCode,
        customerName: getCustomerNameFromRow(first) || customer?.name || '',
        customerAddress: customer?.address || '',
        customerAutoCreate,
        customerProfileStatus: customerAutoCreate ? 'NEW' : '',
        // Mã NVBH phải lấy từ Excel; tên NVBH sẽ được validate/điền lại từ users Mongo theo mã này.
        staffCode: resolvedSalesStaff.staffCode,
        salesStaffCode: resolvedSalesStaff.salesStaffCode,
        staffName: resolvedSalesStaff.staffName,
        salesStaffName: resolvedSalesStaff.salesStaffName,
        saleMethod: DIRECT_PRICE,
        saleMode: DIRECT_PRICE,
        pricingMode: DIRECT_PRICE,
        orderPricingMode: DIRECT_PRICE,
        priceLocked: true,
        promotionCalculated: false,
        isPromotionSale: false,
        lineCount: group.length,
        totalQuantity,
        totalAmount,
        amount: totalAmount,
        adjustedQuantity,
        adjustedAmount,
        shortageCount: shortageReport.length,
        shortageQuantity: shortageSummary.totalMissingQty,
        shortageAmount: shortageSummary.totalCutAmount,
        hasShortage: shortageReport.length > 0,
        statusText: blockingErrors.length
          ? 'Có lỗi'
          : (detailErrors.length
              ? (customerAutoCreate ? 'Có dòng bị bỏ qua - tạo KH mới' : 'Có dòng bị bỏ qua')
              : (shortageReport.length ? shortageStatusText : normalStatusText)),
        shortageReport,
        stockAllocationPolicy: 'sequential_file_order',
        lineDetails,
        detailErrors,
        __importRows: group,
        __adjustedRows: adjustedRows,
        errors: blockingErrors,
        warnings,
        valid: blockingErrors.length === 0
      };
    });
  } else if (type === 'promotionProductRules') {
    const payloads = safeRows.map(pickPromotionProductRulePayload);
    const productMap = await preloadPromotionProductsByCode(payloads);
    result = payloads.map((item) => {
      const product = productMap.get(cleanText(item.productCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình');
      if (!item.programName) item.errors.push('Thiếu nội dung chương trình');
      if (!item.productCode) item.errors.push('Thiếu mã sản phẩm');
      item.productMatched = Boolean(product);
      item.missingProduct = Boolean(item.productCode && !product);
      if (item.missingProduct) item.errors.push(PROMOTION_MISSING_PRODUCT_ERROR);
      item.source = item.source || 'excel-import';
      if (product) item.productName = cleanText(product.name || item.productName);
      if (toNumber(item.discountPercent) < 0) item.errors.push('Chiết khấu không được âm');
      return finalizePromotionGroupItemPreview(item);
    });
    result = applyPromotionProductRuleDuplicatePolicy(result);
  } else if (type === 'promotionGroupItems') {
    const payloads = safeRows.map(pickPromotionGroupItemPayload);
    const productMap = await preloadPromotionProductsByCode(payloads);
    const seen = new Set();
    result = payloads.map((item) => {
      const product = productMap.get(cleanText(item.productCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình KM / mã nhóm');
      if (!item.productCode) item.errors.push('Thiếu mã sản phẩm');
      item.productMatched = Boolean(product);
      item.missingProduct = Boolean(item.productCode && !product);
      if (item.missingProduct) item.errors.push(PROMOTION_MISSING_PRODUCT_ERROR);
      item.source = item.source || 'excel-import';
      if (product) item.productName = cleanText(product.name || item.productName);
      const key = `${item.programCode}__${item.productCode}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mã sản phẩm trong file');
      seen.add(key);
      return finalizePromotionGroupItemPreview(item);
    });
  } else if (type === 'promotionGroupRules') {
    const payloads = safeRows.map(pickPromotionGroupRulePayload);
    const seen = new Set();
    result = payloads.map((item) => {
      item.errors = [];
      const basis = promotionService.normalizeGroupRuleBasis(item.basis || item.calculationBasis);
      if (!item.programCode) item.errors.push('Thiếu mã CTKM / mã chương trình');
      if (!item.programName) item.errors.push('Thiếu nội dung chương trình KM');
      if (!item.groupCode) item.errors.push('Thiếu nhóm áp dụng');
      if (!basis) item.errors.push('Tính theo không hợp lệ');
      item.basis = basis || item.basis;
      item.calculationBasis = basis || item.calculationBasis;
      if (toNumber(item.minAmount) <= 0) item.errors.push(basis === 'QUANTITY' ? 'Số lượng từ phải lớn hơn 0' : 'Doanh số từ phải lớn hơn 0');
      if (toNumber(item.discountPercent) <= 0) item.errors.push('Chiết khấu % phải lớn hơn 0');
      const key = `${item.programCode}__${item.groupCode}__${basis || 'INVALID'}__${toNumber(item.minAmount)}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + nhóm áp dụng + cách tính + ngưỡng trong file');
      seen.add(key);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'promotionQuantityGroupDiscounts') {
    const payloads = safeRows.map(pickPromotionQuantityGroupDiscountPayload);
    const productMap = await preloadPromotionProductsByCode(payloads);
    const seen = new Set();
    result = payloads.map((item) => {
      const product = productMap.get(cleanText(item.productCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình KM');
      if (!item.programName) item.errors.push('Thiếu tên chương trình KM');
      if (!item.productCode) item.errors.push('Thiếu mã sản phẩm');
      if (item.productCode && !product) item.warnings.push('Mã sản phẩm chưa có trong danh mục');
      if (product) item.productName = cleanText(product.name || item.productName);
      if (toNumber(item.minQty) <= 0) item.errors.push('Số lượng tối thiểu phải lớn hơn 0');
      if (toNumber(item.discountPercent) <= 0 || toNumber(item.discountPercent) > 100) item.errors.push('Chiết khấu % phải trong khoảng 0-100');
      const key = `${item.programCode}__${item.productCode}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mã sản phẩm trong file');
      seen.add(key);
      item.productMatched = Boolean(product);
      item.missingProduct = Boolean(item.productCode && !product);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'promotionCustomerOrderValueDiscounts') {
    const payloads = safeRows.map(pickPromotionCustomerOrderValueDiscountPayload);
    const customerMap = await preloadPromotionCustomersByCode(payloads);
    const seen = new Set();
    result = payloads.map((item) => {
      const customer = customerMap.get(cleanText(item.customerCode));
      item.errors = [];
      item.warnings = [];
      if (!item.programCode) item.errors.push('Thiếu mã chương trình KM');
      if (!item.programName) item.errors.push('Thiếu tên chương trình KM');
      if (!item.customerCode) item.errors.push('Thiếu mã khách hàng');
      if (item.customerCode && !customer) item.errors.push('Mã khách hàng chưa có trong danh mục');
      if (customer) item.customerName = cleanText(customer.name || item.customerName);
      if (toNumber(item.minOrderAmount) <= 0) item.errors.push('Doanh số đơn tối thiểu phải lớn hơn 0');
      if (toNumber(item.discountPercent) <= 0 || toNumber(item.discountPercent) > 100) item.errors.push('Chiết khấu % phải trong khoảng 0-100');
      const key = `${item.programCode}__${item.customerCode}`;
      if (seen.has(key)) item.errors.push('Trùng mã chương trình + mã khách hàng trong file');
      seen.add(key);
      item.customerMatched = Boolean(customer);
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'users') {
    const importMode = normalizeImportMode(options.importMode, type);
    const usernames = Array.from(new Set(safeRows.map((row) => cleanText(row.username || row['Tên đăng nhập'] || row['Ten dang nhap'] || row['Tài khoản'] || row['Tai khoan'] || row['User'] || row['Username'])).filter(Boolean)));
    const existingRows = usernames.length ? await User.find({ username: { $in: usernames } }).lean() : [];
    const existing = new Map(existingRows.map((row) => [String(row.username || '').toLowerCase(), row]));
    const seen = new Set();
    result = safeRows.map((row) => {
      const item = { ...rowBase(row), ...pickUserImportPayload(row), errors: [], warnings: [], importMode };
      const key = item.username.toLowerCase();
      const current = existing.get(key) || null;
      if (!item.username) item.errors.push('Thiếu tên đăng nhập');
      if (key && seen.has(key)) item.errors.push('Trùng tên đăng nhập trong file');
      if (key) seen.add(key);

      if (importMode === IMPORT_MODE_UPDATE) {
        const input = getUserUpdateInput(row);
        if (item.username && !current) item.errors.push('Không tìm thấy tài khoản để cập nhật');
        if (input.role.hasValue && !normalizeImportRole(input.role.value)) item.errors.push('Vai trò không hợp lệ');
        const updateInfo = current ? buildUserSelectiveUpdate(row, current, { hashPassword: false }) : { changes: [] };
        item.changes = updateInfo.changes;
        item.changeCount = updateInfo.changes.length;
        item.action = item.errors.length ? 'error' : (item.changeCount ? 'update' : 'no_change');
        item.statusText = item.errors.length ? 'Có lỗi' : (item.changeCount ? `Cập nhật ${item.changeCount} trường` : 'Không thay đổi');
        item.canImport = item.errors.length === 0 && item.changeCount > 0;
        item.passwordStatus = input.password.hasValue ? 'Sẽ cập nhật mật khẩu' : 'Không có mật khẩu mới: giữ nguyên';
      } else {
        if (!item.fullName) item.errors.push('Thiếu họ tên');
        if (!item.staffCode) item.errors.push('Thiếu mã nhân viên');
        if (!item.role) item.errors.push('Vai trò không hợp lệ');
        item.action = item.errors.length ? 'error' : (current ? 'update' : 'create');
        item.statusText = item.errors.length ? 'Có lỗi' : (current ? 'Cập nhật toàn bộ' : 'Thêm mới');
        item.passwordStatus = item.password ? 'Có nhập mật khẩu' : 'Để trống: giữ mật khẩu cũ; tạo mới bắt buộc nhập mật khẩu';
      }
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'openingDebt') {
    const customerMap = await preloadCustomersByCode(safeRows);
    result = safeRows.map((row) => {
      const customerCode = getCustomerCodeFromRow(row);
      const customer = customerMap.get(cleanText(customerCode));
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Công nợ'] ?? row['Cong no']);
      const item = { ...rowBase(row), date: getDateFromRow(row), customerCode, customerName: customer?.name || '', amount, note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (!customerCode) item.errors.push('Thiếu mã khách hàng');
      if (!customer) item.errors.push('Không tìm thấy khách hàng');
      if (amount < 0) item.errors.push('Công nợ đầu không được âm');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'debtCollections') {
    const customerMap = await preloadCustomersByCode(safeRows);
    result = safeRows.map((row) => {
      const customerCode = getCustomerCodeFromRow(row);
      const customer = customerMap.get(cleanText(customerCode));
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Tiền thu'] ?? row['Tien thu']);
      const item = { ...rowBase(row), date: getDateFromRow(row), customerCode, customerName: customer?.name || '', amount, staffName: cleanText(row.staffName || row['Người thu'] || row['Nguoi thu'] || row['Nhân viên']), note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (!customerCode) item.errors.push('Thiếu mã khách hàng');
      if (!customer) item.errors.push('Không tìm thấy khách hàng');
      if (amount <= 0) item.errors.push('Số tiền thu phải lớn hơn 0');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else if (type === 'cashbook') {
    result = safeRows.map((row) => {
      const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
      const cashType = typeRaw.includes('chi') || typeRaw === 'out' ? 'out' : 'in';
      const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien']);
      const item = { ...rowBase(row), date: getDateFromRow(row), type: cashType, source: cleanText(row.source || row['Nguồn'] || row['Nguon'] || row['Nhóm tiền']) || 'import_excel', staffName: cleanText(row.staffName || row['Người nộp/nhận'] || row['Nguoi nop'] || row['Nhân viên']), amount, note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']), errors: [] };
      if (amount <= 0) item.errors.push('Số tiền phải lớn hơn 0');
      return { ...item, valid: item.errors.length === 0 };
    });
  } else {
    throw new Error('Loại import không hợp lệ');
  }

  return buildPreviewSummary(type, result);
}

function normalizeImportFiles({ files = [], buffer = null, fileName = '' } = {}) {
  const list = [];
  if (Array.isArray(files) && files.length) {
    files.forEach((file, index) => {
      if (file && file.buffer) list.push({ buffer: file.buffer, fileName: normalizeUploadedFileName(file.originalname || file.filename || file.name || `File ${index + 1}.xlsx`) });
    });
  }
  if (!list.length && buffer) list.push({ buffer, fileName: normalizeUploadedFileName(fileName || 'File Excel.xlsx') });
  return list;
}

async function buildPreviewFromRows({ type, rows = [], userName = '', importMode = '' } = {}) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!Array.isArray(rows) || !rows.length) {
    return { error: 'File Excel không có dữ liệu hoặc không tìm thấy sheet Import/header hợp lệ', status: 400 };
  }

  const normalizedImportMode = normalizeImportMode(importMode, type);
  const result = await previewMongoNative(type, rows, { importMode: normalizedImportMode });

  if (type === 'salesOrders') {
    const validatedRows = await importRules.validateImportBatch(result.rows || []);

    return {
      ...result,
      importMode: normalizedImportMode,
      rows: validatedRows,
      total: validatedRows.length,
      valid: validatedRows.filter((r) => r.valid).length,
      invalid: validatedRows.filter((r) => !r.valid).length
    };
  }

  return { ...result, importMode: normalizedImportMode };
}

async function previewPastedRows({ type, rows = [], userName = '', importMode = '' } = {}) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  if (!Array.isArray(rows) || !rows.length) return { error: 'Chưa có dữ liệu được dán từ Excel', status: 400 };
  if (rows.length > 5000) return { error: 'Mỗi lần chỉ được dán tối đa 5.000 dòng', status: 413 };

  const normalizedImportMode = normalizeImportMode(importMode, type);
  const safeRows = rows.map((row, index) => {
    const source = row && typeof row === 'object' && !Array.isArray(row) ? row : {};
    const entries = Object.entries(source).slice(0, 100);
    const normalized = Object.fromEntries(entries.map(([key, value]) => [
      String(key || '').slice(0, 200),
      typeof value === 'string' ? value.slice(0, 10000) : value
    ]));
    return {
      ...normalized,
      __rowNo: Number(normalized.__rowNo || normalized.rowNo || index + 1),
      __sourceFile: 'Dán trực tiếp từ Excel'
    };
  });

  const session = await importSessionService.createUploadedSession({
    type,
    fileName: 'clipboard-paste.xlsx',
    fileNames: ['clipboard-paste.xlsx'],
    createdBy: userName,
    importMode: normalizedImportMode
  });

  try {
    await importSessionService.markParsing(session.id);
    const result = await buildPreviewFromRows({
      type,
      rows: safeRows,
      userName,
      importMode: normalizedImportMode
    });

    if (result && result.error) {
      await importSessionService.markFailed(session.id, result.error);
      return {
        ...result,
        sessionId: session.id,
        importSessionId: session.id
      };
    }

    await importSessionService.savePreviewResult(session.id, {
      rows: result.rows || [],
      previewRows: result.rows || [],
      fileNames: ['clipboard-paste.xlsx']
    });

    await auditService.log('IMPORT_PASTE_PREVIEW', {
      refType: 'importSession',
      refId: session.id,
      refCode: session.id,
      userName,
      summary: {
        type,
        importMode: normalizedImportMode,
        totalRows: result.total || result.rows?.length || 0,
        validRows: result.valid || 0,
        invalidRows: result.invalid || 0
      }
    }).catch(() => {});

    return {
      ...result,
      sessionId: session.id,
      importSessionId: session.id,
      importMode: normalizedImportMode,
      status: 'preview_ready',
      source: 'clipboard-paste'
    };
  } catch (err) {
    await importSessionService.markFailed(session.id, err.message || 'Không kiểm tra được dữ liệu đã dán').catch(() => {});
    return {
      error: err.message || 'Không kiểm tra được dữ liệu đã dán',
      status: Number(err.status || err.statusCode || 400),
      sessionId: session.id,
      importSessionId: session.id
    };
  }
}

async function preview({ type, files = [], buffer = null, fileName = '', userName = '', importMode = '' }) {
  if (!type) return { error: 'Thiếu loại import', status: 400 };
  if (type === 'salesOrdersS3') type = 'salesOrders';
  const normalizedImportMode = normalizeImportMode(importMode, type);

  const normalizedFiles = normalizeImportFiles({ files, buffer, fileName });
  if (!normalizedFiles.length) return { error: 'Chưa chọn file Excel', status: 400 };

  const session = await importSessionService.createUploadedSession({
    type,
    fileName: normalizedFiles[0]?.fileName || '',
    fileNames: normalizedFiles.map((f) => f.fileName),
    createdBy: userName,
    importMode: normalizedImportMode
  });

  console.info('[IMPORT_PREVIEW_SESSION_CREATED]', {
    sessionId: session.id,
    type,
    importMode: normalizedImportMode,
    fileCount: normalizedFiles.length
  });

  // Quy mô hiện tại ưu tiên Web direct để không bắt buộc chạy Render Worker.
  // Worker preview vẫn giữ lại như đường mở rộng, chỉ bật khi IMPORT_PREVIEW_ASYNC=true.
  const asyncPreview = process.env.IMPORT_PREVIEW_ASYNC === 'true';

  if (asyncPreview) {
    await importSessionService.markQueued(session.id, { files: normalizedFiles.map((file) => ({
      fileName: file.fileName,
      size: file.size || file.buffer?.length || 0
    })) });

    let queued;
    try {
      queued = await JobSubmissionService.submitImportPreview({
        sessionId: session.id,
        type,
        files: normalizedFiles,
        userName,
        importMode: normalizedImportMode
      });
      console.info('[IMPORT_PREVIEW_JOB_ENQUEUED]', {
        sessionId: session.id,
        jobId: queued?.job?.id,
        created: Boolean(queued?.created)
      });
    } catch (err) {
      await importSessionService.markFailed(session.id, err.message || 'Không thể đưa file vào hàng đợi import').catch(() => {});
      return {
        error: err.message || 'Hàng đợi import đang quá tải',
        status: Number(err.statusCode || err.status || 503),
        sessionId: session.id,
        importSessionId: session.id
      };
    }

    await auditService.log('IMPORT_PREVIEW_QUEUED', {
      refType: 'importSession',
      refId: session.id,
      refCode: session.id,
      userName,
      summary: {
        type,
        importMode: normalizedImportMode,
        totalFiles: normalizedFiles.length,
        fileNames: normalizedFiles.map((file) => file.fileName),
        backgroundJobId: queued.job.id
      }
    }).catch((err) => {
      console.error('[IMPORT_PREVIEW_QUEUED_AUDIT_ERROR]', err && (err.stack || err.message || err));
    });

    return {
      ok: true,
      accepted: true,
      status: 'queued',
      message: 'File import đã được đưa vào hàng chờ xử lý bền vững',
      sessionId: session.id,
      importSessionId: session.id,
      importMode: normalizedImportMode,
      jobId: queued.job.id,
      jobStatusUrl: `/api/background-jobs/${encodeURIComponent(queued.job.id)}`,
      queue: { queued: true, persistent: true, jobId: queued.job.id }
    };
  }

  // Fallback inline dùng runner độc lập, tránh vòng phụ thuộc
  // excelImportService -> importExcelJob -> excelImportService.
  const result = await runImportPreviewPipeline({
    sessionId: session.id,
    type,
    files: normalizedFiles,
    userName,
    importMode: normalizedImportMode,
    buildPreviewFromRows
  });

  if (result.error) return { ...result, sessionId: session.id, importSessionId: session.id };

  await auditService.log('IMPORT_PREVIEW', {
    refType: 'importSession',
    refId: session.id,
    refCode: session.id,
    userName,
    summary: {
      type,
      importMode: normalizedImportMode,
      totalRows: result.total || result.rows?.length || 0,
      validRows: result.valid || 0,
      invalidRows: result.invalid || 0
    }
  });

  return {
    ...result,
    sessionId: session.id,
    importSessionId: session.id,
    importMode: normalizedImportMode,
    status: 'preview_ready'
  };
}

module.exports = {
  previewMongoNative,
  normalizeImportFiles,
  buildPreviewFromRows,
  previewPastedRows,
  preview
};