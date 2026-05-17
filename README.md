# Wine Order Count Static Web App

This folder contains a standalone HTML/CSS/JavaScript version of Wine Order Count for GitHub Pages.

## Files

- `index.html` - app shell
- `catalog.js` - built-in curated product catalog and fixed category/order mapping
- `styles.css` - purple themed UI
- `app.js` - local storage, Supabase sync, XLSX/CSV import, ordering logic, CSV export
- `service-worker.js` - basic offline cache
- `supabase-setup.sql` - Supabase table and testing-only RLS policies
- `xlsx.full.min.js` - local SheetJS build for browser XLSX parsing

`index.html` loads `xlsx.full.min.js` before `app.js`. If the local file is missing, it attempts a CDN fallback from jsDelivr. For restricted work laptops, keep `xlsx.full.min.js` beside `index.html` so XLSX uploads work without relying on the CDN.

## What Runs Locally

The app runs as a static GitHub Pages site. Uploaded files are parsed in the browser. Data is saved locally first, then synced to Supabase under the selected store number when Supabase is available.

Saved locally:

- built-in catalog inventory counts and edits
- inventory products
- edited SKU/description overrides
- deleted built-in item hide-list
- old-to-new SKU aliases for matching edited items
- Front unit counts
- Backstock case counts
- notes and order overrides
- global on-sale flags and the Show Only Sale Items filter
- uploaded sales sessions
- matched and unmatched sales rows
- deduction history
- settings

## Supabase Sync

Use the **Store** dropdown at the top of the app to choose the active store number. Store numbers are loaded from the shared Supabase `stores` table, so a store added on one device appears on other devices after refresh. Inventory counts, sales sessions, product edits, deleted items, recommendations, deductions, and settings are saved per store in the `store_app_state` table:

There is no built-in default store option. If you have not chosen a default store in Settings, the store selector opens blank until you add or select a store.

```text
store_app_state.store_number = {storeNumber}
store_app_state.app_state = { full app state JSON }
```

The `stores` table holds the shared list of available store numbers:

```text
stores.store_number = {storeNumber}
```

The app also keeps a per-store browser cache:

```text
wineAppState_store_{storeNumber}
```

If Supabase is unavailable, the app continues in local mode and syncs again when the browser comes back online.

The **Save Progress** button writes a local backup first and then waits for the Supabase upsert to finish. A successful manual save shows **Project saved to Supabase**. If Supabase is unavailable or rejects the write, the app keeps the local backup and shows **Supabase save failed. Project saved locally only.**

Uploaded sales and inventory files are stored as parsed app data inside the selected store's Supabase state. Selecting the same store number on another device loads the same inventory counts, uploaded sales rows, parsed inventory rows, deleted items, edits, recommendations, and settings from Supabase.

Sale status is global, not store-specific. The app stores sale flags in `global_product_sale_status` keyed by product SKU/source SKU, so marking a product on sale in one store makes it appear on sale in every store. Front counts and Backstock counts remain store-specific in `store_app_state`.

If the global sale table has not been created yet, the app keeps store loading working and falls back to updating sale flags inside every store's `store_app_state` row. Run the latest `supabase-setup.sql` so the dedicated global sale table and Realtime subscription are available.

Use **Settings > Clear All Sales** to remove sale status from every product in every store. This clears sale fields (`on_sale`, `sale_price`, `sale_note`, `sale_start`, and `sale_end`) where the global sale table exists and also clears store-state sale flags. Inventory counts, Backstock, Front, notes, sales data, and order quantities are not changed.

Use **Refresh Stores** to pull the shared store list from Supabase and refresh the currently selected store. Use **Reload Store Data** to force a fresh load of the selected store's `store_app_state.app_state` from Supabase on another device.

When a store is selected, the app subscribes to Supabase Realtime updates for that store's `store_app_state` row and for global sale changes in `global_product_sale_status`. To enable live cross-device updates, run the Realtime lines in `supabase-setup.sql` or enable Realtime for both tables in the Supabase dashboard under Database > Replication.

If a device seems stuck on old JavaScript, use **Settings > Clear App Cache**. The service worker bypasses Supabase requests and uses network-first loading for `index.html`, `styles.css`, and `app.js`.

Inventory count changes are also recorded in `inventory_adjustment_history` and shown from each product row's small circular **i** button. The popup groups additions and removals from the last 14 days by product, date, direction, and quantity type, so Front units and Backstock cases stay separate. Backstock/Front case transfers are stored as `event_type = 'transfer'` rows with `transfer_direction`, `case_quantity`, and `unit_equivalent`, so they appear as movement events instead of normal added/removed inventory.

Use **Settings > Inventory Tools > Clear Stock History** to remove only stock addition/deduction history for the currently selected store. Inventory counts, sale flags, products, uploads, other stores, and `event_type = 'transfer'` case movement history are kept.

### Supabase Setup SQL

Run the SQL in `supabase-setup.sql` in your Supabase SQL editor.

The included RLS policies are for personal testing only. They are public and unauthenticated, so they are not safe for production or public sharing. Add Supabase Auth and store-scoped policies before sharing the app widely.

```text
create table if not exists store_app_state (
  store_number text primary key,
  app_state jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists stores (
  store_number text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists global_product_sale_status (
  product_id text primary key,
  on_sale boolean not null default false,
  sale_price numeric null,
  sale_note text null,
  sale_start timestamptz null,
  sale_end timestamptz null,
  updated_at timestamptz default now()
);
```

## Publish on GitHub Pages

1. Create a GitHub repository or open your existing repository.
2. Copy this `docs` folder into the repository root.
3. Commit and push the files.
4. In GitHub, go to **Settings > Pages**.
5. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/docs`
6. Click **Save**.
7. GitHub will show the Pages URL after the deploy finishes.

The app will be available at a URL similar to:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

## Local Testing

You can open `index.html` directly in a browser for basic testing. For service-worker/offline testing, serve the folder over a local static server:

```powershell
cd docs
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Import Expectations

The app includes the curated product catalog automatically. Inventory file import is optional and is used to merge count data into matching catalog products.
Inventory rows can also be edited or deleted directly in the app. Deleted built-in catalog items are hidden locally, not removed from the source code, and can be restored from **Settings > Restore Deleted Inventory Items**.

Inventory files should include headers like:

- `JDE/UPC`
- `Description`
- optional `Front`
- optional `Backstock`

Sales files can be XLSX or CSV. The parser looks for common headers like:

- `JDE/UPC`, `UPC`, `JDE`, `Product Code`
- `Description`, `Product`, `Product Name`
- `Units Sold`, `Units`, `Sold`
- `Pack`, `Size`, `Package`

If headers are missing, the sales parser also supports the app's legacy column layout:

- Column B: JDE/UPC or product identifier
- Column C: pack/product text
- Column E: units sold

## Exports

The app exports CSV files fully in the browser:

- inventory levels
- order recommendations

No data is uploaded during export.
