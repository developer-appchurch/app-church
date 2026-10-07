-- Índice de cobertura da chave estrangeira (nivel_celula_id, igreja_id) do Domingo em Dia.
-- Já aplicado em produção; mantido aqui para registro e para ambientes novos.
create index if not exists idx_ded_config_nivel
  on public.domingo_em_dia_config (nivel_celula_id, igreja_id);
