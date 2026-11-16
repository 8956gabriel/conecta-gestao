-- ============================================================
-- Defesa Civil Ivatuba — atualização automática a cada 20 minutos
-- Rodar UMA vez no Supabase: SQL Editor > New query > colar > Run
-- Funciona mesmo com o painel fechado.
-- ============================================================

-- 1) Liga as extensões de agendamento e de chamadas HTTP
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Remove agendamentos antigos com o mesmo nome (pode rodar de novo sem duplicar)
do $$
begin
  perform cron.unschedule(jobname) from cron.job
   where jobname in ('dc-sync-alertas-20min', 'dc-process-queue-20min');
end $$;

-- 3) A cada 20 minutos: busca alertas nas fontes oficiais
select cron.schedule(
  'dc-sync-alertas-20min',
  '*/20 * * * *',
  $$ select net.http_get(
       url := 'https://conectagestao360.vercel.app/api/sync-alertas',
       timeout_milliseconds := 60000
     ); $$
);

-- 4) 5 minutos depois: envia a fila de avisos (SMS/WhatsApp) gerada pela sincronização
select cron.schedule(
  'dc-process-queue-20min',
  '5-59/20 * * * *',
  $$ select net.http_get(
       url := 'https://conectagestao360.vercel.app/api/process-queue',
       timeout_milliseconds := 60000
     ); $$
);

-- Conferir: deve listar os 2 agendamentos
select jobname, schedule, active from cron.job where jobname like 'dc-%';

-- Ver as últimas execuções (rodar depois de uns 20 minutos):
-- select j.jobname, d.status, d.start_time, d.return_message
--   from cron.job_run_details d join cron.job j using (jobid)
--  where j.jobname like 'dc-%' order by d.start_time desc limit 10;

-- Para DESLIGAR depois, se precisar:
-- select cron.unschedule('dc-sync-alertas-20min');
-- select cron.unschedule('dc-process-queue-20min');
