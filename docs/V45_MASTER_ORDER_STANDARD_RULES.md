
# V45 MASTER ORDER STANDARD

1. Master order must display total product quantity = sum(item.quantity)

2. Master order value must be recalculated:
totalValue = Σ(quantity * products.salePrice)

3. Products sorted by productName ASC (Vietnamese locale)

4. Always split by warehouse HC and PC from product.defaultWarehouse

5. Print master order in 2 sections HC and PC

6. Use common aggregation service for all master order types

7. Do not trust stored totalAmount/totalQty; recalculate when rendering/reporting/printing.
