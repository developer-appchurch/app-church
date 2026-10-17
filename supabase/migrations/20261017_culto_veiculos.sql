-- ==============================================================================
-- Migração: Contagem de Cultos — carros e motos
-- Data: 2026-10-17
--
-- Acrescenta à contagem de cada culto a quantidade de carros e motos no
-- estacionamento. Não entram no total de pessoas (total = adultos + crianças).
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ==============================================================================

ALTER TABLE public.culto_contagens
    ADD COLUMN IF NOT EXISTS carros INTEGER NOT NULL DEFAULT 0 CHECK (carros BETWEEN 0 AND 100000),
    ADD COLUMN IF NOT EXISTS motos INTEGER NOT NULL DEFAULT 0 CHECK (motos BETWEEN 0 AND 100000);
