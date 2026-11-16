# Monitoramento meteorológico automático — Defesa Civil de Ivatuba

O sistema consulta **fontes oficiais** a cada 10 minutos, mesmo com o painel fechado, e:

- atualiza o status do município e a página pública **Ivatuba Protegida** (sem o cidadão recarregar);
- publica/encerra os alertas oficiais na lista de alertas da página pública;
- registra cada consulta no histórico (dados recebidos, fontes, nível, alterações, mensagens, falhas);
- avisa no painel e prepara WhatsApp/SMS na fila quando o risco muda de forma significativa.

## Fontes de dados (Ivatuba – IBGE 4111605, sede −23.61933, −52.22045)

| Fonte | O que traz | Situação |
|---|---|---|
| Defesa Civil Nacional — IDAP (CAP 1.2) | Alertas oficiais enviados pelas Defesas Civis, incluindo os da Defesa Civil do PR (baseados no SIMEPAR) | Ativa |
| INMET — avisos | Perigo Potencial / Perigo / Grande Perigo | Ativa |
| INMET — previsão por município | Previsão manhã/tarde/noite | Ativa |
| INMET — estação automática mais próxima | Chuva, vento, rajada, temperatura, umidade | Ativa |
| SIMEPAR | — | **O SIMEPAR não publica API aberta.** Os dados são fornecidos por solicitação/convênio. Quando a prefeitura obtiver o acesso, cadastre `SIMEPAR_API_URL` e `SIMEPAR_API_TOKEN` nos segredos da função; a conexão passa a aparecer no painel e os dados recebidos ficam no histórico. A leitura do formato será implementada com a especificação oficial que o SIMEPAR entregar. |

Nenhum endereço foi inventado e nenhum dado é simulado. Os formatos do IDAP e do INMET não têm documentação pública estável; por isso a leitura é tolerante e todo problema aparece no painel (status de cada fonte) e no histórico.

## Regras de classificação

- 🟢 **NORMAL** — nenhum alerta oficial e nenhuma condição de risco.
- 🟡 **ATENÇÃO** — aviso oficial amarelo (INMET Perigo Potencial; Defesa Civil risco baixo/moderado); previsão INMET de chuva, tempestade ou ventos fortes para hoje/amanhã cedo; chuva ≥ 20 mm/h ou rajada ≥ 60 km/h medidas na estação.
- 🟠 **ALERTA** — somente alerta oficial laranja (INMET Perigo; Defesa Civil risco alto/severo).
- 🔴 **ALERTA MÁXIMO** — somente alerta oficial vermelho (INMET Grande Perigo; Defesa Civil risco muito alto/extremo).

Garantias:
- Previsão isolada **nunca** passa de ATENÇÃO.
- Alerta oficial que começa daqui a mais de 6 h conta como ATENÇÃO até se aproximar.
- Elevação de nível é imediata; rebaixamento só após **2 consultas seguidas** confirmando.
- Em falha de comunicação o status **não é rebaixado** (nunca vai para NORMAL por falha); a página pública mostra o último dado válido com aviso de desatualizado.
- Intervenção manual no painel (com motivo e validade) prevalece; se surgir alerta oficial de nível **maior**, o sistema eleva mesmo assim. Tudo vai para a Auditoria.

## Notificações

- Painel: toda mudança de nível e falhas de comunicação (tabela `dc_notificacoes`).
- Comunicado público e fila WhatsApp/SMS: quando o nível **sobe** até ALERTA ou mais, e quando o alerta é **encerrado**. O mesmo nível/evento não gera mensagem repetida.
- A fila usa a tabela `dc_notification_queue` já existente; o envio continua com o processamento atual (`/api/process-queue`). O campo `fila_provider` (padrão `sandbox`, igual ao painel) pode ser ajustado em `dc_monitor_estado`.
- Para desligar o aviso automático à população: `UPDATE gestao360.dc_monitor_estado SET notificar_populacao = false;`

## Ativação (uma vez só)

### 1. Banco de dados
Supabase → **SQL Editor** → cole e execute `supabase/migrations/20261116200000_monitoramento_clima_automatico.sql`.

### 2. Função do servidor
Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**:
- Nome: `dc-monitor-clima`
- Crie os dois arquivos com o conteúdo de `supabase/functions/dc-monitor-clima/index.ts` e `lib.ts`.
- Depois de publicar, abra a função → **Details** → desligue **Enforce JWT verification** (a função usa um segredo próprio).

(Alternativa pela linha de comando: `supabase functions deploy dc-monitor-clima --no-verify-jwt --project-ref kfvkembarvsbtveksiag`)

### 3. Segredo
Invente uma senha longa (ex.: gere em https://www.uuidgenerator.net — use 2 juntos).
- Supabase → **Edge Functions → Secrets** → adicione `DC_MONITOR_CRON_SECRET` = sua senha.
- Supabase → **SQL Editor** → execute (troque a senha):

```sql
select vault.create_secret('https://kfvkembarvsbtveksiag.supabase.co/functions/v1/dc-monitor-clima', 'dc_monitor_url');
select vault.create_secret('COLE_A_MESMA_SENHA_AQUI', 'dc_monitor_cron_secret');
```

### 4. Testar
Painel da Defesa Civil → **Status do Município** → **Consultar agora**. Em até 1 minuto aparecem a conexão de cada fonte, as condições atuais e a primeira linha no histórico. Depois disso o sistema segue sozinho a cada 10 minutos.

Se algo falhar, o histórico mostra o motivo (ex.: "Configuração incompleta: segredos ... não encontrados no Vault").
