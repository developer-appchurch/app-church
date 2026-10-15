-- ==============================================================================
-- Migração: permissão "Configurar Cultos" (culto:configurar)
-- Data: 2026-10-15
--
-- Separa duas coisas:
--   * culto:gerenciar  (Gestor de Culto)  -> só LANÇA a contagem dos cultos;
--   * culto:configurar (Configurar Cultos) -> cadastra campus e horários em
--                                             Configurações da Igreja › Cultos.
-- Pastor, Administrador e church:admin já herdam as duas. Idempotente.
-- ==============================================================================

INSERT INTO public.permissoes (codigo, nome, modulo, descricao)
VALUES (
    'culto:configurar',
    'Configurar Cultos',
    'Cultos',
    'Cadastrar campus e horários de culto em Configurações da Igreja (não inclui lançar a contagem).'
)
ON CONFLICT (codigo) DO NOTHING;
