# Pendências de teste

O que foi e o que **não** foi verificado na reorganização da programação de placa (esquema único, firmware dividido, assistente da placa). Atualizado em 2026-10-24. Teste feito numa ESP32-C3 real (estação `praia`, USB, servidor de desenvolvimento local). O que não está na coluna "Testado" não foi exercitado.

## Testado na placa

| O quê | Como |
|---|---|
| Firmware dividido (`cycle`, `power`, `uplink`, `state`, `diag`) | `firmware/tools/hwtest/checks.py`: 8/8 |
| Limites do esquema único presos no firmware | Valores fora da faixa viraram os limites; configuração original restaurada |
| Economia de bateria, histerese de 0,05 V, "carregando" | Bateria simulada (`simvbat`) |
| Configuração entregue pelo servidor e confirmada | Alteração pela API; a placa baixou e confirmou (`cfg_applied`) |
| Reinício pedido pelo servidor | Pedido, entregue e confirmado pela placa |
| OTA de ponta a ponta | Versão 0.5.3 publicada, atribuída e instalada; depois removida e a placa voltou à 0.5.2 |
| Assistente: placa nova | Estação, rede e senha pelo navegador; a placa passou a enviar |
| Assistente: Wi-Fi e servidor | Corrigiu a conexão da placa |
| Assistente: Atualizar o firmware | Só o aplicativo (`0x10000`): 0.5.0 → 0.5.2, com Wi-Fi, chave e vínculo preservados |

## Ainda não testado

1. **Assistente: Sensores e pinos.** Salvar no servidor e aplicar pelo cabo. Mudar um pino reinicia a placa: teste primeiro com os toggles (por exemplo, desligar o pluviômetro) e confira a página da estação e o `diag` da placa.
2. **Placa em campo, sem cabo.** Bateria ou painel solar, deep sleep entre ciclos, lote de leituras na memória RTC, portal Wi-Fi por BOOT e consumo real. Os testes acima ficaram o tempo todo com o cabo, sem deep sleep.
3. **Imagem completa (`0x0`) no navegador.** O fluxo "Gravar o firmware agora" para placa em branco com o assistente. Sabe-se que a imagem apaga Wi-Fi, chave e configuração (foi o que se viu quando ela era usada para atualizar).
4. **Placa recuperada pelo estado "não respondeu"** (RESET e nova procura) com a gravação feita pelo assistente.
5. **Usuário comum e dono não administrador.** O assistente é só do administrador; conferir que nada aparece nem abre a porta USB para os outros, e que a página da estação não permite mais editar sensores e pinos.
6. **Publicação.** O comportamento do assistente com o site em `https://` na Cloudflare (a gravação e a configuração foram testadas só em `localhost` com a API na rede local).
7. **CI.** Os jobs do GitHub Actions rodaram só localmente (compilação, `tsc`, build); o novo passo `gen_schema.py --check` ainda não passou no GitHub.
8. **Smoke da API** (`worker/scripts/smoke.mjs`): não foi rodado depois das mudanças.
9. **Capturas de tela** de `docs/img/guia/*`: mostram a interface antiga do assistente.
