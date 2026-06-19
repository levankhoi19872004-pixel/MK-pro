'use strict';

const LAYOUT = Object.freeze({
  pageWidthPt: 612,
  pageHeightPt: 792,
  contentLeftPt: 18,
  contentRightPt: 21.24,
  contentTopPt: 17.5,
  contentBottomPt: 14,
  headerHeightPt: 139.1,
  tableHeaderHeightPt: 58.05,
  pageContentBottomPt: 777,
  itemRowsCapacityPt: 562,
  summarySignatureHeightPt: 160,
  detailTitleHeightPt: 17,
  detailHeaderHeightPt: 27,
  detailGapPt: 6,
  maxItemsPerPage: 24
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function textLines(value, charsPerLine) {
  const source = clean(value);
  if (!source) return 1;
  return Math.max(1, Math.ceil(source.length / Math.max(1, charsPerLine)));
}

function estimateItemRowHeight(item = {}) {
  const explicitBreaks = String(item.productName || '').split(/\r?\n/).length;
  const lines = Math.max(explicitBreaks, textLines(item.productName, 49));
  if (lines <= 1) return 17.01;
  if (lines === 2) return 22.86;
  return 22.86 + ((lines - 2) * 10.8);
}

function estimatePromotionRowHeight(row = {}) {
  const descriptionLines = textLines(row.description || row.name, 67);
  const codeLines = textLines(row.code || row.promotionCode, 18);
  return Math.max(25, (Math.max(descriptionLines, codeLines) * 10.2) + 8);
}

function estimateRewardRowHeight(row = {}) {
  const descriptionLines = textLines(row.description || row.name, 62);
  return Math.max(25, (descriptionLines * 10.2) + 8);
}

function packItemPages(items = []) {
  const pages = [];
  let page = [];
  let used = 0;

  for (const item of items) {
    const height = estimateItemRowHeight(item);
    const overCount = page.length >= LAYOUT.maxItemsPerPage;
    const overHeight = page.length > 0 && used + height > LAYOUT.itemRowsCapacityPt;
    if (overCount || overHeight) {
      pages.push({ items: page, itemRowsHeight: used });
      page = [];
      used = 0;
    }
    page.push(item);
    used += height;
  }

  if (page.length || !pages.length) pages.push({ items: page, itemRowsHeight: used });
  return pages;
}

function consumeRows(rows, startIndex, availableHeight, estimator) {
  const selected = [];
  let used = 0;
  let index = startIndex;
  while (index < rows.length) {
    const height = estimator(rows[index]);
    if (selected.length && used + height > availableHeight) break;
    if (!selected.length && height > availableHeight) {
      selected.push(rows[index]);
      used += height;
      index += 1;
      break;
    }
    selected.push(rows[index]);
    used += height;
    index += 1;
  }
  return { selected, used, nextIndex: index };
}

function placeDetailRows(pages, promotions, rewards, initialPageIndex, initialAvailable) {
  let pageIndex = initialPageIndex;
  let available = Math.max(0, initialAvailable);
  let promoIndex = 0;
  let rewardIndex = 0;
  let promoStarted = false;
  let rewardStarted = false;

  function ensurePage() {
    if (!pages[pageIndex]) {
      pages[pageIndex] = {
        items: [],
        itemRowsHeight: 0,
        showItemsTable: false,
        showItemTotal: false,
        showSummary: false,
        promotions: [],
        rewards: []
      };
      available = LAYOUT.pageContentBottomPt - (LAYOUT.contentTopPt + LAYOUT.headerHeightPt);
    }
    return pages[pageIndex];
  }

  while (promoIndex < promotions.length) {
    const page = ensurePage();
    const sectionOverhead = (promoStarted ? LAYOUT.detailHeaderHeightPt : LAYOUT.detailTitleHeightPt + LAYOUT.detailHeaderHeightPt)
      + LAYOUT.detailGapPt;
    if (available <= sectionOverhead + 18) {
      pageIndex += 1;
      available = 0;
      continue;
    }
    const consumed = consumeRows(promotions, promoIndex, available - sectionOverhead, estimatePromotionRowHeight);
    page.promotions = consumed.selected;
    page.promotionContinuation = promoStarted;
    page.showPromotionTotal = consumed.nextIndex >= promotions.length;
    promoStarted = true;
    promoIndex = consumed.nextIndex;
    available -= sectionOverhead + consumed.used;
    if (promoIndex < promotions.length) {
      pageIndex += 1;
      available = 0;
    }
  }

  while (rewardIndex < rewards.length) {
    const page = ensurePage();
    const sectionOverhead = (rewardStarted ? LAYOUT.detailHeaderHeightPt : LAYOUT.detailTitleHeightPt + LAYOUT.detailHeaderHeightPt)
      + LAYOUT.detailGapPt;
    if (available <= sectionOverhead + 18) {
      pageIndex += 1;
      available = 0;
      continue;
    }
    const consumed = consumeRows(rewards, rewardIndex, available - sectionOverhead, estimateRewardRowHeight);
    page.rewards = consumed.selected;
    page.rewardContinuation = rewardStarted;
    page.showRewardTotal = consumed.nextIndex >= rewards.length;
    rewardStarted = true;
    rewardIndex = consumed.nextIndex;
    available -= sectionOverhead + consumed.used;
    if (rewardIndex < rewards.length) {
      pageIndex += 1;
      available = 0;
    }
  }
}

function paginateDmsExactInvoice(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const promotions = Array.isArray(payload.promotions) ? payload.promotions : [];
  const rewards = Array.isArray(payload.offsets) ? payload.offsets : [];
  const pages = packItemPages(items).map((page) => ({
    ...page,
    showItemsTable: true,
    showItemTotal: false,
    showSummary: false,
    promotions: [],
    rewards: []
  }));

  const lastItemPage = pages[pages.length - 1];
  lastItemPage.showItemTotal = true;

  let summaryPageIndex = pages.length - 1;
  let availableAfterItems = LAYOUT.itemRowsCapacityPt - lastItemPage.itemRowsHeight;
  if (availableAfterItems < LAYOUT.summarySignatureHeightPt) {
    pages.push({
      items: [],
      itemRowsHeight: 0,
      showItemsTable: false,
      showItemTotal: false,
      showSummary: true,
      promotions: [],
      rewards: []
    });
    summaryPageIndex = pages.length - 1;
    availableAfterItems = LAYOUT.pageContentBottomPt - (LAYOUT.contentTopPt + LAYOUT.headerHeightPt);
  } else {
    lastItemPage.showSummary = true;
  }

  if (!pages[summaryPageIndex].showSummary) pages[summaryPageIndex].showSummary = true;

  const detailAvailable = pages[summaryPageIndex].showItemsTable
    ? Math.max(0, availableAfterItems - LAYOUT.summarySignatureHeightPt)
    : Math.max(0, availableAfterItems - LAYOUT.summarySignatureHeightPt);

  if (promotions.length || rewards.length) {
    placeDetailRows(pages, promotions, rewards, summaryPageIndex, detailAvailable);
  }

  pages.forEach((page, index) => {
    page.pageNo = index + 1;
    page.pageCount = pages.length;
  });

  return {
    profile: 'SALES_INVOICE_DMS_EXACT_V1',
    copies: ['Liên 1', 'Liên 2'],
    pageCount: pages.length,
    pages,
    layout: LAYOUT
  };
}

module.exports = {
  LAYOUT,
  estimateItemRowHeight,
  estimatePromotionRowHeight,
  estimateRewardRowHeight,
  paginateDmsExactInvoice
};
