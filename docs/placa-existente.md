# Placa já cadastrada: atualizar, trocar a rede, mudar sensores

Para uma placa que **já pertence a uma estação deste site**. Placa nova ou sem vínculo: [placa-nova.md](placa-nova.md).

Plugue o cabo. O assistente da placa reconhece a estação ("Reconhecida: estação …") e oferece três ações, cada uma separada das outras. O assistente é só do administrador: usuários comuns não o veem, e a porta USB nunca é aberta para eles.

| Ação | Para quê | O que muda | O que **não** muda |
|---|---|---|---|
| **Atualizar o firmware** | Pôr a versão que o site oferece, ou recuperar uma placa travada | Grava só o aplicativo (a partir de `0x10000`) | Nada: Wi-Fi, chave e configuração ficam |
| **Wi-Fi e servidor** | Mudou o roteador, a senha, ou o endereço do site | Rede e endereço; **gera uma chave nova** | Sensores, pinos e ajustes da estação |
| **Sensores e pinos** | Trocou ou tirou um sensor, ou mudou a fiação | Salva no servidor e aplica na placa pelo cabo | Wi-Fi e chave |

O menu mostra a versão da placa e a que o site oferece. Se forem iguais, regravar é só uma recuperação.

## Atualizar o firmware

Escolha **Atualizar o firmware**. A gravação leva cerca de um minuto; a placa reinicia sozinha e o assistente a procura de novo. Se a placa dormir, aperte RESET.

Em placas **em campo**, prefira a atualização pelo ar (OTA): publique a versão em *Administração → Firmware* e atribua às estações; a placa baixa e confere o SHA-256 no envio seguinte, sem cabo. Veja [firmware.md](firmware.md#atualização-pelo-ar-ota).

A **imagem completa** (`0x0`) só é usada em placa em branco ou para recuperar uma que não responde: ela **apaga** Wi-Fi, chave e configuração guardados na placa. Está em *Administração → Site e placas → Avançado*, junto com a gravação de um `.bin` seu.

O site oferece as duas imagens porque `firmware/tools/make_factory.py` gera `estacao-c3.bin` (completa) e `estacao-c3-app.bin` (só o aplicativo). Depois de mudar o firmware, rode o script de novo, senão o site oferece uma versão velha.

## Wi-Fi e servidor

Escolha a rede (a placa a procura), digite a senha e confirme. Gerar chave nova **invalida a anterior**: outra placa que compartilhe a chave antiga deixa de enviar. O assistente espera a primeira leitura com a rede nova.

Sem o cabo, o caminho é o portal do celular: com a placa ligada, aperte BOOT nos primeiros 6 s para abrir **EstacaoMeteo-XXXX** (não segure o BOOT ao ligar: isso põe o chip em modo de gravação).

## Sensores e pinos

O assistente é o único lugar para mudar o sensor de ambiente, o que está instalado (anemômetro, biruta, pluviômetro) e os pinos. A página da estação só mostra o que está configurado.

1. Escolha o **sensor de ambiente**: nenhum, BME280, MS5611 ou BME280 + MS5611.
2. Desligue o que **não está instalado**. Sem anemômetro, a velocidade e a rajada somem da página, em vez de mostrar ruído de um pino solto.
3. Se mudou a fiação, escolha os **pinos**. As regras valem igualmente no site, na API e no firmware (vêm de `shared/board-schema.json`): chuva em GPIO0 a 5, bateria em GPIO0 a 4, sem repetir pino, e ficam de fora 8, 9, 11 a 19.
4. **Salvar e aplicar na placa.** O site grava no servidor e manda a configuração pelo cabo. Mudar um pino reinicia a placa. A fiação precisa estar igual ao que está na tela.

Se a placa não aplicar pelo cabo, a configuração já está no servidor e ela a pega no próximo envio.

## Acrescentar um campo de configuração (para quem mexe no código)

Um campo novo (limite, padrão, pino) se declara **uma vez**, em [shared/board-schema.json](../shared/board-schema.json), seguido de `python tools/gen_schema.py`. O comando gera `web/src/lib/schema.ts`, `worker/src/schema.ts` e `firmware/src/schema_gen.h`, e o CI recusa o commit se algum estiver desatualizado. Detalhes em [firmware.md](firmware.md#estrutura-do-código).
