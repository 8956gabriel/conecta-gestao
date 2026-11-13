-- ============================================================
-- CONECTA GESTÃO 360 · Esporte — tabela "Gols e Cartões"
-- Cria gestao360.esporte_jogo_eventos, usada pelo módulo de Esporte
-- (aba "Gols e Cartões" e cálculo de artilharia/cartões da classificação).
--
-- Segurança: a tabela nasce com RLS ligado e recebe EXATAMENTE as mesmas
-- políticas e permissões que já existem em gestao360.esporte_jogos.
-- Não altera nenhuma tabela existente e não apaga nenhum dado.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
--
-- Como usar: Supabase > SQL Editor > New query > colar tudo > Run.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS gestao360.esporte_jogo_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  jogo_id       UUID NOT NULL REFERENCES gestao360.esporte_jogos(id) ON DELETE CASCADE,
  competicao_id UUID REFERENCES gestao360.esporte_competicoes(id) ON DELETE SET NULL,
  equipe_id     UUID REFERENCES gestao360.esporte_equipes(id) ON DELETE SET NULL,
  atleta_id     UUID REFERENCES gestao360.esporte_atletas(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('gol','cartao_amarelo','cartao_vermelho')),
  minuto        INTEGER CHECK (minuto IS NULL OR minuto >= 0),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esp_jogo_eventos_jogo       ON gestao360.esporte_jogo_eventos(jogo_id);
CREATE INDEX IF NOT EXISTS idx_esp_jogo_eventos_competicao ON gestao360.esporte_jogo_eventos(competicao_id);
CREATE INDEX IF NOT EXISTS idx_esp_jogo_eventos_atleta     ON gestao360.esporte_jogo_eventos(atleta_id);

ALTER TABLE gestao360.esporte_jogo_eventos ENABLE ROW LEVEL SECURITY;

-- Copia as políticas RLS de esporte_jogos (mesmo nível de acesso)
DO $$
DECLARE p record; sql text;
BEGIN
  FOR p IN SELECT * FROM pg_policies WHERE schemaname = 'gestao360' AND tablename = 'esporte_jogos' LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='gestao360' AND tablename='esporte_jogo_eventos' AND policyname=p.policyname) THEN
      CONTINUE;
    END IF;
    sql := format('CREATE POLICY %I ON gestao360.esporte_jogo_eventos AS %s FOR %s TO %s',
                  p.policyname, p.permissive, p.cmd, array_to_string(p.roles, ', '));
    IF p.qual IS NOT NULL THEN sql := sql || ' USING (' || p.qual || ')'; END IF;
    IF p.with_check IS NOT NULL THEN sql := sql || ' WITH CHECK (' || p.with_check || ')'; END IF;
    EXECUTE sql;
  END LOOP;
END $$;

-- Copia as permissões (GRANT) de esporte_jogos
DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT grantee, privilege_type FROM information_schema.role_table_grants
           WHERE table_schema = 'gestao360' AND table_name = 'esporte_jogos'
             AND grantee IN ('anon','authenticated','service_role') LOOP
    EXECUTE format('GRANT %s ON gestao360.esporte_jogo_eventos TO %I', g.privilege_type, g.grantee);
  END LOOP;
END $$;

-- Faz a API (PostgREST) enxergar a tabela nova na hora
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência (opcional): deve listar as mesmas políticas de esporte_jogos
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
--  WHERE schemaname='gestao360' AND tablename IN ('esporte_jogos','esporte_jogo_eventos') ORDER BY 1,2;
