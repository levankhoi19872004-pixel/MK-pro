'use strict';

const PICKING_ZONES = Object.freeze({
  HC: 'HC',
  PC: 'PC',
  UNASSIGNED: 'UNASSIGNED'
});

function canonicalPickingZone(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (raw === 'HC' || raw === 'KHO_HC' || raw === 'KHU_HC' || raw === 'PICKING_HC') return PICKING_ZONES.HC;
  if (raw === 'PC' || raw === 'KHO_PC' || raw === 'KHU_PC' || raw === 'PICKING_PC') return PICKING_ZONES.PC;
  if (raw === 'UNASSIGNED' || raw === 'CHUA_PHAN_LOAI' || raw === 'CHƯA_PHÂN_LOẠI') return PICKING_ZONES.UNASSIGNED;

  return null;
}

function normalizePickingZone(value, fallback = PICKING_ZONES.HC) {
  return canonicalPickingZone(value) || fallback;
}

function pickingZoneFrom(...sources) {
  for (const source of sources) {
    if (source === undefined || source === null || source === '') continue;

    const candidates = typeof source === 'object' && !Array.isArray(source)
      ? [
          source.pickingZoneAtOrder,
          source.pickingZoneSnapshot,
          source.pickingZone,
          source.productSnapshot?.pickingZone,
          source.product?.pickingZone,
          source.printGroup,
          source.warehouseCodeAtOrder,
          source.defaultWarehouseAtOrder,
          source.productSnapshot?.warehouseCode,
          source.productSnapshot?.defaultWarehouse,
          source.warehouseCode,
          source.defaultWarehouse,
          source.warehouse,
          source.khoCode
        ]
      : [source];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue;
      const zone = canonicalPickingZone(candidate);
      // MAIN là kho vật lý, không phải khu bốc. Bỏ qua giá trị không thuộc HC/PC
      // để tiếp tục fallback sang snapshot hoặc danh mục sản phẩm.
      if (zone) return zone;
    }
  }

  return PICKING_ZONES.UNASSIGNED;
}

function pickingZoneLabel(value) {
  const zone = normalizePickingZone(value, PICKING_ZONES.UNASSIGNED);
  if (zone === PICKING_ZONES.HC) return 'HC';
  if (zone === PICKING_ZONES.PC) return 'PC';
  return 'Chưa phân loại';
}

function legacyPrintGroupCode(value) {
  const zone = normalizePickingZone(value, PICKING_ZONES.UNASSIGNED);
  if (zone === PICKING_ZONES.PC) return 'KHO_PC';
  if (zone === PICKING_ZONES.HC) return 'KHO_HC';
  return 'UNASSIGNED';
}

function isAssignedPickingZone(value) {
  const zone = normalizePickingZone(value, PICKING_ZONES.UNASSIGNED);
  return zone === PICKING_ZONES.HC || zone === PICKING_ZONES.PC;
}

module.exports = {
  PICKING_ZONES,
  normalizePickingZone,
  pickingZoneFrom,
  pickingZoneLabel,
  legacyPrintGroupCode,
  isAssignedPickingZone
};
