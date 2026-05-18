# OrderWise Help & User Guide

Smarter ordering starts here.

Created by Michael Benia WR358

## App overview

OrderWise helps retail staff count inventory, upload weekly sales files, review ordering recommendations, and export inventory or order lists. The app is built for quick in-store use: products are grouped into the curated lineup, counts are saved locally and synced by store when online sync is available, and sales/order work stays separated from stock counts.

[Screenshot: Inventory page]

## Getting started

1. Open the app.
2. Select or add a store number.
3. Upload a sales file when you are ready to review ordering.
4. Enter or adjust Front Units and Backstock Cases on the Inventory page.
5. Use Ordering to review matched rows, unmatched rows, units sold, order cases, and unit order recommendations.
6. Use Settings for saving, exports, clearing data, and this guide.

## Selecting or switching stores

Use the Store dropdown near the top of the app. Store numbers are treated as text, so leading zeroes are preserved. Data is saved under the selected store number. Switching stores loads that store's inventory counts, uploaded sales data, edited products, deleted products, sale flags, and settings.

Use Refresh Stores to reload the shared store list. Use Reload Store Data to pull the latest saved data for the selected store.

## Uploading sales files

Use Upload Sales File near the store controls.

[Screenshot: Upload sales file button]

Supported files are XLSX and CSV. The app reads the sales file in the browser. Files are not uploaded anywhere except as parsed app data saved under the selected store when you save/sync.

The sales parser recognizes headers such as JDE, SKU, UPC, JDE/UPC, JDE/UPC #, Item Number, Product Number, Item, Units, and Net Sales. If a file cannot be read, the app shows a message with the detected columns so you can spot missing or renamed headers.

## Uploading inventory files

If needed, go to Settings and use Upload Inventory File. Inventory uploads merge into the built-in product catalog. The curated catalog remains the source of truth for display category and item order. Imported files can update counts or matched product information, but they do not reorder the catalog.

## Using the inventory page

The Inventory page shows products in this fixed order:

1. Premium
2. Core
3. Rose/Sparkling
4. Large Format
5. Refreshments
6. CVQA

Rows can include stock controls, sale marking, edit/delete controls, transfer buttons, and the small circular history button.

## Searching inventory

The Inventory search field says Search. It searches:

- SKU/JDE/UPC
- product name
- size or type text, such as 750, 750mL, 1.5, 1.5L, and 4L
- pack or case size fields when available

Search is case-insensitive and partial. If Show Only Sale Items is enabled, search filters only within sale items.

## Front units

Front Units are the individual units on the sales floor/front inventory. You can use plus/minus buttons or type a whole number directly. Front Units cannot be negative.

Weekly sales deductions apply to Front Units only. They do not deduct from Backstock Cases.

## Backstock cases

Backstock Cases are full cases in backstock. Backstock is counted separately from Front Units. Backstock is not deducted when applying weekly sales deductions.

## Moving cases between backstock and front stock

Triangle transfer buttons move full cases between Backstock and Front Stock:

- Backstock to Front Stock subtracts 1 backstock case and adds that product's case-size worth of units to Front Units.
- Front Stock to Backstock subtracts one full case worth of Front Units and adds 1 Backstock Case.

Transfers do not change total inventory. They only move stock between locations. If there is not enough stock to complete a full-case transfer, the app shows a message and does not save a change.

## Additions and deductions to stock

Any real count change is tracked:

- Front Units plus/minus
- Front Units direct entry
- Backstock Cases plus/minus
- Backstock Cases direct entry
- weekly sales deduction from Front Units

The app records the previous value and new value where supported, and uses the actual change amount. For example, changing Front Units from 10 to 6 records a removal of 4 units.

## Stock history

Use the small circular i button on a product row to open Inventory History.

[Screenshot: Stock history area]

The history popup shows the last 14 days. Repeated changes are grouped by product, date, direction, and quantity type:

- units added
- units removed
- cases added
- cases removed
- cases moved from backstock to front stock
- cases moved from front stock to backstock

Cases and units are not combined. Transfers are shown as movement events, not as added or removed inventory.

## Ordering page

The Ordering page shows the active weekly sales dataset, matched rows, unmatched rows, summary metrics, order cases, unit order, and sales deduction controls.

Order math uses units sold and product case size. For example, 45 units sold with 12 units per case becomes 4 order cases and 48 units ordered.

Rows matched to products marked On Sale are highlighted. Unmatched sales rows remain separate until matched.

## Weekly sales deduction

Apply Weekly Sales Deduction deducts Units Sold from Front Units only. It does not deduct Backstock Cases. The app keeps a deduction record for the current weekly sales dataset and blocks duplicate deductions for the same dataset.

## Exporting inventory levels

Go to Settings and use Export Inventory. The browser app exports CSV. The Flutter app exports XLSX. Exported inventory uses current edited SKU/description values and excludes deleted inventory items.

## Exporting order lists

Go to Settings and use Export Order List. The export includes ordering recommendations based on the current sales data and inventory counts.

## Settings

[Screenshot: Settings page]

Settings contains tools such as:

- Upload Inventory File
- Save Progress
- Export Inventory
- Export Order List
- Show Only Sale Items
- Clear Stock History
- Clear prior sales data
- Clear inventory count data
- Clear All Sales
- Restore Deleted Inventory Items
- Clear App Cache
- Default Store controls
- Help & User Guide

## Clearing prior sales data

Clear prior sales data removes loaded sales sessions, parsed sales rows, matched/unmatched processing rows, and deduction records. It does not change inventory counts.

## Clearing inventory count data

Clear inventory count data resets Front Units and Backstock Cases. It does not delete products, stores, sale flags, uploaded files, or the built-in catalog.

## Clearing stock history for the current store only

Clear Stock History removes stock addition and deduction history for the selected store. Inventory counts are not changed. Other stores are not changed. Transfer history is kept when transfer rows can be identified by event type or transfer direction.

If stock history still appears after clearing, use Reload Store Data and reopen the history popup. If the browser has stale files, use Clear App Cache in Settings.

## Troubleshooting common errors

### Could not clear stock history

This usually means the saved history could not be updated. Common causes are:

- the stock history setup is missing
- the app does not have permission to clear history
- the app is offline
- the selected store number is blank

Run the app setup SQL in the admin console to create the history table and policies.

### Stock history is not set up yet. No history was cleared.

Online stock history is not available for this store yet. Ask the app owner to finish the stock history setup, refresh the app, then try again.

### XLSX support is not loaded

The browser app needs xlsx.full.min.js beside index.html, or the SheetJS CDN must be reachable. CSV files still work if XLSX support is unavailable.

### Upload says a column is missing

Check the detected column list in the error. Sales files should include a recognized SKU column such as JDE/UPC # and a Units column.

### Changes do not appear on another device

Confirm both devices selected the same store number. Use Save Progress, Refresh Stores, and Reload Store Data. If the app seems stale, use Clear App Cache.

## FAQ

### Does the app upload my original files?

The browser app parses files locally. Parsed app data can be saved for the selected store.

### Can I use the app without internet?

The app keeps a local backup in the browser. Online sync requires internet. Cached app files may continue working offline after the app has been opened.

### Are sales global across stores?

Sale status is intended to be global by product/SKU. Inventory counts remain store-specific.

### Can I restore deleted built-in products?

Yes. Use Restore Deleted Inventory Items in Settings. Built-in catalog items are hidden through saved state; they are not erased from the app code.

### Why are Backstock Cases and Front Units separate?

Backstock is full cases in storage. Front Units are individual units available on the floor. Keeping them separate prevents weekly sales deductions from accidentally removing backstock.

## Support/contact

For help with store workflow, file formats, or app setup, contact the app owner:

Michael Benia WR358

