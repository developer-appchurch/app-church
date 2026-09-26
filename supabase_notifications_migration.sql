-- ==============================================================================
-- MIGRAÇÃO APPCHURCH: SISTEMA DE LEMBRETE AUTOMÁTICO DE RELATÓRIO PENDENTE
-- ==============================================================================

-- 1. TABELA DE DISPOSITIVOS PUSH (Armazena assinaturas Web Push / VAPID por usuário)
CREATE TABLE IF NOT EXISTS public.dispositivos_push (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  plataforma TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance para dispositivos push
CREATE INDEX IF NOT EXISTS idx_dispositivos_push_membro 
ON public.dispositivos_push(membro_id) 
WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_dispositivos_push_endpoint 
ON public.dispositivos_push(endpoint);

-- RLS para dispositivos_push
ALTER TABLE public.dispositivos_push ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros gerenciam seus próprios dispositivos push" ON public.dispositivos_push;
CREATE POLICY "Membros gerenciam seus próprios dispositivos push"
ON public.dispositivos_push
FOR ALL
USING (
  membro_id IN (
    SELECT id FROM public.membros 
    WHERE auth_user_id = auth.uid() OR id::text = auth.uid()::text
  )
)
WITH CHECK (
  membro_id IN (
    SELECT id FROM public.membros 
    WHERE auth_user_id = auth.uid() OR id::text = auth.uid()::text
  )
);

-- 2. TABELA DE NOTIFICAÇÕES ENVIADAS (Garante idempotência contra disparos duplicados)
CREATE TABLE IF NOT EXISTS public.notificacoes_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL,
  ano_iso INT NOT NULL,
  numero_semana INT NOT NULL,
  data_inicio_semana DATE NOT NULL,
  data_fim_semana DATE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'relatorio_pendente',
  canal TEXT NOT NULL DEFAULT 'push',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  lida_em TIMESTAMPTZ,
  sucesso BOOLEAN NOT NULL DEFAULT true,
  erro TEXT,
  CONSTRAINT unq_notificacao_pendencia_semana UNIQUE (usuario_id, unidade_id, ano_iso, numero_semana)
);

-- Índices de performance para notificações
CREATE INDEX IF NOT EXISTS idx_notificacoes_relatorios_lookup 
ON public.notificacoes_relatorios(usuario_id, unidade_id, ano_iso, numero_semana);

CREATE INDEX IF NOT EXISTS idx_notificacoes_relatorios_enviada 
ON public.notificacoes_relatorios(enviada_em DESC);

-- RLS para notificacoes_relatorios
ALTER TABLE public.notificacoes_relatorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Líder visualiza suas notificações de relatório" ON public.notificacoes_relatorios;
CREATE POLICY "Líder visualiza suas notificações de relatório"
ON public.notificacoes_relatorios
FOR SELECT
USING (
  usuario_id IN (
    SELECT id FROM public.membros 
    WHERE auth_user_id = auth.uid() OR id::text = auth.uid()::text
  )
);

-- 3. AGENDAMENTO AUTOMÁTICO VIA SUPABASE PG_CRON (Toda Segunda-feira às 08:00 Horário de Brasília / 11:00 UTC)
-- Nota: Caso a extensão pg_cron e pg_net estejam ativadas no painel do Supabase:
--
-- SELECT cron.schedule(
--   'lembrete-relatorios-pendentes-segunda',
--   '0 11 * * 1', -- 11:00 UTC = 08:00 Horário de Brasília / Fortaleza toda segunda-feira
--   $$
--   SELECT
--     net.http_post(
--       url := 'https://SEU_PROJETO.supabase.co/functions/v1/check-pending-reports',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer SEU_CRON_SECRET'
--       ),
--       body := jsonb_build_object('trigger', 'pg_cron')
--     ) AS request_id;
--   $$
-- );
