insert into public.economic_indicators (
  id,
  code,
  name,
  source_name,
  source_url,
  frequency,
  unit,
  currency,
  is_active
)
values
  ('00000000-0000-4000-8000-000000000101', 'selic', 'SELIC', 'Banco Central do Brasil', 'https://www.bcb.gov.br/', 'daily', 'percent', 'BRL', true),
  ('00000000-0000-4000-8000-000000000102', 'cdi', 'CDI', 'B3', 'https://www.b3.com.br/', 'daily', 'percent', 'BRL', true),
  ('00000000-0000-4000-8000-000000000103', 'ipca', 'IPCA', 'IBGE', 'https://www.ibge.gov.br/', 'monthly', 'percent', 'BRL', true),
  ('00000000-0000-4000-8000-000000000104', 'di', 'DI', 'B3', 'https://www.b3.com.br/', 'daily', 'percent', 'BRL', true),
  ('00000000-0000-4000-8000-000000000105', 'usd_brl', 'USD/BRL', 'Banco Central do Brasil', 'https://www.bcb.gov.br/', 'daily', 'rate', 'BRL', true)
on conflict (code) do update
set
  name = excluded.name,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  frequency = excluded.frequency,
  unit = excluded.unit,
  currency = excluded.currency,
  is_active = excluded.is_active,
  updated_at = now();
