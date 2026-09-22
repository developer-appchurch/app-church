-- ==============================================================================
-- APPCHURCH - SCRIPT DE MIGRAÇÃO PARA UUIDs ÚNICOS
-- Use este script no Supabase SQL Editor se já tiver criado as tabelas anteriores
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Dropar views dependentes para permitir recriação das colunas
DROP VIEW IF EXISTS public.vw_member_leadership_track CASCADE;
DROP VIEW IF EXISTS public.vw_cell_members_full CASCADE;

-- 2. Recriação limpa com estrutura relacional estrita (se desejar migrar do zero)
-- Recomendado para garantir integridade e relacionamentos consistentes:

DROP TABLE IF EXISTS public.post_comments CASCADE;
DROP TABLE IF EXISTS public.feed_posts CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.leadership_tracks CASCADE;
DROP TABLE IF EXISTS public.member_track_steps CASCADE;
DROP TABLE IF EXISTS public.track_steps CASCADE;
DROP TABLE IF EXISTS public.member_permissions CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.permissions CASCADE;
DROP TABLE IF EXISTS public.members CASCADE;
DROP TABLE IF EXISTS public.cells CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.churches CASCADE;

-- Após executar este script, execute o conteúdo completo de /supabase/schema.sql
-- para recriar as tabelas com colunas UUID, chaves estrangeiras e dados iniciais.
