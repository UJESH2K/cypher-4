-- Kaveri Desk: database schema.
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run twice.
--
-- Security model: row-level security is on for every table and there are no policies, so the
-- public (publishable / anon) key can read and write nothing. Only the server, holding the
-- secret key, talks to the database. The functions below are revoked from public roles too.

-- ---------- Reference data ----------

create table if not exists locations (
  name text primary key,
  kind text not null check (kind in ('store', 'warehouse')),
  lat double precision not null,
  lon double precision not null,
  lang text not null default 'kn'
);
comment on table locations is 'Kaveri''s six stores and two warehouses in North Karnataka.';

create table if not exists products (
  sku text primary key,
  name text not null,
  machine_model text not null default 'Universal',
  category text not null,
  demand_class text not null default 'none' check (demand_class in ('smooth', 'erratic', 'intermittent', 'lumpy', 'none')),
  adi numeric not null default 0,
  cv2 numeric not null default 0,
  abc char(1) not null default 'C' check (abc in ('A', 'B', 'C')),
  source text not null default 'scenario',
  unit_price numeric not null default 0
);
comment on table products is 'Parts catalogue. demand_class follows Syntetos-Boylan (ADI 1.32 / CV2 0.49). source = carparts:<series> when the demand pattern comes from the real car-parts dataset.';

create table if not exists suppliers (
  supplier text primary key,
  city text not null,
  lang text not null,
  on_time_target numeric not null default 0.8
);

create table if not exists supplier_offers (
  supplier text not null references suppliers(supplier) on delete cascade,
  sku text not null references products(sku) on delete cascade,
  price numeric not null check (price >= 0),
  lead_time_days int not null check (lead_time_days >= 0),
  moq int not null default 1 check (moq >= 1),
  primary key (supplier, sku)
);
comment on table supplier_offers is 'The challenge''s Suppliers record: supplier, sku, price, lead_time_days, moq.';

-- ---------- The books ----------

create table if not exists inventory (
  sku text not null references products(sku) on delete cascade,
  location text not null references locations(name),
  stock int not null check (stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (sku, location)
);

create table if not exists sales (
  date date not null,
  sku text not null references products(sku) on delete cascade,
  location text not null references locations(name),
  qty_sold int not null check (qty_sold >= 0),
  primary key (date, sku, location)
);
create index if not exists sales_sku_location_date on sales (sku, location, date);
comment on table sales is 'Daily sales per part and store. Two years of history; the agent reads the last five weeks plus six-month rates.';

create table if not exists purchase_orders (
  po text primary key,
  supplier text not null,
  sku text not null references products(sku) on delete cascade,
  qty int not null check (qty >= 0),
  expected_date date not null,
  status text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  location text not null default 'Hubli Warehouse',
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists po_history (
  po text primary key,
  supplier text not null,
  sku text not null,
  qty int not null,
  location text not null,
  ordered_date date not null,
  promised_date date not null,
  received_date date not null
);
comment on table po_history is 'Received purchase orders over two years; used for supplier on-time scorecards.';

create table if not exists transfers (
  id text primary key,
  sku text not null,
  from_location text not null,
  to_location text not null,
  qty int not null check (qty > 0),
  eta date not null,
  created_at timestamptz not null default now(),
  created_by text
);

-- ---------- People, decisions and the agent ----------

create table if not exists app_users (
  id text primary key,
  name text not null,
  role text not null check (role in ('purchasing', 'store', 'viewer')),
  store text,
  initials text not null,
  salt text not null,
  hash text not null
);
comment on table app_users is 'Demo accounts. Passwords are PBKDF2-SHA256 hashes (120,000 rounds, per-user salt).';

create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists decisions (
  id text primary key,
  at timestamptz not null default now(),
  decision text not null check (decision in ('approved', 'rejected', 'requested')),
  issue_id text not null,
  kind text not null,
  sku text not null,
  location text not null,
  option jsonb not null,
  reason text,
  by_user text,
  by_name text
);
create index if not exists decisions_at on decisions (at desc);
comment on table decisions is 'Audit log: every approval, rejection and request, with who made it.';

create table if not exists handled_issues (
  issue_id text primary key,
  issue jsonb not null,
  option jsonb not null,
  at timestamptz not null default now(),
  by_name text
);

create table if not exists rejections (
  issue_id text not null,
  option_id text not null,
  at timestamptz not null default now(),
  primary key (issue_id, option_id)
);

create table if not exists approval_requests (
  issue_id text primary key,
  option_id text not null,
  by_user text not null,
  by_name text not null,
  at timestamptz not null default now()
);

create table if not exists agent_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  as_of date not null,
  triggered_by text,
  duration_ms int not null,
  records_read int not null,
  problems int not null,
  options_compared int not null,
  drafts int not null,
  top jsonb
);
comment on table agent_runs is 'One row per agent run: when, for whom, how long it took and what it found.';

create table if not exists dataset_meta (
  key text primary key,
  value jsonb not null
);

-- Snapshots of the morning's books, so "Reset to sample data" can restore them.
create table if not exists seed_inventory (sku text, location text, stock int);
create table if not exists seed_purchase_orders (po text, supplier text, sku text, qty int, expected_date date, status text, location text);
create table if not exists seed_supplier_offers (supplier text, sku text, price numeric, lead_time_days int, moq int);
create table if not exists seed_sales_window (date date, sku text, location text, qty_sold int);

-- ---------- Row-level security: on, with no policies ----------

do $$
declare t text;
begin
  foreach t in array array['locations','products','suppliers','supplier_offers','inventory','sales','purchase_orders','po_history',
    'transfers','app_users','app_settings','decisions','handled_issues','rejections','approval_requests','agent_runs','dataset_meta',
    'seed_inventory','seed_purchase_orders','seed_supplier_offers','seed_sales_window']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- Functions the server calls ----------

-- Everything the agent needs for one morning, in one round trip.
create or replace function api_snapshot(window_days int default 35)
returns jsonb
language sql
stable
as $$
  with m as (select (value->>'as_of')::date as as_of from dataset_meta where key = 'dataset')
  select jsonb_build_object(
    'as_of', (select as_of from m),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'name', name, 'machine_model', machine_model,
                   'category', category, 'demand_class', demand_class) order by sku), '[]'::jsonb) from products),
    'inventory', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'location', location, 'stock', stock)), '[]'::jsonb) from inventory),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('supplier', supplier, 'sku', sku, 'price', price,
                   'lead_time_days', lead_time_days, 'moq', moq)), '[]'::jsonb) from supplier_offers),
    'purchase_orders', (select coalesce(jsonb_agg(jsonb_build_object('po', po, 'supplier', supplier, 'sku', sku, 'qty', qty,
                   'expected_date', expected_date, 'status', status, 'location', location) order by po), '[]'::jsonb) from purchase_orders),
    'transfers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sku', sku, 'from', from_location, 'to', to_location,
                   'qty', qty, 'eta', eta) order by created_at), '[]'::jsonb) from transfers),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('date', s.date, 'sku', s.sku, 'location', s.location, 'qty_sold', s.qty_sold)), '[]'::jsonb)
              from sales s, m where s.date >= m.as_of - window_days and s.date < m.as_of),
    'longRates', (select coalesce(jsonb_agg(jsonb_build_object('sku', sku, 'location', location, 'rate180', rate180)), '[]'::jsonb)
                  from (select s.sku, s.location, round(sum(s.qty_sold)::numeric / 180, 3) as rate180
                        from sales s, m where s.date >= m.as_of - 180 and s.date < m.as_of group by s.sku, s.location) x),
    'settings', (select value from app_settings where id = 1),
    'handled', (select coalesce(jsonb_object_agg(issue_id, jsonb_build_object('issue', issue, 'option', option, 'at', at, 'by', by_name)), '{}'::jsonb) from handled_issues),
    'rejected', (select coalesce(jsonb_object_agg(issue_id, ids), '{}'::jsonb)
                 from (select issue_id, jsonb_agg(option_id order by at) as ids from rejections group by issue_id) r),
    'requests', (select coalesce(jsonb_object_agg(issue_id, jsonb_build_object('issueId', issue_id, 'optionId', option_id,
                   'by', by_user, 'byName', by_name, 'at', at)), '{}'::jsonb) from approval_requests),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'decision', decision, 'issueId', issue_id, 'kind', kind,
              'sku', sku, 'location', location, 'option', option, 'reason', reason, 'by', by_name) order by at desc), '[]'::jsonb)
            from (select * from decisions order by at desc limit 300) d)
  );
$$;

-- Numbers for the "Data and sources" panel.
create or replace function db_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'tables', jsonb_build_object(
      'products', (select count(*) from products),
      'locations', (select count(*) from locations),
      'supplier_offers', (select count(*) from supplier_offers),
      'inventory', (select count(*) from inventory),
      'sales', (select count(*) from sales),
      'purchase_orders', (select count(*) from purchase_orders),
      'po_history', (select count(*) from po_history),
      'decisions', (select count(*) from decisions),
      'agent_runs', (select count(*) from agent_runs)),
    'sales_from', (select min(date) from sales),
    'sales_to', (select max(date) from sales),
    'units_sold', (select coalesce(sum(qty_sold), 0) from sales),
    'demand_classes', (select coalesce(jsonb_object_agg(demand_class, n), '{}'::jsonb)
                       from (select demand_class, count(*) as n from products group by demand_class) x),
    'abc', (select coalesce(jsonb_object_agg(abc, n), '{}'::jsonb) from (select abc, count(*) as n from products group by abc) x),
    'real_demand_parts', (select count(*) from products where source like 'carparts:%'),
    'suppliers', (select coalesce(jsonb_agg(x order by x.supplier), '[]'::jsonb) from (
        select h.supplier, count(*) as orders,
               round(avg(case when h.received_date <= h.promised_date then 1 else 0 end)::numeric, 3) as on_time,
               round(avg(greatest(h.received_date - h.promised_date, 0))::numeric, 2) as avg_days_late,
               round(avg(h.promised_date - h.ordered_date)::numeric, 1) as avg_lead
        from po_history h group by h.supplier) x),
    'last_run', (select to_jsonb(r) from (select * from agent_runs order by at desc limit 1) r),
    'meta', (select value from dataset_meta where key = 'dataset')
  );
$$;

-- Put the books back to this morning's state and move every date so that "today" is today (IST).
create or replace function reset_demo()
returns jsonb
language plpgsql
set statement_timeout = '120s'
as $$
declare
  old_as_of date;
  new_as_of date := (now() at time zone 'Asia/Kolkata')::date;
  shift int;
begin
  select (value->>'as_of')::date into old_as_of from dataset_meta where key = 'dataset';
  if old_as_of is null then
    raise exception 'dataset is not seeded';
  end if;
  shift := new_as_of - old_as_of;

  delete from transfers;
  delete from handled_issues;
  delete from rejections;
  delete from approval_requests;
  delete from decisions;

  delete from inventory;
  insert into inventory (sku, location, stock) select sku, location, stock from seed_inventory;
  delete from purchase_orders;
  insert into purchase_orders (po, supplier, sku, qty, expected_date, status, location)
    select po, supplier, sku, qty, expected_date + shift, status, location from seed_purchase_orders;
  delete from supplier_offers;
  insert into supplier_offers (supplier, sku, price, lead_time_days, moq)
    select supplier, sku, price, lead_time_days, moq from seed_supplier_offers;
  update app_settings set value = (select value from dataset_meta where key = 'default_settings'), updated_at = now() where id = 1;

  -- Sales: drop the morning window (edits only ever touch it), then move all history by the same
  -- number of days and put the original window back on top.
  delete from sales where date >= old_as_of - 35;
  if shift <> 0 then
    create temporary table shifted on commit drop as select date + shift as date, sku, location, qty_sold from sales;
    delete from sales;
    insert into sales select * from shifted;
    update seed_purchase_orders set expected_date = expected_date + shift;
    update po_history set ordered_date = ordered_date + shift, promised_date = promised_date + shift, received_date = received_date + shift;
    update seed_sales_window set date = date + shift;
  end if;
  insert into sales (date, sku, location, qty_sold) select date, sku, location, qty_sold from seed_sales_window;

  update dataset_meta set value = jsonb_set(value, '{as_of}', to_jsonb(new_as_of)) where key = 'dataset';
  return jsonb_build_object('as_of', new_as_of, 'shifted_days', shift);
end;
$$;

revoke execute on function api_snapshot(int) from public, anon, authenticated;
revoke execute on function db_stats() from public, anon, authenticated;
revoke execute on function reset_demo() from public, anon, authenticated;
grant execute on function api_snapshot(int) to service_role;
grant execute on function db_stats() to service_role;
grant execute on function reset_demo() to service_role;

-- Tell the API layer about the new tables and functions straight away.
notify pgrst, 'reload schema';
