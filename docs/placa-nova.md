# Placa nova: do cabo ao primeiro dado

Para um **ESP32-C3 novo, em branco ou que nunca foi vinculado a uma estação deste site**. Se a placa já foi cadastrada, vá para [placa-existente.md](placa-existente.md). Antes, tenha à mão o que o [guia da primeira estação](guia-primeira-estacao.md#0-antes-de-começar) lista: Chrome/Edge/Opera, cabo USB **de dados**, rede Wi-Fi de **2,4 GHz** e conta de administrador.

## O caminho em uma tela

Tudo acontece no **assistente da placa**, o aviso que aparece no canto da tela quando você pluga o cabo (a primeira vez, autorize a placa em *Administração → Site e placas → Abrir o assistente da placa*). Ele lê a placa e segue sozinho:

| O assistente vê | O que faz |
|---|---|
| Placa sem firmware (não responde) | Oferece **Gravar o firmware agora**. Se a placa dormir, pede RESET e continua sozinho. |
| Placa com firmware e sem estação | Mostra o formulário de placa nova (abaixo). |
| Placa configurada, mas para uma estação que não existe aqui | O mesmo formulário: crie a estação ou vincule a uma existente. |

O formulário da placa nova tem quatro blocos, nesta ordem:

1. **Estação.** *Nova estação…* (nome, local, dono opcional) ou uma já cadastrada. O local vem do navegador; ajuste digitando ou pelo botão **No mapa**.
2. **Sensores e pinos** (opcional, fechado por padrão). O padrão serve para a montagem do [guia de hardware](hardware.md): BME280, anemômetro, biruta e pluviômetro nos pinos de fábrica. Abra só se a sua montagem for diferente (sem anemômetro, MS5611, outros pinos).
3. **Wi-Fi.** A própria placa procura as redes; escolha a sua e digite a senha. O endereço do site que a placa vai usar fica em *Avançado* (em desenvolvimento é o IP do computador; veja [firmware.md](firmware.md#gravar-o-firmware-pelo-navegador)).
4. **Criar a estação e configurar a placa.** O site cria a estação, gera a chave, grava Wi-Fi, endereço e chave na placa pelo cabo e espera a **primeira leitura**. Leva de 10 a 60 segundos.

Quando a leitura chega, o assistente mostra **Estação no ar** e o botão para abri-la.

## Se algo não anda

| Sintoma | Veja |
|---|---|
| O aviso não aparece | A placa foi autorizada? O navegador é Chrome, Edge ou Opera? Outra aba, o monitor serial ou a IDE podem estar com a porta. |
| A gravação falha ao conectar | Aperte RESET (o assistente recomeça sozinho). Se persistir: segure BOOT, aperte RESET, solte o RESET e depois o BOOT. |
| Configurada, mas nunca chega leitura | A senha do Wi-Fi e se a rede é de 2,4 GHz. Em teste local, se o endereço gravado é o IP do computador e a API foi aberta para a rede (`npm run dev:lan`). |
| "Token de administrador incorreto" | Entre com a conta Google de administrador, ou confira o token (só quando não há login Google). |

Mais casos em [solucao-de-problemas.md](solucao-de-problemas.md).

## Sem computador: o outro caminho

Para mandar a placa a quem vai instalá-la em outro lugar, grave-a uma vez pelo assistente (ou por `pio run -t upload`) e use o **código de pareamento**: veja [o guia](guia-primeira-estacao.md#4-caminho-b-código-de-pareamento) e [firmware.md](firmware.md#instalar-sem-computador-código-de-pareamento). Sem cabo e sem pareamento, o portal do celular (`EstacaoMeteo-XXXX`) também configura Wi-Fi e chave.

## Depois que está no ar

Intervalo, bateria, energia e calibração ficam em **Configurações** da página da estação ([calibracao.md](calibracao.md), [energia.md](energia.md)). Sensores e pinos ficam no assistente: [placa-existente.md](placa-existente.md#sensores-e-pinos).
