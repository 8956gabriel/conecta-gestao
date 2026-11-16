-- ============================================================================
-- DEFESA CIVIL IVATUBA — MONITORAMENTO METEOROLÓGICO AUTOMÁTICO
-- Consulta fontes oficiais a cada 10 minutos (pg_cron + Edge Function),
-- classifica o nível de risco, atualiza o status público e registra histórico.
--
-- Execute UMA VEZ no SQL Editor do Supabase (projeto kfvkembarvsbtveksiag).
-- Pode ser executado de novo sem problema (idempotente).
-- Nada existente é removido: só acrescenta colunas, tabelas e funções.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SET search_path TO gestao360, public;

-- ----------------------------------------------------------------------------
-- 1. dc_config: campos públicos extras do status (lidos pela página pública)
-- ----------------------------------------------------------------------------
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_origem TEXT;              -- 'automatico' | 'manual'
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_risco TEXT;               -- tipo de risco (ex.: "Tempestade")
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_orientacao TEXT;          -- orientação à população
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_fonte TEXT;               -- fontes consideradas
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_dados_em TIMESTAMPTZ;     -- horário do último dado válido
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_consulta_em TIMESTAMPTZ;  -- horário da última consulta
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_desatualizado BOOLEAN DEFAULT FALSE;
ALTER TABLE dc_config ADD COLUMN IF NOT EXISTS status_aviso_falha TEXT;         -- aviso de falha de comunicação

-- ----------------------------------------------------------------------------
-- 2. Estado do monitor (um registro por município/tenant). Leitura só no painel.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dc_monitor_estado (
  tenant_id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  municipio TEXT NOT NULL DEFAULT 'Ivatuba',
  uf TEXT NOT NULL DEFAULT 'PR',
  ibge TEXT NOT NULL DEFAULT '4111605',
  -- Coordenadas oficiais da sede municipal (IBGE)
  latitude DOUBLE PRECISION NOT NULL DEFAULT -23.61933,
  longitude DOUBLE PRECISION NOT NULL DEFAULT -52.22045,
  intervalo_minutos INTEGER NOT NULL DEFAULT 10,

  -- Divulgação
  notificar_populacao BOOLEAN NOT NULL DEFAULT TRUE,     -- coloca WhatsApp/SMS na fila
  notificar_nivel_minimo TEXT NOT NULL DEFAULT 'alerta'  -- a partir de qual nível avisa a população
    CHECK (notificar_nivel_minimo IN ('atencao','alerta','emergencia')),
  fila_provider TEXT DEFAULT 'sandbox',                  -- mesmo valor que o painel já usa na fila
  publicar_alertas_oficiais BOOLEAN NOT NULL DEFAULT TRUE,
  publicar_comunicados BOOLEAN NOT NULL DEFAULT TRUE,

  -- Intervenção manual do administrador
  manual_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  manual_status TEXT CHECK (manual_status IN ('normal','atencao','alerta','emergencia')),
  manual_mensagem TEXT,
  manual_motivo TEXT,
  manual_usuario TEXT,
  manual_desde TIMESTAMPTZ,
  manual_ate TIMESTAMPTZ,

  -- Situação da última execução
  ultima_consulta_em TIMESTAMPTZ,
  ultima_consulta_ok_em TIMESTAMPTZ,
  proxima_consulta_em TIMESTAMPTZ,
  ultimo_disparo_em TIMESTAMPTZ,
  falhas_consecutivas INTEGER NOT NULL DEFAULT 0,
  conexao TEXT DEFAULT 'aguardando',                     -- ok | parcial | falha | aguardando
  fontes JSONB DEFAULT '{}'::jsonb,                      -- situação de cada fonte
  dados JSONB,                                           -- último dado válido (observação, previsão, alertas)
  dados_em TIMESTAMPTZ,
  nivel_calculado TEXT,
  nivel_aplicado TEXT,
  nivel_motivos JSONB,
  riscos JSONB,
  rebaixamento_nivel TEXT,                               -- histerese: nível menor aguardando confirmação
  rebaixamento_contagem INTEGER NOT NULL DEFAULT 0,
  ultimo_nivel_notificado TEXT DEFAULT 'normal',
  ultimo_evento_notificado TEXT,
  ultima_notificacao_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

INSERT INTO dc_monitor_estado (tenant_id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Histórico / auditoria de cada consulta e de cada alteração
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dc_monitor_consultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  executado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo TEXT NOT NULL DEFAULT 'consulta',     -- consulta | manual | liberacao_manual | falha_disparo
  origem TEXT,                               -- cron | manual | painel
  usuario TEXT,
  duracao_ms INTEGER,
  conexao TEXT,                              -- ok | parcial | falha
  fontes JSONB,                              -- por fonte: ok, http, erro, itens, url
  dados JSONB,                               -- dados meteorológicos recebidos (resumo)
  nivel_calculado TEXT,
  nivel_anterior TEXT,
  nivel_aplicado TEXT,
  alterou_status BOOLEAN DEFAULT FALSE,
  motivo TEXT,
  alteracoes JSONB,                          -- o que mudou (status, alertas públicos, etc.)
  mensagens JSONB,                           -- mensagens divulgadas (comunicado, fila, painel)
  erros JSONB
);
CREATE INDEX IF NOT EXISTS idx_dc_monitor_consultas_data ON dc_monitor_consultas (tenant_id, executado_em DESC);

-- ----------------------------------------------------------------------------
-- 4. Segurança: leitura apenas para usuários logados; escrita só pelo servidor
-- ----------------------------------------------------------------------------
ALTER TABLE dc_monitor_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_monitor_consultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monitor_estado_leitura ON dc_monitor_estado;
CREATE POLICY monitor_estado_leitura ON dc_monitor_estado FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS monitor_consultas_leitura ON dc_monitor_consultas;
CREATE POLICY monitor_consultas_leitura ON dc_monitor_consultas FOR SELECT TO authenticated USING (true);

REVOKE ALL ON dc_monitor_estado, dc_monitor_consultas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON dc_monitor_estado, dc_monitor_consultas FROM authenticated;
GRANT SELECT ON dc_monitor_estado, dc_monitor_consultas TO authenticated;
GRANT ALL ON dc_monitor_estado, dc_monitor_consultas TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Disparo da Edge Function (usado pelo agendamento e pelo botão manual)
--    URL e segredo ficam no Vault do Supabase — nunca no código das páginas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gestao360.dc_monitor_disparar(p_origem TEXT DEFAULT 'cron', p_usuario TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gestao360, public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_req BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'dc_monitor_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'dc_monitor_cron_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    INSERT INTO dc_monitor_consultas (tipo, origem, usuario, conexao, motivo, erros)
    VALUES ('falha_disparo', p_origem, p_usuario, 'falha',
            'Configuração incompleta: segredos dc_monitor_url / dc_monitor_cron_secret não encontrados no Vault.',
            '["Vault sem dc_monitor_url ou dc_monitor_cron_secret"]'::jsonb);
    RETURN NULL;
  END IF;

  UPDATE dc_monitor_estado SET ultimo_disparo_em = now()
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-secret', v_secret),
    body := jsonb_build_object('origem', p_origem, 'usuario', p_usuario),
    timeout_milliseconds := 120000
  ) INTO v_req;
  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION gestao360.dc_monitor_disparar(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Botão "Consultar agora" do painel (só usuários logados, no máximo 1 vez por minuto)
CREATE OR REPLACE FUNCTION gestao360.dc_monitor_consultar_agora()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gestao360, public, extensions
AS $$
DECLARE
  v_ult TIMESTAMPTZ;
  v_user TEXT := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: faça login no painel.';
  END IF;
  SELECT ultimo_disparo_em INTO v_ult FROM dc_monitor_estado
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
  IF v_ult IS NOT NULL AND v_ult > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Uma consulta foi iniciada há menos de 1 minuto. Aguarde.');
  END IF;
  PERFORM gestao360.dc_monitor_disparar('manual', v_user);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION gestao360.dc_monitor_consultar_agora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gestao360.dc_monitor_consultar_agora() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Intervenção manual (registrada na auditoria e no histórico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gestao360.dc_monitor_definir_manual(
  p_status TEXT, p_mensagem TEXT, p_motivo TEXT, p_horas INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gestao360, public
AS $$
DECLARE
  v_tid UUID := '00000000-0000-0000-0000-000000000001';
  v_user TEXT := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  v_ate TIMESTAMPTZ := CASE WHEN p_horas IS NULL OR p_horas <= 0 THEN NULL ELSE now() + make_interval(hours => p_horas) END;
  v_ant TEXT;
  v_cfg UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado: faça login no painel.'; END IF;
  IF p_status NOT IN ('normal','atencao','alerta','emergencia') THEN RAISE EXCEPTION 'Status inválido.'; END IF;
  IF coalesce(length(trim(p_motivo)), 0) < 5 THEN RAISE EXCEPTION 'Informe o motivo da intervenção manual.'; END IF;

  SELECT id, status_municipio INTO v_cfg, v_ant FROM dc_config WHERE tenant_id = v_tid LIMIT 1;

  UPDATE dc_monitor_estado SET
    manual_ativo = TRUE, manual_status = p_status, manual_mensagem = nullif(trim(p_mensagem), ''),
    manual_motivo = trim(p_motivo), manual_usuario = v_user, manual_desde = now(), manual_ate = v_ate,
    nivel_aplicado = p_status, rebaixamento_nivel = NULL, rebaixamento_contagem = 0, atualizado_em = now()
  WHERE tenant_id = v_tid;

  IF v_cfg IS NULL THEN
    INSERT INTO dc_config (tenant_id, status_municipio, status_mensagem, status_atualizado_em, status_origem)
    VALUES (v_tid, p_status, nullif(trim(p_mensagem), ''), now(), 'manual');
  ELSE
    UPDATE dc_config SET status_municipio = p_status, status_mensagem = nullif(trim(p_mensagem), ''),
      status_atualizado_em = now(), status_origem = 'manual'
    WHERE id = v_cfg;
  END IF;

  INSERT INTO dc_auditoria (tenant_id, usuario, acao, modulo, detalhes)
  VALUES (v_tid, v_user, 'Status do município alterado manualmente', 'monitoramento_clima',
          format('De %s para %s. Motivo: %s. Validade: %s.', coalesce(v_ant, '—'), p_status, trim(p_motivo),
                 coalesce(to_char(v_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), 'até liberar')));

  INSERT INTO dc_monitor_consultas (tenant_id, tipo, origem, usuario, nivel_anterior, nivel_aplicado, alterou_status, motivo, alteracoes)
  VALUES (v_tid, 'manual', 'painel', v_user, v_ant, p_status, coalesce(v_ant, '') <> p_status, trim(p_motivo),
          jsonb_build_object('mensagem', p_mensagem, 'validade', v_ate));

  RETURN jsonb_build_object('ok', true, 'ate', v_ate);
END;
$$;
REVOKE ALL ON FUNCTION gestao360.dc_monitor_definir_manual(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gestao360.dc_monitor_definir_manual(TEXT, TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION gestao360.dc_monitor_liberar_manual(p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = gestao360, public
AS $$
DECLARE
  v_tid UUID := '00000000-0000-0000-0000-000000000001';
  v_user TEXT := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado: faça login no painel.'; END IF;
  UPDATE dc_monitor_estado SET manual_ativo = FALSE, manual_ate = NULL, atualizado_em = now() WHERE tenant_id = v_tid;
  INSERT INTO dc_auditoria (tenant_id, usuario, acao, modulo, detalhes)
  VALUES (v_tid, v_user, 'Status do município devolvido ao modo automático', 'monitoramento_clima', coalesce(p_motivo, ''));
  INSERT INTO dc_monitor_consultas (tenant_id, tipo, origem, usuario, motivo)
  VALUES (v_tid, 'liberacao_manual', 'painel', v_user, coalesce(p_motivo, 'Retorno ao modo automático'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION gestao360.dc_monitor_liberar_manual(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION gestao360.dc_monitor_liberar_manual(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Agendamentos: consulta a cada 10 minutos + limpeza do histórico (180 dias)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('dc-monitor-clima', 'dc-monitor-clima-limpeza');
END $$;

SELECT cron.schedule('dc-monitor-clima', '*/10 * * * *', $$ SELECT gestao360.dc_monitor_disparar('cron'); $$);
SELECT cron.schedule('dc-monitor-clima-limpeza', '17 4 * * *',
  $$ DELETE FROM gestao360.dc_monitor_consultas WHERE executado_em < now() - interval '180 days'; $$);
