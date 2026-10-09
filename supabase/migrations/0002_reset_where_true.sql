-- Fix: Supabase's API layer runs with pg_safeupdate, which refuses DELETE without a WHERE
-- clause, even inside functions. reset_demo() used plain "delete from <table>;" and failed.
-- Every delete now says "where true". Paste into Supabase > SQL Editor and Run.

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

  delete from transfers where true;
  delete from handled_issues where true;
  delete from rejections where true;
  delete from approval_requests where true;
  delete from decisions where true;

  delete from inventory where true;
  insert into inventory (sku, location, stock) select sku, location, stock from seed_inventory;
  delete from purchase_orders where true;
  insert into purchase_orders (po, supplier, sku, qty, expected_date, status, location)
    select po, supplier, sku, qty, expected_date + shift, status, location from seed_purchase_orders;
  delete from supplier_offers where true;
  insert into supplier_offers (supplier, sku, price, lead_time_days, moq)
    select supplier, sku, price, lead_time_days, moq from seed_supplier_offers;
  update app_settings set value = (select value from dataset_meta where key = 'default_settings'), updated_at = now() where id = 1;

  delete from sales where date >= old_as_of - 35;
  if shift <> 0 then
    create temporary table shifted on commit drop as select date + shift as date, sku, location, qty_sold from sales;
    delete from sales where true;
    insert into sales select * from shifted;
    update seed_purchase_orders set expected_date = expected_date + shift where true;
    update po_history set ordered_date = ordered_date + shift, promised_date = promised_date + shift, received_date = received_date + shift where true;
    update seed_sales_window set date = date + shift where true;
  end if;
  insert into sales (date, sku, location, qty_sold) select date, sku, location, qty_sold from seed_sales_window;

  update dataset_meta set value = jsonb_set(value, '{as_of}', to_jsonb(new_as_of)) where key = 'dataset';
  return jsonb_build_object('as_of', new_as_of, 'shifted_days', shift);
end;
$$;

revoke execute on function reset_demo() from public, anon, authenticated;
grant execute on function reset_demo() to service_role;
notify pgrst, 'reload schema';
