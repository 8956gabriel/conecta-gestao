-- ============================================================
-- DEFESA CIVIL IVATUBA — MIGRAÇÃO V2
-- Novos módulos: Notas Técnicas, Fila de Notificações,
-- Configurações do Desenvolvedor, Auditoria, campos adicionais
-- Execute no SQL Editor do Supabase
-- ============================================================

SET search_path TO gestao360, public;

-- ============================================================
-- 1. NOTAS TÉCNICAS (ENOS, SIMEPAR, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS dc_notas_tecnicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  numero TEXT,
  data_publicacao DATE,
  titulo TEXT NOT NULL,
  assunto TEXT,
  resumo TEXT,
  situacao_atual TEXT,
  riscos TEXT,
  recomendacoes TEXT,
  periodo_analisado TEXT,
  pdf_url TEXT,
  fonte TEXT DEFAULT 'Defesa Civil do Paraná / SIMEPAR',
  external_id TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dc_notas_tecnicas_data ON dc_notas_tecnicas(data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_dc_notas_tecnicas_external ON dc_notas_tecnicas(external_id);
ALTER TABLE dc_notas_tecnicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_notas_tecnicas" ON dc_notas_tecnicas FOR ALL USING (true);

-- ============================================================
-- 2. FILA DE NOTIFICAÇÕES (WhatsApp/SMS)
-- ============================================================
CREATE TABLE IF NOT EXISTS dc_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  pessoa_id UUID REFERENCES dc_pessoas_alerta(id),
  alerta_id UUID,
  ocorrencia_id UUID,
  canal TEXT NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('sms','whatsapp')),
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','enviada','erro','cancelada')),
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 3,
  proxima_tentativa TIMESTAMPTZ,
  provider TEXT,
  resposta_provider TEXT,
  erro TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  enviado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dc_notif_queue_status ON dc_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_dc_notif_queue_criado ON dc_notification_queue(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_dc_notif_queue_pessoa ON dc_notification_queue(pessoa_id);
ALTER TABLE dc_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_notif_queue" ON dc_notification_queue FOR ALL USING (true);

-- ============================================================
-- 3. CONFIGURAÇÕES DO DESENVOLVEDOR
-- ============================================================
CREATE TABLE IF NOT EXISTS dc_developer_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  developer_name TEXT DEFAULT 'Gabriel Oliveira',
  developer_company TEXT,
  developer_website TEXT,
  developer_contact TEXT,
  developer_logo TEXT,
  platform_name TEXT DEFAULT 'Defesa Civil Ivatuba',
  platform_version TEXT DEFAULT '2.0.0',
  municipio TEXT DEFAULT 'Ivatuba',
  estado TEXT DEFAULT 'Paraná',
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dc_developer_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_developer_config" ON dc_developer_config FOR ALL USING (true);

INSERT INTO dc_developer_config (tenant_id, developer_name, platform_name, platform_version)
VALUES ('00000000-0000-0000-0000-000000000001', 'Gabriel Oliveira', 'Defesa Civil Ivatuba', '2.0.0')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. AUDITORIA
-- ============================================================
CREATE TABLE IF NOT EXISTS dc_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  usuario TEXT,
  acao TEXT NOT NULL,
  modulo TEXT,
  registro_id UUID,
  detalhes TEXT,
  ip TEXT,
  data TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dc_auditoria_data ON dc_auditoria(data DESC);
ALTER TABLE dc_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_auditoria" ON dc_auditoria FOR ALL USING (true);

-- ============================================================
-- 5. CAMPOS ADICIONAIS EM TABELAS EXISTENTES
-- ============================================================

-- dc_alertas: external_id para deduplicação de alertas oficiais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='external_id') THEN
    ALTER TABLE dc_alertas ADD COLUMN external_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='hash_conteudo') THEN
    ALTER TABLE dc_alertas ADD COLUMN hash_conteudo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='sincronizado') THEN
    ALTER TABLE dc_alertas ADD COLUMN sincronizado BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='sincronizado_em') THEN
    ALTER TABLE dc_alertas ADD COLUMN sincronizado_em TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='whatsapp_enviado') THEN
    ALTER TABLE dc_alertas ADD COLUMN whatsapp_enviado BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_alertas' AND column_name='whatsapp_total') THEN
    ALTER TABLE dc_alertas ADD COLUMN whatsapp_total INTEGER DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dc_alertas_external ON dc_alertas(external_id);

-- dc_ocorrencias: GPS, fotos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_ocorrencias' AND column_name='latitude') THEN
    ALTER TABLE dc_ocorrencias ADD COLUMN latitude DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_ocorrencias' AND column_name='longitude') THEN
    ALTER TABLE dc_ocorrencias ADD COLUMN longitude DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_ocorrencias' AND column_name='fotos') THEN
    ALTER TABLE dc_ocorrencias ADD COLUMN fotos JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_ocorrencias' AND column_name='videos') THEN
    ALTER TABLE dc_ocorrencias ADD COLUMN videos JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_ocorrencias' AND column_name='gravidade') THEN
    ALTER TABLE dc_ocorrencias ADD COLUMN gravidade TEXT CHECK (gravidade IN ('leve','moderada','grave','critica'));
  END IF;
END $$;

-- dc_pessoas_alerta: preferências de tipo de alerta
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_pessoas_alerta' AND column_name='preferencias_alerta') THEN
    ALTER TABLE dc_pessoas_alerta ADD COLUMN preferencias_alerta JSONB DEFAULT '["chuva","enchente","vendaval","incendio","geral"]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_pessoas_alerta' AND column_name='nivel_minimo') THEN
    ALTER TABLE dc_pessoas_alerta ADD COLUMN nivel_minimo TEXT DEFAULT 'moderada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='gestao360' AND table_name='dc_pessoas_alerta' AND column_name='municipio') THEN
    ALTER TABLE dc_pessoas_alerta ADD COLUMN municipio TEXT DEFAULT 'Ivatuba';
  END IF;
END $$;

-- ============================================================
-- 6. GRANTS
-- ============================================================
GRANT ALL ON dc_notas_tecnicas TO anon;
GRANT ALL ON dc_notas_tecnicas TO authenticated;
GRANT ALL ON dc_notification_queue TO anon;
GRANT ALL ON dc_notification_queue TO authenticated;
GRANT ALL ON dc_developer_config TO anon;
GRANT ALL ON dc_developer_config TO authenticated;
GRANT ALL ON dc_auditoria TO anon;
GRANT ALL ON dc_auditoria TO authenticated;
